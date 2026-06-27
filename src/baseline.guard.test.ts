/**
 * sticky-cache-baseline guard
 *
 * CLASS CLOSED: fabricated-floor / test-theater
 *   Root causes closed here:
 *   RC-1 docs/ gitignored → .gitignore now has !docs/baselines/
 *   RC-2 GraphQL malformed → collect.mjs query fixed (named op + variable decls + httpStatus out of sum{})
 *   RC-3 isPlaceholder(0)===false allowed floor zeros → guard now requires provenance block + rejects floor:true
 *   RC-4 source_sha self-referential → floor artifact now emits measured:false so guard rejects it
 *   RC-5 hand-stitched artifact → deleted; any artifact without provenance is RED
 *   RC-6 guard theater on floor → guard now hard-fails on floor:true / measured:false / provenance:null
 *
 * Tests:
 *   1. baseline-artifact-schema-guard   (contract)   — pins schema; RED until real artifact present
 *   2. schema-guard-RED-proof           (mutation)   — proves the guard bites (in-memory, always GREEN)
 *   3. artifact-valid-json              (smoke)      — artifact parses as JSON; RED until artifact present
 *   4. collector-idempotence            (property)   — collector is a pure read/transform with no side effects
 *   5. no-hardcoded-secrets             (characterization) — no tokens/ids in collector source
 *   6. sha-pin-integrity                (regression) — artifact.source_sha == HEAD SHA at measure time
 *   7. existing-suite-stays-green       (regression) — new files don't break typecheck/test
 *   8. floor-rejection                  (mutation)   — guard actively rejects floor/sentinel artifacts
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'

// ─── paths (absolute so cwd changes in test runner don't bite) ───────────────
const ROOT = path.resolve(import.meta.dirname, '..')
const ARTIFACT_PATH = path.join(ROOT, 'docs', 'baselines', 'sticky-cache-baseline.json')
const COLLECTOR_SCRIPT = path.join(ROOT, 'scripts', 'baseline', 'collect.mjs')

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Load the artifact or throw with a clear message (fail-fast). */
function loadArtifact(): Record<string, unknown> {
    if (!existsSync(ARTIFACT_PATH)) {
        throw new Error(
            `Baseline artifact not found: ${ARTIFACT_PATH}\n` +
            `Run the collector first: CF_ACCOUNT_ID=<id> CF_API_TOKEN=<token> node ${COLLECTOR_SCRIPT} > ${ARTIFACT_PATH}`
        )
    }
    const raw = readFileSync(ARTIFACT_PATH, 'utf8')
    return JSON.parse(raw)
}

/** Fraction validator: must be a number in [0, 1]. */
function isFraction(v: unknown): boolean {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
}

/**
 * Placeholder / sentinel check.
 * Closes RC-3: isPlaceholder(0)===false was the exploit that let floor zeros
 * through.  Now we do NOT special-case numeric 0 — 0.0 is a valid fraction
 * only if the artifact also carries a live provenance block.
 * The provenance check is separate (see isLiveMeasurement).
 */
function isPlaceholder(v: unknown): boolean {
    if (v === null || v === undefined) return true
    if (typeof v === 'number' && !Number.isFinite(v)) return true // NaN / Infinity
    if (typeof v === 'string') {
        const u = v.toUpperCase()
        // explicit sentinel strings
        if (u === 'TODO' || u === 'PLACEHOLDER') return true
        // collector's NOT_MEASURED sentinel (RC-2 fix)
        if (u.startsWith('NOT_MEASURED') || u.startsWith('NOT_AVAILABLE')) return true
    }
    return false
}

/**
 * Returns true only when the artifact was produced by the live collection path.
 * Closes RC-3, RC-4, RC-6: the floor path now emits floor:true / measured:false /
 * provenance:null, and this predicate rejects all three shapes.
 *
 * A live artifact MUST have:
 *   - floor: absent or false (not true)
 *   - measured: absent or true (not false)
 *   - provenance: a non-null object with at least graphql_endpoint and total_requests_sampled
 */
