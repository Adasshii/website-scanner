---
phase: 07-lifecycle-reporting-retention
plan: 06
subsystem: retention
tags: [supabase, cron, retention, gdpr, allowlist, integration-test, vitest]

requires: ["07-01"]
provides:
  - "GET /api/cron/retention — the scheduled retention entry point, dry-run only in this plan"
  - "lib/retention.ts's runRetention()/selectExpiringProspects()/retentionFrom() — the write arms plan 07-07 fills in"
  - "lib/retention-constants.ts's RETENTION_MODE/RETENTION_MONTHS/RETENTION_TABLE_ALLOWLIST — the config surface counsel's LIA answer changes"
affects: []

tech-stack:
  added: []
  patterns:
    - "single guarded table accessor (retentionFrom) keyed on a const-array-derived union type — the only place in the module allowed to call sb.from(), enforced by both a compile-time union and a runtime membership check"
    - "type guard (isRetentionMode) instead of a bare `as` cast for validating an environment string against a closed enum — grep-gated to prove no cast slipped in"
    - "one internal helper (computeExpiringProspects) shared by the public read-only selectExpiringProspects() and the mode-branching runRetention(), so the pre-filter candidate count and the clock-filtered expiring set come from one query pass"
    - "chunked .in() lookups (RETENTION_ID_CHUNK_SIZE=150) — PostgREST URL-encodes an .in() filter into the GET query string, so a large id list needs batching to avoid a URI-too-long failure"
    - "delta-based integration assertions (before/after runRetention() diff) instead of absolute counts, to stay exact against a shared, already-populated local Supabase instance"

key-files:
  created:
    - lib/retention-constants.ts
    - lib/retention.ts
    - app/api/cron/retention/route.ts
    - app/api/cron/retention/route.integration.test.ts
    - lib/retention.integration.test.ts
  modified: []

key-decisions:
  - "RETENTION_MODE resolves via a type-guard function (isRetentionMode), not a cast — 07-RESEARCH.md's own sketch used a bare `as RetentionMode`, which the plan explicitly rejected (Security Domain V5); the type guard also reads more idiomatically and is grep-gated to prove no cast slipped back in"
  - "computeExpiringProspects() is an internal (non-exported) helper that both selectExpiringProspects() and runRetention() call, returning { candidateCount, expiring } — this gives RetentionResult's `candidates` (raw pre-filter count) and `expiring` (clock-filtered count) from one query pass instead of running the selection twice"
  - "Both prospect_id .in() lookups (contact, scan) chunk ids at RETENTION_ID_CHUNK_SIZE=150 rather than passing the full candidate set — discovered as a real defect via a { months: 0 } test run against this project's 711-row local dev prospects table, which RETENTION_MAX_BATCH (1000) explicitly allows for but the un-chunked query could not survive (PostgREST URL length limit)"
  - "Both integration suites assert deltas (before/after runRetention() diff, or before/after seeding a fixture) rather than absolute counts — the shared local Supabase instance carries hundreds of pre-existing real rows and stray fixture leftovers from other suites, so an absolute-count assertion would be flaky by construction"
  - "runRetention()'s anonymize/delete arms throw an explicit Error naming plan 07-07, never a silent no-op — a job that accepted a writing mode and touched nothing would look healthy while doing nothing, the same plausible-looking-absence failure D-7-13 rejects elsewhere in this phase"

patterns-established:
  - "A dedicated monthly cron route stays fully separate from the existing four Vercel crons (D-7-20) — a retention failure can never take out the scan drain"

requirements-completed: [CMP-13, CMP-14, CMP-15]

