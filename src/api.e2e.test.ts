import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the D1-backed key service so these e2e tests exercise the worker's
// request handling (routing, vending contract, retry loop) without a database.
vi.mock('./service/key', () => ({
    listActiveKeysViaCache: vi.fn(),
    setKeyStatus: vi.fn(async () => {}),
    setKeyModelCooldownIfAvailable: vi.fn(async () => {})
}))

import * as keyService from './service/key'
import { handle, DEFAULT_UPSTREAM_TIMEOUT_MS, BIFROST_TIMEOUT_MS } from './api'
import worker from './index'

const KEY_MANAGER_TOKEN = 'kmt-test'
const AUTH_KEY = 'svc-test'

function makeEnv(overrides: Record<string, unknown> = {}): Env {
    return {
        AUTH_KEY,
        KEY_MANAGER_TOKEN,
        AI_GATEWAY: 'one-balance',
        AI: { gateway: (_name: string) => ({ getUrl: async () => 'https://gateway.example/' }) },
        ...overrides
    } as unknown as Env
}

function makeCtx(): ExecutionContext {
    return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext
}

// Several keys so the retry loop can rotate (forward() splices each tried key
// out of the pool — prod gets a fresh array per call, so the mock must too).
const sampleKeys = [
    { id: 'key-1', key: 'secret-1', modelCoolings: {} },
    { id: 'key-2', key: 'secret-2', modelCoolings: {} },
    { id: 'key-3', key: 'secret-3', modelCoolings: {} }
]

beforeEach(() => {
    vi.clearAllMocks()
    ;(keyService.listActiveKeysViaCache as any).mockImplementation(async () =>
        sampleKeys.map(k => ({ ...k, modelCoolings: { ...k.modelCoolings } }))
    )
})

// ─── Key Manager vending contract (ai-node depends on this byte-for-byte) ───

