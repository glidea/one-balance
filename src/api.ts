import * as keyService from './service/key'
import * as util from './util'
import type * as schema from './service/d1/schema'
import { CONVERSATION_FINGERPRINT_CORE, BIFROST_ECHO_PREFIX, LEGACY_FINGERPRINT_HEADER } from './contract'

const PROVIDER_CUSTOM_AUTH_HEADER: Record<string, string> = {
    'google-ai-studio': 'x-goog-api-key',
    anthropic: 'x-api-key',
    elevenlabs: 'x-api-key',
    'azure-openai': 'api-key',
    cartesia: 'X-API-Key'
}

function getAuthHeaderName(provider: string): string {
    return PROVIDER_CUSTOM_AUTH_HEADER[provider] || 'Authorization'
}

export async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    // Strip our own `?key=` (the google-ai-studio auth-via-query style) from what we
    // forward upstream. The pooled key always goes in the auth header; leaking our
    // AUTH_KEY into the gateway/Google URL would expose it in their logs and — if
    // Google preferred a query key over the header — get a HEALTHY pooled key benched
    // as API_KEY_INVALID. Header-based auth (what Bifrost uses) is unaffected.
    const forwardUrl = new URL(request.url)
    forwardUrl.searchParams.delete('key')
    const restResource = forwardUrl.pathname.substring('/api/'.length) + forwardUrl.search

    // Key Manager API (consumed by ai-node): vend a key / report its status.
    // Authenticated by KEY_MANAGER_TOKEN, separate from the proxy auth below.
    if (restResource.startsWith('keys/')) {
        return handleKeys(request, env)
    }

    const provider = restResource.split('/')[0]
    const authKey = getAuthKey(request, provider)

    // ListModels carries no model — auth it against the provider, then forward it
    // with any active pooled key. Must run before model extraction (which would
    // 400 a modelless path).
    if (isListModelsRequest(request.method, url.pathname)) {
        if (!util.isApiRequestAllowed(authKey, env.AUTH_KEY, provider, '')) {
            return new Response('Invalid auth key', { status: 403 })
        }
        return await forwardListModels(request, env, restResource, provider)
    }

    const realProviderAndModel = await extractRealProviderAndModel(request, restResource, provider)
    if (!realProviderAndModel) {
        return new Response('Not supported request: valid provider or model not found', { status: 400 })
    }

    if (!util.isApiRequestAllowed(authKey, env.AUTH_KEY, realProviderAndModel.provider, realProviderAndModel.model)) {
        return new Response('Invalid auth key', { status: 403 })
    }

    return await forward(request, env, ctx, restResource, realProviderAndModel.provider, realProviderAndModel.model)
}

// ─── Key Manager API ──────────────────────────────────────────────────────
// Vends pooled keys to ai-node (which then calls the provider directly) and
// receives key-health reports back. This is a separate trust boundary from the
// proxy path: authenticated by a single KEY_MANAGER_TOKEN, not the AUTH_KEY set.

function checkKeyManagerAuth(request: Request, env: Env): Response | null {
    const token = env.KEY_MANAGER_TOKEN
    if (!token) {
        return new Response('KEY_MANAGER_TOKEN not configured', { status: 500 })
    }
    const auth = request.headers.get('Authorization') ?? ''
    // Constant-time compare: the KEY_MANAGER_TOKEN bearer must not leak via timing.
    if (!util.timingSafeEqual(auth, `Bearer ${token}`)) {
        return new Response('Unauthorized', { status: 401 })
    }
    return null
}

async function handleKeys(request: Request, env: Env): Promise<Response> {
    const authError = checkKeyManagerAuth(request, env)
    if (authError) return authError

    const path = new URL(request.url).pathname
    if (path === '/api/keys/next' && request.method === 'GET') {
        return handleKeysNext(request, env)
    }
    const statusMatch = path.match(/^\/api\/keys\/(.+)\/status$/)
    if (statusMatch && request.method === 'POST') {
        return handleKeysStatus(request, env, statusMatch[1])
    }
    return new Response('Not found', { status: 404 })
}

// GET /api/keys/next?provider=&model= → { key, id, cooling_until }
// Picks an available key for the (provider, model); cooling_until is the unix
// second the chosen key's model cooldown ends, or null if it's not cooling.
async function handleKeysNext(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const provider = url.searchParams.get('provider')
    const model = url.searchParams.get('model')
    if (!provider || !model) {
        return new Response('provider and model query params required', { status: 400 })
    }

    const activeKeys = await keyService.listActiveKeysViaCache(env, provider)
    if (activeKeys.length === 0) {
        return new Response('No active keys available', { status: 503 })
    }

    const fingerprint = readConversationFingerprint(request)
    const selectedKey = await selectKey(activeKeys, model, fingerprint)
    const cooling = selectedKey.modelCoolings?.[model]
    const coolingUntil = cooling && cooling.end_at > Date.now() / 1000 ? cooling.end_at : null

    return new Response(JSON.stringify({ key: selectedKey.key, id: selectedKey.id, cooling_until: coolingUntil }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    })
}

