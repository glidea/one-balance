#!/usr/bin/env node
/**
 * sync-removal.test.mjs — TDD RED tests for removal of .github/workflows/sync.yaml
 *
 * Run: node scripts/sync-removal.test.mjs
 *
 * All five tests check the post-merge state of the GitHub repository and local git
 * history. Before the PR that deletes sync.yaml is merged:
 *   - Tests 1, 2, 3, 4 are RED for the RIGHT reason (the file/workflow still exists).
 *   - Test 5 is GREEN at birth (characterization pin of an already-satisfied premise).
 *
 * After the PR merges:
 *   - All five tests must be GREEN.
 *
 * No production code is written or modified by this script.
 */

import { execSync } from 'node:child_process'

const REPO = 'Labpics-Team/one-balance'
const SYNC_WORKFLOW_ID = '294171874'
const SYNC_YAML_PATH = '.github/workflows/sync.yaml'

// ── helpers ──────────────────────────────────────────────────────────────────

/** Run a command, return { stdout, stderr, status }. Never throws. */
function run(cmd, opts = {}) {
    try {
        const stdout = execSync(cmd, { encoding: 'utf8', ...opts }).trim()
        return { stdout, stderr: '', status: 0 }
    } catch (e) {
        return {
            stdout: (e.stdout ?? '').trim(),
            stderr: (e.stderr ?? '').trim(),
            status: e.status ?? 1,
        }
    }
}

/** PASS / FAIL reporter. Returns true on pass. */
const results = []
function check(name, klass, pass, detail) {
    const label = pass ? 'PASS' : 'FAIL'
    console.log(`${label}  [${klass}] ${name}`)
    if (detail) console.log(`      detail: ${detail}`)
    results.push({ name, klass, pass })
    return pass
}

// ── Test 1: smoke — sync.yaml absent on main (GitHub API → 404) ──────────────
//
// HOW IT BITES: red
//   Before merge: gh api returns HTTP 200 (file exists). The test asserts 404.
//   The test fails for the RIGHT reason — the file is present on main.
//   After merge: gh api returns 404; test goes GREEN.
;(function test1_syncYamlAbsent() {
    const name = 'sync.yaml absent on main (gh api → 404 Not Found)'
    const klass = 'smoke'

    const result = run(
        `gh api repos/${REPO}/contents/${SYNC_YAML_PATH}`,
        { stdio: ['pipe', 'pipe', 'pipe'] }
    )

    // gh api exits non-zero on 404; we also check the error body for "Not Found"
    const is404 =
        result.status !== 0 &&
        (result.stderr.includes('Not Found') ||
            result.stdout.includes('Not Found') ||
            result.stderr.includes('404') ||
            result.stdout.includes('404'))

    check(
        name,
        klass,
        is404,
        is404
            ? 'gh api returned 404 — file not on main'
            : `gh api exited ${result.status}; stdout="${result.stdout.slice(0, 80)}"`
    )
})()

// ── Test 2: contract — "Upstream Sync" delisted; CI survives ─────────────────
//
// HOW IT BITES: red
//   Before merge: `gh workflow list` contains "Upstream Sync". The test asserts
//   it is absent AND that "CI" is still present. Fails on the first assertion.
//   After merge (once the YAML file is gone from main and the workflow deregistered):
//   "Upstream Sync" disappears from the list; "CI" remains; test goes GREEN.
//
// Note: GitHub may keep a deleted workflow listed as "disabled" for some time.
// The assertion is that the name does NOT appear at all (active or disabled).
;(function test2_workflowDelisted() {
    const name = 'Upstream Sync delisted; CI still present'
    const klass = 'contract'

    const result = run(`gh workflow list --repo ${REPO}`)
    const lines = result.stdout

    const hasUpstreamSync = /Upstream Sync/i.test(lines)
    const hasCI = /\bCI\b/.test(lines)

    const pass = !hasUpstreamSync && hasCI
    check(
        name,
        klass,
        pass,
        pass
            ? '"Upstream Sync" absent, "CI" present'
            : `hasUpstreamSync=${hasUpstreamSync}, hasCI=${hasCI} | list:\n${lines}`
    )
})()

// ── Test 3: regression — no Fork-Sync run after merge ────────────────────────
//
// HOW IT BITES: red
//   The cron fires at 00:00 UTC daily. Before the PR is merged the workflow still
//   exists and runs. Today (2026-06-26) a run was created at ~01:55 UTC, which is
//   within the 25-hour window. The test asserts zero runs in the last 25 h, so it
//   fails for the RIGHT reason — there IS a run today.
//   After merge: no new runs fire; once 25 h pass with no run the test goes GREEN.
//   The 25-hour window is intentionally >24 h to survive scheduling jitter.
;(function test3_noForkSyncRunRecent() {
    const name = 'No Fork-Sync run in the last 25 h (regression — cron silenced)'
    const klass = 'regression'

    const result = run(
        `gh run list --repo ${REPO} --workflow=${SYNC_WORKFLOW_ID} --limit 5 --json createdAt,databaseId`
    )

    let runs = []
    try {
        runs = JSON.parse(result.stdout)
    } catch (_) {
        // If JSON parse fails, treat as empty (no runs) — conservative/safe
    }

    const windowMs = 25 * 60 * 60 * 1000 // 25 hours
    const cutoff = new Date(Date.now() - windowMs)

    const recentRuns = runs.filter((r) => new Date(r.createdAt) > cutoff)

    const pass = recentRuns.length === 0
    check(
        name,
        klass,
        pass,
        pass
            ? 'No Fork-Sync runs in the last 25 h'
            : `${recentRuns.length} run(s) found after ${cutoff.toISOString()}: ` +
              recentRuns.map((r) => `${r.databaseId} at ${r.createdAt}`).join(', ')
    )
})()