describe('Key Manager vending contract', () => {
    it('GET /api/keys/next returns {key,id,cooling_until} with a valid token', async () => {
        const req = new Request('https://ob/api/keys/next?provider=google-ai-studio&model=gemini-2.5-flash', {
            method: 'GET',
            headers: { Authorization: `Bearer ${KEY_MANAGER_TOKEN}` }
        })
        const res = await handle(req, makeEnv(), makeCtx())
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toContain('application/json')
        const body = (await res.json()) as { key: string; id: string; cooling_until: number | null }
        // Contract shape ai-node reads — exact key is selectKey's (random) choice.
        expect(Object.keys(body).sort()).toEqual(['cooling_until', 'id', 'key'])
        expect(body.key).toMatch(/^secret-/)
        expect(body.id).toMatch(/^key-/)
        expect(body.cooling_until).toBeNull()
    })

    it('GET /api/keys/next rejects a bad KEY_MANAGER_TOKEN with 401', async () => {
        const req = new Request('https://ob/api/keys/next?provider=google-ai-studio&model=m', {
            method: 'GET',
            headers: { Authorization: 'Bearer wrong' }
        })
        const res = await handle(req, makeEnv(), makeCtx())
        expect(res.status).toBe(401)
    })

    it('GET /api/keys/next → 400 without provider/model', async () => {
        const req = new Request('https://ob/api/keys/next', {
            method: 'GET',
            headers: { Authorization: `Bearer ${KEY_MANAGER_TOKEN}` }
        })
        const res = await handle(req, makeEnv(), makeCtx())
        expect(res.status).toBe(400)
    })

    it('GET /api/keys/next → 503 when the pool is empty', async () => {
        ;(keyService.listActiveKeysViaCache as any).mockResolvedValue([])
        const req = new Request('https://ob/api/keys/next?provider=google-ai-studio&model=m', {
            method: 'GET',
            headers: { Authorization: `Bearer ${KEY_MANAGER_TOKEN}` }
        })
        const res = await handle(req, makeEnv(), makeCtx())
        expect(res.status).toBe(503)
    })

    it('POST /api/keys/{id}/status {blocked} marks the key blocked', async () => {
        const req = new Request('https://ob/api/keys/key-1/status', {
            method: 'POST',
            headers: { Authorization: `Bearer ${KEY_MANAGER_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ blocked: true, provider: 'google-ai-studio' })
        })
        const res = await handle(req, makeEnv(), makeCtx())
        expect(res.status).toBe(200)
        expect(keyService.setKeyStatus).toHaveBeenCalledWith(expect.anything(), 'google-ai-studio', 'key-1', 'blocked')
    })

    it('POST /api/keys/{id}/status {rate_limited} cools the key for the model', async () => {
        const req = new Request('https://ob/api/keys/key-1/status', {
            method: 'POST',
            headers: { Authorization: `Bearer ${KEY_MANAGER_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rate_limited: true,
                retry_after: 60,
                provider: 'google-ai-studio',
                model: 'gemini-2.5-flash'
            })
        })
        const res = await handle(req, makeEnv(), makeCtx())
        expect(res.status).toBe(200)
        expect(keyService.setKeyModelCooldownIfAvailable).toHaveBeenCalledWith(
            expect.anything(),
            'key-1',
            'google-ai-studio',
            'gemini-2.5-flash',
            60
        )
    })

    it('POST /api/keys/{id}/status {rate_limited, retry_after:0} is accepted and cools the key (0 is valid)', async () => {
        // retry_after:0 is a legitimate "cool for zero extra seconds" signal; the
        // old truthiness check (`&& body.retry_after`) rejected it as a 400.
        const req = new Request('https://ob/api/keys/key-1/status', {
            method: 'POST',
            headers: { Authorization: `Bearer ${KEY_MANAGER_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rate_limited: true,
                retry_after: 0,
                provider: 'google-ai-studio',
                model: 'gemini-2.5-flash'
            })
        })
        const res = await handle(req, makeEnv(), makeCtx())
        expect(res.status).toBe(200)
        expect(keyService.setKeyModelCooldownIfAvailable).toHaveBeenCalledWith(
            expect.anything(),
            'key-1',
            'google-ai-studio',
            'gemini-2.5-flash',
            0
        )
    })

    it('POST /api/keys/{id}/status {blocked} → 400 when provider is missing (no defaulting)', async () => {
        const req = new Request('https://ob/api/keys/key-1/status', {
            method: 'POST',
            headers: { Authorization: `Bearer ${KEY_MANAGER_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ blocked: true })
        })
        const res = await handle(req, makeEnv(), makeCtx())
        expect(res.status).toBe(400)
        expect(keyService.setKeyStatus).not.toHaveBeenCalled()
    })

    it('POST /api/keys/{id}/status {rate_limited} → 400 when provider is missing (no defaulting)', async () => {
        const req = new Request('https://ob/api/keys/key-1/status', {
            method: 'POST',
            headers: { Authorization: `Bearer ${KEY_MANAGER_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ rate_limited: true, retry_after: 60, model: 'gemini-2.5-flash' })
        })
        const res = await handle(req, makeEnv(), makeCtx())
        expect(res.status).toBe(400)
        expect(keyService.setKeyModelCooldownIfAvailable).not.toHaveBeenCalled()
    })

    it('POST /api/keys/{id}/status {rate_limited} → 400 when retry_after is missing (no silent cooldown loss)', async () => {
        // rate_limited without a numeric retry_after gets a precise 400 instead of
        // falling through to the generic "invalid status body" and dropping the cooldown.
        const req = new Request('https://ob/api/keys/key-1/status', {
            method: 'POST',
            headers: { Authorization: `Bearer ${KEY_MANAGER_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ rate_limited: true, provider: 'google-ai-studio', model: 'gemini-2.5-flash' })
        })
        const res = await handle(req, makeEnv(), makeCtx())
        expect(res.status).toBe(400)
        expect(await res.text()).toContain('retry_after')
        expect(keyService.setKeyModelCooldownIfAvailable).not.toHaveBeenCalled()
    })

    it('POST /api/keys/{id}/status {ok} returns 200', async () => {
        const req = new Request('https://ob/api/keys/key-1/status', {
            method: 'POST',
            headers: { Authorization: `Bearer ${KEY_MANAGER_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ok: true })
        })
        const res = await handle(req, makeEnv(), makeCtx())
        expect(res.status).toBe(200)
    })
})

// ─── Proxy path: happy path intact + bounded retry (the avalanche fix) ──────

describe('proxy forward() — happy path + bounded retry', () => {
    const proxyReq = () =>
        new Request('https://ob/api/compat/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${AUTH_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'google-ai-studio/gemini-2.5-flash', messages: [] })
        })

    it('passes a 200 straight through (happy path unchanged)', async () => {
        const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)
        const res = await handle(proxyReq(), makeEnv(), makeCtx())
        expect(res.status).toBe(200)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('caps retries at 3 on persistent 429 and returns a clean 429 + Retry-After', async () => {
        const body429 = JSON.stringify({
            error: {
                code: 429,
                details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '30s' }]
            }
        })
        const fetchMock = vi.fn(async () => new Response(body429, { status: 429 }))
        vi.stubGlobal('fetch', fetchMock)

        const res = await handle(proxyReq(), makeEnv(), makeCtx())

        expect(fetchMock).toHaveBeenCalledTimes(3) // MAX_RETRIES = 3, not 30
        expect(res.status).toBe(429) // real rate-limit signal, not a generic 500
        expect(res.headers.get('Retry-After')).toBe('32') // 30 + 2s buffer
        expect(keyService.setKeyModelCooldownIfAvailable).toHaveBeenCalled()
    })

    it('returns a 400 user error without retrying (not a key problem)', async () => {
        const fetchMock = vi.fn(async () => new Response('{"error":"bad request"}', { status: 400 }))
        vi.stubGlobal('fetch', fetchMock)
        const res = await handle(proxyReq(), makeEnv(), makeCtx())
        expect(res.status).toBe(400)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('rejects a request with an invalid service AUTH_KEY (403)', async () => {
        const req = new Request('https://ob/api/compat/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: 'Bearer wrong-key', 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'google-ai-studio/gemini-2.5-flash', messages: [] })
        })
        const res = await handle(req, makeEnv(), makeCtx())
        expect(res.status).toBe(403)
    })
})

// ─── ListModels on the Gemini-native path (Bifrost enumerates models here) ──

describe('ListModels — GET /api/{provider}/v1beta/models', () => {
    const listReq = (headers: Record<string, string> = { 'x-goog-api-key': AUTH_KEY }) =>
        new Request('https://ob/api/google-ai-studio/v1beta/models', { method: 'GET', headers })

    it('forwards to the gateway with a pooled key and returns the upstream model JSON', async () => {
        const modelsJson = { models: [{ name: 'models/gemini-2.5-flash' }, { name: 'models/gemini-2.5-pro' }] }
        let capturedUrl = ''
        let capturedKey = ''
        const fetchMock = vi.fn(async (req: Request) => {
            capturedUrl = req.url
            capturedKey = req.headers.get('x-goog-api-key') ?? ''
            return new Response(JSON.stringify(modelsJson), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            })
        })
        vi.stubGlobal('fetch', fetchMock)

        const res = await handle(listReq(), makeEnv(), makeCtx())
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toContain('application/json')
        expect(await res.json()).toEqual(modelsJson)
        // A pooled key (secret-*) was injected — not the caller's AUTH_KEY.
        expect(capturedKey).toMatch(/^secret-/)
        // Gateway URL is AI.gateway().getUrl() + the rest resource, unchanged.
        expect(capturedUrl).toBe('https://gateway.example/google-ai-studio/v1beta/models')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('→ 503 when the provider has no active keys', async () => {
        vi.mocked(keyService.listActiveKeysViaCache).mockResolvedValue([])
        const res = await handle(listReq(), makeEnv(), makeCtx())
        expect(res.status).toBe(503)
    })

    it('→ 403 with an invalid service auth key', async () => {
        const res = await handle(listReq({ 'x-goog-api-key': 'wrong' }), makeEnv(), makeCtx())
        expect(res.status).toBe(403)
    })

    it('retries once on a transient 5xx, then returns the 200 (GET is idempotent)', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('upstream boom', { status: 503 }))
            .mockResolvedValueOnce(
                new Response('{"models":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } })
            )
        vi.stubGlobal('fetch', fetchMock)
        const res = await handle(listReq(), makeEnv(), makeCtx())
        expect(res.status).toBe(200)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('rotates to another key when the first pooled key is rejected (403 → 200)', async () => {
        // One bad/blocked pooled key must not fail the whole list for a healthy pool.
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
            .mockResolvedValueOnce(
                new Response('{"models":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } })
            )
        vi.stubGlobal('fetch', fetchMock)
        const res = await handle(listReq(), makeEnv(), makeCtx())
        expect(res.status).toBe(200)
        expect(fetchMock).toHaveBeenCalledTimes(2)
        // list-models rotates only — it never benches the key.
        expect(keyService.setKeyStatus).not.toHaveBeenCalled()
    })

    it('surfaces the upstream 403 when every rotation attempt is rejected', async () => {
        const fetchMock = vi.fn(async () => new Response('forbidden', { status: 403 }))
        vi.stubGlobal('fetch', fetchMock)
        const res = await handle(listReq(), makeEnv(), makeCtx())
        expect(res.status).toBe(403) // real upstream status, not a synthetic 502
        // maxAttempts = min(3, 3 sample keys) → 3 rotations, all 403.
        expect(fetchMock).toHaveBeenCalledTimes(3)
        expect(keyService.setKeyStatus).not.toHaveBeenCalled()
    })

    it('strips content-disposition from the forwarded list-models response', async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response('{"models":[]}', {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Disposition': 'attachment; filename="models.json"'
                    }
                })
        )
        vi.stubGlobal('fetch', fetchMock)
        const res = await handle(listReq(), makeEnv(), makeCtx())
        expect(res.status).toBe(200)
        expect(res.headers.get('content-disposition')).toBeNull()
    })

    it('→ 504 + Retry-After when the gateway hangs past UPSTREAM_TIMEOUT_MS', async () => {
        const hangingFetch = vi.fn(
            (_input: Request, init?: { signal?: AbortSignal }) =>
                new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => {
                        const err = new Error('aborted')
                        err.name = 'AbortError'
                        reject(err)
                    })
                })
        )
        vi.stubGlobal('fetch', hangingFetch)
        const res = await handle(listReq(), makeEnv({ UPSTREAM_TIMEOUT_MS: '20' }), makeCtx())
        expect(res.status).toBe(504)
        expect(res.headers.get('Retry-After')).toBe('1')
    })

    it('strips our ?key= from the forwarded upstream URL (never leak AUTH_KEY to the gateway/Google)', async () => {
        let capturedUrl = ''
        const fetchMock = vi.fn(async (req: Request) => {
            capturedUrl = req.url
            return new Response('{"models":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } })
        })
        vi.stubGlobal('fetch', fetchMock)
        // Authenticate via ?key= (the google-ai-studio query style): it must authorize
        // the caller but never appear in the URL forwarded upstream.
        const req = new Request(`https://ob/api/google-ai-studio/v1beta/models?key=${AUTH_KEY}`, { method: 'GET' })
        const res = await handle(req, makeEnv(), makeCtx())
        expect(res.status).toBe(200)
        expect(capturedUrl).not.toContain('key=')
        expect(capturedUrl).toBe('https://gateway.example/google-ai-studio/v1beta/models')
    })

    it('a model-specific GET (.../v1beta/models/<model>) is NOT list-models — goes through the model proxy', async () => {
        // The version+/models anchor must exclude the per-model path. Proof: the
        // model proxy cools the key on 429 (setKeyModelCooldownIfAvailable); the
        // list path never does. Its having been called means forward() handled it.
        const body429 = JSON.stringify({
            error: {
                code: 429,
                details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '30s' }]
            }
        })
        const fetchMock = vi.fn(async () => new Response(body429, { status: 429 }))
        vi.stubGlobal('fetch', fetchMock)
        const req = new Request('https://ob/api/google-ai-studio/v1beta/models/gemini-2.5-flash', {
            method: 'GET',
            headers: { 'x-goog-api-key': AUTH_KEY }
        })
        const res = await handle(req, makeEnv(), makeCtx())
        expect(res.status).toBe(429)
        expect(keyService.setKeyModelCooldownIfAvailable).toHaveBeenCalled()
    })
})

// ─── Upstream timeout: AbortController gates header receipt, not the stream ──

describe('upstream timeout (AbortController → 504 + Retry-After)', () => {
    const proxyReq = () =>
        new Request('https://ob/api/compat/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${AUTH_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'google-ai-studio/gemini-2.5-flash', messages: [] })
        })

    it('returns 504 + Retry-After when the gateway hangs past UPSTREAM_TIMEOUT_MS', async () => {
        // Never resolves on its own; rejects with AbortError when our timer fires
        // the controller signal — exactly what a hung upstream produces under it.
        const hangingFetch = vi.fn(
            (_input: Request, init?: { signal?: AbortSignal }) =>
                new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => {
                        const err = new Error('aborted')
                        err.name = 'AbortError'
                        reject(err)
                    })
                })
        )
        vi.stubGlobal('fetch', hangingFetch)

        const res = await handle(proxyReq(), makeEnv({ UPSTREAM_TIMEOUT_MS: '20' }), makeCtx())
        expect(res.status).toBe(504)
        expect(res.headers.get('Retry-After')).toBe('1')
    })

    it('does not abort the stream once headers are received (timer cleared)', async () => {
        // Resolves immediately (headers in) with a tiny timeout; waiting past the
        // timeout must NOT corrupt the body — the timer was cleared on resolve.
        const fetchMock = vi.fn(
            async () => new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })
        )
        vi.stubGlobal('fetch', fetchMock)

        const res = await handle(proxyReq(), makeEnv({ UPSTREAM_TIMEOUT_MS: '10' }), makeCtx())
        expect(res.status).toBe(200)
        await new Promise(resolve => setTimeout(resolve, 40)) // outlast the 10ms timeout
        expect(await res.json()).toEqual({ ok: true })
    })

    it('streams a body chunk that arrives AFTER the timeout window (timer gates headers, not body)', async () => {
        // Real ReadableStream: headers resolve immediately, but the single body chunk
        // is enqueued 60ms later — well past the 20ms header timeout. The abort timer
        // is cleared once fetch resolves, so the late chunk must reach the client whole
        // and not be torn by the timeout.
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                setTimeout(() => {
                    controller.enqueue(new TextEncoder().encode('{"late":true}'))
                    controller.close()
                }, 60)
            }
        })
        const fetchMock = vi.fn(
            async () => new Response(stream, { status: 200, headers: { 'Content-Type': 'application/json' } })
        )
        vi.stubGlobal('fetch', fetchMock)

        const res = await handle(proxyReq(), makeEnv({ UPSTREAM_TIMEOUT_MS: '20' }), makeCtx())
        expect(res.status).toBe(200)
        // Consuming the body waits for the delayed chunk; it must arrive intact.
        expect(await res.json()).toEqual({ late: true })
    })

    // Timeout-inversion guard: one-balance's default upstream timeout MUST sit
    // strictly above Bifrost's 60s so the CALLER's timer always owns timeouts and
    // the two never race. If someone "rounds" the default back down to 60s (or
    // below), this fails and explains why — preventing the inverted failure where
    // the inner proxy reports a timeout that belongs to the outer gateway.
    it('default upstream timeout outlasts Bifrost (no inverted timeout race)', () => {
        expect(DEFAULT_UPSTREAM_TIMEOUT_MS).toBeGreaterThan(BIFROST_TIMEOUT_MS)
        expect(DEFAULT_UPSTREAM_TIMEOUT_MS).toBe(65_000)
        expect(BIFROST_TIMEOUT_MS).toBe(60_000)
    })
})

