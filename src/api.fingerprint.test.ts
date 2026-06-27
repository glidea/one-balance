import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the D1-backed key service so these tests exercise selection logic
// (consistent-hash vs random) over a fixed, deterministic pool — no database,
// no network.
vi.mock('./service/key', () => ({
    listActiveKeysViaCache: vi.fn(),
    setKeyStatus: vi.fn(async () => {}),
    setKeyModelCooldownIfAvailable: vi.fn(async () => {})
}))

import * as keyService from './service/key'
import { handle } from './api'

const KEY_MANAGER_TOKEN = 'kmt-test'

function makeEnv(overrides: Record<string, unknown> = {}): Env {
    return {
        AUTH_KEY: 'svc-test',
        KEY_MANAGER_TOKEN,
        AI_GATEWAY: 'one-balance',
        AI: { gateway: (_name: string) => ({ getUrl: async () => 'https://gateway.example/' }) },
        ...overrides
    } as unknown as Env
}

function makeCtx(): ExecutionContext {
    return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext
}

// Stable pool of three keys (no cooldowns) so every key is eligible. With three
// keys, a consistent-hash selection lands on exactly one of them for a given
// fingerprint, while RANDOM selection would spread across all three.
const POOL = [
    { id: 'key-1', key: 'secret-1', modelCoolings: {} },
    { id: 'key-2', key: 'secret-2', modelCoolings: {} },
    { id: 'key-3', key: 'secret-3', modelCoolings: {} }
]

beforeEach(() => {
    vi.clearAllMocks()
    // Fresh copies per call (prod hands selectKey a fresh array each request).
    ;(keyService.listActiveKeysViaCache as any).mockImplementation(async () =>
        POOL.map(k => ({ ...k, modelCoolings: { ...k.modelCoolings } }))
    )
})

afterEach(() => {
    vi.restoreAllMocks()
})

// Request the Key Manager vend endpoint with the given fingerprint headers.
// handleKeysNext returns the *selected* key id, so the chosen key is observable.
async function vend(headers: Record<string, string>): Promise<{ id: string; key: string }> {
    const req = new Request('https://ob/api/keys/next?provider=google-ai-studio&model=gemini-2.5-flash', {
        method: 'GET',
        headers: { Authorization: `Bearer ${KEY_MANAGER_TOKEN}`, ...headers }
    })
    const res = await handle(req, makeEnv(), makeCtx())
    expect(res.status).toBe(200)
    return (await res.json()) as { id: string; key: string }
}

// getDeterministicIndex(fp, 3) = parseInt(fp.slice(0,8), 16) % 3.
// 0x00000004 = 4 → 4 % 3 = 1 → POOL[1] = key-2. A fixed expectation pins the
// consistent-hash semantics (characterization), independent of the header name.
const FP_TO_KEY2 = '00000004deadbeefcafef00d' // 24 hex chars (sha-256-ish length)
const EXPECTED_KEY_FOR_FP = 'key-2'