// POST /api/keys/{id}/status — body: {blocked} | {rate_limited, retry_after, model, provider} | {ok}
async function handleKeysStatus(request: Request, env: Env, keyId: string): Promise<Response> {
    let body: {
        blocked?: boolean
        rate_limited?: boolean
        retry_after?: number
        ok?: boolean
        provider?: string
        model?: string
    }
    try {
        body = await request.json()
    } catch {
        return new Response('Invalid JSON', { status: 400 })
    }

    if (body.blocked) {
        // provider is required: defaulting it (previously 'google-ai-studio') could
        // mark a key of one provider blocked under another, corrupting key health.
        if (!body.provider) {
            return new Response('provider required for blocked', { status: 400 })
        }
        await keyService.setKeyStatus(env, body.provider, keyId, 'blocked')
        return new Response('OK', { status: 200 })
    }
    if (body.rate_limited) {
        // provider and model are both required so the cooldown is attributed to the
        // correct (provider, model) — never defaulted, which would mis-cool keys.
        if (!body.provider) {
            return new Response('provider required for rate_limited', { status: 400 })
        }
        if (!body.model) {
            return new Response('model required for rate_limited', { status: 400 })
        }
        // retry_after must be an explicit number (0 is valid — "cool for zero extra
        // seconds"). A missing/non-numeric value gets its own precise 400 instead of
        // silently falling through to the generic "invalid status body" — which would
        // drop the cooldown and hide the cause from the caller.
        if (typeof body.retry_after !== 'number') {
            return new Response('retry_after (number) required for rate_limited', { status: 400 })
        }
        await keyService.setKeyModelCooldownIfAvailable(env, keyId, body.provider, body.model, body.retry_after)
        return new Response('OK', { status: 200 })
    }
    if (body.ok) {
        return new Response('OK', { status: 200 })
    }
    return new Response('Invalid status body: one of ok, blocked, rate_limited required', { status: 400 })
}

async function extractRealProviderAndModel(
    request: Request,
    restResource: string,
    provider: string
): Promise<{ provider: string; model: string } | null> {
    const model = await extractModel(request, restResource)
    if (!model) {
        return null
    }
    if (provider !== 'compat') {
        return { provider, model }
    }

    // find the real provider from model (e.g. google-ai-studio/gemini-2.0-flash)
    // see https://developers.cloudflare.com/ai-gateway/chat-completion/#curl
    const realProvider = model.split('/')[0]
    if (!realProvider) {
        // bad request
        return null
    }
    const realModel = model.split('/')[1]
    if (!realModel) {
        // bad request
        return null
    }

    return { provider: realProvider, model: realModel }
}

async function extractModel(request: Request, restResource: string): Promise<string | null> {
    if (request.method === 'POST' && request.body) {
        const model = await extractModelFromBody(request)
        if (model) return model
    }

    return extractModelFromPath(restResource)
}

async function extractModelFromBody(request: Request): Promise<string | null> {
    try {
        const body = (await request.clone().json()) as { model: string }
        return body.model || null
    } catch {
        return null
    }
}

function extractModelFromPath(restResource: string): string | null {
    const parts = restResource.split('/models/')
    if (parts.length > 1) {
        return parts[1].split(':')[0]
    }

    return null
}

// ─── Upstream forwarding helpers (timeout + response hygiene) ───────────────

// Bifrost (the caller) times the request out at 60s. If one-balance ALSO timed
// out at 60s the two timers raced: a slow-but-recovering upstream could surface
// as a one-balance 504 instead of letting Bifrost own the timeout, producing the
// inverted/confusing failure where the inner proxy reports the outage the outer
// gateway should. Sit just ABOVE Bifrost's 60s so Bifrost's timer always wins;
// one-balance's 504 then means "definitely longer than the caller will ever
// wait", never a coin-flip with the caller. Override via UPSTREAM_TIMEOUT_MS.
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 65_000
// Bifrost's own request timeout. one-balance MUST outlast it so the caller's
// timer owns timeouts and the two never race. Kept here so the invariant is
// testable (DEFAULT_UPSTREAM_TIMEOUT_MS > BIFROST_TIMEOUT_MS).
export const BIFROST_TIMEOUT_MS = 60_000
// On an upstream timeout we return 504 with a short Retry-After: the condition is
// transient (a hung gateway/provider, not a quota window), so the caller (Bifrost)
// should be free to fail over / retry quickly rather than wait.
const UPSTREAM_TIMEOUT_RETRY_AFTER_SECONDS = 1

function upstreamTimeoutMs(env: Env): number {
    const v = Number(env.UPSTREAM_TIMEOUT_MS)
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_UPSTREAM_TIMEOUT_MS
}