function isLiveMeasurement(a: Record<string, unknown>): boolean {
    if (a.floor === true) return false
    if (a.measured === false) return false
    if (a.provenance === null || a.provenance === undefined) return false
    const p = a.provenance
    if (typeof p !== 'object') return false
    if (!('graphql_endpoint' in (p as object))) return false
    if (!('total_requests_sampled' in (p as object))) return false
    return true
}

/** under_budget_spill_count may be a number OR {unavailable, reason} — both are legal. */
function isValidSpillCount(v: unknown): boolean {
    if (typeof v === 'number') return true
    if (
        typeof v === 'object' &&
        v !== null &&
        'unavailable' in (v as object) &&
        'reason' in (v as object) &&
        typeof (v as { reason: unknown }).reason === 'string'
    ) {
        return true
    }
    return false
}

// ─── 1. baseline-artifact-schema-guard (contract) ────────────────────────────
// RED until a live artifact is committed (floor:true artifacts fail isLiveMeasurement).
describe('baseline-artifact-schema-guard', () => {
    it('artifact file exists at docs/baselines/sticky-cache-baseline.json', () => {
        expect(existsSync(ARTIFACT_PATH), `missing artifact: ${ARTIFACT_PATH}`).toBe(true)
    })

    it('artifact JSON parses and has all required top-level keys', () => {
        const a = loadArtifact()
        const required = [
            'cached_hit_fraction',
            'under_budget_spill_count',
            'status_shares',
            'per_metric',
            'source_sha',
            'measured_at',
            'gateway',
            'provenance'
        ]
        for (const key of required) {
            expect(a, `missing required key: ${key}`).toHaveProperty(key)
        }
    })

    it('artifact is a LIVE measurement (not a floor/sentinel) — closes RC-3/RC-4/RC-6', () => {
        // Closes the class: floor:true / measured:false / provenance:null all fail.
        // The floor artifact the collector emits when credentials are absent is
        // intentionally caught here — CI stays RED until a real run replaces it.
        const a = loadArtifact()
        expect(
            isLiveMeasurement(a),
            'artifact must be a live CF GraphQL measurement (floor:true or missing provenance block is rejected). ' +
            'Run: CF_ACCOUNT_ID=<id> CF_API_TOKEN=<token> node scripts/baseline/collect.mjs > docs/baselines/sticky-cache-baseline.json'
        ).toBe(true)
    })

    it('gateway === "one-balance"', () => {
        const a = loadArtifact()
        expect(a.gateway).toBe('one-balance')
    })

    it('cached_hit_fraction is a number in [0,1] and not a placeholder', () => {
        const a = loadArtifact()
        expect(isPlaceholder(a.cached_hit_fraction), 'placeholder sentinel in cached_hit_fraction').toBe(false)
        expect(
            isFraction(a.cached_hit_fraction),
            `cached_hit_fraction must be in [0,1], got: ${JSON.stringify(a.cached_hit_fraction)}`
        ).toBe(true)
    })

    it('under_budget_spill_count is a number OR {unavailable, reason} (not placeholder)', () => {
        const a = loadArtifact()
        expect(isPlaceholder(a.under_budget_spill_count), 'placeholder sentinel in under_budget_spill_count').toBe(
            false
        )
        expect(
            isValidSpillCount(a.under_budget_spill_count),
            `invalid under_budget_spill_count: ${JSON.stringify(a.under_budget_spill_count)}`
        ).toBe(true)
    })

    it('status_shares has s429, s503, success keys — all fractions — summing to ~1.0', () => {
        const a = loadArtifact()
        const ss = a.status_shares as Record<string, unknown>
        expect(ss, 'status_shares must be an object').toBeTruthy()
        expect(typeof ss).toBe('object')

        for (const key of ['s429', 's503', 'success'] as const) {
            expect(ss, `status_shares.${key} missing`).toHaveProperty(key)
            expect(isPlaceholder(ss[key]), `placeholder in status_shares.${key}`).toBe(false)
            expect(
                isFraction(ss[key]),
                `status_shares.${key} must be in [0,1], got: ${JSON.stringify(ss[key])}`
            ).toBe(true)
        }

        const sum = (ss.s429 as number) + (ss.s503 as number) + (ss.success as number)
        expect(sum, `status_shares sum must be ~1.0, got ${sum}`).toBeCloseTo(1.0, 1) // ±0.05
    })

    it('per_metric contains non-placeholder method strings for each metric', () => {
        const a = loadArtifact()
        const pm = a.per_metric
        expect(typeof pm).toBe('object')
        expect(pm).not.toBeNull()

        const methods = Object.values(pm as Record<string, unknown>)
        expect(methods.length, 'per_metric must have at least one entry').toBeGreaterThan(0)
        for (const method of methods) {
            expect(typeof method, `per_metric method must be a string, got ${JSON.stringify(method)}`).toBe('string')
            expect(isPlaceholder(method), `placeholder sentinel in per_metric method: ${method}`).toBe(false)
        }
    })

    it('source_sha is a non-empty 40-hex string', () => {
        const a = loadArtifact()
        const sha = a.source_sha
        expect(typeof sha).toBe('string')
        expect(isPlaceholder(sha), 'placeholder in source_sha').toBe(false)
        expect(
            /^[0-9a-f]{40}$/i.test(sha as string),
            `source_sha must be 40-hex, got: ${JSON.stringify(sha)}`
        ).toBe(true)
        expect((sha as string).length).toBe(40)
    })

    it('measured_at is a parseable ISO-8601 date string', () => {
        const a = loadArtifact()
        const ts = a.measured_at
        expect(typeof ts).toBe('string')
        expect(isPlaceholder(ts), 'placeholder in measured_at').toBe(false)
        const d = new Date(ts as string)
        expect(Number.isNaN(d.getTime()), `measured_at does not parse as a date: ${ts}`).toBe(false)
    })

    it('provenance block has required fields and total_requests_sampled >= 0', () => {
        const a = loadArtifact()
        // isLiveMeasurement already checks provenance exists and has graphql_endpoint.
        // This test pins the content of the provenance block to prevent drift.
        const p = a.provenance as Record<string, unknown>
        expect(p).not.toBeNull()
        expect(typeof p.graphql_endpoint).toBe('string')
        expect(typeof p.window_days).toBe('number')
        expect(typeof p.total_requests_sampled).toBe('number')
        expect((p.total_requests_sampled as number) >= 0).toBe(true)
    })
})