describe('conversation-fingerprint → consistent-hash key selection', () => {
    it('(a) de-prefixed header `conversation-fingerprint` selects the deterministic hashed key', async () => {
        const picked = await vend({ 'conversation-fingerprint': FP_TO_KEY2 })
        expect(picked.id).toBe(EXPECTED_KEY_FOR_FP)
    })

    it('(b) same fingerprint + stable pool → same key (deterministic, not random)', async () => {
        // Random over a 3-key pool would, with overwhelming probability, return
        // more than one distinct id across 20 calls. Hash selection returns one.
        const ids = new Set<string>()
        for (let i = 0; i < 20; i++) {
            const picked = await vend({ 'conversation-fingerprint': FP_TO_KEY2 })
            ids.add(picked.id)
        }
        expect([...ids]).toEqual([EXPECTED_KEY_FOR_FP])
    })

    it('(c) non-hex fingerprint → safe random fallback, deterministic spread, valid key', async () => {
        // parseInt('not-hex…',16) is NaN → NaN % len = NaN → keys[NaN] = undefined
        // → crash on .modelCoolings. Hardening must fall back to random instead.
        // Single-shot would false-green if a buggy validator pinned ONE key, so we
        // loop like (b) and assert random truly spreads across the whole pool.
        const ids = new Set<string>()
        for (let i = 0; i < 30; i++) {
            const picked = await vend({ 'conversation-fingerprint': 'not-a-hex-string-zzzz' })
            expect(picked.id).toMatch(/^key-/)
            expect(picked.key).toMatch(/^secret-/)
            ids.add(picked.id)
        }
        // Random over 3 keys × 30 draws lands on every key with overwhelming
        // probability (P(miss any one) ≈ 3·(2/3)^30 ≈ 1.6e-5). Consistent-hash
        // would pin exactly one — so >1 distinct id proves the random fallback.
        expect(ids.size).toBeGreaterThan(1)
    })

    it('(c2) TRUTHY non-hex fingerprint routes through hardening → random fallback', async () => {
        // An empty string takes the falsy fast-path and never exercises
        // isUsableFingerprint. A truthy-but-non-hex value DOES reach the validator,
        // which must reject it (anchored hex) and degrade to random selection.
        const ids = new Set<string>()
        for (let i = 0; i < 30; i++) {
            const picked = await vend({ 'conversation-fingerprint': 'not-a-hex-value' })
            expect(picked.id).toMatch(/^key-/)
            expect(picked.key).toMatch(/^secret-/)
            ids.add(picked.id)
        }
        expect(ids.size).toBeGreaterThan(1)
    })

    it('(c3) empty fingerprint header → safe random fallback, no throw, valid key', async () => {
        const picked = await vend({ 'conversation-fingerprint': '' })
        expect(picked.id).toMatch(/^key-/)
        expect(picked.key).toMatch(/^secret-/)
    })

    it('(c4) 8-hex-prefix + injected suffix → rejected by anchoring (random) AND not logged raw', async () => {
        // Log-injection regression. The OLD validator (/^[0-9a-fA-F]{8}/, unanchored)
        // accepts any value that merely STARTS with 8 hex chars — so a forged tail is
        // (1) accepted, pinning a deterministic key, and (2) logged verbatim. A raw
        // '\n'/'\r' is rejected by the Headers constructor before it ever reaches us,
        // so the real header-valid vector is a hex prefix followed by a long control-
        // char-laced suffix (tab, etc.). Anchored validation (/^[0-9a-fA-F]{8,128}$/)
        // must REJECT it (→ random fallback), and the log sites must only ever emit a
        // safe fixed-length slice — never the raw header value.
        const forged = 'deadbeef\t[INFO] forged log line injected via fingerprint'
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
        try {
            const ids = new Set<string>()
            for (let i = 0; i < 30; i++) {
                const picked = await vend({ 'conversation-fingerprint': forged })
                expect(picked.id).toMatch(/^key-/)
                ids.add(picked.id)
            }
            // Rejected by the anchored validator → random spread, not pinned to one.
            expect(ids.size).toBeGreaterThan(1)

            // No log line may contain the raw injected payload (full string or tail).
            const loggedRaw = infoSpy.mock.calls.some(args =>
                args.some(a => typeof a === 'string' && a.includes(forged))
            )
            expect(loggedRaw).toBe(false)
            const loggedTail = infoSpy.mock.calls.some(args =>
                args.some(a => typeof a === 'string' && a.includes('[INFO] forged log line'))
            )
            expect(loggedTail).toBe(false)
        } finally {
            infoSpy.mockRestore()
        }
    })

    it('(c5) valid full-length hex fingerprint is still logged ONLY as a safe slice', async () => {
        // Even a legitimate fingerprint must never be logged in full — the log site
        // emits a fixed 8-char slice. Assert the success path logs the slice and not
        // the whole value (defends the sanitization independent of the validator).
        const fullHex = '00000004' + 'a'.repeat(56) // 64-hex, hashes to key-2 (0x04 % 3 = 1)
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
        try {
            const picked = await vend({ 'conversation-fingerprint': fullHex })
            expect(picked.id).toBe(EXPECTED_KEY_FOR_FP)
            const loggedFull = infoSpy.mock.calls.some(args =>
                args.some(a => typeof a === 'string' && a.includes(fullHex))
            )
            expect(loggedFull).toBe(false)
            const loggedSlice = infoSpy.mock.calls.some(args =>
                args.some(a => typeof a === 'string' && a.includes('00000004'))
            )
            expect(loggedSlice).toBe(true)
        } finally {
            infoSpy.mockRestore()
        }
    })

    it('(neg) STILL-PREFIXED `x-bf-eh-conversation-fingerprint` does NOT drive hash → random fallback', async () => {
        // The wire contract: ai-node EMITS `x-bf-eh-conversation-fingerprint`,
        // Bifrost STRIPS the `x-bf-eh-` prefix, one-balance READS the de-prefixed
        // `conversation-fingerprint`. If Bifrost ever fails to strip (or a partial
        // rename ships), one-balance would receive the STILL-PREFIXED name. That
        // name must NOT be read as a fingerprint — selection silently degrades to
        // RANDOM (no 4xx, no log) rather than pinning every conversation onto one
        // key. This negative case is the consumer-side seal of the drift class:
        // only the exact de-prefixed name pins; the prefixed one spreads.
        const ids = new Set<string>()
        for (let i = 0; i < 30; i++) {
            const picked = await vend({ 'x-bf-eh-conversation-fingerprint': FP_TO_KEY2 })
            expect(picked.id).toMatch(/^key-/)
            ids.add(picked.id)
        }
        // De-prefixed FP_TO_KEY2 pins exactly key-2 (test a/b). The prefixed name
        // is invisible to readConversationFingerprint → random over 3 keys × 30
        // draws hits >1 distinct id with overwhelming probability. Pinned-to-one
        // would mean the prefixed header WAS (wrongly) read as a fingerprint.
        expect(ids.size).toBeGreaterThan(1)
    })

    it('(neg2) de-prefixed name pins while the prefixed name alone does not (positive vs negative, same value)', async () => {
        // Same fingerprint value, two header names: the de-prefixed name pins to
        // the deterministic key; the still-prefixed name does not. Proves the
        // distinction is the NAME, not the value.
        const dePrefixed = await vend({ 'conversation-fingerprint': FP_TO_KEY2 })
        expect(dePrefixed.id).toBe(EXPECTED_KEY_FOR_FP)

        const prefixedIds = new Set<string>()
        for (let i = 0; i < 30; i++) {
            prefixedIds.add((await vend({ 'x-bf-eh-conversation-fingerprint': FP_TO_KEY2 })).id)
        }
        expect(prefixedIds.size).toBeGreaterThan(1)
    })

    it('(d) backward-compat: legacy `x-conversation-fingerprint` still selects via hash', async () => {
        const picked = await vend({ 'x-conversation-fingerprint': FP_TO_KEY2 })
        expect(picked.id).toBe(EXPECTED_KEY_FOR_FP)
    })

    it('(d2) de-prefixed name wins when both headers are present', async () => {
        // De-prefixed is the name Bifrost actually sends — prefer it. Point the two
        // headers at different keys and assert the de-prefixed one decides.
        // 0x00000005 = 5 → 5 % 3 = 2 → key-3.
        const picked = await vend({
            'conversation-fingerprint': '00000005deadbeefcafef00d', // → key-3
            'x-conversation-fingerprint': FP_TO_KEY2 // → key-2
        })
        expect(picked.id).toBe('key-3')
    })
})

