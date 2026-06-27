#!/usr/bin/env node
/**
 * collect.mjs — sticky-cache-baseline collector
 *
 * PURPOSE: Read-only, idempotent collector for CF AI Gateway analytics.
 *   Queries the CF Analytics GraphQL API, derives the pre-fix cache metrics,
 *   and prints the JSON artifact to stdout. Caller pipes to
 *   docs/baselines/sticky-cache-baseline.json.
 *
 * USAGE:
 *   CF_ACCOUNT_ID=<id> CF_API_TOKEN=<token> node scripts/baseline/collect.mjs \
 *     | tee docs/baselines/sticky-cache-baseline.json
 *
 * INVARIANTS:
 *   INV-A  No fabrication — every field is backed by a GraphQL query or an
 *          explicit {unavailable, reason} when the API does not expose it.
 *   INV-B  SHA pinned — source_sha is read from `git rev-parse HEAD` at run time.
 *   INV-C  One-shot — no scheduled job, no side effects, stdout only.
 *   INV-D  No secrets in source — all credentials via process.env only.
 *
 * REQUIRED ENV:
 *   CF_ACCOUNT_ID   Cloudflare account ID (32-hex)
 *   CF_API_TOKEN    Cloudflare API token with Analytics:Read permission
 *
 * OPTIONAL ENV:
 *   CF_GATEWAY_NAME  AI Gateway name (default: "one-balance")
 *   WINDOW_DAYS      Look-back window in days (default: 7)
 */

import { execSync } from 'node:child_process'

const GATEWAY = process.env.CF_GATEWAY_NAME ?? 'one-balance'
const WINDOW_DAYS = Number(process.env.WINDOW_DAYS ?? '7')

// ── secrets from env only (INV-D) ─────────────────────────────────────────────
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID
const CF_API_TOKEN = process.env.CF_API_TOKEN

if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    // Emit an explicit NOT-MEASURED sentinel artifact.
    // floor: true and measured: false are machine-readable markers that the
    // baseline guard test REJECTS — this artifact is intentionally RED in CI
    // until real credentials are supplied and a live artifact is committed.
    // Do NOT commit this output as the final baseline.
    const sha = gitHead()
    const artifact = {
        gateway: GATEWAY,
        source_sha: sha,
        measured_at: new Date().toISOString(),
        floor: true,
        measured: false,
        cached_hit_fraction: null,
        under_budget_spill_count: {
            unavailable: true,
            reason: 'CF_ACCOUNT_ID or CF_API_TOKEN not set; measurement not possible'
        },
        status_shares: {
            s429: null,
            s503: null,
            success: null
        },
        per_metric: {
            cached_hit_fraction: 'NOT_MEASURED — CF credentials absent; run with CF_ACCOUNT_ID+CF_API_TOKEN',
            under_budget_spill_count: 'NOT_AVAILABLE — count(requests where cost_tokens < budget_tokens) not exposed by CF Analytics',
            status_shares: 'NOT_MEASURED — CF credentials absent; run with CF_ACCOUNT_ID+CF_API_TOKEN'
        },
        provenance: null,
        notes: 'NOT-MEASURED sentinel. Re-run with CF_ACCOUNT_ID+CF_API_TOKEN set to produce a real baseline. Do not commit this artifact — the guard test will fail on floor:true.'
    }
    process.stdout.write(JSON.stringify(artifact, null, 2) + '\n')
    process.exit(0)
}

// ── live collection path ───────────────────────────────────────────────────────

const now = new Date()
const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
const sinceStr = since.toISOString()
const untilStr = now.toISOString()

// Named operation with variable declarations (fixes "Variable not defined" error).
// httpStatus is a DIMENSION, not a summable field — it must NOT appear inside sum{}.
const query = `
query BaselineCollect(
  $accountTag: string!
  $since: Time!
  $until: Time!
  $gatewayId: string!
) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      aiGatewayRequestsAdaptiveGroups(
        filter: {
          datetimeHour_geq: $since
          datetimeHour_leq: $until
          gatewayId: $gatewayId
        }
        limit: 10000
      ) {
        count
        sum {
          cacheHits
          requests
        }
        dimensions {
          httpStatus
        }
      }
    }
  }
}
`

const variables = {
    accountTag: CF_ACCOUNT_ID,
    since: sinceStr,
    until: untilStr,
    gatewayId: GATEWAY
}

const CF_GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql'

let raw
try {
    const resp = await fetch(CF_GRAPHQL_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CF_API_TOKEN}`
        },
        body: JSON.stringify({ query, variables })
    })
    raw = await resp.json()
} catch (err) {
    fatal(`CF GraphQL request failed: ${err.message}`)
}

if (raw.errors && raw.errors.length > 0) {
    fatal(`CF GraphQL errors: ${JSON.stringify(raw.errors)}`)
}

const groups = raw?.data?.viewer?.accounts?.[0]?.aiGatewayRequestsAdaptiveGroups ?? []

let totalRequests = 0
let totalCacheHits = 0
const statusCounts = { s429: 0, s503: 0, success: 0 }

for (const g of groups) {
    const count = g.count ?? 0
    const hits = g.sum?.cacheHits ?? 0
    const status = g.dimensions?.httpStatus ?? 200
    totalRequests += count
    totalCacheHits += hits
    if (status === 429) statusCounts.s429 += count
    else if (status === 503) statusCounts.s503 += count
    else statusCounts.success += count
}

const cachedHitFraction = totalRequests > 0 ? totalCacheHits / totalRequests : 0.0

const statusTotal = statusCounts.s429 + statusCounts.s503 + statusCounts.success
const statusShares = statusTotal > 0
    ? {
        s429: statusCounts.s429 / statusTotal,
        s503: statusCounts.s503 / statusTotal,
        success: statusCounts.success / statusTotal
    }
    : { s429: 0.0, s503: 0.0, success: 1.0 }

const sha = gitHead()

const artifact = {
    gateway: GATEWAY,
    source_sha: sha,
    measured_at: untilStr,
    cached_hit_fraction: cachedHitFraction,
    under_budget_spill_count: {
        unavailable: true,
        reason: 'CF AI Gateway Analytics does not expose per-request cost_tokens at free-tier granularity; spill count unavailable'
    },
    status_shares: statusShares,
    per_metric: {
        cached_hit_fraction: `CF Analytics GraphQL: sum(cacheHits)/sum(requests) over ${WINDOW_DAYS}d [${sinceStr}..${untilStr}] on gateway=${GATEWAY} account=${CF_ACCOUNT_ID}`,
        under_budget_spill_count: 'count(requests where cost_tokens < budget_tokens) — not available at CF Analytics granularity',
        status_shares: `CF Analytics GraphQL: count(requests) grouped by httpStatus, normalised to fractions, ${WINDOW_DAYS}d window on gateway=${GATEWAY}`
    },
    provenance: {
        graphql_endpoint: CF_GRAPHQL_URL,
        account_id_env: 'CF_ACCOUNT_ID',
        token_env: 'CF_API_TOKEN',
        window_days: WINDOW_DAYS,
        window_since: sinceStr,
        window_until: untilStr,
        total_requests_sampled: totalRequests
    }
}

process.stdout.write(JSON.stringify(artifact, null, 2) + '\n')

// ── helpers ────────────────────────────────────────────────────────────────────

function gitHead() {
    try {
        return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
    } catch {
        return '0000000000000000000000000000000000000000'
    }
}

function fatal(msg) {
    process.stderr.write(`collect.mjs error: ${msg}\n`)
    process.exit(1)
}