function isAbortError(e: unknown): boolean {
    return e instanceof Error && e.name === 'AbortError'
}

// Bounds ONLY the receipt of response headers. Once fetch resolves, the timer is
// cleared, so streaming the body back to the client is never aborted (same
// semantics as aiproxy's gate, now living in one-balance after aiproxy retires).
// Throws AbortError on timeout.
async function fetchWithTimeout(req: Request, timeoutMs: number): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        return await fetch(req, { signal: controller.signal })
    } finally {
        clearTimeout(timer)
    }
}

function upstreamTimeoutResponse(): Response {
    return new Response('Upstream timed out', {
        status: 504,
        headers: {
            'Content-Type': 'text/plain',
            'Retry-After': String(UPSTREAM_TIMEOUT_RETRY_AFTER_SECONDS)
        }
    })
}

// Re-wraps a proxied upstream response to strip content-disposition (so a JSON/SSE
// body is never treated as a file download) without buffering the body. aiproxy
// did this on its gemini-native path; preserved here.
function proxyResponse(upstream: Response): Response {
    const out = new Response(upstream.body, upstream)
    out.headers.delete('content-disposition')
    // Don't pass an upstream Set-Cookie (Google / AI Gateway internals) back to the
    // caller — one-balance is not a session boundary and the cookie is never ours.
    out.headers.delete('set-cookie')
    return out
}

// ListModels has no model in the path (e.g. GET /api/google-ai-studio/v1beta/models)
// so it cannot go through the model-extraction path. It is not model-specific, so it
// forwards with any active pooled key. A single randomly-picked key that is bad,
// blocked, or throttled (401/403/429) must NOT fail the whole list for a healthy
// pool — so on those statuses (and a transient 5xx) we rotate to another random key
// and retry. list-models is low-stakes and the GET is idempotent, so we do not
// bench/cool the key here (that is the proxy path's job); rotation alone is enough.
// Body is returned as-is with its content-type.
async function forwardListModels(
    request: Request,
    env: Env,
    restResource: string,
    provider: string
): Promise<Response> {
    const activeKeys = await keyService.listActiveKeysViaCache(env, provider)
    if (activeKeys.length === 0) {
        return new Response('No active keys available', { status: 503 })
    }

    const timeoutMs = upstreamTimeoutMs(env)
    // Rotate WITHOUT replacement: a key that just failed must not be retried within
    // this same call (otherwise on a tiny pool a single bad key can burn every
    // attempt). A few rotations are enough to dodge one bad key; never more than the
    // pool size. We mutate a copy so the cached pool array is untouched.
    const candidates = [...activeKeys]
    const maxAttempts = Math.min(3, candidates.length)
    let lastResp: Response | null = null
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const selectedKey = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0]
        const reqToGateway = await makeGatewayRequest(
            request.method,
            request.headers,
            null,
            env,
            restResource,
            selectedKey.key
        )

        let resp: Response
        try {
            resp = await fetchWithTimeout(reqToGateway, timeoutMs)
        } catch (e) {
            if (isAbortError(e)) {
                console.error(`list-models ${provider} timed out after ${timeoutMs}ms`)
                return upstreamTimeoutResponse()
            }
            throw e
        }
        lastResp = resp

        // 401/403/429 are key-specific (a bad/blocked/throttled key); 5xx is a
        // transient upstream blip. Either way a different key may succeed — rotate.
        const shouldRotate = resp.status === 401 || resp.status === 403 || resp.status === 429 || resp.status >= 500
        if (!shouldRotate) {
            return proxyResponse(resp)
        }
        console.warn(`list-models ${provider} attempt ${attempt + 1}/${maxAttempts} → ${resp.status}, rotating key`)
    }

    // Every attempt rotated (all tried keys bad/throttled or upstream down). Surface
    // the real last upstream response so the caller sees its status/body, rather than
    // a synthetic 502. lastResp is set: the loop runs ≥1 time (empty pool 503'd above)
    // and a timeout returns early, so reaching here means a Response was recorded.
    return proxyResponse(lastResp!)
}

// GET whose path ends in a versioned /v1beta/models or /v1/models collection.
// Bifrost's google-ai-studio provider calls this to enumerate models. The version
// segment is required and the path is anchored on /models, so a model-specific path
// (.../v1beta/models/gemini-2.5-flash) is NOT matched and falls through to the proxy.
function isListModelsRequest(method: string, pathname: string): boolean {
    if (method !== 'GET') return false
    return /\/(?:v1beta|v1)\/models$/.test(pathname)
}

