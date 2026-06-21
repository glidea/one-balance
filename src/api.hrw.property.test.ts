import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'

// ─────────────────────────────────────────────────────────────────────────────
// Property suite for RENDEZVOUS / HIGHEST-RANDOM-WEIGHT (HRW) key selection —
// Chapter 02, slice 2. HRW is the churn-STABLE replacement for the legacy sticky
// path `hash(fingerprint) % len(activeKeys)` (modulo), which remaps a whole
// conversation to a DIFFERENT key whenever the active-key set changes size — and
// so loses Google's key/project-scoped implicit cache exactly when the pool
// churns (a key blocked / cooled / added). HRW reassigns only the minimum.
//
// The selection algorithm is the ONLY thing under test here (slice 1 — key
// classification / mass-death — is a separate branch and is not touched).
//
// These properties close CLASSES of selection bugs over thousands of generated
// inputs, not a handful of hand-picked ones:
//   1. STICKINESS UNDER CHURN (headline): removing/cooling any NON-winner leaves
//      the winner unchanged — WITH a contrast assertion proving the old hash%len
//      WOULD remap on the same churn (so the property is the fix, not theater).
//   2. MINIMAL DISRUPTION ON ADD: adding a key moves at most ~1/(n+1) of
//      fingerprints, and NEVER moves one between two keys that both still exist.
//   3. DETERMINISM: same (fingerprint, key set) → same key, every call.
//   4. SPREAD: over many fingerprints the winner is ~uniform across the pool.
// ─────────────────────────────────────────────────────────────────────────────

import { selectByHRW } from './api'
import type * as schema from './service/d1/schema'

type TestKey = schema.Key

// A pool of N keys with STABLE uuid-like ids. HRW keys off `key.id` (the stable
// UUID), never the array index, so ids — not positions — are what matters. Only
// id/key/modelCoolings are read by selection; the rest are filled to satisfy the
// schema.Key shape so the suite calls the REAL exported signature, not a cast.
function makePool(n: number): TestKey[] {
    return Array.from({ length: n }, (_, i) => ({
        id: `key-uuid-${String(i + 1).padStart(4, '0')}`,
        key: `secret-${i + 1}`,
        provider: 'google-ai-studio',
        modelCoolings: {},
        totalCoolingSeconds: 0,
        status: 'active',
        remark: null,
        createdAt: new Date(0),
        updatedAt: new Date(0)
    }))
}

// Valid full-length hex fingerprint generator (64 hex chars — sha-256 length),
// drawn over the full 32-bit prefix space so distinct fingerprints are distinct
// hash inputs. (HRW hashes the WHOLE `fingerprint + ':' + id`, so the suffix
// matters too; we vary the prefix to get a wide spread of distinct inputs.)
const hexFingerprint = fc.integer({ min: 0, max: 0xffffffff }).map(n => {
    const prefix = n.toString(16).padStart(8, '0')
    return prefix + 'a'.repeat(56)
})

// The OLD sticky algorithm, kept verbatim here as the CONTRAST oracle: index =
// parseInt(fp[0..8],16) % len, key = pool[index]. Used only to prove that the
// same churn that HRW survives WOULD remap the modulo selection.
function oldHashModulo(pool: TestKey[], fingerprint: string): TestKey {
    const idx = parseInt(fingerprint.substring(0, 8), 16) % pool.length
    return pool[idx]
}