// ─── internal routing header leak guard (стержень #8) ───────────────────────
// Internal routing headers used only for in-worker key selection must NEVER
// reach the upstream provider (Google / AI Gateway): selection has already run
// by the time the upstream request is built, so they carry no further meaning
// and forwarding them needlessly exposes our routing scheme. stripInternalRouting
// Headers is 0%-covered today — a deleted delete() ships green. This pins it.

describe('internal routing header leak guard (never forwarded upstream)', () => {
    it('strips conversation-fingerprint, x-conversation-fingerprint, and x-bf-eh-* before the gateway fetch', async () => {
        // Capture the EXACT headers on the upstream request the worker builds.
        let upstream: Headers | undefined
        const fetchMock = vi.fn(async (req: Request) => {
            upstream = req.headers
            return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })
        })
        vi.stubGlobal('fetch', fetchMock)

        const req = new Request('https://ob/api/compat/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${AUTH_KEY}`,
                'Content-Type': 'application/json',
                // The three internal routing header shapes that must be stripped:
                'conversation-fingerprint': '00000004deadbeefcafef00d',
                'x-conversation-fingerprint': '00000004deadbeefcafef00d',
                // An arbitrary x-bf-eh-* member (mixed-case to prove case-insensitive strip).
                'X-Bf-Eh-Conversation-Fingerprint': '00000004deadbeefcafef00d'
            },
            body: JSON.stringify({ model: 'google-ai-studio/gemini-2.5-flash', messages: [] })
        })

        const res = await handle(req, makeEnv(), makeCtx())
        expect(res.status).toBe(200)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(upstream).toBeDefined()

        // Headers.get is case-insensitive — each internal routing header is ABSENT.
        expect(upstream!.get('conversation-fingerprint')).toBeNull()
        expect(upstream!.get('CONVERSATION-FINGERPRINT')).toBeNull()
        expect(upstream!.get('x-conversation-fingerprint')).toBeNull()
        expect(upstream!.get('x-bf-eh-conversation-fingerprint')).toBeNull()

        // Belt and braces: NO header whose lowercased name is one of the internal
        // routing names — or starts with the x-bf-eh- prefix — survives upstream.
        const leaked = [...upstream!.keys()].filter(
            n =>
                n.toLowerCase() === 'conversation-fingerprint' ||
                n.toLowerCase() === 'x-conversation-fingerprint' ||
                n.toLowerCase().startsWith('x-bf-eh-')
        )
        expect(leaked).toEqual([])
    })

    it('still forwards a benign header (proves the strip is targeted, not a blanket wipe)', async () => {
        // The guard must remove ONLY internal routing headers — an ordinary header
        // (here the auth header the gateway needs) must still reach upstream.
        let upstream: Headers | undefined
        const fetchMock = vi.fn(async (req: Request) => {
            upstream = req.headers
            return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })
        })
        vi.stubGlobal('fetch', fetchMock)

        const req = new Request('https://ob/api/compat/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${AUTH_KEY}`,
                'Content-Type': 'application/json',
                'conversation-fingerprint': '00000004deadbeefcafef00d'
            },
            body: JSON.stringify({ model: 'google-ai-studio/gemini-2.5-flash', messages: [] })
        })
        const res = await handle(req, makeEnv(), makeCtx())
        expect(res.status).toBe(200)
        expect(upstream!.get('conversation-fingerprint')).toBeNull()
        // The compat proxy path authenticates upstream via the Authorization header,
        // carrying the pooled key (secret-*). It survives the strip — proving the
        // guard removes only internal routing headers, not the request wholesale.
        expect(upstream!.get('Authorization')).toMatch(/^Bearer secret-/)
    })
})

