# Deploy & rollback runbook — one-balance (production)

`one-balance` serves a live Gemini key-pool that real work depends on. Production
must change **only** through the gated pipeline below — never an ad-hoc
`wrangler deploy` from a laptop or a feature branch.

## How a deploy reaches production

```
PR → review (≥2) → merge to main → CI runs on main → (green)
   → "Deploy (production)" workflow → ⏸ manual approval → wrangler deploy
```

Three gates, all required:

1. **CI green on `main`** — `Deploy (production)` triggers via `workflow_run` only
   when the `CI` workflow concluded `success` on `main`.
2. **Manual approval** — the job runs in the `production` GitHub Environment, which
   has a **required reviewer**. The deploy waits in the Actions UI until approved.
3. **main-only** — the job checks out `ref: main`; PR/feature branches can never
   deploy.

Direct `pnpm deploycf` is **disabled** (it now errors). The deploy logic lives in
the `deploy:ci` script, invoked **only** by the Action with secrets from GitHub.

### D1 schema migrations — deliberate, separate from the worker deploy

The worker deploy (`deploy:ci`) ships **worker code only** — it does **not** auto-run
D1 migrations. The drizzle migration-history dir (`src/service/d1/migrations`) is not
committed, so auto-`drizzle-kit generate` in a fresh CI checkout would emit a
full-schema migration whose `CREATE TABLE`s collide with the already-provisioned prod
DB — running it blindly would break production, not protect it. The prod D1 schema
already exists, so worker-only deploys are correct while the schema is unchanged.

Schema changes go through a separate, reviewed migration step (backlog: commit the
migration history + baseline the existing prod schema, then apply-only in CI). Do
**not** wire `drizzle-kit generate` into the deploy path.

### First / emergency deploy

Use **Actions → Deploy (production) → Run workflow** (`workflow_dispatch`). It still
hits the approval gate. Use this for the first controlled deploy of a vetted `main`.

> ⚠️ `main` currently contains the regression that was rolled back on 2026-06-22.
> Do NOT deploy `main` until that regression is found and fixed. Production stays on
> the known-good version until then.

## Rollback (one step)

Production is versioned; rollback never needs a git revert.

- **Cloudflare dashboard:** Workers & Pages → `one-balance` → Deployments →
  pick a previous version → **Rollback**.
- **wrangler:** `pnpm exec wrangler rollback [<version-id>]` (with
  `CLOUDFLARE_API_TOKEN` set).
- **API:** `POST /accounts/{account_id}/workers/scripts/one-balance/versions`
  rollback, or the version-rollback endpoint.

List versions: `pnpm exec wrangler deployments list` (or the CF dashboard).

## One remaining hardening step (owner / CF dashboard)

Cloudflare **Workers Builds** (git integration) historically built branch pushes.
To make the gated Action the *sole* path to production, in the CF dashboard:
Workers & Pages → `one-balance` → Settings → Builds → **disconnect the repo**
(or set the production branch to `main` and disable non-production deploys).
The deploy then runs only through this workflow. Until then, branch builds remain
**preview-only** and do not touch production (verified: prod deployments come only
from `wrangler`/`dash`, never from Builds).