async function forward(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    restResource: string,
    provider: string,
    model: string
): Promise<Response> {
    const activeKeys = await keyService.listActiveKeysViaCache(env, provider)
    if (activeKeys.length === 0) {
        return new Response('No active keys available', { status: 503 })
    }

    const fingerprint = readConversationFingerprint(request)
    const body = request.body ? await request.arrayBuffer() : null
    const timeoutMs = upstreamTimeoutMs(env)
    // Bounded retries. Each key is a separate Google project, so a few attempts
    // are enough to find one with fresh per-minute quota. Walking the whole pool
    // (the old MAX_RETRIES=30) re-sent the full body Nx and benched every key it
    // touched — catastrophic for a request larger than any single free project's
    // per-minute TPM, which 429s on every key and can never succeed by rotation.
    const MAX_RETRIES = 3
    // M: size of the ACTIVE pool we started this request with. key.ts:30 filters
    // to status='active', so blocked keys (e.g. the ~144 invalid ones) are already
    // excluded — "all attempted" only ever means the few active keys we probed.
    const activePoolSize = activeKeys.length
    let attempted = 0 // N: how many keys we actually probed this request (≤ MAX_RETRIES)
    let lastRateLimitSec = 0 // Retry-After hint (seconds) from the most recent 429
    let sawRateLimit = false
    let lastRate429Cause: Rate429Cause = 'unknown' // why the most recent 429 fired
    let cooledThisRun = 0 // keys we cooled (429) during this request
    let blockedThisRun = 0 // keys we blocked (401/403/invalid-400) during this request
    let lastServerErrorStatus = 0 // most recent upstream 5xx status (for the honest 502 body)
    for (let i = 0; i < MAX_RETRIES; i++) {
        if (activeKeys.length === 0) {
            break
        }
        attempted++

        const selectedKey = await selectKey(activeKeys, model, fingerprint)
        const reqToGateway = await makeGatewayRequest(
            request.method,
            request.headers,
            body,
            env,
            restResource,
            selectedKey.key
        )
        let respFromGateway: Response
        try {
            respFromGateway = await fetchWithTimeout(reqToGateway, timeoutMs)
        } catch (e) {
            // Timeout receiving headers: bound the hang and let the caller fail
            // over fast (504) instead of retrying and stacking full timeouts.
            // Non-abort fetch errors bubble to the top-level handler (→ 500).
            if (isAbortError(e)) {
                console.error(`gateway timed out after ${timeoutMs}ms (attempt ${i + 1}/${MAX_RETRIES})`)
                return upstreamTimeoutResponse()
            }
            throw e
        }
        const status = respFromGateway.status
        switch (status) {
            // try block
            case 400:
                if (!(await keyIsInvalid(respFromGateway, provider))) {
                    return proxyResponse(respFromGateway) // user error
                }

            // key is invalid, then continue to block and next key
            case 401:
            case 403:
                ctx.waitUntil(keyService.setKeyStatus(env, provider, selectedKey.id, 'blocked'))
                console.error(`key ${selectedKey.id} is blocked due to ${respFromGateway.status}`)
                blockedThisRun++
                if (activeKeys.length < 500) {
                    // save the CPU time for Cloudflare Free plan
                    activeKeys.splice(activeKeys.indexOf(selectedKey), 1)
                }
                continue

            // rate limited: cool the key for the right amount (RPD → midnight PT,
            // per-minute → the provider's RetryInfo delay) and try another key
            case 429: {
                const { seconds: sec, cause } = await classifyRate429(respFromGateway, provider)
                ctx.waitUntil(keyService.setKeyModelCooldownIfAvailable(env, selectedKey.id, provider, model, sec))
                sawRateLimit = true
                lastRateLimitSec = sec
                lastRate429Cause = cause
                cooledThisRun++
                console.warn(
                    `key ${selectedKey.id} cooling ${sec}s for model ${model} (429 ${cause}, attempt ${i + 1}/${MAX_RETRIES})`
                )
                if (activeKeys.length < 500) {
                    activeKeys.splice(activeKeys.indexOf(selectedKey), 1)
                }
                continue
            }

            case 500:
            case 502:
            case 503:
            case 504:
                console.error(`gateway returned 5xx ${respFromGateway.status}`)
                lastServerErrorStatus = respFromGateway.status
                continue // no backoff, just retry...
        }

        return proxyResponse(respFromGateway)
    }

    // Retries exhausted. Surface an HONEST body that names the real CAUSE and the
    // ACTION — but NOTHING about backend capacity/health. ai-node proxies this
    // body VERBATIM to the (possibly shared/sold) virtual-key holder, so the exact
    // active-pool size and the blocked/cooling breakdown are an info-disclosure
    // leak across the trust boundary (STRIDE). The pool composition is logged
    // server-side for operators instead — see logExhaustedPool below.
    logExhaustedPool({
        kind: sawRateLimit ? '429' : '502',
        activePoolSize,
        attempted,
        cooledThisRun,
        blockedThisRun,
        lastServerErrorStatus,
        cause: lastRate429Cause,
        model
    })

    if (sawRateLimit) {
        const headers: Record<string, string> = { 'Content-Type': 'text/plain' }
        if (lastRateLimitSec > 0) {
            headers['Retry-After'] = String(lastRateLimitSec)
        }
        const retryAfterNote = lastRateLimitSec > 0 ? ` Retry-After: ${lastRateLimitSec}s.` : ''
        // FIX B: "returned 429" counts the ACTUAL 429s (cooledThisRun), not every
        // probed key — `attempted` also counts 401/403-blocked and 5xx keys, so
        // the old "each returned 429" claim lied whenever the run was mixed.
        const body =
            `Rate limited: the fingerprint-pinned key and its rotation fallbacks were exhausted ` +
            `(${cooledThisRun} returned 429). ` +
            `Cause: ${describeRate429Cause(lastRate429Cause)}. ` +
            `${rotationAdvice(lastRate429Cause)}` +
            retryAfterNote
        return new Response(body, { status: 429, headers })
    }
    // No rate-limit signal at all. Capture the LAST upstream status (most recent
    // evidence) and explain that a free-tier per-minute/TPM overflow is the
    // likeliest real cause. FIX B: only claim "all returned 5xx" when NO key was
    // blocked this run; a mixed run (some keys 401/403-rejected, or early
    // pool-exhaustion) softens to a claim that does not overstate the 5xx.
    const lastStatusText = lastServerErrorStatus > 0 ? String(lastServerErrorStatus) : '5xx'
    const upstreamClaim =
        blockedThisRun === 0
            ? `all returned 5xx (last status ${lastStatusText})`
            : `last upstream status ${lastStatusText}; the pool returned 5xx and/or rejected keys with no rate-limit signal`
    return new Response(
        `Upstream rejected request after ${attempted} key attempts (no rate-limit signal): ` +
            `${upstreamClaim} — likely request too large for free-tier ` +
            `per-minute TPM or a transient gateway error. Compact the request or use a larger-context model.`,
        { status: 502, headers: { 'Content-Type': 'text/plain' } }
    )
}