// ─── Pinned-key-cooling probe resilience (стержень #11, Class C fault) ───────
// The consistent-hash pins a conversation to ONE deterministic key. When that
// exact key is cooling (modelCoolings[model].end_at in the future), selection
// must NOT crash and must NOT keep serving the cooling key: tryHashedSelect
// linear-probes forward to the next AVAILABLE key. When EVERY key is cooling,
// selectFromAllKeys must return the EARLIEST-RECOVERING key (min end_at) —
// never undefined (the `bestCoolingKey!` deref would crash on undefined). These
// two faults are the linear-probe's whole reason to exist; this seals them.
describe('pinned-key cooling → linear-probe resilience', () => {
    // FP_TO_KEY2 (0x04 % 3 = 1) pins index 1 = key-2. We inject cooldowns onto a
    // fresh pool per call so the deterministic pick (key-2) is the one cooling.
    const FUTURE = () => Date.now() / 1000 + 600 // 10 min out — comfortably "cooling"
    const SOON = () => Date.now() / 1000 + 30 // recovers first
    const LATER = () => Date.now() / 1000 + 900 // recovers last

    function vendWithCoolings(
        coolings: Record<string, number>, // keyId → end_at (absent = available)
        headers: Record<string, string>
    ) {
        ;(keyService.listActiveKeysViaCache as any).mockImplementation(async () =>
            POOL.map(k => ({
                ...k,
                modelCoolings: coolings[k.id]
                    ? { 'gemini-2.5-flash': { total_seconds: 0, end_at: coolings[k.id] } }
                    : {}
            }))
        )
        const req = new Request('https://ob/api/keys/next?provider=google-ai-studio&model=gemini-2.5-flash', {
            method: 'GET',
            headers: { Authorization: `Bearer ${KEY_MANAGER_TOKEN}`, ...headers }
        })
        return handle(req, makeEnv(), makeCtx())
    }

    it('deterministic key cooling → linear-probe selects the NEXT available key, no crash', async () => {
        // key-2 is the deterministic pick for FP_TO_KEY2 but it is cooling.
        // tryHashedSelect probes idx 1 (key-2, cooling) → idx 2 (key-3, available).
        const res = await vendWithCoolings({ 'key-2': FUTURE() }, { 'conversation-fingerprint': FP_TO_KEY2 })
        expect(res.status).toBe(200)
        const body = (await res.json()) as { id: string; key: string; cooling_until: number | null }
        // Must NOT serve the cooling pinned key; must land on an available one.
        expect(body.id).not.toBe('key-2')
        expect(body.id).toBe('key-3')
        expect(body.key).toBe('secret-3')
        // The chosen key (key-3) is not cooling → cooling_until is null.
        expect(body.cooling_until).toBeNull()
    })

    it('deterministic + its next probe both cooling → probes onward to the only available key', async () => {
        // key-2 (idx 1) and key-3 (idx 2) cooling → wrap to idx 0 = key-1 available.
        const res = await vendWithCoolings(
            { 'key-2': FUTURE(), 'key-3': FUTURE() },
            { 'conversation-fingerprint': FP_TO_KEY2 }
        )
        expect(res.status).toBe(200)
        const body = (await res.json()) as { id: string; cooling_until: number | null }
        expect(body.id).toBe('key-1')
        expect(body.cooling_until).toBeNull()
    })

    it('ALL keys cooling → returns the EARLIEST-recovering key (no undefined deref)', async () => {
        // Every key cooling: key-1 recovers SOON, key-2 LATER, key-3 FUTURE.
        // selectFromAllKeys finds nothing available and must return the key whose
        // end_at is smallest (key-1) — never undefined.
        const res = await vendWithCoolings(
            { 'key-1': SOON(), 'key-2': LATER(), 'key-3': FUTURE() },
            { 'conversation-fingerprint': FP_TO_KEY2 }
        )
        expect(res.status).toBe(200)
        const body = (await res.json()) as { id: string; key: string; cooling_until: number | null }
        // Earliest-recovering wins regardless of which one the hash pinned.
        expect(body.id).toBe('key-1')
        expect(body.key).toBe('secret-1')
        // The returned key IS still cooling → cooling_until is its future end_at.
        expect(body.cooling_until).not.toBeNull()
        expect(body.cooling_until!).toBeGreaterThan(Date.now() / 1000)
    })

    it('ALL keys cooling, no fingerprint → still returns earliest-recovering key, no crash', async () => {
        // The random path (no fingerprint) also routes through selectFromAllKeys
        // when nothing is available; it must likewise return the earliest key, not
        // undefined. Proves the resilience is not specific to the hashed path.
        const res = await vendWithCoolings({ 'key-1': LATER(), 'key-2': SOON(), 'key-3': FUTURE() }, {})
        expect(res.status).toBe(200)
        const body = (await res.json()) as { id: string; cooling_until: number | null }
        expect(body.id).toBe('key-2') // earliest end_at
        expect(body.cooling_until).not.toBeNull()
    })
})
