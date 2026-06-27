# deployed-reference/ — recovered production bundles (RECOVERY OF RECORD)

These are the **esbuild build outputs** of the two Cloudflare Workers actually running in production
(recovered 2026-06-10 from Daniil's Desktop, originally wrangler-deployed; source existed nowhere else —
not in any repo, not reconstructable via the CF API/MCP). Captured here so the running code is in GitOps
and survives loss of the Cloudflare copy.

- `one-balance.deployed.js` — the `one-balance` worker. = upstream glidea monolith (`src/*.ts`) **plus** a
  custom **Key Manager API** (the divergence ai-node depends on):
  - `GET /api/keys/next?provider=&model=` (auth `Authorization: Bearer ${KEY_MANAGER_TOKEN}`) → `{key, id, cooling_until}`
  - `POST /api/keys/{id}/status` → `{blocked}` | `{rate_limited, retry_after, model, provider}` | `{ok}`
  - The proxy path `/api/{provider}/...` (and `/api/compat/...`) runs the `forward()` retry loop.
- `aiproxy.deployed.js` — the `aiproxy` worker. Thin proxy with two distinct paths:
  - **Gemini-native** (`/v1beta?/models/{model}:generate|streamGenerate`, and `GET /v1beta/models` for ListModels) —
    forwards to one-balance via service binding `env.ONE_BALANCE.fetch(...)` under an AbortController timeout and
    streams the upstream body back **unchanged** (it only strips the `content-disposition` header). No SSE rewriting.
  - **OpenAI-compat** (`/v1/chat/completions`) — auto-prefixes `provider/` onto the model and, **only on this path**,
    runs the Gemini `thought_signature` SSE warning-filter (a `TransformStream` over the `text/event-stream` body).

  So the `thought_signature`/SSE warning-filter is **scoped to the chat-completions SSE path only** — it does **not**
  run on the Gemini-native proxying that Bifrost actually uses. **No retry loop** (retries are single-layer, in
  one-balance).

These are build artifacts, NOT the maintainable source — the clean TypeScript lives in `src/` (reconstructed
from the upstream fork + the Key Manager additions). Do not edit the bundles; do not deploy from here.

## The bug being fixed (one-balance `forward()`)
`MAX_RETRIES = 30` re-sending the full request body to each rotated key; on 429 a key is benched, and a
consecutive-count heuristic (`CONSECUTIVE_429_THRESHOLD`, default 2) benches it until midnight Pacific
(≤24h) — misclassifying per-minute/size 429s as daily RPD exhaustion. A request larger than a free
project's per-minute TPM 429s on every project → the loop burns the pool (30× the body) and benches keys
for the day while still failing with `500 "Internal server error after retries"`.