// Operator-only record of the exhausted-pool composition. This is the capacity/
// health detail deliberately WITHHELD from the client body (it crosses the
// virtual-key trust boundary): operators get the full picture in the logs, the
// client gets only the cause and the action. Kept as a single structured warn so
// it is greppable and never drifts from the two exhaustion sites that call it.
function logExhaustedPool(info: {
    kind: '429' | '502'
    activePoolSize: number
    attempted: number
    cooledThisRun: number
    blockedThisRun: number
    lastServerErrorStatus: number
    cause: Rate429Cause
    model: string
}): void {
    console.warn(
        `exhausted-pool ${info.kind} model=${info.model} cause=${info.cause} ` +
            `(Pool: ${info.activePoolSize} active, ${info.blockedThisRun} blocked, ${info.cooledThisRun} cooling; ` +
            `attempted=${info.attempted}, lastServerErrorStatus=${info.lastServerErrorStatus || 'none'})`
    )
}

// Human-readable cause for the honest 429 body — mirrors the classification the
// cooldown duration was derived from (RPD vs per-minute/TPM).
function describeRate429Cause(cause: Rate429Cause): string {
    switch (cause) {
        case 'per-day-rpd':
            return 'per-day RPD quota exhausted for the probed projects'
        case 'per-minute-tpm':
            return 'per-minute TPM — request too large for free-tier per-minute quota'
        default:
            return 'rate limited (cause unclassified from the 429 body)'
    }
}

// Whether rotating across more keys can help — it cannot beat an oversized
// per-minute request (every project shares the same free-tier per-minute TPM),
// but a per-day exhaustion may clear on a project that still has daily budget.
function rotationAdvice(cause: Rate429Cause): string {
    if (cause === 'per-minute-tpm') {
        return 'Rotation across more keys will NOT help an oversized per-minute request — compact the request or raise the per-minute quota.'
    }
    if (cause === 'per-day-rpd') {
        return 'These projects are out of per-day budget; rotation may help only if other projects still have daily quota — otherwise wait for the midnight PT reset.'
    }
    return 'If this persists, compact the request or raise the per-minute quota.'
}

function getAuthKey(request: Request, provider: string): string {
    if (provider === 'google-ai-studio') {
        // try to get auth key from query params
        const key = new URL(request.url).searchParams.get('key')
        if (key) {
            return key
        }
    }

    return getAuthKeyFromHeader(request, provider)
}

function getAuthKeyFromHeader(request: Request, provider: string): string {
    const h = getAuthHeaderName(provider)
    let v = request.headers.get(h)
    if (!v) {
        return ''
    }

    let key = v
    if (h === 'Authorization') {
        key = v.replace(/^Bearer\s+/, '')
    }

    return key
}

