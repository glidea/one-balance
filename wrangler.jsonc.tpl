{
    "$schema": "node_modules/wrangler/config-schema.json",
    "name": "one-balance",
    "main": "src/index.ts",
    "compatibility_date": "2025-06-20",
    "build": {
        "command": "pnpm install --frozen-lockfile && pnpm run typecheck"
    },
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
    },
    "observability": {
        "enabled": true
    }
}
