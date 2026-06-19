import { describe, it, expect } from 'vitest'
import {
    CONVERSATION_FINGERPRINT_CORE,
    BIFROST_ECHO_PREFIX,
    LEGACY_FINGERPRINT_HEADER
} from './contract'
// The golden fixture is the single source of truth shared with ai-node
// (byte-identical copy at tests/contracts/conversation-fingerprint.json). It is
// imported as JSON (tsconfig resolveJsonModule) so no Node fs/url types are
// needed under the Worker tsconfig — keeping tsc --noEmit clean.
import fixture from '../tests/contracts/conversation-fingerprint.json'

// ── The wire contract (стержень #6) ────────────────────────────────────────
// ai-node EMITS `x-bf-eh-conversation-fingerprint`; Bifrost strips the
// `x-bf-eh-` prefix; one-balance READS `conversation-fingerprint`. A partial
// rename of any link silently degrades consistent-hash selection to RANDOM —
// no 4xx, no log. This is THE class of bug that started the cache revival.
// This test pins our TS consts to the shared fixture so a literal can never
// drift from the wire string without a RED here.

describe('conversation-fingerprint wire contract (golden)', () => {
    it('CORE const equals fixture.core (the de-prefixed name one-balance reads)', () => {
        expect(CONVERSATION_FINGERPRINT_CORE).toBe(fixture.core)
    })

    it('ECHO prefix const equals fixture.prefix (the only family Bifrost forwards)', () => {
        expect(BIFROST_ECHO_PREFIX).toBe(fixture.prefix)
    })

    it('LEGACY header const equals fixture.legacy (backward-compat fallback)', () => {
        expect(LEGACY_FINGERPRINT_HEADER).toBe(fixture.legacy)
    })

    it('prefix + core composes to the emitted name ai-node sends (fixture.emit)', () => {
        // The keystone equality: what ai-node EMITS == what our consts compose.
        // If either side renames in isolation, prefix+core !== emit → RED.
        expect(BIFROST_ECHO_PREFIX + CONVERSATION_FINGERPRINT_CORE).toBe(fixture.emit)
    })
})