// Bifrost forwards the conversation fingerprint under the DE-PREFIXED name
// `conversation-fingerprint` (it strips the `x-bf-eh-` prefix ai-node sends).
// Prefer that name; fall back to the legacy `x-conversation-fingerprint` for
// backward compatibility. Centralized so both vend sites stay in sync — reading
// the wrong name silently degrades consistent-hash selection to RANDOM.
function readConversationFingerprint(request: Request): string | undefined {
    return (
        request.headers.get(CONVERSATION_FINGERPRINT_CORE) ??
        request.headers.get(LEGACY_FINGERPRINT_HEADER) ??
        undefined
    )
}

// A fingerprint is usable for consistent hashing only if the WHOLE string is hex
// of a sane length. Anchoring matters for two reasons:
//   1. Correctness: empty/non-hex values make parseInt() return NaN, and
//      `NaN % len` is NaN → keys[NaN] is undefined → crash.
//   2. Log-injection (defense): an UNANCHORED prefix regex (/^[0-9a-fA-F]{8}/)
//      accepts anything that merely starts with 8 hex chars, so a forged suffix
//      laced with control chars would be accepted AND logged verbatim, letting a
//      caller forge log lines. Requiring the full string be hex (8..128 chars —
//      SHA-256 is 64 hex, the band tolerates other hashes) rejects such inputs,
//      which then fall back to random selection.
const FINGERPRINT_HEX = /^[0-9a-fA-F]{8,128}$/

function isUsableFingerprint(fingerprint: string | undefined): fingerprint is string {
    return !!fingerprint && FINGERPRINT_HEX.test(fingerprint)
}

// Never log a raw fingerprint: even a validated one is logged only as a short,
// fixed-length slice so a hostile or malformed header value can never inject
// newlines/control chars into the log stream. Defense in depth — the validator
// already rejects non-hex, but the log sites must be safe on their own.
function safeFingerprint(fingerprint: string | undefined): string {
    return fingerprint ? fingerprint.slice(0, 8) : '(none)'
}

function getDeterministicIndex(fingerprint: string, length: number): number {
    const hexPart = fingerprint.substring(0, 8)
    const num = parseInt(hexPart, 16)
    // Defense in depth: callers gate on isUsableFingerprint, but never let a
    // bad value yield NaN here (NaN % len = NaN → keys[NaN] = undefined → crash).
    if (Number.isNaN(num)) {
        return 0
    }
    return num % length
}

function tryHashedSelect(keys: schema.Key[], model: string, fingerprint: string): schema.Key | null {
    const now = Date.now() / 1000
    const keyIndex = getDeterministicIndex(fingerprint, keys.length)
    const maxAttempts = Math.min(10, keys.length)

    for (let i = 0; i < maxAttempts; i++) {
        const idx = (keyIndex + i) % keys.length
        const candidateKey = keys[idx]
        const coolingEnd = candidateKey.modelCoolings?.[model]?.end_at

        if (!coolingEnd || coolingEnd < now) {
            console.info(
                `selected deterministic key ${candidateKey.id} for fingerprint ${safeFingerprint(fingerprint)} (attempt: ${i + 1})`
            )
            return candidateKey
        }
    }

    return null
}

async function selectKey(keys: schema.Key[], model: string, fingerprint?: string): Promise<schema.Key> {
    // Only an empty-or-non-hex fingerprint degrades to random; a usable one pins
    // a key by consistent hash so a conversation sticks to the same key (sharing
    // its rate-limit budget) instead of fanning out across the pool.
    const hashable = isUsableFingerprint(fingerprint) ? fingerprint : undefined

    if (hashable) {
        let selectedKey = tryHashedSelect(keys, model, hashable)
        if (selectedKey) {
            return selectedKey
        }
    } else {
        let selectedKey = tryRandomSelect(keys, model) // fast path
        if (selectedKey) {
            return selectedKey
        }
    }

    return selectFromAllKeys(keys, model, hashable)
}

function tryRandomSelect(keys: schema.Key[], model: string): schema.Key | null {
    const now = Date.now() / 1000
    const maxAttempts = 10

    for (let i = 0; i < maxAttempts; i++) {
        const randomKey = keys[Math.floor(Math.random() * keys.length)]
        const coolingEnd = randomKey.modelCoolings?.[model]?.end_at

        if (!coolingEnd || coolingEnd < now) {
            console.info(`selected a key ${randomKey.id} to try; count: ${i + 1}`)
            return randomKey
        }
    }

    return null
}

function selectFromAllKeys(keys: schema.Key[], model: string, fingerprint?: string): schema.Key {
    const now = Date.now() / 1000
    const availableKeys = []
    let bestCoolingKey: schema.Key | null = null
    let earliestCooldownEnd = Infinity

    for (const key of keys) {
        const coolingEnd = key.modelCoolings?.[model]?.end_at
        if (!coolingEnd || coolingEnd < now) {
            availableKeys.push(key)
        } else if (coolingEnd < earliestCooldownEnd) {
            earliestCooldownEnd = coolingEnd
            bestCoolingKey = key
        }
    }

    if (availableKeys.length > 0) {
        let selectedKey
        if (fingerprint) {
            const idx = getDeterministicIndex(fingerprint, availableKeys.length)
            selectedKey = availableKeys[idx]
        } else {
            selectedKey = availableKeys[Math.floor(Math.random() * availableKeys.length)]
        }
        console.info(
            `selected available key ${selectedKey.id} after full scan (fingerprint: ${safeFingerprint(fingerprint)})`
        )
        return selectedKey
    }

    console.warn(`selected a cooling key ${bestCoolingKey?.id} to try`)
    return bestCoolingKey! // may be available actually
}

