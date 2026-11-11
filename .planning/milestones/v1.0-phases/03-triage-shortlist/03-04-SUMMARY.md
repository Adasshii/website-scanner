---
phase: 03-triage-shortlist
plan: 04
subsystem: triage-operator-surface
tags: [cli, tsx, supabase, vitest, triage]

requires:
  - phase: 03-triage-shortlist
    plan: 01
    provides: types/triage.ts (TriageSignals/TriageScore), lib/triage-constants.ts (tunable block)
  - phase: 03-triage-shortlist
    plan: 02
    provides: lib/triage-fetch.ts (fetchTriageSignals), lib/triage-scorer.ts (computeTriageScore)
provides:
  - lib/triage-candidates.ts — getTriageCandidates() (eligible-to-triage query, D-09) and getShortlist() (admin-display query), both pure reads
  - scripts/triage-prospects.ts — the npm run triage CLI orchestrator wiring fetchTriageSignals + computeTriageScore + getTriageCandidates behind a TriageDeps DI seam, bounded-concurrency batch loop, per-prospect skip-and-log, printed summary
  - "npm run triage" script in package.json
affects: [03-05-admin-ui, 03-06-production-push]

tech-stack:
  added: []
  patterns:
    - "CLI-script shape (args + TriageDeps DI seam + per-prospect try/catch + printed summary) mirrored wholesale from scripts/import-prospects.ts"
    - "Bounded-concurrency batch loop with inter-batch delay (BATCH_SIZE/BATCH_DELAY_MS), reused from RESEARCH.md Pattern 7"

key-files:
  created:
    - lib/triage-candidates.ts
    - lib/triage-candidates.integration.test.ts
    - scripts/triage-prospects.ts
    - scripts/triage-prospects.test.ts
  modified:
    - package.json

key-decisions:
  - "getTriageCandidates()/getShortlist() are both pure reads — verified by a grep gate finding zero .update/.insert/.upsert calls in lib/triage-candidates.ts (D-07)"
  - "runTriage() always calls createServerClient()/getTriageCandidates() to read eligible rows, dry-run or not — only the per-prospect .update() write is skipped under --dry-run, since the whole point of --dry-run is to preview real fetch+score results without committing them"
  - "Manual CLI smoke-test (npm run triage -- --dry-run --limit 5) was run against the LOCAL Supabase stack, not the .env.local-configured production project — production has not yet received migration 016 (that push is Plan 06's explicit, human-gated step per STATE.md), so scan_released_at does not exist there yet; running the real command against production at this point in the sequence would correctly fail"

patterns-established:
  - "Comment wording avoids the literal substring '.upsert(' even inside prose (e.g. 'the upsert method is never used') so the TRI grep gate for real upsert calls isn't tripped by a comment discussing why upsert is avoided"

requirements-completed: [TRI-01, TRI-02, TRI-03, TRI-04, TRI-05, TRI-06, TRI-07]

