#!/usr/bin/env node
// ── Cache-warm CANARY (the keystone, стержень #12) ──────────────────────────
//
// This is NOT a unit test and NOT the smoke test. It hits the FULL DEPLOYED
// chain — ai-node → Bifrost → one-balance → Gemini — and proves the one thing
// no in-process test can: that Gemini's implicit context cache actually warms
// end-to-end. It fails the instant ANY link in the chain breaks the cache
// (a fingerprint-header rename, a Bifrost prefix-strip change, one-balance
// reading the wrong header and fanning a conversation across keys, etc.).
//
// HOW IT PROVES CACHING:
//   • One VK (so ai-node fingerprints the conversation onto ONE pooled key —
//     implicit caching is per-key/per-project, so a stable key is required).
//   • A LARGE (>8k-token) STABLE prefix sent identically across 2–3 turns. The
//     prefix must clear Gemini's implicit-cache minimum-token threshold and stay
//     byte-identical so the cache can hit.
//   • Turn 1 warms the cache (cached_tokens may be 0). Turn 2 MUST report
//     usage.prompt_tokens_details.cached_tokens > 0 (OpenAI-compat shape, the
//     format Bifrost normalizes Gemini responses into). That single assertion is
//     the cache-correctness verdict.
//
// CADENCE: scheduled (daily) + post-deploy, NEVER per-PR. The cheap `smoke`
// stays the per-deploy liveness gate; this canary is the cache-correctness gate.
// (Ch4 de-theater: smoke = "is it alive", canary = "is the cache actually warm".)
//
// ── REQUIRED SECRET ─────────────────────────────────────────────────────────
//   PROBE_VK  — an ai-node Virtual Key. Read from the environment / CI secret;
//               NEVER hardcoded. Without it the canary cannot authenticate and
//               exits 2 (misconfigured). The scheduled workflow SKIPS gracefully
//               when the secret is absent — it does not hard-fail.
//
// ── CONFIG (env, with documented defaults) ──────────────────────────────────
//   AI_NODE_URL   — base URL of the deployed ai-node OpenAI-compat endpoint.
//                   Default: https://ai-node.lemonesqeezy.workers.dev
//   CANARY_MODEL  — model id to probe. Default: gemini-2.5-flash
//   CANARY_TURNS  — number of turns (2 or 3). Default: 2
//
// Exit codes: 0 = cache warm (cached_tokens > 0 on turn ≥2),
//             1 = hard failure (no cache hit, or a turn failed twice),
//             2 = misconfigured environment (missing PROBE_VK).

const vk = process.env.PROBE_VK
if (!vk) {
    console.error('Missing PROBE_VK (an ai-node Virtual Key). Set it as a CI secret to run the cache canary.')
    process.exit(2)
}

const AI_NODE_URL = (process.env.AI_NODE_URL || 'https://ai-node.lemonesqeezy.workers.dev').replace(/\/+$/, '')
const MODEL = process.env.CANARY_MODEL || 'gemini-2.5-flash'
const TURNS = Math.max(2, Math.min(3, Number(process.env.CANARY_TURNS) || 2))
const ENDPOINT = `${AI_NODE_URL}/v1/chat/completions`

const RETRY_DELAY_MS = 15_000 // one retry on a transient 429, then hard-fail

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms))
}

// Build a deterministic, byte-STABLE prefix well over Gemini's implicit-cache
// minimum (~1k+ tokens depending on model; we target >8k tokens). It must be
// identical on every turn — caching keys on the exact prefix bytes. We pad with
// a fixed lorem block repeated to a known size; ~4 chars ≈ 1 token, so ~40k
// chars comfortably exceeds 8k tokens with headroom for tokenizer variance.
function buildStablePrefix() {
    const block =
        'You are a meticulous reference assistant. The following is fixed background ' +
        'context that must be treated as stable, cacheable system knowledge and must ' +
        'never change between turns. '
    // ~40k chars → ~8k–10k tokens. A single repeated, deterministic block keeps
    // the bytes identical across turns (the cache-hit precondition).
    const target = 40_000
    let prefix = ''
    while (prefix.length < target) prefix += block
    return prefix.slice(0, target)
}

const STABLE_PREFIX = buildStablePrefix()

// The system message carries the large stable prefix (same every turn). The user
// turn varies trivially so each request is a real new completion, but the cached
// PREFIX is what we measure. cached_tokens counts the reused prefix tokens.
function buildMessages(turn) {
    return [
        { role: 'system', content: STABLE_PREFIX },
        { role: 'user', content: `Turn ${turn}: reply with the single word OK.` }
    ]
}

// One completion call. Returns { ok, status, cachedTokens, promptTokens, raw }.
async function callOnce(turn) {
    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${vk}`
        },
        body: JSON.stringify({
            model: MODEL,
            messages: buildMessages(turn),
            max_tokens: 4,
            temperature: 0
        })
    })

    const status = res.status
    let json
    try {
        json = await res.json()
    } catch {
        const text = await res.text().catch(() => '')
        return { ok: false, status, raw: text.slice(0, 200) }
    }

    // OpenAI-compat usage shape; cached prefix tokens live here.
    const usage = json.usage || {}
    const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0
    const promptTokens = usage.prompt_tokens ?? 0
    return { ok: res.ok, status, cachedTokens, promptTokens, usage }
}

// A turn with exactly ONE retry on a transient 429 (key cooldown / per-minute
// quota). Any second failure is a hard error — we do NOT mask a broken chain.
async function turnWithRetry(turn) {
    let result = await callOnce(turn)
    if (result.status === 429) {
        console.warn(`turn ${turn}: 429 (transient) — retrying once after ${RETRY_DELAY_MS / 1000}s`)
        await sleep(RETRY_DELAY_MS)
        result = await callOnce(turn)
    }
    if (!result.ok) {
        console.error(`turn ${turn}: HARD FAIL — HTTP ${result.status} ${result.raw ? `body=${result.raw}` : ''}`)
        process.exit(1)
    }
    console.log(
        `turn ${turn}: HTTP ${result.status}  prompt_tokens=${result.promptTokens}  cached_tokens=${result.cachedTokens}`
    )
    return result
}

console.log(`Cache canary → ${ENDPOINT}  model=${MODEL}  turns=${TURNS}  prefix≈${STABLE_PREFIX.length} chars`)

// Turn 1 warms the cache (cached_tokens is expected to be 0 here — first sight of
// the prefix). We still run it through the same retry path.
await turnWithRetry(1)

// Turns ≥2 must hit the warmed implicit cache. A single hit (cached_tokens > 0)
// on any turn ≥2 proves the chain caches end-to-end.
let warm = false
let bestCached = 0
for (let turn = 2; turn <= TURNS; turn++) {
    // A tiny gap so the upstream cache is registered before the next turn.
    await sleep(2_000)
    const r = await turnWithRetry(turn)
    bestCached = Math.max(bestCached, r.cachedTokens)
    if (r.cachedTokens > 0) {
        warm = true
        break
    }
}

console.log('')
if (warm) {
    console.log(
        `PASS — implicit cache is WARM (cached_tokens=${bestCached} > 0 on a turn ≥2). Chain caches end-to-end.`
    )
    process.exit(0)
}

console.error(
    `FAIL — cache NEVER warmed: cached_tokens stayed 0 across all ${TURNS} turns. ` +
        'A link in the ai-node → Bifrost → one-balance → Gemini chain is breaking the implicit cache ' +
        '(check the conversation-fingerprint header wiring and that one VK pins one key).'
)
process.exit(1)