async function makeGatewayRequest(
    method: string,
    headers: Headers,
    body: ArrayBuffer | null,
    env: Env,
    restResource: string,
    key: string
): Promise<Request> {
    const newHeaders = new Headers(headers)
    stripInternalRoutingHeaders(newHeaders)
    setAuthHeader(newHeaders, restResource, key)

    const selected = selectGateway(env)
    let base = await env.AI.gateway(selected).getUrl()
    if (!base.endsWith('/')) {
        base += '/'
    }
    const url = `${base}${restResource}`

    return new Request(url, {
        method: method,
        headers: newHeaders,
        body: body,
        redirect: 'follow'
    })
}

// Internal routing headers used only for in-worker key selection. They must NOT
// leak to the upstream provider (Google / AI Gateway): selection has already run
// by the time we build the upstream request, so they carry no further meaning and
// forwarding them needlessly exposes our routing scheme. Body is passed and sent
// separately, so stripping headers never mutates the forwarded request body.
function stripInternalRoutingHeaders(headers: Headers): void {
    headers.delete(CONVERSATION_FINGERPRINT_CORE)
    headers.delete(LEGACY_FINGERPRINT_HEADER)
    // ai-node sends the fingerprint (and any future routing hints) under the
    // x-bf-eh-* family; Bifrost strips the prefix, but defend against any that
    // reach us prefixed. Header names are case-insensitive in the Headers API.
    for (const name of [...headers.keys()]) {
        if (name.toLowerCase().startsWith(BIFROST_ECHO_PREFIX)) {
            headers.delete(name)
        }
    }
}

function selectGateway(env: Env): string {
    const gateways = env.AI_GATEWAY.split(',').map(s => s.trim())
    const selected = gateways[Math.floor(Math.random() * gateways.length)]
    console.info(`selected gateway ${selected}`)
    return selected
}

function setAuthHeader(headers: Headers, restResource: string, key: string) {
    const provider = restResource.split('/')[0]

    let v = key
    const h = getAuthHeaderName(provider)
    if (h == 'Authorization') {
        v = `Bearer ${key}`
    }

    headers.set(h, v)
}

async function keyIsInvalid(respFromGateway: Response, provider: string): Promise<boolean> {
    if (provider !== 'google-ai-studio') {
        return false // TODO: support other providers
    }

    if (respFromGateway.status !== 400) {
        return false
    }

    try {
        const body = await respFromGateway.clone().json()
        const detail = getGoogleAiStudioErrorDetail(body, 'type.googleapis.com/google.rpc.ErrorInfo')
        return detail?.reason === 'API_KEY_INVALID' // may already deleted.
    } catch {
        return false
    }
}

// Why a 429 happened — the dimension that decides whether ROTATING to another
// key can possibly help:
//   • 'per-day-rpd'    — this project's per-day request quota is spent; a DIFFERENT
//                        project (key) still has budget, so rotation genuinely helps.
//   • 'per-minute-tpm' — a per-minute / input-tokens-per-minute limit. A request
//                        larger than any single free project's per-minute TPM 429s
//                        on EVERY key — rotation can NEVER save it; the request must
//                        be compacted or the quota raised.
//   • 'unknown'        — no QuotaFailure/RetryInfo we could classify.
// This is the SAME signal the cooldown duration is derived from (RPD → bench until
// midnight; per-minute → short cooldown), surfaced so the exhausted-pool message
// can state the TRUE cause instead of the old "all keys cooling down" lie.
export type Rate429Cause = 'per-day-rpd' | 'per-minute-tpm' | 'unknown'

// A classified 429: how long to cool the key AND why it was throttled. Both come
// from one parse of the body so the cooldown and the user-facing cause never drift.
export interface Rate429 {
    seconds: number
    cause: Rate429Cause
}

// cooldownSecondsFor429 derives how long to cool a key from the ACTUAL quota
// signal in the 429 body, not a consecutive-count heuristic. The old code
// benched a key until midnight PT (≤24h) after N consecutive 429s — which
// misclassified a per-minute/size 429 as daily exhaustion and pulled healthy
// project-keys out of rotation for the whole day. Here a per-day (RPD) signal
// benches until midnight (rotating to another project genuinely helps), while a
// per-minute limit yields a short cooldown (rotation does NOT help an oversized
// request, so we cool briefly and let the bounded retry loop give up fast).
export async function cooldownSecondsFor429(respFromGateway: Response, provider: string): Promise<number> {
    return (await classifyRate429(respFromGateway, provider)).seconds
}

