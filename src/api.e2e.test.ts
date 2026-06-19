import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the D1-backed key service so these e2e tests exercise the worker's
// request handling (routing, vending contract, retry loop) without a database.
vi.mock('./service/key', () => ({
    listActiveKeysViaCache: vi.fn(),
    setKeyStatus: vi.fn(async () => {}),
    setKeyModelCooldownIfAvailable: vi.fn(async () => {})
}))

import * as keyService from './service/key'
import { handle } from './api'
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

// ─── /health liveness probe (top-level entrypoint) ──────────────────────────

describe('GET /health', () => {
    it('returns 200 "ok" without touching the proxy or key service', async () => {
        const res = await worker.fetch(new Request('https://ob/health'), makeEnv(), makeCtx())
        expect(res.status).toBe(200)
        expect(await res.text()).toBe('ok')
        expect(keyService.listActiveKeysViaCache).not.toHaveBeenCalled()
    })
})