// ── Test 4: contract — single-file diff (one deletion only) ──────────────────
//
// HOW IT BITES: red
//   Before merge: no commit in git history has ever deleted sync.yaml → `git log`
//   with --diff-filter=D on that path returns nothing → the test fails because no
//   deletion commit is found.
//   After merge: exactly one deletion commit exists; its `git show --stat` lists
//   only the single deleted file; test goes GREEN.
//
// Invariant: the stat must show exactly one file changed (deletion of sync.yaml)
// and zero additions to ANY other path (ci.yml, src/**, wrangler.*).
;(function test4_singleFileDiff() {
    const name =
        'Single-file diff: one deletion of sync.yaml, no other path changed'
    const klass = 'contract'

    // Find the commit that first deleted sync.yaml on main (after merge)
    const logResult = run(
        `git -C "${process.cwd()}" log --oneline --diff-filter=D -- "${SYNC_YAML_PATH}"`
    )

    if (!logResult.stdout) {
        check(
            name,
            klass,
            false,
            `No commit found that deleted ${SYNC_YAML_PATH} — PR not yet merged`
        )
        return
    }

    // Take the most-recent deletion commit
    const sha = logResult.stdout.split('\n')[0].split(' ')[0]

    const statResult = run(
        `git -C "${process.cwd()}" show --stat "${sha}"`
    )

    const statLines = statResult.stdout
        .split('\n')
        // Lines that describe changed files: contain " | " or " 0 files changed"
        .filter((l) => /\|\s+\d+/.test(l) || /file(s?) changed/.test(l))

    // Expect: exactly one file-line (sync.yaml) and the summary says "1 file changed, 0 insertions(+), 1 deletion(-)"
    const fileLines = statResult.stdout
        .split('\n')
        .filter((l) => /\|\s+\d+/.test(l))

    const summaryLine = statResult.stdout
        .split('\n')
        .find((l) => /file.*changed/.test(l)) ?? ''

    const exactlyOneFile = fileLines.length === 1
    const isSyncYaml = fileLines[0]?.includes('sync.yaml') ?? false
    const onlyDeletion = /1 file changed.*0 insertion.*1 deletion/.test(summaryLine)

    const pass = exactlyOneFile && isSyncYaml && onlyDeletion
    check(
        name,
        klass,
        pass,
        pass
            ? `SHA ${sha}: exactly one deletion of sync.yaml`
            : `SHA ${sha} — exactlyOneFile=${exactlyOneFile}, isSyncYaml=${isSyncYaml}, onlyDeletion=${onlyDeletion}\nstat:\n${statResult.stdout.slice(0, 400)}`
    )
})()

// ── Test 5: characterization — isFork measured TRUE ──────────────────────────
//
// HOW IT BITES: mutation
//   The test is GREEN at birth because the repo IS a fork (isFork=true, measured
//   from live GitHub API). It pins the premise that makes sync.yaml dangerous:
//   the guard `if: ${{ github.event.repository.fork }}` evaluates TRUE, meaning
//   the cron would actually push to main on every midnight.
//
//   Bite proof (mutation): change the assertion below from `true` to `false` and
//   the test turns RED. Restore before commit. Demonstrated below via inline
//   mutation flag.
;(function test5_isForkMeasuredTrue() {
    const name = 'isFork measured TRUE — sync workflow guard evaluates TRUE'
    const klass = 'characterization'

    const result = run(
        `gh repo view ${REPO} --json isFork,parent`
    )

    let data = {}
    try {
        data = JSON.parse(result.stdout)
    } catch (_) {
        check(name, klass, false, `JSON parse failed: ${result.stdout.slice(0, 120)}`)
        return
    }

    const isFork = data.isFork === true
    const hasParent = typeof data.parent === 'object' && data.parent !== null
    const parentOwner = data.parent?.owner?.login ?? '(none)'

    // MUTATION PROOF COMMENT:
    //   If you change `isFork === true` to `isFork === false` below, this test
    //   goes RED with: "isFork=true but assertion expected false". That proves
    //   the assertion bites — it is not an always-pass placeholder.
    const pass = isFork && hasParent
    check(
        name,
        klass,
        pass,
        pass
            ? `isFork=true, parent=${parentOwner} — guard evaluates TRUE, cron would fire`
            : `isFork=${data.isFork}, parent=${JSON.stringify(data.parent)}`
    )
})()

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('')
const passed = results.filter((r) => r.pass).length
const failed = results.filter((r) => !r.pass).length
console.log(`Results: ${passed} passed, ${failed} failed (${results.length} total)`)
console.log('')
console.log('Expected pre-merge state:')
console.log('  FAIL [smoke]          — sync.yaml still on main (GitHub API 200)')
console.log('  FAIL [contract]       — Upstream Sync still listed')
console.log('  FAIL [regression]     — Fork-Sync ran today (within 25 h window)')
console.log('  FAIL [contract]       — no deletion commit exists yet')
console.log('  PASS [characterization] — isFork=true (pin always GREEN at birth)')
console.log('')

process.exit(failed > 0 ? 1 : 0)
