import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'

// Property suite for consistent-hash KEY SELECTION (стержень #11: determinism +
// uniform spread). The example-based api.fingerprint.test.ts pins a handful of
// hand-picked fingerprints; this suite closes the CLASS over thousands of
// generated ones. It proves two invariants that a future change to the hash
// (e.g. truncating to 4 hex chars, or returning a constant index) would break:
//
//   1. UNIFORM SPREAD — over a large pool of random fingerprints the chosen key
//      is ~evenly distributed across the pool (chi-square + max-bucket bound). A
//      degenerate hash that clusters conversations onto one key would defeat the
//      whole point of consistent-hash routing (one key eats every conversation's
//      rate-limit budget) — and this catches it.
//   2. IDEMPOTENT/DETERMINISTIC — the same fingerprint over the same pool always
//      selects the same key (no Math.random leaks into the hashed path), and the
//      chosen INDEX is a pure function of (fingerprint, pool length) independent
//      of pool order. Shuffling the pool moves keys, but the index is invariant.
//
// Driven through the real handle() vend path (same as api.fingerprint.test.ts)
// so the property exercises production selection, not a reimplementation.

vi.mock('./service/key', () => ({
    listActiveKeysViaCache: vi.fn(),
    setKeyStatus: vi.fn(async () => {}),
    setKeyModelCooldownIfAvailable: vi.fn(async () => {})
}))

import * as keyService from './service/key'
import { handle } from './api'

const KEY_MANAGER_TOKEN = 'kmt-test'
const MODEL = 'gemini-2.5-flash'

function makeEnv(): Env {
    return {
        AUTH_KEY: 'svc-test',
        KEY_MANAGER_TOKEN,
        AI_GATEWAY: 'one-balance',
        AI: { gateway: (_name: string) => ({ getUrl: async () => 'https://gateway.example/' }) }
    } as unknown as Env
}

function makeCtx(): ExecutionContext {
    return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext
}

// A pool of N fully-available keys (no cooldowns) so tryHashedSelect's first
// probe always lands — selection is purely positional: keys[hash % N].
function makePool(n: number): Array<{ id: string; key: string; modelCoolings: Record<string, never> }> {
    return Array.from({ length: n }, (_, i) => ({
        id: `key-${i + 1}`,
        key: `secret-${i + 1}`,
        modelCoolings: {}
    }))
}

// Point the mocked cache at a given pool, handing out a FRESH deep copy per call
// (prod hands selectKey a fresh array every request; the hashed path never
// mutates it, but copying keeps the mock faithful).
function usePool(pool: ReturnType<typeof makePool>): void {
    ;(keyService.listActiveKeysViaCache as any).mockImplementation(async () =>
        pool.map(k => ({ ...k, modelCoolings: { ...k.modelCoolings } }))
    )
}

async function vend(fingerprint: string): Promise<string> {
    const req = new Request(`https://ob/api/keys/next?provider=google-ai-studio&model=${MODEL}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${KEY_MANAGER_TOKEN}`, 'conversation-fingerprint': fingerprint }
    })
    const res = await handle(req, makeEnv(), makeCtx())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string }
    return body.id
}

// fast-check generator for a VALID full-length hex fingerprint. Only the first 8
// hex chars drive getDeterministicIndex, so we generate those uniformly over the
// full 32-bit space and pad to a 64-char (sha-256-length) hex string the
// anchored validator (/^[0-9a-fA-F]{8,128}$/) accepts.
const hexFingerprint = fc.integer({ min: 0, max: 0xffffffff }).map(n => {
    const prefix = n.toString(16).padStart(8, '0')
    return prefix + 'a'.repeat(56) // 8 + 56 = 64 hex chars
})

beforeEach(() => {
    vi.clearAllMocks()
    // Silence the per-selection console.info so the property loop stays quiet.
    vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('consistent-hash selection — property suite (Class C)', () => {
    const POOL_SIZE = 5

    it('spreads ~uniformly across the pool over thousands of random fingerprints', async () => {
        usePool(makePool(POOL_SIZE))

        // One large sample (a single property "run" with N internal draws) so the
        // chi-square statistic is computed over the whole distribution rather than
        // re-judged per fast-check shrink. We collect distinct fingerprints, vend
        // each, and bucket the chosen key.
        const SAMPLES = 2000
        const fps = fc.sample(fc.uniqueArray(hexFingerprint, { minLength: SAMPLES, maxLength: SAMPLES }), 1)[0]

        const counts = new Map<string, number>()
        for (const fp of fps) {
            const id = await vend(fp)
            counts.set(id, (counts.get(id) ?? 0) + 1)
        }

        // Every pool key must be reachable — a hash that never lands on some key
        // (e.g. `% (N-1)` or a constant) is a routing defect.
        expect(counts.size).toBe(POOL_SIZE)

        const expected = SAMPLES / POOL_SIZE // 400
        const observed = [...counts.values()]

        // (1) Max-bucket bound: no key may absorb a disproportionate share. A
        //     perfectly clustered hash would put ~all SAMPLES in one bucket; a
        //     uniform one keeps every bucket near `expected`. 1.5× the mean is a
        //     generous ceiling that uniform randomness clears with vast margin
        //     yet a clustering regression blows past.
        const maxBucket = Math.max(...observed)
        expect(maxBucket).toBeLessThan(expected * 1.5)

        // (2) Chi-square goodness-of-fit (df = N-1 = 4). The 0.001 critical value
        //     for df=4 is ~18.47; a sound uniform hash sits well under it, while a
        //     skewed one produces a large statistic. Bound at 25 (above the 0.001
        //     critical value) so a genuinely-uniform hash is not flaky-failed but
        //     a real clustering regression is caught.
        const chiSquare = observed.reduce((acc, o) => acc + (o - expected) ** 2 / expected, 0)
        expect(chiSquare).toBeLessThan(25)
    })

    it('is idempotent: same fingerprint + same pool → same key, every time', async () => {
        usePool(makePool(POOL_SIZE))
        await fc.assert(
            fc.asyncProperty(hexFingerprint, async fp => {
                const first = await vend(fp)
                // Repeat several times: a Math.random leak into the hashed path
                // would, with high probability, return a different id within a few
                // draws. Determinism means all draws agree.
                for (let i = 0; i < 5; i++) {
                    expect(await vend(fp)).toBe(first)
                }
            }),
            { numRuns: 50 }
        )
    })

    it('selects by index = parseInt(fp[0..8],16) % len, independent of pool ORDER', async () => {
        // The chosen key tracks the POSITION the hash computes, so the same
        // fingerprint over two equal-but-shuffled pools picks the key sitting at
        // that same index — proving the selection is the documented positional
        // hash, not order-coincidence. (Shuffling moves which id sits at the
        // index; the index itself is invariant.)
        await fc.assert(
            fc.asyncProperty(hexFingerprint, async fp => {
                const ordered = makePool(POOL_SIZE)
                const idx = parseInt(fp.substring(0, 8), 16) % POOL_SIZE

                usePool(ordered)
                expect(await vend(fp)).toBe(ordered[idx].id)

                // Same membership, reversed order → the key at the SAME index is a
                // different id, and selection must follow the index, not the id.
                const reversed = [...ordered].reverse()
                usePool(reversed)
                expect(await vend(fp)).toBe(reversed[idx].id)
            }),
            { numRuns: 50 }
        )
    })
})