coverage:
  - id: D1
    description: "GET /api/cron/retention answers a Bearer ${CRON_SECRET} request with mode, months, cutoff, candidates and expiring; 401 before any query on a missing or wrong bearer"
    requirement: "CMP-13"
    verification:
      - kind: integration
        ref: "app/api/cron/retention/route.integration.test.ts — 3 tests (401 missing header, 401 wrong bearer, 200 dry-run body)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The D-7-15 clock is the latest of created_at, last sent outreach, last prospect-owned scan; a drafted-but-never-sent message never moves it"
    requirement: "CMP-13"
    verification:
      - kind: integration
        ref: "lib/retention.integration.test.ts — 'runRetention — clock' describe, 6 tests (13mo selected, 11mo not, scan moves clock, sent-outreach moves clock, draft does not, latest-of-two-sent wins)"
        status: pass
    human_judgment: false
  - id: D3
    description: "RETENTION_MONTHS defaults to 12 and is overridable per-call via opts, never a hardcoded interval"
    requirement: "CMP-14"
    verification:
      - kind: integration
        ref: "lib/retention.integration.test.ts — 'runRetention — config' describe, 3 tests ({months:0} selects a minutes-old fixture, {months:600} selects nothing, returned months/cutoff reflect the override)"
        status: pass
    human_judgment: false
  - id: D4
    description: "RETENTION_MODE resolves against the closed 3-value enum via a type guard (never a bare cast) and falls back to dry-run on any unset/unrecognised value"
    requirement: "CMP-14"
    verification:
      - kind: unit
        ref: "grep -v '^\\s*[/*]' lib/retention-constants.ts | grep -c 'as RetentionMode' -> 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every query in lib/retention.ts opens its table through the single guarded accessor retentionFrom(), keyed on RETENTION_TABLE_ALLOWLIST (3 entries: prospects, outreach_messages, scans)"
    requirement: "CMP-15"
    verification:
      - kind: unit
        ref: "grep -v '^\\s*[/*]' lib/retention.ts | grep -c 'sb\\.from(' -> 1"
        status: pass
      - kind: integration
        ref: "lib/retention.integration.test.ts — 'runRetention — allowlist' describe, 3 tests (length===3 and excludes suppressions, retentionFrom throws for suppressions, retentionFrom throws for leads)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A suppression row older than the retention window is byte-identical after a full dry-run — suppressions cannot be named by this module by type or by runtime check"
    requirement: "CMP-15"
    verification:
      - kind: integration
        ref: "lib/retention.integration.test.ts -t suppression — 3 tests selected and passing"
        status: pass
    human_judgment: false
  - id: D7
    description: "A scan with prospect_id null (public-scanner scan) is unreachable by this job and never enters any prospect's clock; leads is not queryable at all"
    requirement: "CMP-15"
    verification:
      - kind: integration
        ref: "lib/retention.integration.test.ts — 'runRetention — scope' describe, 2 tests (null-prospect_id scan present after dry-run, retentionFrom throws for leads)"
        status: pass
    human_judgment: false
  - id: D8
    description: "Dry-run writes nothing: every seeded row is byte-identical after a run and all five write counters are 0; anonymize/delete both reject with an explicit error naming plan 07-07"
    requirement: "CMP-13"
    verification:
      - kind: integration
        ref: "lib/retention.integration.test.ts — 'runRetention — dry-run inertness' describe, 3 tests (byte-identical rows + zero counters, anonymize rejects, delete rejects)"
        status: pass
    human_judgment: false
  - id: D9
    description: "No file this plan changed contains a write statement (insert/update/delete)"
    requirement: "CMP-13"
    verification:
      - kind: unit
        ref: "grep -nE '\\.(insert|update|delete)\\(' across lib/retention-constants.ts, lib/retention.ts, app/api/cron/retention/route.ts -> no matches"
        status: pass
    human_judgment: false

duration: ~1h10min
completed: 2026-08-02
status: complete
---

# Phase 07 Plan 06: Retention Config, Clock and Dry-Run Cron Route Summary

**`lib/retention.ts` computes the D-7-15 expiry clock and the D-7-16 prospect-owned scope through one guarded table accessor keyed on a 3-entry allowlist, wired to a scheduled `GET /api/cron/retention`, with every write path throwing rather than running until plan 07-07**

## Performance

- **Duration:** ~1h10min
- **Completed:** 2026-08-02
- **Tasks:** 2 (Task 1 `type="tracer"`, Task 2 `type="auto" tdd="true"`)
- **Files modified:** 3 new lib/route files, 2 new integration test files

