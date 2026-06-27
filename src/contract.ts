// ── Conversation-fingerprint wire contract (single source of truth) ─────────
//
// ai-node EMITS the fingerprint as `x-bf-eh-conversation-fingerprint`. Bifrost
// forwards ONLY the `x-bf-eh-*` header family and strips that prefix, so
// one-balance RECEIVES the de-prefixed `conversation-fingerprint`. A partial
// rename of any link in this chain silently degrades consistent-hash key
// selection to RANDOM — no 4xx, no log. That is the exact bug class the cache
// revival closed; these consts exist so the wire string lives in ONE place
// (no bare literals scattered through api.ts) and is pinned by contract.test.ts
// against the byte-identical golden fixture shared with ai-node
// (tests/contracts/conversation-fingerprint.json).

// The de-prefixed name one-balance reads off the incoming request.
export const CONVERSATION_FINGERPRINT_CORE = 'conversation-fingerprint'

// The only header-name prefix Bifrost forwards (and strips). ai-node sends the
// fingerprint — and any future routing hints — under this family.
export const BIFROST_ECHO_PREFIX = 'x-bf-eh-'

// Legacy header kept for backward compatibility: read as a fallback, stripped
// before forwarding upstream.
export const LEGACY_FINGERPRINT_HEADER = 'x-conversation-fingerprint'
