---
phase: 04-bulk-scan-queue
plan: 01
subsystem: database
tags: [postgres, plpgsql, supabase, vitest, typescript, p-limit]

# Dependency graph
requires:
  - phase: 03-triage-shortlist
    provides: prospects.scan_released_at (migration 016) — the queue this phase drains
provides:
  - "prospects.scan_status / scan_attempts / scan_status_reason columns with a CHECK constraint on scan_status"
  - "claim_next_scan_batch(batch_size) — atomic SKIP LOCKED claim RPC, this project's first"
  - "lib/bulk-scan-constants.ts — the single tunable block for all bulk-scan pacing/identity/ceiling values"
  - "scanner-service/src/capacity.ts — pure, dependency-free isAtCapacity() with reserved public headroom"
  - "p-limit declared as a real production dependency (was only an incidental transitive devDependency)"
affects: [04-02, 04-03, 04-04, 04-05, 04-06]

# Tech tracking
tech-stack:
  added: ["p-limit ^7.3.1 (declared dependency, was already an incidental transitive devDependency at 3.1.0)"]
  patterns:
    - "Project's first plpgsql RPC function (claim_next_scan_batch), following migration 013/016's comment-style convention"
    - "Server-side clamp inside the DB function (least(greatest(batch_size,0),10)) — defence-in-depth independent of caller validation"
    - "Dependency-free pure module (scanner-service/src/capacity.ts) importable from the root Vitest suite via relative path, bypassing scanner-service's own tsconfig include set"

key-files:
  created:
    - supabase/migrations/017_add_scan_status.sql
    - lib/bulk-scan-constants.ts
    - scanner-service/src/capacity.ts
    - lib/scanner-capacity.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "scan_status/scan_attempts/scan_status_reason added as new prospects columns; latest_scan_id (migration 013) reused as-is for D-01's scan reference — no new scan-reference column"
  - "claim_next_scan_batch() does not touch scan_attempts (spent at dispatch time, plan 04-03) and does not write lifecycle_state (Phase 3 convention: those enum values stay unwritten)"
  - "Drain ordering is FIFO by scan_released_at asc, not a re-ranked worst-first order (Claude's Discretion per CONTEXT.md — Phase 3 already applied worst-first when releasing)"
  - "BULK_USER_AGENT is a distinct string from both the public scanner's UA and TRIAGE_USER_AGENT (D-09) — verified by grep in the acceptance criteria, not by eye"
  - "isAtCapacity() takes an explicit activeCount + optional source param rather than reading activeFullScans directly, keeping the module pure and testable without importing scanner-service's Express/Playwright graph"

patterns-established:
  - "Single tunable constants block per subsystem (lib/bulk-scan-constants.ts mirrors lib/triage-constants.ts) — no inline concurrency/pacing/identity literals elsewhere in the phase"
  - "Root-tree test file for a scanner-service module (lib/scanner-capacity.test.ts imports scanner-service/src/capacity.ts via relative path) so the service's own tsc build ships no test-only file"

requirements-completed: [SCAN-01, SCAN-02, SCAN-03, SCAN-04, SCAN-05]

coverage:
  - id: D1
    description: "Migration 017 adds scan_status/scan_attempts/scan_status_reason to prospects with a CHECK constraint, a partial index, and the claim_next_scan_batch(batch_size) RPC (SKIP LOCKED, clamped batch size), applied and verified idempotent on the local Supabase"
    requirement: "SCAN-01"
    verification:
      - kind: integration
        ref: "psql verification: information_schema.columns count=3, pg_proc count=1, claim_next_scan_batch(0) returns zero rows on two consecutive calls with no error"
        status: pass
    human_judgment: false
  - id: D2
    description: "lib/bulk-scan-constants.ts exports the single tunable block (UA, batch size, concurrency, spacing, ceilings, IP-hash sentinel, health-check window) with no name collision against lib/triage-constants.ts, and p-limit is declared as a real dependency with engines.node pinned"
    requirement: "SCAN-05"
    verification:
      - kind: unit
        ref: "node -e assertion: package.json dependencies.p-limit and engines.node present; import('p-limit') resolves a function"
        status: pass
      - kind: other
        ref: "grep assertions: 9 export const lines, 1 AdashiProspecting match, 0 AdashiScanner match, 0 BATCH_SIZE collision"
        status: pass
    human_judgment: false
  - id: D3
    description: "scanner-service/src/capacity.ts's isAtCapacity() reserves headroom for the public scanner (D-08, SCAN-02), proven pure/dependency-free and covered by lib/scanner-capacity.test.ts"
    requirement: "SCAN-02"
    verification:
      - kind: unit
        ref: "lib/scanner-capacity.test.ts — 5/5 passing (no active scans, bulk refused at reserved boundary, public scan can use that headroom, public scanner still bounded by total, RESERVED_FOR_PUBLIC < MAX_TOTAL_FULL_SCANS)"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-07-21
status: complete
---

# Phase 4 Plan 1: Bulk Scan Queue Foundation Summary

