---
phase: 02-compliance-spine
plan: 01
subsystem: database
tags: [supabase, postgres, compliance, suppression, vitest]

# Dependency graph
requires:
  - phase: 01-prospect-data-foundation-import
    provides: normalizeDomain (lib/domain-normalize.ts) registrable-domain resolution, migration numbering convention (010+), RLS-enable-no-policy + partial-unique-index migration style
provides:
  - suppressions table (migration 014) — single source of truth for who must not be contacted
  - lib/suppression.ts — isSuppressed / writeSuppression / liftSuppression service functions
  - DI-stubbed unit suite (lib/suppression.test.ts) and real-Postgres integration suite (lib/suppression.integration.test.ts)
affects: [02-02 (legal basis), 02-03 (unsubscribe token), 02-04 (unsubscribe route), 02-05 (webhook auto-suppression + backfill), 02-06 (override CLI), 02-07 (prod migration push)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Partial unique index for active-row uniqueness (email WHERE lifted_at IS NULL) instead of a plain UNIQUE — lets lifted rows persist as history and permits re-suppression"
    - "Check-then-write (not .upsert()) mirroring lib/prospect-upsert.ts convention, DI-friendly (sb: SupabaseClient as first arg)"

key-files:
  created:
    - supabase/migrations/014_create_suppressions.sql
    - lib/suppression.ts
    - lib/suppression.test.ts
    - lib/suppression.integration.test.ts
  modified:
    - .gitignore

key-decisions:
  - "isSuppressed matches active rows via .or(email.eq.X,domain.eq.Y) — a single query proves both CMP-01 exact-match and CMP-03 domain-wide match"
  - "suppression.ts never references prospects or lifecycle_state — pure lookup table per D-07, verified by grep gate"
  - "supabase/.branches/ (Supabase CLI local artifact) added to .gitignore rather than committed"

patterns-established:
  - "Pattern 1: DI-stubbed unit test + real-Postgres integration test pair for every lib/ service touching Supabase (mirrors lib/prospect-upsert.ts + lib/prospect-upsert.integration.test.ts)"

requirements-completed: [CMP-01, CMP-03, CMP-04, CMP-05, CMP-06]

coverage:
  - id: D1
    description: "suppressions table with partial-unique active-email index, partial domain index, CHECK-constrained reason/source, RLS enabled with no policy"
    requirement: "CMP-01"
    verification:
      - kind: unit
        ref: "supabase/migrations/014_create_suppressions.sql — source assertion (partial index present, RLS enabled, no CREATE POLICY)"
        status: pass
      - kind: integration
        ref: "local Supabase db reset applied migration 014; \\dt confirms suppressions table exists"
        status: pass
    human_judgment: false
  - id: D2
    description: "isSuppressed(email) returns true on exact email match OR registrable-domain match; false when only a lifted row matches"
    requirement: "CMP-01, CMP-03"
    verification:
      - kind: unit
        ref: "lib/suppression.test.ts#isSuppressed (4 tests: exact match, domain match, lifted-row exclusion, error propagation)"
        status: pass
      - kind: integration
        ref: "lib/suppression.integration.test.ts#CMP-03 domain: suppressing sales@ blocks info@ on the same domain"
        status: pass
    human_judgment: false
  - id: D3
    description: "writeSuppression is idempotent — a second call for an already-suppressed email is a no-op returning { created: false }, never a second active row"
    requirement: "CMP-04"
    verification:
      - kind: unit
        ref: "lib/suppression.test.ts#writeSuppression (no-op when active row exists; insert + { created: true } otherwise)"
        status: pass
      - kind: integration
        ref: "lib/suppression.integration.test.ts#CMP-04: writeSuppression called twice for the same email leaves exactly one active row"
        status: pass
    human_judgment: false
  - id: D4
    description: "liftSuppression lifts (never deletes) the active row; a later writeSuppression for the same email inserts a fresh active row rather than failing"
    requirement: "CMP-05"
    verification:
      - kind: unit
        ref: "lib/suppression.test.ts#liftSuppression (sets lifted_at/lifted_by_reason; { lifted: false } when no active row)"
        status: pass
      - kind: integration
        ref: "lib/suppression.integration.test.ts#CMP-05/D-09: writeSuppression -> liftSuppression -> writeSuppression re-suppresses on a fresh row"
        status: pass
    human_judgment: false
  - id: D5
    description: "No code path can silently re-add an already-active suppression — the partial unique index rejects a raw duplicate insert at the DB, and the service layer treats it as a no-op"
    requirement: "CMP-06"
    verification:
      - kind: integration
        ref: "lib/suppression.integration.test.ts#CMP-06: a raw direct insert of a second active row fails at the DB, and writeSuppression treats it as a no-op"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-20
status: complete
---

# Phase 02 Plan 01: Suppression Spine Summary

**suppressions table (migration 014) + lib/suppression.ts service (isSuppressed/writeSuppression/liftSuppression) proving email+domain matching, idempotent writes, and lift-never-delete re-suppression against real Postgres**

## Performance

- **Duration:** ~12 min (this resumed session; migration + partial unit work from a prior interrupted run)
- **Completed:** 2026-07-20
- **Tasks:** 3 (all complete)
- **Files modified:** 5 (4 created, 1 modified — `.gitignore`)

## Accomplishments
- `suppressions` table with a partial unique active-email index (`WHERE lifted_at IS NULL`), a partial domain index, CHECK-constrained `reason`/`source`, RLS enabled with zero policies
- `lib/suppression.ts` exporting `isSuppressed`, `writeSuppression`, `liftSuppression` — DI-friendly, check-then-write, reuses `normalizeDomain` from `lib/domain-normalize.ts`
- Unit suite (8 tests, DI-stubbed) and integration suite (4 tests, real local Postgres) both green
- Verified end-to-end against a local Supabase instance with migration 014 actually applied (`supabase db reset`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 014 — suppressions table** - `9b302a0` (feat) — completed in a prior interrupted run, verified intact this session
2. **Task 2: lib/suppression.ts service + unit tests** - `4479322` (feat) — implementation and unit suite were already correct from the prior run (the TS2322 flagged in the resume context was not reproducible; `npx tsc --noEmit` and `npx vitest run lib/suppression.test.ts` were both clean on inspection), committed as-is
3. **Task 3: lib/suppression.integration.test.ts** - `1e5fb50` (test) — new integration suite, 4 tests, run against local Supabase

**Supporting commit:** `f9bc994` (chore) — added `supabase/.branches/` to `.gitignore` per resume-context instruction (never committed its contents)

**Plan metadata:** commit to follow (this SUMMARY + STATE.md + ROADMAP.md)

## Files Created/Modified
- `supabase/migrations/014_create_suppressions.sql` - suppressions table, partial-unique active-email index, partial domain index, RLS-enable-no-policy
- `lib/suppression.ts` - isSuppressed / writeSuppression / liftSuppression service functions
- `lib/suppression.test.ts` - DI-stubbed unit suite (8 tests)
- `lib/suppression.integration.test.ts` - real-Postgres integration suite (4 tests)
- `.gitignore` - added `supabase/.branches/`

## Decisions Made
- Kept the existing `lib/suppression.ts` and `lib/suppression.test.ts` implementation from the prior interrupted run unchanged — re-inspection found `npx tsc --noEmit` clean and `npx vitest run lib/suppression.test.ts` green (8/8), so the TS2322 described in the resume context was not present in the current file state (the mock's `QueryResult.data` field is already optional, so `{ error: null }` fallbacks satisfy the type). No code change was needed to close that item.
- `lib/suppression.integration.test.ts` mirrors `lib/prospect-upsert.integration.test.ts`'s setup exactly (local demo service-role JWT, `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `beforeAll` client, scoped `afterEach` cleanup keyed on a `test-suppression-` email prefix).
- Added `supabase/.branches/` to `.gitignore` as a small chore commit rather than leaving it perpetually untracked, per the resume context's explicit instruction; its contents were never staged.

## Deviations from Plan

None — plan executed exactly as written. The one apparent deviation flagged in the resume context (a TS2322 mock-typing error in `lib/suppression.test.ts`) did not reproduce on this session's `npx tsc --noEmit` run; the file as left by the prior interrupted run was already type-correct, so no fix was required.

## Issues Encountered
- `supabase db reset` failed on its first invocation this session (`error running container: exit 1` while restarting the `storage-api` container — an unrelated auxiliary service, not the Postgres container). A second `supabase db reset` completed cleanly; `\dt` confirmed the `suppressions` table (along with the other 6 phase-1 tables) existed afterward, and all 4 integration tests then passed. No production/remote command was ever run — `supabase migration list` was attempted first and correctly errored with `LegacyProjectNotLinkedError` (project not linked), confirming there was no remote target to accidentally touch.

## User Setup Required

None - no external service configuration required. Local Supabase must be running (`supabase start`) with migration 014 applied (`supabase db reset` or `supabase migration up`) before re-running the integration suite; this precondition is documented in the test file's header comment.

## Next Phase Readiness
- `lib/suppression.ts` is the load-bearing service every subsequent plan in this phase calls: the unsubscribe route (Plan 04) writes via `writeSuppression`, the Resend webhook (Plan 05) auto-suppresses on bounce/complaint, the backfill script (Plan 05) and override CLI (Plan 06) both read/write through this same module — no second implementation to keep in sync.
- Migration 014 exists only locally; pushing it to the linked/production Supabase project is explicitly out of scope here and reserved for the human-gated Plan 02-07 (`supabase db push` was never run against a remote project in this plan).
- No blockers for Plan 02 (legal basis) or Plan 03 (unsubscribe token), which do not depend on this plan's internals beyond the migration-numbering convention (015 is next).

---
*Phase: 02-compliance-spine*
*Completed: 2026-07-20*

## Self-Check: PASSED

All created files verified present on disk; all referenced commit hashes (9b302a0, 4479322, f9bc994, 1e5fb50) verified present in git log.