// ─── content-disposition stripping on proxied responses ─────────────────────

describe('content-disposition stripping', () => {
    it('removes content-disposition from a forwarded upstream response', async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response('{"ok":true}', {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Disposition': 'attachment; filename="resp.json"'
                    }
                })
        )
        vi.stubGlobal('fetch', fetchMock)
        const req = new Request('https://ob/api/compat/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${AUTH_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'google-ai-studio/gemini-2.5-flash', messages: [] })
        })
        const res = await handle(req, makeEnv(), makeCtx())
        expect(res.status).toBe(200)
        expect(res.headers.get('content-disposition')).toBeNull()
        expect(res.headers.get('Content-Type')).toContain('application/json')
    })

    it('removes set-cookie from a forwarded upstream response', async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response('{"ok":true}', {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'sess=abc; HttpOnly' }
                })
        )
        vi.stubGlobal('fetch', fetchMock)
        const req = new Request('https://ob/api/compat/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${AUTH_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'google-ai-studio/gemini-2.5-flash', messages: [] })
        })
        const res = await handle(req, makeEnv(), makeCtx())
        expect(res.status).toBe(200)
        expect(res.headers.get('set-cookie')).toBeNull()
    })
})

// ─── honest exhausted-pool error bodies (429 / 502) ─────────────────────────
// The retry loop surfaces an honest body once retries run out. Two invariants
// these goldens enforce:
//   1. NO POOL-COMPOSITION LEAK (FIX A — info disclosure). ai-node proxies the
//      upstream body VERBATIM to the virtual-key holder, who may have bought a
//      shared VK. The CLIENT body must teach the CAUSE and the ACTION, but never
//      the backend's capacity/health: no exact active-pool size (M), no
//      blocked/cooling counts, no "N of M active keys". Those numbers live ONLY
//      in the operator log (console.warn), across the trust boundary.
//   2. NO SOFT-LIES (FIX B). The 429 "each returned 429" claim must count the
//      ACTUAL 429s (cooledThisRun), not every probed key (which includes
//      401/403-blocked and 5xx). The 502 "all returned 5xx" claim holds only
//      when no key was blocked this run; otherwise it is softened.

