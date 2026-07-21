---
phase: 04-bulk-scan-queue
plan: 03
subsystem: api
tags: [supabase, postgres, plpgsql, skip-locked, p-limit, vitest, typescript]

# Dependency graph
requires:
  - phase: 04-bulk-scan-queue (plan 04-01)
    provides: "prospects.scan_status/scan_attempts/scan_status_reason columns, claim_next_scan_batch RPC, lib/bulk-scan-constants.ts, p-limit dependency"
  - phase: 04-bulk-scan-queue (plan 04-02)
    provides: "full-async handler's source/userAgent/prospectId request-body contract and 503 { error, retryAfterSeconds } capacity-refusal shape"
provides:
  - "lib/scan-queue.ts — armBatch, claimNextScanBatch, markScanFailed, requeueToQueued, requeueProspect, reconcileInFlightScans (every prospects state transition in the phase)"
  - "lib/bulk-scan-dispatch.ts — dispatchClaimedProspects(): validate -> robots pre-flight -> scans-row insert -> pLimit-bounded, paced dispatch"
  - "ScannerClient.fullScanBulk() — the bulk full-async caller, 503-aware, 30s timeout"
  - "supabase/migrations/017_add_scan_status.sql — claim_next_scan_batch() SKIP LOCKED clamp bug fixed (MATERIALIZED CTE), re-applied locally"
affects: [04-04, 04-05, 04-06]

tech-stack:
  added: []
  patterns:
    - "Injected validateUrlSafe seam on dispatchClaimedProspects (beyond the plan's documented client/fetchImpl/sleep deps) — mirrors lib/triage-fetch.ts's TriageDeps and scripts/import-prospects.ts's ImportDeps so a real DNS-resolving SSRF check never runs inside a unit test"
    - "ctx.skip()-based integration-suite reachability guard (beforeAll probe + per-test skip) instead of a top-level-await probe, because this project's tsconfig has no explicit `target` (defaults to ES3, rejects top-level await)"

key-files:
  created:
    - lib/scan-queue.ts
    - lib/scan-queue.test.ts
    - lib/bulk-scan-dispatch.ts
    - lib/bulk-scan-dispatch.test.ts
    - lib/scan-drain.integration.test.ts
  modified:
    - lib/scanner-client.ts
    - supabase/migrations/017_add_scan_status.sql

key-decisions:
  - "Reworded two 'Never call .upsert()' comments in lib/scan-queue.ts (and avoided the literal in lib/bulk-scan-dispatch.ts) to describe the constraint without the literal substring 'upsert', because the plan's own acceptance grep (`grep -c \"upsert\"` must be 0) would otherwise flag the explanatory comment it asked for — same self-correction pattern 04-01 hit with 'AdashiScanner'"
  - "Added an undocumented `validateUrlSafe` override to dispatchClaimedProspects's deps object (plan text only lists client/fetchImpl/sleep) so lib/bulk-scan-dispatch.test.ts can run deterministically without real DNS resolution; defaults to the real @/lib/url-validation.server implementation everywhere else"
  - "reconcileInFlightScans() applies the failed-reason update per-row (not a single grouped .update().in()) because different failed prospects can carry different error_message text — a single grouped update can only set one literal value"

patterns-established:
  - "Every prospects write funnels through lib/scan-queue.ts's six functions — lib/bulk-scan-dispatch.ts never writes prospects directly except the one accepted-dispatch update (latest_scan_id/scan_attempts), which has no matching scan-queue.ts helper"

requirements-completed: [SCAN-01, SCAN-03, SCAN-04, SCAN-05]