**Migration 017 (scan status columns + the project's first plpgsql SKIP LOCKED claim RPC), the single bulk-scan tunable constants block, a pure reserved-headroom capacity gate with a passing Vitest suite, and `p-limit` promoted to a declared dependency.**

## Performance

- **Started:** 2026-07-21T19:33Z (prior commit, pattern map)
- **Completed:** 2026-07-21T19:40:00+02:00
- **Tasks:** 3 completed (Task 3 ran RED → GREEN as two commits)
- **Files modified:** 6 (4 created, 2 modified: `package.json`, `package-lock.json`)

## Accomplishments

- `supabase/migrations/017_add_scan_status.sql` applied to the local Supabase and verified idempotent (re-run produces `NOTICE ... already exists, skipping` for every column/index, `CREATE FUNCTION` succeeds again cleanly)
- `claim_next_scan_batch(batch_size int)` — the project's first plpgsql RPC — atomically claims queued prospects via `SELECT ... FOR UPDATE SKIP LOCKED`, clamps its own input to `[0, 10]` regardless of caller input (T-04-01), and verified to return zero rows (not error) on two consecutive `batch_size => 0` calls
- `lib/bulk-scan-constants.ts` — 9 exported constants covering identity (D-09), batch/concurrency/spacing/ceiling (D-07/D-08), the IP-hash sentinel, and the public-scanner health-check window (plan 04-06), following `lib/triage-constants.ts`'s exact style
- `scanner-service/src/capacity.ts` — dependency-free (`0` imports/requires), pure `isAtCapacity()` gate with `RESERVED_FOR_PUBLIC=1` strictly below `MAX_TOTAL_FULL_SCANS=3`, tested via TDD RED → GREEN
- `p-limit` promoted from an incidental transitive devDependency (3.1.0) to a declared production dependency at `^7.3.1`; `engines.node: >=20` added to `package.json`

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 017 — scan status columns and claim_next_scan_batch RPC** - `f801f41` (feat)
2. **Task 2: lib/bulk-scan-constants.ts and the p-limit dependency declaration** - `c9dac20` (feat)
3. **Task 3: scanner-service capacity module (pure, testable) with reserved headroom**
   - RED: `8af4310` (test) — failing test written first, confirmed failing (`Cannot find module '../scanner-service/src/capacity'`)
   - GREEN: `174a99a` (feat) — `capacity.ts` implemented, all 5 assertions pass, full suite green (171/171)

**Plan metadata:** committed separately after this summary (docs: complete plan)

## Files Created/Modified

- `supabase/migrations/017_add_scan_status.sql` - three new `prospects` columns, a partial index, and the `claim_next_scan_batch` RPC
- `lib/bulk-scan-constants.ts` - single tunable block for all bulk-scan identity/pacing/ceiling values
- `scanner-service/src/capacity.ts` - pure `isAtCapacity()` reserved-headroom gate
- `lib/scanner-capacity.test.ts` - RED-then-GREEN Vitest coverage for the capacity gate (root tree, imports the service module by relative path)
- `package.json` / `package-lock.json` - `p-limit` moved to `dependencies`, `engines.node: >=20` added

## Decisions Made

- Reused `prospects.latest_scan_id` (migration 013) verbatim for D-01's "reference to the produced scan" instead of adding a fourth column — the plan's explicit instruction, confirmed by the file's inline SQL comment and the `grep -c "latest_scan_id"` acceptance check
- `claim_next_scan_batch()` deliberately does not increment `scan_attempts` or write `lifecycle_state`, matching Phase 3's precedent of leaving `lifecycle_state` alone
- Removed a comment referencing `"AdashiScanner/1.0"` literally in `bulk-scan-constants.ts` after the Task 2 grep acceptance check (`grep -c 'AdashiScanner'` must be `0`) flagged it — kept the intent (distinct identity from the public scanner) without the literal string

## Deviations from Plan

None - plan executed exactly as written. One self-correction during Task 2 (see Decisions Made above: a header comment referencing the public scanner's UA string by name would have failed its own acceptance grep, so the comment was reworded before commit — not a deviation from the plan's intent, just a wording fix caught by the plan's own verification step).

## Issues Encountered

- No local `psql` binary on PATH; local Supabase runs via Docker (`supabase_db_website-scanner` container). Migration 017 was applied and verified via `docker exec -i supabase_db_website-scanner psql -U postgres -d postgres` instead of a bare `psql` invocation — same SQL, same verification queries, different invocation path. No `supabase db push` was run; this stays a local-only apply per the plan's database constraint.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `lib/bulk-scan-constants.ts` and `scanner-service/src/capacity.ts` are ready for plan 04-02 to import: `isAtCapacity()` for the `full-async` handler's capacity guard, and `BULK_DISPATCH_CONCURRENCY` for the `p-limit` wiring in the dispatch loop.
- `claim_next_scan_batch()` is callable and ready for `lib/scan-claim.ts` (plan 04-02/04-03) to wrap via `.rpc()`.
- No blockers. Migration 017 is local-only per the database constraint — applying it to the live database remains a human-gated task owned by plan 04-06, not this plan.

---
*Phase: 04-bulk-scan-queue*
*Completed: 2026-07-21*

## Self-Check: PASSED

All 5 created files found on disk; all 4 task commit hashes (`f801f41`, `c9dac20`, `8af4310`, `174a99a`) found in git log.
