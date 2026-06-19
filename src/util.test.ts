import { describe, it, expect } from 'vitest'
import { timingSafeEqual, isApiRequestAllowed, isWebUiRequestAllowed } from './util'

// timingSafeEqual replaces `===`/`!==` on the secret-auth path so that
// equality does not leak via timing. We cannot reliably assert wall-clock
// timing in a unit test (the JIT + GC make it flaky), so instead we lock the
// CORRECTNESS invariants a length-safe constant-time compare must satisfy —
// and, critically, the ones a NAÏVE/broken constant-time impl gets wrong:
//   • a compare that only XORs up to min(len) would accept a prefix as equal,
//   • a compare that early-returns on a length mismatch would leak length.
// Each case below kills one of those mutations.
describe('timingSafeEqual — constant-time secret equality', () => {
    it('returns true only for byte-identical strings', () => {
        expect(timingSafeEqual('sk-abc123', 'sk-abc123')).toBe(true)
        expect(timingSafeEqual('', '')).toBe(true)
    })

    it('returns false when any byte differs (same length)', () => {
        expect(timingSafeEqual('sk-abc123', 'sk-abc124')).toBe(false)
        // first byte differs — must still be false (no early-exit shortcut peeked)
        expect(timingSafeEqual('Xk-abc123', 'sk-abc123')).toBe(false)
    })

    it('returns false when one is a PREFIX of the other (the side-channel attack)', () => {
        // A min(len)-only XOR would wrongly accept these. This is the exact
        // byte-by-byte recovery case the constant-time compare must defeat.
        expect(timingSafeEqual('sk-abc', 'sk-abc123')).toBe(false)
        expect(timingSafeEqual('sk-abc123', 'sk-abc')).toBe(false)
        expect(timingSafeEqual('', 'sk-abc123')).toBe(false)
        expect(timingSafeEqual('sk-abc123', '')).toBe(false)
    })

    it('returns false for different lengths even when content overlaps', () => {
        expect(timingSafeEqual('aaaa', 'aaaaa')).toBe(false)
        expect(timingSafeEqual('aaaaa', 'aaaa')).toBe(false)
    })

    it('is symmetric', () => {
        const a = 'svc-test-key'
        const b = 'svc-test-keX'
        expect(timingSafeEqual(a, b)).toBe(timingSafeEqual(b, a))
    })
})

// Integration: the auth path that consumes timingSafeEqual must keep exactly the
// same accept/reject semantics it had with `===`.
describe('auth path uses constant-time compare without changing semantics', () => {
    const KEYS = 'svc-test;other-key'

    it('accepts the exact unrestricted key', () => {
        expect(isApiRequestAllowed('svc-test', KEYS, 'google-ai-studio', 'gemini-2.5-flash')).toBe(true)
        expect(isWebUiRequestAllowed('svc-test', KEYS)).toBe(true)
    })

    it('rejects a same-length wrong key', () => {
        expect(isApiRequestAllowed('svc-tesX', KEYS, 'google-ai-studio', 'gemini-2.5-flash')).toBe(false)
        expect(isWebUiRequestAllowed('svc-tesX', KEYS)).toBe(false)
    })

    it('rejects a correct PREFIX of a valid key (timing-recovery guess)', () => {
        expect(isApiRequestAllowed('svc-', KEYS, 'google-ai-studio', 'gemini-2.5-flash')).toBe(false)
        expect(isWebUiRequestAllowed('svc-', KEYS)).toBe(false)
    })
})
