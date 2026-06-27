{
    "$schema": "node_modules/wrangler/config-schema.json",
    "name": "one-balance",
    "main": "src/index.ts",
    "compatibility_date": "2025-06-20",
    "ai": {
        "binding": "AI"
    },
    "d1_databases": [
        {
            "binding": "DB",
            "database_name": "one-balance",
            "database_id": "my-database-id",
            "migrations_dir": "src/service/d1/migrations"
        }
    ],
    "vars": {
        "AI_GATEWAY": "one-balance",
        "UPSTREAM_TIMEOUT_MS": "60000"
        // KEY_SELECTION_STRATEGY (OPTIONAL, not a secret) — key selection for
        // FINGERPRINTED (sticky) requests. Deliberately NOT listed as a var here:
        // a literal value would make `wrangler types` infer the single-literal type
        // "hash" and break the 'hrw' comparison. Its type lives in src/env.d.ts and
        // it defaults to "hash" at runtime when unset. Set it per-environment (e.g.
        // a Dokploy/Cloudflare var) to opt in:
        //   "hash" (DEFAULT) — legacy hash(fingerprint) % len consistent hashing.
        //   "hrw"            — rendezvous / highest-random-weight: churn-stable, so
        //                      a conversation keeps its key (and Google's implicit
        //                      cache) when the pool gains/loses keys. Opt-in.
        // Any unrecognized/absent value is coerced to "hash" (see api.ts).
    },
    "observability": {
        "enabled": true
    }
}