## Accomplishments
- Wrote `lib/retention-constants.ts`: `RETENTION_MODE` (validated against the closed 3-value enum via a type guard, never a cast; falls back to `dry-run` on any unset/unrecognised value with a `console.warn`), `RETENTION_MONTHS` (12-month placeholder pending the LIA, validated as a finite integer ≥ 1), `RETENTION_TABLE_ALLOWLIST` (`prospects`, `outreach_messages`, `scans` — `suppressions` and `leads` deliberately and permanently absent, each with a named comment explaining why), `RETENTION_MAX_BATCH` (1000), and `RETENTION_ID_CHUNK_SIZE` (150, added during Task 2 as a Rule 1 fix — see Deviations)
- Wrote `lib/retention.ts`: `retentionCutoff()`, `retentionFrom()` as the single place in the module allowed to call `sb.from()` (compile-time union + runtime membership check), `selectExpiringProspects()` computing the D-7-15 clock (latest of `created_at`, last `sent` outreach, last prospect-owned scan) over a `.lt("created_at", cutoffIso)` pre-filter bounded by `RETENTION_MAX_BATCH`, and `runRetention()` whose dry-run arm returns all-zero write counters and whose `anonymize`/`delete` arms throw naming plan 07-07
- Wired `GET /api/cron/retention`: `CRON_SECRET` bearer guard before any query (mirrors `drain-scan-queue`'s auth shape exactly), no request-supplied mode or window, aggregate-only JSON response (mode, months, cutoff, candidates, expiring, five write counters)
- Wrote `app/api/cron/retention/route.integration.test.ts` (3 tests) and `lib/retention.integration.test.ts` (17 tests) against real local Postgres, proving the clock, the scope boundary, the allowlist, the config override, and dry-run inertness

## Task Commits

1. **Task 1: One path end to end — cron GET, dry-run, counts out** — `319b80f` (feat)
2. **Task 2: Prove the clock, the scope and the allowlist against a real database** — `819187f` (test)

**Plan metadata:** committed alongside this SUMMARY

## Tracer Feedback Gate

Task 1 is `type="tracer"`. Its `<verify>` (`npx vitest run app/api/cron/retention/route.integration.test.ts && npx tsc --noEmit`) was re-run after the Task 1 commit — 3/3 tests passing, `tsc` clean — before Task 2 (the expansion/proof task) began. Logged: `⚡ Tracer verified end-to-end — expanding to Task 2.`

## Files Created/Modified
- `lib/retention-constants.ts` (new) — `RetentionMode`, `RETENTION_MODE`, `RETENTION_MONTHS`, `RETENTION_TABLE_ALLOWLIST`, `RetentionTable`, `RETENTION_MAX_BATCH`, `RETENTION_ID_CHUNK_SIZE`
- `lib/retention.ts` (new) — `ExpiringProspect`, `RetentionResult`, `retentionCutoff()`, `retentionFrom()`, `selectExpiringProspects()`, `runRetention()`. The only writer-in-waiting for `prospects`/`outreach_messages`/`scans` retention state; no write path is live in this plan.
- `app/api/cron/retention/route.ts` (new) — `GET` handler, `CRON_SECRET` guard, `runRetention(supabase)` called with no options
- `app/api/cron/retention/route.integration.test.ts` (new) — 3 tests: 401 missing header, 401 wrong bearer, 200 dry-run body
- `lib/retention.integration.test.ts` (new) — 17 tests across 5 describes: clock (6), scope (2), allowlist (3), config (3), dry-run inertness (3)

## Decisions Made
- `RETENTION_MODE` resolves via a type-guard function (`isRetentionMode`), not a cast — 07-RESEARCH.md's own sketch used a bare `as RetentionMode`, which the plan explicitly named and rejected (Security Domain V5). The type guard is also grep-gated (`grep -c 'as RetentionMode'` → 0) to prove no cast slipped back in during a later edit.
- `computeExpiringProspects()` is an internal (non-exported) helper shared by `selectExpiringProspects()` and `runRetention()`, returning `{ candidateCount, expiring }` — gives `RetentionResult`'s `candidates` (raw pre-filter count) and `expiring` (clock-filtered count) from one query pass instead of selecting twice.
- Both `prospect_id` `.in()` lookups (contact, scan) chunk ids at `RETENTION_ID_CHUNK_SIZE` (150) rather than passing the full candidate set in one call. `RETENTION_MAX_BATCH` (1000) explicitly permits a candidate set that large, but PostgREST URL-encodes an `.in()` filter into the GET request's query string — a real `{ months: 0 }` test run against this project's 711-row local dev prospects table produced "URI too long" before this fix.
- Both integration suites assert deltas (before/after `runRetention()`, or before/after seeding one fixture) rather than absolute counts. The shared local Supabase instance carries hundreds of pre-existing real prospect rows plus stray fixture leftovers from other suites' known contention hazard — an absolute-count assertion would be flaky by construction, a delta is exact regardless.
- `runRetention()`'s `anonymize`/`delete` arms throw an explicit `Error` naming plan 07-07, never a silent no-op — a job that accepted a writing mode and touched nothing would look healthy while doing nothing, the same plausible-looking-absence failure D-7-13 rejects elsewhere in this phase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `.in()` lookups overflowed the URL length limit against real local data**
- **Found during:** Task 2, writing the `{ months: 0 }` config test
- **Issue:** `{ months: 0 }` makes almost every prospect in the table a candidate. Against this project's 711-row local dev `prospects` table, the contact and scan lookups' `.in("prospect_id", ids)` filters (PostgREST URL-encodes `.in()` into the GET request's query string) produced a request that failed with "URI too long". `RETENTION_MAX_BATCH` (1000) explicitly permits a candidate set this large, so the un-chunked query was a real defect, not a test artifact.
- **Fix:** Added `RETENTION_ID_CHUNK_SIZE` (150) to `lib/retention-constants.ts` and batched both `.in()` lookups in `computeExpiringProspects()` into chunks of that size, merging results into the same `Map`-based reduction.
- **Files modified:** `lib/retention-constants.ts`, `lib/retention.ts`
- **Verification:** `lib/retention.integration.test.ts`'s `{ months: 0 }` test passes; full `npx vitest run` green (441/441); `npx tsc --noEmit` clean; `npm run build` succeeds.
- **Committed in:** `819187f` (Task 2 commit)

**2. [Rule 3 - Blocking] Cleaned 14 stray fixture rows blocking `npx vitest run`**
- **Found during:** Task 2, full-suite verification
- **Issue:** `lib/reporting-aggregates.integration.test.ts` failed 3 tests with `duplicate key value violates unique constraint "prospects_domain_unique_idx"` — the same documented, pre-existing hazard 07-05's SUMMARY recorded (that test's `afterEach` never inspects its delete errors, and migration 013's `ON DELETE`-less FK on `scans.prospect_id` makes the `prospects` delete throw silently, leaving debris). Confirmed the leak recurs on every run of that file (reproduced twice during this plan).
- **Fix:** Data cleanup only, no code or test file touched. Deleted the stray `test-reporting-agg-*` rows via the same prefix-scoped, children-before-parents delete (`scans` by `prospect_id`, then `outreach_messages`, then `prospects`) — out of this plan's scope to fix the owning test, per explicit standing instruction.
- **Verification:** `npx vitest run` — 441/441 tests passing across all three projects.
- **Not committed:** database-only cleanup, no file changes.

---

**Total deviations:** 2 auto-fixed (1 blocking URL-length bug in this plan's own code, 1 blocking cross-suite stray-fixture cleanup)
**Impact on plan:** The URL-length fix touched only this plan's two files (`lib/retention-constants.ts`, `lib/retention.ts`), already staged for this plan. No scope creep.

## Issues Encountered
- The stray-fixture contention documented above (`lib/reporting-aggregates.integration.test.ts`) reproduces on every run of that file — resolved as data cleanup each time, not a code defect of this plan. The shared local Supabase instance across sibling projects on this machine remains a standing operational note (see `MEMORY.md` reference `reference_shared_local_supabase_across_projects.md`).

## User Setup Required
None. No migration, no new environment variable, no manual step. `CRON_SECRET` was already required and configured before this plan. `RETENTION_MODE`/`RETENTION_MONTHS` are optional overrides with safe shipped defaults (`dry-run`/`12`) — not documented in `.env.example` by this plan, since this plan never reads them for a decision a deployer needs to make yet (both write modes still throw).

## Next Phase Readiness
- Plan 07-07 has a real selection engine to build the write arms against: `selectExpiringProspects()`/`computeExpiringProspects()` already prove the exact candidate set (id, clock, `latestScanId`) that `anonymizeProspects()`/`deleteProspects()` will need to act on, and `retentionFrom()` is already the only door those functions may use to reach a table.
- `vercel.json`'s cron entry for `/api/cron/retention` (`{ "path": "/api/cron/retention", "schedule": "0 3 1 * *" }`) is listed in the phase's artifact roster but not added by this plan — this route is not yet scheduled in production. Confirm with 07-07 or a dedicated deploy step whether the cron entry ships alongside the write arms or earlier; shipping it now would only run a dry-run report (harmless but currently unscheduled).
- `.env.example` documentation for `RETENTION_MODE`/`RETENTION_MONTHS` (named, empty values) is listed in the phase's Config artifact roster — not added by this plan since it wasn't in `files_modified`; confirm whether 07-07 owns it.
- FA-CMP-15 (suppression email anonymization tension) and FA-CMP-13-SOURCES (`prospect_sources.raw_website_url` outside this job's scope) remain open per the plan's own `<flagged_assumptions>` — unchanged by this plan, still pending the LIA / a future decision.

---
*Phase: 07-lifecycle-reporting-retention*
*Completed: 2026-08-02*

## Self-Check: PASSED

All created files and commit hashes verified present on disk / in git log.
