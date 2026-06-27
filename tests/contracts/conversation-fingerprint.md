# Conversation-fingerprint wire contract (SSOT)

Single source of truth for the header wire-string that carries the conversation
fingerprint from **ai-node** (emitter) to **one-balance** (reader). A partial
rename of any link in this chain silently degrades consistent-hash key
selection to **RANDOM** — no 4xx, no log. That is the exact bug class the
Gemini cache revival closed; this contract exists so the wire string lives in
one place and cannot drift unnoticed.

## The chain

1. **ai-node EMITS** `x-bf-eh-conversation-fingerprint`.
   Bifrost forwards only the `x-bf-eh-*` header family and strips the prefix.
2. **one-balance READS** the de-prefixed `conversation-fingerprint`
   (legacy fallback: `x-conversation-fingerprint`).
3. one-balance **STRIPS** all three before forwarding upstream to Google /
   AI Gateway, so internal routing headers never leak.

## The frozen values

| field    | value                               | role                                            |
| -------- | ----------------------------------- | ----------------------------------------------- |
| `core`   | `conversation-fingerprint`          | de-prefixed name one-balance reads              |
| `emit`   | `x-bf-eh-conversation-fingerprint`  | name ai-node sends on the Bifrost path          |
| `prefix` | `x-bf-eh-`                          | only header family Bifrost forwards (and strips) |
| `legacy` | `x-conversation-fingerprint`        | backward-compat fallback read                   |

Invariant: `prefix + core == emit`.

## Where it is pinned

- **Consts** (one source, no bare literals): `src/contract.ts`.
- **Golden fixture** (byte-identical, shared with ai-node):
  `tests/contracts/conversation-fingerprint.json`
  (canonical `sha256 = b29d9621141dca5615df614863a7ca7ba757fd685a6f8bcc85f1d91fb64b1495`).
- **Golden test** pinning consts ↔ fixture: `src/contract.test.ts`.
- **Consumer negative case** (prefixed name must NOT pin a key → random):
  `src/api.fingerprint.test.ts` `(neg)` / `(neg2)`.
- **Leak guard** (all three stripped upstream): `src/api.e2e.test.ts`.
- **CI guard**: `.github/workflows/ci.yml` → "Contract guard (fingerprint wire-string)".

## Changing the contract

A rename is a coordinated change. In the **same PR / paired PRs**:

1. Update `src/contract.ts` (the consts).
2. Update `tests/contracts/conversation-fingerprint.json` **and** the canonical
   `EXPECTED_SHA` in the CI guard step.
3. Update this doc's frozen-values table.
4. Update the **ai-node** side (`internal/infrastructure/server.go` emit +
   its own `tests/contracts/conversation-fingerprint.json`).

## Cross-repo enforcement (FLAG — follow-up)

The CI guard's cross-repo byte-diff against the ai-node sibling copy is
**best-effort and currently a no-op**: ai-node is a PRIVATE sibling
(`Labpics-Team/ai-node`) in the same org, so the default `GITHUB_TOKEN` of a
one-balance Actions run cannot read it, and the sibling
`tests/contracts/conversation-fingerprint.json` does not exist yet. The guard
auto-activates (and starts blocking on drift) once **both** land:

- a read-only cross-repo PAT exposed as the `AI_NODE_CONTRACT_TOKEN` secret, and
- the byte-identical sibling fixture committed in ai-node.

Until then, **this doc + the always-on local sha256 guard are the contract**.
The canonical org-wide SSOT location is
`Labpics-Team/Labpics-infra/docs/contracts/conversation-fingerprint.md`
(tracked as a sibling-stage deliverable).