coverage:
  - id: D1
    description: "Every prospects state transition (arm, claim, fail, requeue, reconcile) is a tested library function in lib/scan-queue.ts, with the capacity-refusal and human-requeue paths proven not to spend the single attempt"
    requirement: "SCAN-01"
    verification:
      - kind: unit
        ref: "lib/scan-queue.test.ts (10/10 passing)"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D2
    description: "The dispatch path validates (SSRF re-check), pre-flights robots.txt (D-10), creates the linked scans row under the bulk ip_hash sentinel, dispatches under a concurrency bound with pacing, and maps every outcome to the right prospect state"
    requirement: "SCAN-05"
    verification:
      - kind: unit
        ref: "lib/bulk-scan-dispatch.test.ts (7/7 passing, including a peak-in-flight concurrency assertion)"
        status: pass
    human_judgment: false
  - id: D3
    description: "ScannerClient.fullScanBulk() posts to /api/scan/full-async with source:\"bulk\"/BULK_USER_AGENT/prospectId and treats a 503 as { accepted: false } distinctly from request()'s throw-on-non-ok convention"
    requirement: "SCAN-05"
    verification:
      - kind: unit
        ref: "lib/bulk-scan-dispatch.test.ts (accept/refuse/throw cases exercise fullScanBulk's contract via a stubbed client)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Overlapping claim_next_scan_batch() calls are provably disjoint against a real Postgres, a released-but-unarmed row is never claimed (D-07), and reconcileInFlightScans() drives completed/failed scans to done/failed with the scan's error text"
    requirement: "SCAN-01"
    verification:
      - kind: integration
        ref: "lib/scan-drain.integration.test.ts (6/6 passing against local Supabase; verified skip-clean with exit 0 when unreachable)"
        status: pass
      - kind: other
        ref: "npx vitest run (full suite, 198/198 passing)"
        status: pass
    human_judgment: false
  - id: D5
    description: "reconcileInFlightScans() drives a completed/failed scan to the prospect's visible status (done/failed) and never touches a still-scanning row"
    requirement: "SCAN-03"
    verification:
      - kind: integration
        ref: "lib/scan-drain.integration.test.ts > reconcileInFlightScans() moves a completed scan to done and a failed scan to failed with its error text"
        status: pass
    human_judgment: false
  - id: D6
    description: "A capacity-refused prospect returns to queued with scan_attempts unchanged, and requeueProspect() is a no-op on any non-failed row, matching SCAN-04's never-retried-indefinitely rule"
    requirement: "SCAN-04"
    verification:
      - kind: unit
        ref: "lib/scan-queue.test.ts > requeueToQueued / requeueProspect describe blocks"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-07-21
status: complete
---

# Phase 04 Plan 03: Scan Queue and Bulk Dispatch Libraries Summary

**lib/scan-queue.ts (six tested state-transition functions) and lib/bulk-scan-dispatch.ts (validate → robots pre-flight → linked scans row → pLimit-bounded paced dispatch), plus a Postgres SKIP LOCKED clamp bug found and fixed by this plan's own integration test.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-07-21T19:47:00Z (approx, per session start)
- **Completed:** 2026-07-21T20:00:00+02:00
- **Tasks:** 3 completed
- **Files modified:** 7 (5 created, 2 modified — scanner-client.ts extended, migration 017 bug-fixed)

## Accomplishments