// classifyRate429 returns both the cooldown duration and the cause in one pass.
// cooldownSecondsFor429 is the thin "seconds only" wrapper kept for the callers
// (and tests) that only need the duration.
export async function classifyRate429(respFromGateway: Response, provider: string): Promise<Rate429> {
    if (provider === 'google-ai-studio') {
        return untilResetForGoogleAiStudio(respFromGateway)
    }
    if (provider === 'openrouter') {
        return { seconds: await untilResetForOpenrouter(respFromGateway), cause: 'unknown' }
    }

    return { seconds: 65, cause: 'unknown' }
}

async function untilResetForGoogleAiStudio(respFromGateway: Response): Promise<Rate429> {
    try {
        const errorBody = await respFromGateway.clone().json()
        const quotaFailureDetail = getGoogleAiStudioErrorDetail(
            errorBody,
            'type.googleapis.com/google.rpc.QuotaFailure'
        )
        if (quotaFailureDetail) {
            const violations = quotaFailureDetail.violations || []
            for (const violation of violations) {
                if (violation.quotaId === 'GenerateRequestsPerDayPerProjectPerModel-FreeTier') {
                    // Requests-per-day (RPD) quota — this project is done for the
                    // day; reset is at midnight Pacific. Rotating keys helps here.
                    console.warn('429 reason=RPD (per-day per-project) → cool until midnight PT')
                    return { seconds: util.getSecondsUntilMidnightPT(), cause: 'per-day-rpd' }
                }
            }
            // QuotaFailure present but not RPD → a per-minute/per-request quota
            // (e.g. input tokens/min). A request bigger than the free per-minute
            // TPM will hit this on EVERY project — rotation cannot save it.
            console.warn(
                `429 reason=per-minute/other quota (${violations.map((v: any) => v.quotaId).join(',') || 'unknown'})`
            )
        }

        const retryInfoDetail = getGoogleAiStudioErrorDetail(errorBody, 'type.googleapis.com/google.rpc.RetryInfo')
        if (retryInfoDetail && retryInfoDetail.retryDelay) {
            const retrySeconds = parseInt(retryInfoDetail.retryDelay.replace('s', ''))
            // A malformed retryDelay (e.g. "" or "fast") makes parseInt return NaN.
            // Never propagate a NaN cooldown — fall back to the same safe default
            // used for an unclassified 429 instead of benching the key for NaN.
            if (Number.isFinite(retrySeconds)) {
                console.warn(`429 reason=RetryInfo retryDelay=${retrySeconds}s`)
                // A bare RetryInfo (no RPD QuotaFailure) is the per-minute backoff
                // signal — rotation cannot beat an oversized per-minute request.
                return { seconds: retrySeconds + 2, cause: 'per-minute-tpm' } // 2 seconds buffer
            }
            console.warn(`429 reason=RetryInfo unparseable retryDelay='${retryInfoDetail.retryDelay}' → fallback 65s`)
            // QuotaFailure(non-RPD) reached here only via a per-minute quota; an
            // unparseable delay still leaves the cause per-minute. With neither
            // signal present the cause is genuinely unknown.
            return { seconds: 65, cause: quotaFailureDetail ? 'per-minute-tpm' : 'unknown' }
        }
        console.warn('429 reason=unclassified (no QuotaFailure/RetryInfo) → fallback 65s')
        // A non-RPD QuotaFailure with no RetryInfo is still a per-minute/per-request
        // limit; truly nothing parseable → unknown.
        return { seconds: 65, cause: quotaFailureDetail ? 'per-minute-tpm' : 'unknown' }
    } catch (error) {
        console.error('failed to parse google-ai-studio 429 response, fallback to 65 seconds', error)
    }
    return { seconds: 65, cause: 'unknown' }
}

async function untilResetForOpenrouter(respFromGateway: Response): Promise<number> {
    try {
        const resetHeader = respFromGateway.headers.get('X-RateLimit-Reset')
        if (resetHeader) {
            const resetTime = parseInt(resetHeader)
            const now = Date.now()
            if (resetTime > now) {
                const cooldownSeconds = Math.floor((resetTime - now) / 1000) + 5
                return cooldownSeconds
            }
        }
    } catch (error) {
        console.error('failed to parse openrouter 429 response, fallback to 65 seconds', error)
    }
    return 65
}

function getGoogleAiStudioErrorDetail(body: any, type: string): any | null {
    let errorBody = body
    if (Array.isArray(body) && body.length > 0) {
        errorBody = body[0]
    }

    const details = errorBody.error?.details || []
    for (const detail of details) {
        if (detail['@type'] === type) {
            return detail
        }
    }

    return null
}