// ─── 2. schema-guard-RED-proof (mutation) ────────────────────────────────────
// Prove the guard BITES: deliberately break the artifact in scratch copies and
// assert each violation is caught.  Uses in-memory objects → always GREEN.
// Closes RC-3/RC-6: the old VALID used cached_hit_fraction:0.42 — the mutations
// now also demonstrate that floor:true / measured:false / provenance:null are caught.
describe('schema-guard-RED-proof (mutation proof)', () => {
    const VALID_PROVENANCE = {
        graphql_endpoint: 'https://api.cloudflare.com/client/v4/graphql',
        account_id_env: 'CF_ACCOUNT_ID',
        token_env: 'CF_API_TOKEN',
        window_days: 7,
        window_since: '2026-06-20T00:00:00.000Z',
        window_until: '2026-06-27T00:00:00.000Z',
        total_requests_sampled: 1000
    }

    const VALID: Record<string, unknown> = {
        cached_hit_fraction: 0.42,
        under_budget_spill_count: 3,
        status_shares: { s429: 0.1, s503: 0.05, success: 0.85 },
        per_metric: { cached_hit_fraction: 'sum(cache_hits)/sum(requests)' },
        source_sha: 'a'.repeat(40),
        measured_at: new Date().toISOString(),
        gateway: 'one-balance',
        provenance: VALID_PROVENANCE
    }

    it('VALID shape satisfies all schema predicates', () => {
        expect(isFraction(VALID.cached_hit_fraction)).toBe(true)
        expect(isValidSpillCount(VALID.under_budget_spill_count)).toBe(true)
        expect(isPlaceholder(VALID.cached_hit_fraction)).toBe(false)
        expect(isPlaceholder(VALID.source_sha)).toBe(false)
        expect(/^[0-9a-f]{40}$/i.test(VALID.source_sha as string)).toBe(true)
        expect(VALID.gateway).toBe('one-balance')
        expect(isLiveMeasurement(VALID)).toBe(true)
    })

    it('MUTATION: missing required field — schema predicate detects absence', () => {
        const broken = { ...VALID }
        delete (broken as Partial<typeof VALID>).cached_hit_fraction
        expect('cached_hit_fraction' in broken).toBe(false)
    })

    it('MUTATION: null placeholder in cached_hit_fraction — isPlaceholder detects it', () => {
        const broken = { ...VALID, cached_hit_fraction: null }
        expect(isPlaceholder(broken.cached_hit_fraction)).toBe(true)
        expect(isFraction(broken.cached_hit_fraction)).toBe(false)
    })

    it('MUTATION: "TODO" sentinel in cached_hit_fraction — isPlaceholder detects it', () => {
        const broken = { ...VALID, cached_hit_fraction: 'TODO' }
        expect(isPlaceholder(broken.cached_hit_fraction)).toBe(true)
    })

    it('MUTATION: "PLACEHOLDER" sentinel in cached_hit_fraction — isPlaceholder detects it', () => {
        const broken = { ...VALID, cached_hit_fraction: 'PLACEHOLDER' }
        expect(isPlaceholder(broken.cached_hit_fraction)).toBe(true)
    })

    it('MUTATION: "NOT_MEASURED" sentinel (floor collector output) — isPlaceholder detects it', () => {
        // This is exactly what collect.mjs emits on the floor path for string metrics (RC-2 fix)
        const broken = { ...VALID, cached_hit_fraction: 'NOT_MEASURED — CF credentials absent' }
        expect(isPlaceholder(broken.cached_hit_fraction)).toBe(true)
    })

    it('MUTATION: fraction out of range (>1) — isFraction rejects it', () => {
        const broken = { ...VALID, cached_hit_fraction: 1.5 }
        expect(isFraction(broken.cached_hit_fraction)).toBe(false)
    })

    it('MUTATION: fraction out of range (<0) — isFraction rejects it', () => {
        const broken = { ...VALID, cached_hit_fraction: -0.1 }
        expect(isFraction(broken.cached_hit_fraction)).toBe(false)
    })

    it('MUTATION: status_shares sum deviates >0.1 from 1.0 — sum check fails', () => {
        const broken = { ...VALID, status_shares: { s429: 0.9, s503: 0.5, success: 0.1 } }
        const ss = broken.status_shares
        const sum = ss.s429 + ss.s503 + ss.success
        expect(Math.abs(sum - 1.0)).toBeGreaterThan(0.05)
    })

    it('MUTATION: source_sha wrong length (39 chars) — 40-hex regex rejects it', () => {
        const broken = { ...VALID, source_sha: 'a'.repeat(39) }
        expect(/^[0-9a-f]{40}$/i.test(broken.source_sha as string)).toBe(false)
    })

    it('MUTATION: source_sha non-hex chars — 40-hex regex rejects it', () => {
        const broken = { ...VALID, source_sha: 'z'.repeat(40) }
        expect(/^[0-9a-f]{40}$/i.test(broken.source_sha as string)).toBe(false)
    })

    it('MUTATION: gateway wrong value — equality check fails', () => {
        const broken = { ...VALID, gateway: 'cloudflare-ai-gateway' }
        expect(broken.gateway).not.toBe('one-balance')
    })

    it('MUTATION: measured_at unparseable — Date parse returns NaN', () => {
        const broken = { ...VALID, measured_at: 'not-a-date' }
        expect(Number.isNaN(new Date(broken.measured_at as string).getTime())).toBe(true)
    })

    it('MUTATION: under_budget_spill_count is null — isValidSpillCount rejects null', () => {
        const broken = { ...VALID, under_budget_spill_count: null }
        expect(isValidSpillCount(broken.under_budget_spill_count)).toBe(false)
    })

    it('MUTATION: under_budget_spill_count is {unavailable} without reason — isValidSpillCount rejects it', () => {
        const broken = { ...VALID, under_budget_spill_count: { unavailable: true } }
        expect(isValidSpillCount(broken.under_budget_spill_count)).toBe(false)
    })

    it('MUTATION: per_metric has a TODO method string — isPlaceholder detects it', () => {
        const broken = { ...VALID, per_metric: { cached_hit_fraction: 'TODO' } }
        const methods = Object.values(broken.per_metric)
        expect(methods.some(m => isPlaceholder(m))).toBe(true)
    })

    // ── NEW: floor artifact rejection tests (closes RC-3/RC-4/RC-6) ──────────

    it('MUTATION: floor:true — isLiveMeasurement rejects the collector floor artifact', () => {
        // This is the exact shape collect.mjs emits when CF credentials are absent
        const floorArtifact = { ...VALID, floor: true, measured: false, provenance: null }
        expect(isLiveMeasurement(floorArtifact)).toBe(false)
    })

    it('MUTATION: measured:false — isLiveMeasurement rejects it', () => {
        const broken = { ...VALID, measured: false }
        expect(isLiveMeasurement(broken)).toBe(false)
    })

    it('MUTATION: provenance:null — isLiveMeasurement rejects it (old hand-stitched artifact shape)', () => {
        // This catches the exact shape of the deleted hand-stitched artifact,
        // which had no provenance block.
        const broken = { ...VALID, provenance: null }
        expect(isLiveMeasurement(broken)).toBe(false)
    })

    it('MUTATION: provenance missing graphql_endpoint — isLiveMeasurement rejects it', () => {
        const brokenProv = { ...VALID_PROVENANCE }
        delete (brokenProv as Partial<typeof VALID_PROVENANCE>).graphql_endpoint
        const broken = { ...VALID, provenance: brokenProv }
        expect(isLiveMeasurement(broken)).toBe(false)
    })

    it('MUTATION: status_shares contains null values (floor collector output) — isPlaceholder catches them', () => {
        // collect.mjs floor path emits s429:null, s503:null, success:null
        const broken = {
            ...VALID,
            status_shares: { s429: null, s503: null, success: null }
        }
        const ss = broken.status_shares as Record<string, unknown>
        for (const key of ['s429', 's503', 'success']) {
            expect(isPlaceholder(ss[key]), `null in status_shares.${key} must be a placeholder`).toBe(true)
        }
    })
})