- `lib/scan-queue.ts` — `armBatch()` (D-07's human-gated arming write, ceiling-sliced in JS), `claimNextScanBatch()` (thin RPC wrapper), `markScanFailed()`, `requeueToQueued()` (capacity refusal — never spends the attempt), `requeueProspect()` (human requeue, chained `.eq("scan_status","failed")` guard), `reconcileInFlightScans()` (the sole done/failed write-back path) — 10 passing unit tests against a hand-written chainable/thenable Supabase stub
- `ScannerClient.fullScanBulk()` — posts to `/api/scan/full-async` with `source: "bulk"`, `BULK_USER_AGENT`, `prospectId`, a 30s timeout, and `{ accepted: false }` on 503 (distinct from `request()`'s throw-on-non-ok convention); locale omitted so the column default applies
- `lib/bulk-scan-dispatch.ts` — `dispatchClaimedProspects()`: re-validates `website_url` (SSRF, T-04-08), pre-flights robots.txt via the existing `isHomepageDisallowed()` (D-10, never re-implemented), inserts the linked `scans` row under `BULK_SCAN_IP_HASH` before dispatch, calls `fullScanBulk()` under `pLimit(BULK_DISPATCH_CONCURRENCY)` with `BULK_DISPATCH_SPACING_MS` inter-dispatch spacing, and maps every outcome (validation-fail, robots-skip, accept, capacity-refuse, throw) to the right `scan-queue.ts` state transition — 7 passing unit tests, including a peak-in-flight concurrency assertion
- `lib/scan-drain.integration.test.ts` — 6 assertions against the real local Supabase: concurrent-claim disjointness (SCAN-01), claimed rows go to `scanning`, a drained queue returns zero rows (SCAN-04), D-07's arming gate is structural, `reconcileInFlightScans()` end-to-end, and the RPC's internal batch_size clamp
- **Found and fixed a genuine bug** in migration 017's `claim_next_scan_batch()`: the SKIP LOCKED clamp was silently defeated by Postgres re-running the `LIMIT`-bearing subquery once per outer-row candidate instead of once overall — this plan's own oversized-batch_size assertion caught it (12 rows claimed against an intended clamp of 10). Fixed by wrapping the subquery in a `WITH ... AS MATERIALIZED` CTE, re-verified manually (10/10 clamp, 6/6 disjoint concurrent claim) before the automated suite confirmed it

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/scan-queue.ts — every prospects state transition** - `83765d7` (feat)
2. **Task 2: scanner-client fullScanBulk and lib/bulk-scan-dispatch.ts** - `7b77122` (feat)
3. **Task 3: SKIP LOCKED overlap integration test against local Supabase** - `4e75260` (test) — includes the migration 017 bug fix

**Plan metadata:** committed separately after this summary (docs: complete plan) — this plan does not update STATE.md/ROADMAP.md itself, per orchestrator instruction.

_Note: no separate TDD RED/GREEN split was needed — each task's test file and implementation were written and verified together before commit, matching the plan's `tdd="true"` intent (tests written first, run to confirm coverage, then committed alongside the implementation in a single atomic commit per task)._

## Files Created/Modified

- `lib/scan-queue.ts` - `ClaimedProspect`, `armBatch`, `claimNextScanBatch`, `markScanFailed`, `requeueToQueued`, `requeueProspect`, `reconcileInFlightScans`
- `lib/scan-queue.test.ts` - 10 unit tests, chainable/thenable Supabase stub
- `lib/scanner-client.ts` - added `fullScanBulk(url, opts)` method
- `lib/bulk-scan-dispatch.ts` - `DispatchOutcome`, `dispatchClaimedProspects(sb, claimed, deps?)`
- `lib/bulk-scan-dispatch.test.ts` - 7 unit tests, fetch/client/sleep/validateUrlSafe stubs
- `lib/scan-drain.integration.test.ts` - 6 integration tests against local Supabase, `ctx.skip()` reachability guard
- `supabase/migrations/017_add_scan_status.sql` - `claim_next_scan_batch()` rewritten with a `MATERIALIZED` CTE (bug fix, re-applied locally)

## Decisions Made

- Reworded the "never call `.upsert()`" comments in `lib/scan-queue.ts` to avoid the literal substring `upsert` (the plan's own `grep -c "upsert"` acceptance check would otherwise fail on the explanatory comment it asked for) — same self-correction pattern plan 04-01 hit with `AdashiScanner`.
- Added an undocumented `validateUrlSafe` override to `dispatchClaimedProspects`'s `deps` (the plan's text only lists `client`/`fetchImpl`/`sleep`) so `lib/bulk-scan-dispatch.test.ts` runs deterministically with no real DNS resolution — mirrors the existing `TriageDeps`/`ImportDeps` injection pattern already used elsewhere in this codebase for the same function.
- `reconcileInFlightScans()` applies the failed-reason update per-row rather than one grouped `.update().in()` call, because different failed prospects can carry different `error_message` text that a single grouped update can't express.
- Used `ctx.skip()` inside each integration test (guarded by a `beforeAll` reachability probe) instead of a `describe.skipIf` + top-level-await probe, because this project's `tsconfig.json` has no explicit `target` (defaults to ES3) and rejects top-level `await` under `npx tsc --noEmit`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `claim_next_scan_batch()`'s silently-defeated batch_size clamp**
- **Found during:** Task 3 (the oversized-batch_size integration assertion)
- **Issue:** `UPDATE prospects ... WHERE id IN (SELECT ... LIMIT least(greatest(batch_size,0),10) FOR UPDATE SKIP LOCKED)` let Postgres's planner rewrite the `IN` as a per-outer-row semi-join, re-running the `LIMIT`+`SKIP LOCKED` subquery once per candidate row (`loops=12` in `EXPLAIN ANALYZE`) instead of once overall — `batch_size=999` against 12 eligible rows claimed all 12, not the intended 10
- **Fix:** Wrapped the claimable-id subquery in a `WITH claimable AS MATERIALIZED (...)` CTE, forcing single evaluation as an optimization fence
- **Files modified:** `supabase/migrations/017_add_scan_status.sql`
- **Verification:** Manual psql check (10/10 clamp, 6/6 disjoint concurrent claim) before and after; `lib/scan-drain.integration.test.ts` 6/6 passing; full `npx vitest run` 198/198; re-applied locally via idempotent `create or replace function` (no `supabase db push`)
- **Committed in:** `4e75260` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for SCAN-01's correctness — this bug directly undermined the guarantee this plan's integration test exists to prove. No scope creep; the fix is scoped to the single function migration 017 introduced.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None - no external service configuration required. Migration 017's fix is local-only; pushing it (along with the rest of migration 017) to the live database remains plan 04-06's human-gated task per this plan's database constraint.

## Next Phase Readiness

**For plan 04-04 (the three routes: cron drain, admin run-batch, admin requeue):**
- `armBatch(sb, opts?)`, `claimNextScanBatch(sb, batchSize?)`, `markScanFailed(sb, id, reason, opts?)`, `requeueToQueued(sb, id)`, `requeueProspect(sb, id)`, `reconcileInFlightScans(sb)` are all exported from `lib/scan-queue.ts`, each taking an injectable `SupabaseClient` first parameter.
- `dispatchClaimedProspects(sb, claimed: ClaimedProspect[], deps?)` is exported from `lib/bulk-scan-dispatch.ts`, returning `DispatchOutcome[]` (`{ id, dispatched, reason? }`).
- The expected route wiring: `app/api/cron/drain-scan-queue/route.ts` calls `claimNextScanBatch()` then `dispatchClaimedProspects()` then `reconcileInFlightScans()`; `app/api/admin/run-batch/route.ts` calls `armBatch()`; `app/api/admin/requeue-scan/route.ts` calls `requeueProspect()`.
- `ClaimedProspect { id, domain, website_url, scan_attempts }` is the shape routes receive from `claimNextScanBatch()`.
- Migration 017's `claim_next_scan_batch()` fix is local-only and must ship together with the rest of migration 017 when plan 04-06 pushes it live — flagging this explicitly so 04-06 doesn't assume the originally-committed (buggy) function definition.
- Full verification for this plan: `npx vitest run` → 198/198 across 23 files; `npx tsc --noEmit` exits 0; no `.upsert()` in either new library; no leftover fixture rows in the local DB after the integration suite.

---
*Phase: 04-bulk-scan-queue*
*Completed: 2026-07-21*

## Self-Check: PASSED

- FOUND: lib/scan-queue.ts
- FOUND: lib/scan-queue.test.ts
- FOUND: lib/bulk-scan-dispatch.ts
- FOUND: lib/bulk-scan-dispatch.test.ts
- FOUND: lib/scan-drain.integration.test.ts
- FOUND: commit 83765d7 (Task 1)
- FOUND: commit 7b77122 (Task 2)
- FOUND: commit 4e75260 (Task 3)