coverage:
  - id: D1
    description: "getTriageCandidates() excludes released (scan_released_at set, D-09) and no-website (null-domain) prospects; getShortlist() returns only rows with triage_score set"
    requirement: "TRI-07"
    verification:
      - kind: integration
        ref: "lib/triage-candidates.integration.test.ts (5 tests, local Supabase)"
        status: pass
      - kind: other
        ref: "grep -cE \"\\.(update|insert|upsert)\\(\" lib/triage-candidates.ts — returns 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "npm run triage fetches, scores, and persists triage_score + triage_checked_at for every eligible prospect via .update().eq(\"id\", ...) — never .upsert() — with bounded concurrency + inter-batch spacing and no browser/AI import"
    requirement: "TRI-01, TRI-02, TRI-03, TRI-04, TRI-05, TRI-06"
    verification:
      - kind: unit
        ref: "scripts/triage-prospects.test.ts (10 tests)"
        status: pass
      - kind: other
        ref: "grep -c '\\.upsert(' scripts/triage-prospects.ts — returns 0"
        status: pass
      - kind: other
        ref: "grep -rEn playwright|lighthouse|@google/generative-ai|jsdom|cheerio scripts/triage-prospects.ts — no matches"
        status: pass
      - kind: other
        ref: "grep -q BATCH_DELAY_MS scripts/triage-prospects.ts — present"
        status: pass
      - kind: manual_procedural
        ref: "npm run triage -- --dry-run --limit 5 against local Supabase stack: prints '[triage-prospects] N triaged, M clear the cutoff, K unreachable' and leaves triage_score/triage_checked_at untouched on the seeded row"
        status: pass
    human_judgment: false
  - id: D3
    description: "One bad prospect is logged and skipped; the run continues and prints a summary"
    verification:
      - kind: unit
        ref: "scripts/triage-prospects.test.ts > 'a bad prospect is logged and skipped, not fatal'"
        status: pass
    human_judgment: false
  - id: D4
    description: "package.json has a triage script running scripts/triage-prospects.ts via tsx"
    verification:
      - kind: other
        ref: "node -e \"process.exit(require('./package.json').scripts.triage ? 0 : 1)\" — exits 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full project verification: tsc clean, full test suite green"
    verification:
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
      - kind: other
        ref: "npm run test — 18 files, 166 tests"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-07-20
status: complete
---

# Phase 3 Plan 4: Triage Operator Surface Summary

**`lib/triage-candidates.ts` (the eligible-to-triage + admin-shortlist pure-read queries) and `scripts/triage-prospects.ts` (the `npm run triage` CLI mirroring `import-prospects.ts` wholesale) — the end-to-end no-browser triage pass, wired against real rows with bounded-concurrency batching and per-prospect skip-and-log.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-20T16:01:00Z
- **Completed:** 2026-07-20T16:09:05Z
- **Tasks:** 2
- **Files modified:** 5 (4 new, 1 modified)

## Accomplishments
- `lib/triage-candidates.ts` exports `getTriageCandidates(sb, { limit? })` (domain not null, `scan_released_at` is null — D-09 excludes released and no-website prospects) and `getShortlist(sb)` (all rows with `triage_score` set), both proven pure reads via a zero-match `.update/.insert/.upsert` grep gate
- `scripts/triage-prospects.ts` is the operator's one command: `npm run triage [--dry-run] [--limit=N] [--cutoff=N]`, copying `import-prospects.ts`'s `TriageArgsError`/`TriageDeps`/`defaultDeps`/per-row-try-catch/`loadLocalEnv`/CLI-entrypoint shape wholesale
- Every prospect flows through `getTriageCandidates` → `fetchTriageSignals` → `computeTriageScore` → `.update({ triage_score, triage_checked_at }).eq("id", ...)` — never `.upsert()` (Pitfall 3, `prospects.country` NOT NULL)
- Bounded-concurrency batch loop (`BATCH_SIZE` in flight, `await sleep(BATCH_DELAY_MS)` between batches) implements the D-12 good-citizen spacing the plan requires
- Printed summary format: `"N triaged, M clear the cutoff, K unreachable"`, with a trailing `dry-run, zero writes performed` marker under `--dry-run`
- Manually verified `npm run triage -- --dry-run --limit 5` end-to-end against the local Supabase stack: seeded one prospect row, ran the command, confirmed the printed summary and that `triage_score`/`triage_checked_at` remained `null` afterward

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/triage-candidates.ts — eligible-to-triage query + shortlist-display query** - `7aa3dcf` (feat)
2. **Task 2: scripts/triage-prospects.ts — npm run triage CLI orchestrator + bounded-concurrency loop** - `554fb1d` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/triage-candidates.ts` - `getTriageCandidates()`, `getShortlist()` — pure-read queries
- `lib/triage-candidates.integration.test.ts` - 5 tests against local Supabase: D-09 exclusions, limit, shortlist filter
- `scripts/triage-prospects.ts` - `TriageArgsError`, `parseTriageArgs`, `TriageDeps`/`defaultDeps`, `runTriage`, `runCli`, CLI entrypoint
- `scripts/triage-prospects.test.ts` - 10 tests: arg parsing/validation, dry-run zero-writes, real-write persistence, cutoff/unreachable counting, skip-and-log, `--limit` pass-through
- `package.json` - added `"triage": "tsx scripts/triage-prospects.ts"`

## Decisions Made
- `runTriage()` always reads via `getTriageCandidates()` regardless of `--dry-run` (a read is needed either way to know what's eligible); only the per-prospect `.update()` write is skipped under `--dry-run`, matching the plan's "compute and print but write nothing" instruction
- The manual `npm run triage -- --dry-run --limit 5` verification ran against the local Supabase stack rather than the `.env.local`-configured production project, since migration 016 (`scan_released_at`) has not yet been pushed to production — that push is Plan 06's explicit, human-gated step. Running the unmodified command as written would correctly fail against production right now; this is expected sequencing, not a defect in this plan's code
- Comment wording in `scripts/triage-prospects.ts` avoids the literal substring `.upsert(` (writes "the upsert method is never used" instead of `.upsert()`) so the TRI-01/Pitfall-3 grep gate for real upsert calls isn't tripped by explanatory prose

## Deviations from Plan

None — plan executed exactly as written. Two self-caught corrections before any code was committed (not numbered deviations, since neither changed committed logic after the fact):
1. A prose comment referencing `.upsert()` tripped the `grep -c '\.upsert('` acceptance gate on first check — reworded to avoid the literal substring before committing.
2. A test's `vi.fn(() => ...)` mock had an untyped parameter, causing a `tsc` tuple-index error on `mock.calls[0][0]` — added an explicit parameter type before committing.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. The CLI reads Supabase credentials from `.env.local`/`.env` (already configured for this project); manual verification used a local-stack env override rather than touching production, since production still lacks migration 016 (Plan 06's job).

## Next Phase Readiness
- `lib/triage-candidates.ts`'s `getShortlist()` is ready for Plan 05 (admin shortlist UI) to read directly — no redefinition needed.
- `scripts/triage-prospects.ts` is a complete, runnable operator surface; once Plan 06 pushes migration 016 to production, `npm run triage` works there unmodified (no code change needed, only the human-gated migration push).
- No blockers.

---
*Phase: 03-triage-shortlist*
*Completed: 2026-07-20*

## Self-Check: PASSED

All 4 created files found on disk; both task commits (`7aa3dcf`, `554fb1d`) found in git log; `npx tsc --noEmit` clean; `npm run test` 166/166 passing (18 files); TRI-01 no-browser grep gate and `.upsert(` grep gate both return zero matches on `scripts/triage-prospects.ts`; `lib/triage-candidates.ts` grep gate for update/insert/upsert returns 0.