// Capture operator-facing console.warn lines so a test can assert the raw pool
// composition is logged server-side (for operators) even though it is withheld
// from the client body. Returns the joined warn output during `fn`.
async function captureWarn(fn: () => Promise<void>): Promise<string> {
    const lines: string[] = []
    const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '))
    })
    try {
        await fn()
    } finally {
        spy.mockRestore()
    }
    return lines.join('\n')
}

// The exact pool-composition shapes that must NEVER reach the client body.
// `/Pool: \d+ active/` is the literal breakdown the old body leaked; the
// "N of M active … keys" pair is the capacity disclosure FIX A removes.
const POOL_BREAKDOWN_LEAK = /Pool:\s*\d+\s*active/i
const N_OF_M_LEAK = /\d+\s+of\s+\d+\s+active/i

describe('honest 429 body when the bounded retry loop exhausts the pool', () => {
    const proxyReq = () =>
        new Request('https://ob/api/compat/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${AUTH_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'google-ai-studio/gemini-2.5-flash', messages: [] })
        })

    // A per-minute (TPM/RetryInfo) 429 — rotation can NEVER fix an oversized
    // per-minute request, so the body must say so, not "all keys cooling down".
    const perMinute429 = () =>
        new Response(
            JSON.stringify({
                error: {
                    code: 429,
                    details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '30s' }]
                }
            }),
            { status: 429 }
        )

    // A per-day (RPD) 429 — here rotation across projects genuinely helps; the
    // body must classify the cause as per-day RPD exhaustion, not per-minute.
    const perDay429 = () =>
        new Response(
            JSON.stringify({
                error: {
                    code: 429,
                    details: [
                        {
                            '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                            violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }]
                        }
                    ]
                }
            }),
            { status: 429 }
        )

    it('drops the old lying literal "all attempted keys are cooling down"', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => perMinute429())
        )
        const res = await handle(proxyReq(), makeEnv(), makeCtx())
        expect(res.status).toBe(429)
        const body = await res.text()
        expect(body).not.toContain('all attempted keys are cooling down')
    })

    it('per-minute/TPM cause: names the per-minute/oversize cause and that rotation will NOT help — WITHOUT leaking pool numbers', async () => {
        const fetchMock = vi.fn(async () => perMinute429())
        vi.stubGlobal('fetch', fetchMock)
        const res = await handle(proxyReq(), makeEnv(), makeCtx())

        expect(res.status).toBe(429)
        expect(res.headers.get('Retry-After')).toBe('32') // 30 + 2s buffer, preserved
        const body = await res.text()

        // ── ACTIONABLE TRUTH kept in the client body ──
        // true cause: per-minute TPM / oversized request for free tier.
        expect(body).toMatch(/per-minute|TPM/i)
        expect(body).toMatch(/too large|oversized|compact/i)
        // rotation across more keys will NOT help an oversized per-minute request.
        expect(body).toMatch(/rotation.*will not help/i)
        // Retry-After echoed in the body too.
        expect(body).toMatch(/Retry-After: ?32/i)

        // ── FIX A: pool composition is WITHHELD from the client ──
        // No exact active-pool size, no blocked/cooling breakdown, no "N of M".
        expect(body).not.toMatch(POOL_BREAKDOWN_LEAK)
        expect(body).not.toMatch(N_OF_M_LEAK)
        // The specific count words tied to capacity must not appear as a breakdown.
        expect(body).not.toMatch(/\d+\s+blocked/i)
        expect(body).not.toMatch(/\d+\s+cooling/i)
        expect(body).not.toMatch(/\d+\s+active/i)
    })

    it('FIX A: operator log carries the raw pool composition the client body withholds', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => perMinute429())
        )
        let body = ''
        const warn = await captureWarn(async () => {
            const res = await handle(proxyReq(), makeEnv(), makeCtx())
            body = await res.text()
        })
        // The operator sees the capacity/health the client never does.
        expect(warn).toMatch(/pool/i)
        expect(warn).toMatch(/active/i)
        expect(warn).toMatch(/blocked/i)
        expect(warn).toMatch(/cooling/i)
        // And the client body still does not.
        expect(body).not.toMatch(POOL_BREAKDOWN_LEAK)
        expect(body).not.toMatch(N_OF_M_LEAK)
    })

    it('FIX B: the "returned 429" claim counts ACTUAL 429s, not every probed key', async () => {
        // Mix of statuses across the 3 attempts: 401 (blocked) → 500 (5xx) → 429.
        // Only ONE attempt actually returned 429, so the client claim must say 1,
        // never 3. The old body asserted "tried 3 … each returned 429" — a lie.
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('forbidden', { status: 401 }))
            .mockResolvedValueOnce(new Response('boom', { status: 500 }))
            .mockResolvedValueOnce(perMinute429())
        vi.stubGlobal('fetch', fetchMock)
        const res = await handle(proxyReq(), makeEnv(), makeCtx())
        expect(res.status).toBe(429) // sawRateLimit → 429 path
        const body = await res.text()

        // Honest 429-count: exactly 1 key returned 429 this run.
        expect(body).toMatch(/1 returned 429/i)
        // It must NOT claim all three returned 429 ("each returned 429").
        expect(body).not.toMatch(/each returned 429/i)
        expect(body).not.toMatch(/3 returned 429/i)
        // And still no pool-composition leak.
        expect(body).not.toMatch(POOL_BREAKDOWN_LEAK)
        expect(body).not.toMatch(N_OF_M_LEAK)
    })

    it('per-day/RPD cause: classifies the cause as per-day RPD exhaustion (rotation can help)', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => perDay429())
        )
        const res = await handle(proxyReq(), makeEnv(), makeCtx())
        expect(res.status).toBe(429)
        const body = await res.text()
        expect(body).toMatch(/per-day|RPD/i)
        // it must NOT misclassify a per-day exhaustion as a per-minute TPM cause.
        expect(body).not.toMatch(/per-minute request|oversized per-minute/i)
        // still no pool-composition leak.
        expect(body).not.toMatch(POOL_BREAKDOWN_LEAK)
        expect(body).not.toMatch(N_OF_M_LEAK)
    })
})