describe('selectByHRW — rendezvous/HRW selection (Class C property suite)', () => {
    it('(1) STICKINESS UNDER CHURN: removing any NON-winner leaves the winner unchanged', async () => {
        await fc.assert(
            fc.asyncProperty(hexFingerprint, fc.integer({ min: 3, max: 12 }), async (fp, n) => {
                const pool = makePool(n)
                const winner = selectByHRW(pool, fp)

                // Remove EACH non-winner in turn; the winner must not change.
                for (const victim of pool) {
                    if (victim.id === winner.id) continue
                    const churned = pool.filter(k => k.id !== victim.id)
                    expect(selectByHRW(churned, fp).id).toBe(winner.id)
                }
            }),
            { numRuns: 200 }
        )
    })

    it('(1-contrast) the OLD hash%len WOULD remap on the SAME non-winner churn (proves HRW is the fix)', async () => {
        // For HRW, removing a non-winner is a no-op. For the modulo scheme the
        // index is computed against the NEW length, so removing a non-winner
        // shifts pool[idx] for at least some fingerprints. We assert that across
        // a sample there EXISTS a (fingerprint, non-winner removal) where the old
        // scheme remaps — i.e. the bug HRW fixes is real, not imagined.
        let foundOldRemap = false
        const pool = makePool(6)
        const fps = fc.sample(hexFingerprint, 300)
        for (const fp of fps) {
            const hrwWinner = selectByHRW(pool, fp)
            const oldWinner = oldHashModulo(pool, fp)
            // Remove a key that is NOT the old scheme's winner (a benign churn).
            const victim = pool.find(k => k.id !== oldWinner.id)!
            const churned = pool.filter(k => k.id !== victim.id)
            const oldAfter = oldHashModulo(churned, fp)
            if (oldAfter.id !== oldWinner.id) foundOldRemap = true
            // HRW on the same benign churn (victim != hrwWinner) is always stable.
            if (victim.id !== hrwWinner.id) {
                expect(selectByHRW(churned, fp).id).toBe(hrwWinner.id)
            }
        }
        // The whole point: the old scheme is demonstrably churn-unstable.
        expect(foundOldRemap).toBe(true)
    })

    it('(1b) COOLING a non-winner (excluding it from the candidate set) leaves the winner unchanged', async () => {
        // "Cooling" a key, for selection purposes, means it drops out of the
        // available candidate set — identical to removal for the HRW ranking.
        // This mirrors how the wired path filters out cooling keys before HRW.
        await fc.assert(
            fc.asyncProperty(hexFingerprint, fc.integer({ min: 3, max: 10 }), async (fp, n) => {
                const pool = makePool(n)
                const winner = selectByHRW(pool, fp)
                const nonWinners = pool.filter(k => k.id !== winner.id)
                // Cool an arbitrary subset of non-winners — winner must survive.
                const available = pool.filter((_, i) => i === 0 || (i % 2 === 0 && pool[i].id !== winner.id))
                const candidateSet = available.length > 0 ? available : [winner, ...nonWinners.slice(0, 1)]
                if (candidateSet.some(k => k.id === winner.id)) {
                    expect(selectByHRW(candidateSet, fp).id).toBe(winner.id)
                }
            }),
            { numRuns: 100 }
        )
    })

    it('(2) MINIMAL DISRUPTION ON ADD: adding a key moves at most ~1/(n+1) of fingerprints', async () => {
        const n = 6
        const before = makePool(n)
        const added: TestKey = {
            id: 'key-uuid-9999',
            key: 'secret-new',
            provider: 'google-ai-studio',
            modelCoolings: {},
            totalCoolingSeconds: 0,
            status: 'active',
            remark: null,
            createdAt: new Date(0),
            updatedAt: new Date(0)
        }
        const after = [...before, added]

        const SAMPLES = 3000
        const fps = fc.sample(fc.uniqueArray(hexFingerprint, { minLength: SAMPLES, maxLength: SAMPLES }), 1)[0]

        let moved = 0
        for (const fp of fps) {
            const w0 = selectByHRW(before, fp).id
            const w1 = selectByHRW(after, fp).id
            if (w0 !== w1) {
                moved++
                // (2b) When a fingerprint moves on ADD, it must move ONTO the new
                // key — never between two keys that BOTH still exist. That is the
                // defining HRW guarantee versus modulo's full reshuffle.
                expect(w1).toBe(added.id)
            }
        }
        // Ideal fraction is 1/(n+1) = 1/7 ≈ 0.143. Allow a generous band for
        // sampling noise; a modulo reshuffle would move a huge fraction and a
        // broken HRW that ignores the new key would move ~0 (also wrong).
        const fraction = moved / SAMPLES
        expect(fraction).toBeGreaterThan(0.07)
        expect(fraction).toBeLessThan(0.25)
    })

    it('(3) DETERMINISM: same (fingerprint, key set) → same key across many calls', async () => {
        await fc.assert(
            fc.asyncProperty(hexFingerprint, fc.integer({ min: 1, max: 12 }), async (fp, n) => {
                const pool = makePool(n)
                const first = selectByHRW(pool, fp).id
                for (let i = 0; i < 5; i++) {
                    expect(selectByHRW(pool, fp).id).toBe(first)
                }
                // Order-independence: a shuffled pool of the same membership picks
                // the same ID (HRW keys off id, not position).
                const shuffled = [...pool].reverse()
                expect(selectByHRW(shuffled, fp).id).toBe(first)
            }),
            { numRuns: 100 }
        )
    })

    it('(4) SPREAD: winner is ~uniform across the pool over thousands of fingerprints', async () => {
        const POOL_SIZE = 5
        const pool = makePool(POOL_SIZE)
        const SAMPLES = 4000
        const fps = fc.sample(fc.uniqueArray(hexFingerprint, { minLength: SAMPLES, maxLength: SAMPLES }), 1)[0]

        const counts = new Map<string, number>()
        for (const fp of fps) {
            const id = selectByHRW(pool, fp).id
            counts.set(id, (counts.get(id) ?? 0) + 1)
        }

        // Every key must be reachable (no starved key).
        expect(counts.size).toBe(POOL_SIZE)

        const expected = SAMPLES / POOL_SIZE
        const observed = [...counts.values()]

        // No hot key: max bucket under 1.5× the mean.
        expect(Math.max(...observed)).toBeLessThan(expected * 1.5)

        // Chi-square goodness-of-fit (df = 4); 0.001 critical ≈ 18.47, bound at 25.
        const chiSquare = observed.reduce((acc, o) => acc + (o - expected) ** 2 / expected, 0)
        expect(chiSquare).toBeLessThan(25)
    })

    it('(5) TIE-BREAK is deterministic by id (pure function, no Math.random)', async () => {
        // selectByHRW must be a pure function of (fingerprint, key set). We can't
        // force a real 64-bit hash tie, but we CAN assert that with a fixed input
        // it never varies even if Math.random is perturbed mid-run.
        const pool = makePool(8)
        const fp = '00000001' + 'b'.repeat(56)
        const baseline = selectByHRW(pool, fp).id
        const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.999999)
        try {
            for (let i = 0; i < 10; i++) {
                expect(selectByHRW(pool, fp).id).toBe(baseline)
            }
        } finally {
            rnd.mockRestore()
        }
    })
})