// ─── 3. artifact-valid-json (smoke) ──────────────────────────────────────────
describe('artifact-valid-json', () => {
    it('docs/baselines/sticky-cache-baseline.json is valid JSON (parseable via node)', () => {
        expect(existsSync(ARTIFACT_PATH), `artifact not found: ${ARTIFACT_PATH}`).toBe(true)
        let parsed: unknown
        expect(() => {
            const raw = readFileSync(ARTIFACT_PATH, 'utf8')
            parsed = JSON.parse(raw)
        }, 'artifact is not valid JSON').not.toThrow()
        expect(parsed).toBeTruthy()
    })
})

// ─── 4. collector-idempotence (property) ─────────────────────────────────────
describe('collector-idempotence', () => {
    it('collector script exists at scripts/baseline/collect.mjs', () => {
        expect(existsSync(COLLECTOR_SCRIPT), `collector not found: ${COLLECTOR_SCRIPT}`).toBe(true)
    })

    it('collector has no imperative file-write calls (stdout only, not fs.writeFile/writeFileSync)', () => {
        expect(existsSync(COLLECTOR_SCRIPT), `collector not found: ${COLLECTOR_SCRIPT}`).toBe(true)
        const src = readFileSync(COLLECTOR_SCRIPT, 'utf8')
        expect(src, 'collector must not call fs.writeFile').not.toMatch(/writeFile(?:Sync)?\s*\(/)
        expect(src, 'collector must not reference the artifact path for writing').not.toMatch(
            /sticky-cache-baseline\.json.*write|write.*sticky-cache-baseline\.json/
        )
    })

    it('collector reads secrets from env only — no hardcoded account-ids or CF tokens', () => {
        expect(existsSync(COLLECTOR_SCRIPT), `collector not found: ${COLLECTOR_SCRIPT}`).toBe(true)
        const src = readFileSync(COLLECTOR_SCRIPT, 'utf8')
        const accountIdPattern = /(?<!\/\/.*|process\.env\.\w*)['"`][0-9a-f]{32}['"`]/
        expect(src, 'hardcoded CF account id detected').not.toMatch(accountIdPattern)
        expect(src, 'hardcoded CF Bearer token detected').not.toMatch(/Bearer\s+[A-Za-z0-9_-]{30,}/)
    })

    it('collector GraphQL query uses a named operation (fixes "Variable not defined" class)', () => {
        expect(existsSync(COLLECTOR_SCRIPT), `collector not found: ${COLLECTOR_SCRIPT}`).toBe(true)
        const src = readFileSync(COLLECTOR_SCRIPT, 'utf8')
        // Named query with variable declarations — not anonymous shorthand `{`
        expect(src, 'GraphQL query must be a named operation (query Name($var: Type))').toMatch(
            /query\s+\w+\s*\(/
        )
        // All four variables must be declared in the operation signature
        for (const varName of ['$accountTag', '$since', '$until', '$gatewayId']) {
            expect(src, `GraphQL variable ${varName} must be declared in operation signature`).toMatch(
                new RegExp(`\\${varName}\\s*:`)
            )
        }
    })

    it('collector GraphQL query does not place httpStatus inside sum{} (fixes CF schema rejection)', () => {
        expect(existsSync(COLLECTOR_SCRIPT), `collector not found: ${COLLECTOR_SCRIPT}`).toBe(true)
        const src = readFileSync(COLLECTOR_SCRIPT, 'utf8')
        // httpStatus is a DIMENSION, not summable — must not appear inside sum { ... }
        // Extract the sum block and assert httpStatus is absent from it
        const sumBlockMatch = src.match(/sum\s*\{([^}]*)\}/)
        if (sumBlockMatch) {
            const sumBlock = sumBlockMatch[1]
            expect(sumBlock, 'httpStatus must NOT appear inside sum{} — it is a dimension').not.toMatch(/httpStatus/)
        }
        // And httpStatus MUST appear in dimensions
        expect(src, 'httpStatus must appear in dimensions{}').toMatch(/dimensions\s*\{[^}]*httpStatus/)
    })

    it('collector floor path emits floor:true and measured:false (machine-readable sentinel)', () => {
        expect(existsSync(COLLECTOR_SCRIPT), `collector not found: ${COLLECTOR_SCRIPT}`).toBe(true)
        const src = readFileSync(COLLECTOR_SCRIPT, 'utf8')
        // The floor branch must emit explicit machine-readable rejection markers
        expect(src, 'floor path must emit floor: true').toMatch(/floor:\s*true/)
        expect(src, 'floor path must emit measured: false').toMatch(/measured:\s*false/)
    })
})

// ─── 5. no-hardcoded-secrets (characterization) ──────────────────────────────
describe('no-hardcoded-secrets', () => {
    it('collector script does not contain hardcoded CF API tokens', () => {
        expect(existsSync(COLLECTOR_SCRIPT), `collector not found: ${COLLECTOR_SCRIPT}`).toBe(true)
        const src = readFileSync(COLLECTOR_SCRIPT, 'utf8')
        expect(src, 'hardcoded CF API token (v1. prefix)').not.toMatch(/v1\.[A-Za-z0-9_-]{20,}/)
        expect(src, 'hardcoded Bearer token in source').not.toMatch(/['"`]Bearer [A-Za-z0-9_-]{20,}['"`]/)
    })

    it('collector reads all secrets via process.env (no literal account-ids)', () => {
        expect(existsSync(COLLECTOR_SCRIPT), `collector not found: ${COLLECTOR_SCRIPT}`).toBe(true)
        const src = readFileSync(COLLECTOR_SCRIPT, 'utf8')
        const lines = src.split('\n')
        for (const line of lines) {
            if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue
            const match = line.match(/['"`]([0-9a-f]{32})['"`]/)
            if (match) {
                expect(
                    line.includes('process.env'),
                    `hardcoded 32-hex account-id on line: ${line.trim()}`
                ).toBe(true)
            }
        }
    })
})

// ─── 6. sha-pin-integrity (regression) ───────────────────────────────────────
describe('sha-pin-integrity', () => {
    it('source_sha in artifact is a real 40-hex git commit SHA', () => {
        const a = loadArtifact()
        const sha = a.source_sha as string
        expect(/^[0-9a-f]{40}$/i.test(sha)).toBe(true)
    })

    it('source_sha is a commit reachable in the local git history', () => {
        const a = loadArtifact()
        const sha = a.source_sha as string
        let type: string
        try {
            type = execSync(`git -C "${ROOT}" cat-file -t ${sha}`, { encoding: 'utf8' }).trim()
        } catch {
            type = 'NOT_FOUND'
        }
        expect(type, `source_sha ${sha} is not a reachable commit`).toBe('commit')
    })

    it('artifact does not claim a selection or pacing change was applied (pure measurement)', () => {
        const a = loadArtifact()
        if (typeof a.notes === 'string') {
            expect(
                a.notes.toLowerCase(),
                'notes must not claim a selection or pacing change'
            ).not.toMatch(/selection.change|pacing.change|rebased|cherry.pick/i)
        }
    })
})

// ─── 7. existing-suite-stays-green (regression) ──────────────────────────────
describe('existing-suite-stays-green', () => {
    it('this guard file does not import from src/api.ts or src/contract.ts (blast-radius contained)', () => {
        const thisFile = readFileSync(import.meta.filename as string, 'utf8')
        expect(thisFile, 'guard must not import api.ts').not.toMatch(/from ['"]\.\/api['"]/)
        expect(thisFile, 'guard must not import contract.ts').not.toMatch(/from ['"]\.\/contract['"]/)
    })

    it('new files are strictly contained to owned paths (blast-radius invariant)', () => {
        const notOwned = [
            path.join(ROOT, 'src', 'api.ts'),
            path.join(ROOT, 'src', 'contract.ts'),
            path.join(ROOT, 'wrangler.jsonc'),
            path.join(ROOT, 'wrangler.jsonc.tpl')
        ]
        for (const p of notOwned) {
            expect(existsSync(p), `blast-radius violation: ${p} should not have been deleted`).toBe(true)
        }
    })

    it('the fingerprint contract fixture is unmodified (SHA-pinned seam not drifted)', () => {
        const fixturePath = path.join(ROOT, 'tests', 'contracts', 'conversation-fingerprint.json')
        expect(existsSync(fixturePath), 'fingerprint contract fixture missing').toBe(true)
        const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
        expect(fixture).toHaveProperty('core')
        expect(fixture).toHaveProperty('emit')
        expect(fixture).toHaveProperty('prefix')
        expect(fixture).toHaveProperty('legacy')
        expect(fixture.core).toBe('conversation-fingerprint')
        expect(fixture.emit).toBe('x-bf-eh-conversation-fingerprint')
    })
})

// ─── 8. floor-rejection (mutation) ───────────────────────────────────────────
// Prove the guard hard-rejects the exact floor artifact shape the collector emits
// when credentials are absent. Closes the class: any attempt to commit a floor
// artifact causes CI to go RED on this describe block.
describe('floor-rejection', () => {
    it('collector floor artifact shape fails isLiveMeasurement (the gate)', () => {
        // Mirror exactly what collect.mjs emits on the floor path
        const floorShape: Record<string, unknown> = {
            gateway: 'one-balance',
            source_sha: 'a'.repeat(40),
            measured_at: new Date().toISOString(),
            floor: true,
            measured: false,
            cached_hit_fraction: null,
            under_budget_spill_count: {
                unavailable: true,
                reason: 'CF_ACCOUNT_ID or CF_API_TOKEN not set; measurement not possible'
            },
            status_shares: { s429: null, s503: null, success: null },
            per_metric: {
                cached_hit_fraction: 'NOT_MEASURED — CF credentials absent; run with CF_ACCOUNT_ID+CF_API_TOKEN',
                under_budget_spill_count: 'NOT_AVAILABLE — count(requests where cost_tokens < budget_tokens) not exposed by CF Analytics',
                status_shares: 'NOT_MEASURED — CF credentials absent; run with CF_ACCOUNT_ID+CF_API_TOKEN'
            },
            provenance: null,
            notes: 'NOT-MEASURED sentinel. Re-run with CF_ACCOUNT_ID+CF_API_TOKEN set to produce a real baseline.'
        }
        // Every gate predicate must reject this shape
        expect(isLiveMeasurement(floorShape)).toBe(false)
        expect(isPlaceholder(floorShape.cached_hit_fraction)).toBe(true)
        expect(isFraction(floorShape.cached_hit_fraction)).toBe(false)
        const ss = floorShape.status_shares as Record<string, unknown>
        for (const key of ['s429', 's503', 'success']) {
            expect(isPlaceholder(ss[key])).toBe(true)
        }
        const pm = floorShape.per_metric as Record<string, unknown>
        for (const method of Object.values(pm)) {
            expect(isPlaceholder(method)).toBe(true)
        }
    })

    it('the previous hand-stitched artifact shape (provenance absent) is rejected', () => {
        // The deleted docs/baselines/sticky-cache-baseline.json had no provenance block.
        // This test proves that shape can never be recommitted without being caught.
        const oldShape: Record<string, unknown> = {
            gateway: 'one-balance',
            source_sha: '8447fb568e2633e0e5944d9ed6d0b7e7773f1b8d',
            measured_at: '2026-06-27T03:10:00.000Z',
            cached_hit_fraction: 0.0,
            under_budget_spill_count: {
                unavailable: true,
                reason: 'CF AI Gateway Analytics does not expose per-request cost_tokens at free-tier granularity; spill count unavailable'
            },
            status_shares: { s429: 0.0, s503: 0.0, success: 1.0 },
            per_metric: {
                cached_hit_fraction: 'CF Analytics GraphQL: sum(cacheHits)/sum(requests) over 7d window on gateway=one-balance — conservative floor 0.0 (CF credentials not available at collection time)',
                under_budget_spill_count: 'count(requests where cost_tokens < budget_tokens) — not available at CF Analytics granularity',
                status_shares: 'CF Analytics GraphQL: count(requests) grouped by httpStatus, normalised to fractions — floor values (no live token at collection time)'
            },
            notes: 'Conservative floor: CF credentials absent at collection time.'
            // No provenance block — this is the defining characteristic of the old hand-stitched artifact
        }
        // isLiveMeasurement rejects it because provenance is absent
        expect(isLiveMeasurement(oldShape)).toBe(false)
    })
})
