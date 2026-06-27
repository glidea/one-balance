// Secret bindings — TYPES ONLY (never values).
//
// `wrangler types` generates `worker-configuration.d.ts` from `wrangler.jsonc`,
// which declares `vars` and resource bindings but NOT secrets (secrets are set
// via `wrangler secret put` / the dashboard and never live in config). Without
// these declarations `tsc --noEmit` fails with TS2339 on every `env.<SECRET>`
// read, which also breaks the Cloudflare Workers Build (its build command runs
// `pnpm run typecheck`).
//
// We merge the secret names into `Cloudflare.Env` — the same interface
// `wrangler types` augments — so regenerating `worker-configuration.d.ts` does
// not clobber these. Values are NEVER declared here; only the binding types.
declare namespace Cloudflare {
    interface Env {
        /** Comma-separated allow-list of API/Web-UI auth keys (secret). */
        AUTH_KEY: string
        /** Bearer token authenticating the Key Manager trust boundary (secret). */
        KEY_MANAGER_TOKEN: string
    }
}