describe('honest 502 body when no rate-limit signal (5xx and/or blocked keys)', () => {
    const proxyReq = () =>
        new Request('https://ob/api/compat/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${AUTH_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'google-ai-studio/gemini-2.5-flash', messages: [] })
        })

    it('drops the old lying literal "Upstream unavailable after retries"', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('gateway boom', { status: 502 }))
        )
        const res = await handle(proxyReq(), makeEnv(), makeCtx())
        expect(res.status).toBe(502)
        const body = await res.text()
        expect(body).not.toContain('Upstream unavailable after retries')
    })

    it('all-5xx run: claims "all returned 5xx" (blockedThisRun===0), reports the hint, no pool leak', async () => {
        const fetchMock = vi.fn(async () => new Response('gateway boom', { status: 502 }))
        vi.stubGlobal('fetch', fetchMock)
        const res = await handle(proxyReq(), makeEnv(), makeCtx())

        expect(res.status).toBe(502)
        expect(fetchMock).toHaveBeenCalledTimes(3) // MAX_RETRIES = 3
        const body = await res.text()

        // explicit: there was NO rate-limit signal (distinguishes it from the 429 path).
        expect(body).toMatch(/no rate-limit signal/i)
        // With zero blocked keys, the strong "all returned 5xx" claim is TRUE.
        expect(body).toMatch(/all returned 5xx/i)
        // last upstream status captured (the most recent 5xx).
        expect(body).toMatch(/5xx|502/i)
        // oversize/TPM hint reused from the classification.
        expect(body).toMatch(/too large|TPM|larger-context/i)
        // FIX A: no pool composition in the client body.
        expect(body).not.toMatch(POOL_BREAKDOWN_LEAK)
        expect(body).not.toMatch(N_OF_M_LEAK)
    })

    it('FIX B: mixed blocked+5xx run does NOT claim "all returned 5xx" (softened)', async () => {
        // 401 (blocked) → 500 → 503: blockedThisRun=1, so the unconditional
        // "all returned 5xx" would be a soft-lie. The body must soften instead.
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('forbidden', { status: 401 }))
            .mockResolvedValueOnce(new Response('a', { status: 500 }))
            .mockResolvedValueOnce(new Response('b', { status: 503 }))
        vi.stubGlobal('fetch', fetchMock)
        const res = await handle(proxyReq(), makeEnv(), makeCtx())
        expect(res.status).toBe(502)
        const body = await res.text()

        // The strong, now-false claim must be absent.
        expect(body).not.toMatch(/all returned 5xx/i)
        // It still names the last status and the no-rate-limit-signal condition.
        expect(body).toMatch(/no rate-limit signal/i)
        expect(body).toContain('503') // last upstream status seen
        // Softened wording acknowledges rejected keys and/or 5xx.
        expect(body).toMatch(/rejected keys|and\/or/i)
        // Hint preserved; no pool leak.
        expect(body).toMatch(/too large|TPM|larger-context/i)
        expect(body).not.toMatch(POOL_BREAKDOWN_LEAK)
        expect(body).not.toMatch(N_OF_M_LEAK)
    })

    it('FIX A: operator log carries the raw pool composition for the 502 path too', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('gateway boom', { status: 502 }))
        )
        let body = ''
        const warn = await captureWarn(async () => {
            const res = await handle(proxyReq(), makeEnv(), makeCtx())
            body = await res.text()
        })
        expect(warn).toMatch(/pool/i)
        expect(warn).toMatch(/active/i)
        expect(warn).toMatch(/blocked/i)
        expect(warn).toMatch(/cooling/i)
        expect(body).not.toMatch(POOL_BREAKDOWN_LEAK)
        expect(body).not.toMatch(N_OF_M_LEAK)
    })

    it('captures the LAST 5xx status when statuses differ across attempts (500 → 503 → 504)', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('a', { status: 500 }))
            .mockResolvedValueOnce(new Response('b', { status: 503 }))
            .mockResolvedValueOnce(new Response('c', { status: 504 }))
        vi.stubGlobal('fetch', fetchMock)
        const res = await handle(proxyReq(), makeEnv(), makeCtx())
        expect(res.status).toBe(502)
        const body = await res.text()
        // The LAST status (504) is the one reported, not the first.
        expect(body).toContain('504')
        expect(body).not.toContain('500')
    })
})

// ─── /health liveness probe (top-level entrypoint) ──────────────────────────

describe('GET /health', () => {
    it('returns 200 "ok" without touching the proxy or key service', async () => {
        const res = await worker.fetch(new Request('https://ob/health'), makeEnv(), makeCtx())
        expect(res.status).toBe(200)
        expect(await res.text()).toBe('ok')
        expect(keyService.listActiveKeysViaCache).not.toHaveBeenCalled()
    })
})
