import { describe, it, expect } from 'vitest'
import { cooldownSecondsFor429 } from './api'

// Builds a Gemini-style 429 error Response with the given error details.
function gemini429(details: unknown[]): Response {
    return new Response(JSON.stringify({ error: { code: 429, message: 'rate limited', details } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
    })
}

describe('cooldownSecondsFor429 — 429 classification (replaces the 24h consecutive-count bench)', () => {
    it('per-day (RPD) quota → benches until midnight PT (large, not the short fallbacks)', async () => {
        const resp = gemini429([
            {
                '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }]
            }
        ])
        const sec = await cooldownSecondsFor429(resp, 'google-ai-studio')
        // Seconds-until-midnight-PT is in (0, 86400]; crucially it is NOT one of
        // the short per-minute fallbacks (39 / 65) — RPD genuinely benches the key.
        expect(sec).toBeGreaterThan(0)
        expect(sec).toBeLessThanOrEqual(24 * 60 * 60)
        expect(sec).not.toBe(65)
    })

    it('per-minute limit with RetryInfo → short cooldown (retryDelay + 2s), NOT a 24h bench', async () => {
        const resp = gemini429([
            { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' }
        ])
        const sec = await cooldownSecondsFor429(resp, 'google-ai-studio')
        expect(sec).toBe(39)
    })

    it('QuotaFailure that is NOT per-day still resolves via RetryInfo as a short cooldown', async () => {
        const resp = gemini429([
            {
                '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }]
            },
            { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '12s' }
        ])
        const sec = await cooldownSecondsFor429(resp, 'google-ai-studio')
        expect(sec).toBe(14)
    })

    it('unclassified 429 (no QuotaFailure/RetryInfo) → 65s fallback', async () => {
        const resp = gemini429([])
        const sec = await cooldownSecondsFor429(resp, 'google-ai-studio')
        expect(sec).toBe(65)
    })

    it('unparseable body → 65s fallback, never throws', async () => {
        const resp = new Response('not json', { status: 429 })
        const sec = await cooldownSecondsFor429(resp, 'google-ai-studio')
        expect(sec).toBe(65)
    })

    it('malformed RetryInfo retryDelay → 65s fallback, never a NaN cooldown', async () => {
        // parseInt('fast') is NaN; without the guard this would bench the key for
        // NaN seconds. The fix falls back to the safe default instead.
        const resp = gemini429([{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: 'fast' }])
        const sec = await cooldownSecondsFor429(resp, 'google-ai-studio')
        expect(Number.isNaN(sec)).toBe(false)
        expect(sec).toBe(65)
    })

    it('non-google provider falls back to 65s when no rate-limit headers', async () => {
        const resp = new Response('{}', { status: 429, headers: { 'Content-Type': 'application/json' } })
        const sec = await cooldownSecondsFor429(resp, 'some-other-provider')
        expect(sec).toBe(65)
    })
})

// Builds an OpenRouter-style 429 with the given headers (X-RateLimit-Reset is a
// unix timestamp in MILLISECONDS, per OpenRouter's API).
function openrouter429(headers: Record<string, string>): Response {
    return new Response('{}', { status: 429, headers })
}

describe('cooldownSecondsFor429 — OpenRouter (untilResetForOpenrouter via X-RateLimit-Reset)', () => {
    it('valid future X-RateLimit-Reset → (reset - now)/1000 + 5s buffer', async () => {
        const now = Date.now()
        const resetMs = now + 30_000 // resets in 30s
        const resp = openrouter429({ 'X-RateLimit-Reset': String(resetMs) })
        const sec = await cooldownSecondsFor429(resp, 'openrouter')
        // floor(~30000/1000) + 5 = 35 (allow 1s slack for test-execution drift).
        expect(sec).toBeGreaterThanOrEqual(34)
        expect(sec).toBeLessThanOrEqual(35)
    })

    it('missing X-RateLimit-Reset header → 65s fallback', async () => {
        const resp = openrouter429({ 'Content-Type': 'application/json' })
        const sec = await cooldownSecondsFor429(resp, 'openrouter')
        expect(sec).toBe(65)
    })

    it('malformed (non-numeric) X-RateLimit-Reset → 65s fallback, never throws', async () => {
        const resp = openrouter429({ 'X-RateLimit-Reset': 'not-a-number' })
        const sec = await cooldownSecondsFor429(resp, 'openrouter')
        expect(sec).toBe(65)
    })

    it('past X-RateLimit-Reset (already elapsed) → 65s fallback', async () => {
        const resp = openrouter429({ 'X-RateLimit-Reset': String(Date.now() - 10_000) })
        const sec = await cooldownSecondsFor429(resp, 'openrouter')
        expect(sec).toBe(65)
    })
})
