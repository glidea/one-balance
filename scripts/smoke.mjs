#!/usr/bin/env node
// E2E smoke test against a DEPLOYED one-balance. Hitting the cheapest model
// with a 1-token output barely costs anything (~0.0001% of a free-key quota).
// one-balance internally rotates through 3 keys per attempt; the outer retry
// (3 attempts × 5 s backoff) survives transient upstream blips that outlasted
// the internal rotation.
//
//   ONE_BALANCE_URL=https://one-balance.example.workers.dev \
//   GEMINI_PROXY_KEY=your-service-auth-key \
//   node scripts/smoke.mjs
//
// Exit: 0 = all checks passed, 1 = CI gate (generateContent) failed,
//       2 = misconfigured env.

const url = process.env.ONE_BALANCE_URL
const key = process.env.GEMINI_PROXY_KEY

if (!url || !key) {
    console.error('Missing env. Required: ONE_BALANCE_URL and GEMINI_PROXY_KEY.')
    process.exit(2)
}

const RETRY_MAX = 5
const RETRY_DELAY_MS = 10_000
const CI_WARMUP_MS = 30_000
const CI_GATE = process.env.CI_GATE === '1'

const base = url.replace(/\/+$/, '')
const results = []

function record(name, ok, detail) {
    results.push({ name, ok })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(18)} ${detail}`)
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms))
}

async function withRetry(name, fn, attempts) {
    let lastErr
    for (let i = 1; i <= attempts; i++) {
        try {
            const res = await fn()
            if (res.ok) {
                record(name, true, `HTTP ${res.status} (attempt ${i}/${attempts})`)
                return true
            }
            const body = await res.text().catch(() => '')
            lastErr = `HTTP ${res.status} body=${body.slice(0, 120)}`
            console.warn(`  retry ${i}/${attempts}: ${lastErr}`)
        } catch (e) {
            lastErr = e.message
            console.warn(`  retry ${i}/${attempts}: error=${lastErr}`)
        }
        if (i < attempts) await sleep(RETRY_DELAY_MS)
    }
    record(name, false, `after ${attempts} retries: ${lastErr}`)
    return false
}

async function checkHealth() {
    try {
        const res = await fetch(`${base}/health`)
        const text = (await res.text()).trim()
        record('health', res.ok && text === 'ok', `HTTP ${res.status} body="${text}"`)
    } catch (e) {
        record('health', false, `error: ${e.message}`)
    }
}

async function checkListModels() {
    try {
        const res = await fetch(`${base}/api/google-ai-studio/v1beta/models`, {
            headers: { 'x-goog-api-key': key }
        })
        let extra = ''
        try {
            const json = await res.json()
            if (Array.isArray(json.models)) extra = ` (${json.models.length} models)`
        } catch {}
        record('listModels', res.ok, `HTTP ${res.status}${extra}`)
    } catch (e) {
        record('listModels', false, `error: ${e.message}`)
    }
}

async function checkGenerateContent() {
    const endpoint = `${base}/api/google-ai-studio/v1beta/models/gemini-2.0-flash-lite:generateContent`
    const body = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 1 }
    })
    const ok = await withRetry('generateContent', () =>
        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body
        }), RETRY_MAX)
    return ok
}

console.log(`Smoke testing ${base}`)
if (CI_GATE) {
    console.log(`CI warmup: waiting ${CI_WARMUP_MS / 1000}s for key cooldowns to clear...`)
    await sleep(CI_WARMUP_MS)
}
await checkHealth()
await checkListModels()
const genOk = await checkGenerateContent()

const failed = results.filter(r => !r.ok)
console.log('')
if (failed.length === 0) {
    console.log(`PASS — all ${results.length} checks passed`)
    process.exit(0)
}

if (!CI_GATE) {
    console.log(`INFO — ${failed.length}/${results.length} failed: ${failed.map(r => r.name).join(', ')} (non-blocking)`)
    process.exit(0)
}

// CI gate mode: only generateContent blocks; listModels/health are informative.
console.log(`CI GATE: generateContent ${genOk ? 'PASS' : 'FAIL'} (${failed.filter(r => r.name !== 'generateContent').map(r => r.name).join(', ')} are non-blocking)`)
process.exit(genOk ? 0 : 1)
