import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// FLAG-BEHAVIOR + REGRESSION-SAFETY gate for HRW key selection (Chapter 02,
// slice 2). HRW is opt-in behind `KEY_SELECTION_STRATEGY`:
//   - unset / 'hash' (DEFAULT) → legacy hash%len selection, BYTE-IDENTICAL to
//     the current behavior (proven against the existing fingerprint test vectors).
//   - 'hrw'                    → rendezvous/HRW selection (churn-stable).
//
// Driven through the real handle() vend path so the flag is exercised exactly as
// production wires it — not a reimplementation.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('./service/key', () => ({
    listActiveKeysViaCache: vi.fn(),
    setKeyStatus: vi.fn(async () => {}),
    setKeyModelCooldownIfAvailable: vi.fn(async () => {})
}))

import * as keyService from './service/key'
import { handle, selectByHRW } from './api'

const KEY_MANAGER_TOKEN = 'kmt-test'
const MODEL = 'gemini-2.5-flash'

// Pool of three available keys — same shape the existing fingerprint suite uses.
const POOL = [
    { id: 'key-1', key: 'secret-1', modelCoolings: {} },
    { id: 'key-2', key: 'secret-2', modelCoolings: {} },
    { id: 'key-3', key: 'secret-3', modelCoolings: {} }
]

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

beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    ;(keyService.listActiveKeysViaCache as any).mockImplementation(async () =>
        POOL.map(k => ({ ...k, modelCoolings: { ...k.modelCoolings } }))
    )
})

afterEach(() => {
    vi.restoreAllMocks()
})

async function vend(env: Env, fingerprint?: string): Promise<string> {
    const headers: Record<string, string> = { Authorization: `Bearer ${KEY_MANAGER_TOKEN}` }
    if (fingerprint !== undefined) headers['conversation-fingerprint'] = fingerprint
    const req = new Request(`https://ob/api/keys/next?provider=google-ai-studio&model=${MODEL}`, {
        method: 'GET',
        headers
    })
    const res = await handle(req, env, makeCtx())
    expect(res.status).toBe(200)
    return ((await res.json()) as { id: string }).id
}

// The exact fingerprint→key vectors the current behavior produces (from
// api.fingerprint.test.ts): getDeterministicIndex(fp,3) = parseInt(fp[0..8],16)%3.
//   0x00000004 = 4 → 4%3 = 1 → key-2
//   0x00000005 = 5 → 5%3 = 2 → key-3
const FP_KEY2 = '00000004deadbeefcafef00d'
const FP_KEY3 = '00000005deadbeefcafef00d'

describe('KEY_SELECTION_STRATEGY flag — default OFF is byte-identical to current', () => {
    it('(OFF/unset) hash%len vectors are preserved — key-2 for 0x04, key-3 for 0x05', async () => {
        const env = makeEnv() // no KEY_SELECTION_STRATEGY
        expect(await vend(env, FP_KEY2)).toBe('key-2')
        expect(await vend(env, FP_KEY3)).toBe('key-3')
    })

    it("(explicit 'hash') identical to unset — same legacy vectors", async () => {
        const env = makeEnv({ KEY_SELECTION_STRATEGY: 'hash' })
        expect(await vend(env, FP_KEY2)).toBe('key-2')
        expect(await vend(env, FP_KEY3)).toBe('key-3')
    })

    it('(OFF) unknown strategy value falls back to legacy hash (fail-safe default)', async () => {
        const env = makeEnv({ KEY_SELECTION_STRATEGY: 'totally-unknown' })
        expect(await vend(env, FP_KEY2)).toBe('key-2')
        expect(await vend(env, FP_KEY3)).toBe('key-3')
    })

    it('(OFF) no fingerprint → random fallback unchanged (valid key from pool)', async () => {
        const env = makeEnv()
        const id = await vend(env)
        expect(id).toMatch(/^key-/)
    })
})

describe("KEY_SELECTION_STRATEGY = 'hrw' — opt-in HRW selection", () => {
    it('(ON) with a fingerprint, vended key matches selectByHRW over the pool', async () => {
        const env = makeEnv({ KEY_SELECTION_STRATEGY: 'hrw' })
        // The wired HRW path must agree with the pure function over the same pool.
        const expected = selectByHRW(POOL as any, FP_KEY2).id
        expect(await vend(env, FP_KEY2)).toBe(expected)
    })

    it('(ON) HRW is sticky for a fingerprint across repeated vends', async () => {
        const env = makeEnv({ KEY_SELECTION_STRATEGY: 'hrw' })
        const first = await vend(env, FP_KEY2)
        for (let i = 0; i < 10; i++) {
            expect(await vend(env, FP_KEY2)).toBe(first)
        }
    })

    it('(ON) no fingerprint → still random fallback (HRW only applies WITH a fingerprint)', async () => {
        const env = makeEnv({ KEY_SELECTION_STRATEGY: 'hrw' })
        const id = await vend(env)
        expect(id).toMatch(/^key-/)
    })
})
