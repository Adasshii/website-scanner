---
phase: 07-lifecycle-reporting-retention
plan: 04
subsystem: admin-shortlist
tags: [typescript, react, supabase, admin-ui, lifecycle-derivation, vitest, tdd]

requires:
  - phase: 07-02
    provides: "lib/lifecycle.ts: deriveLifecycleState(), FineLifecycleState (12 values), FUNNEL_GROUPS — the single lifecycle-derivation ladder this plan calls, not re-derives"
provides:
  - "ShortlistRow.stage: FineLifecycleState — resolved server-side inside getShortlist(), zero extra Supabase round trips"
  - "components/admin/shortlist-table.tsx: StagePill, stagePillStyles (6-entry, keyed through FUNNEL_GROUPS) — the Stage column between Status and Released (D-7-14)"
affects: []

tech-stack:
  added: []
  patterns:
    - "Single-query dual-derivation: the existing outreach_messages SELECT (already run for has_outreach_draft) is widened to status+created_at, ordered ascending, and one pass over the result set produces both draftedIds (any row) and the newest-per-prospect status (Pitfall 4) — never two queries that could describe different rows for the same prospect"
    - "Total rendering, no null branch: StagePill renders unconditionally (D-7-02 puts `new` at the floor), unlike StatusPill which renders nothing for a null scan_status"

key-files:
  created:
    - components/admin/shortlist-table.test.tsx
  modified:
    - lib/triage-candidates.ts
    - lib/triage-candidates.integration.test.ts
    - components/admin/shortlist-table.tsx

key-decisions:
  - "app/api/admin/shortlist/route.ts left untouched, confirmed by reading it rather than assumed — it spreads ShortlistRow straight through into NextResponse.json({ rows: sorted }) with no named fields, so the new stage property reaches the wire automatically"
  - "Stray local-Supabase fixture rows from an earlier interrupted 07-03 test run (domain prefix test-reporting-agg-, all created at repeatable fixed suffixes with no random component) were blocking npx vitest run with duplicate-key errors on prospects_domain_unique_idx, unrelated to this plan's code. Cleaned up via the exact same prefix-scoped delete the test file's own afterEach performs (plus the one dependent scans/outreach_messages row a foreign key required first) rather than touching any test file or assertion — data cleanup, not a code fix, and confined to the local-only Supabase instance this project's safety constraints already flag as prone to exactly this contention"

patterns-established: []

requirements-completed: [TRK-01, TRK-02]

coverage:
  - id: D1
    description: "getShortlist() attaches a resolved stage: FineLifecycleState per row via deriveLifecycleState(), reading lifecycle_state/triage_checked_at/booked_at plus the already-selected scan markers and the newest outreach_messages status, with zero added Supabase round trips"
    requirement: "TRK-01"
    verification:
      - kind: integration
        ref: "lib/triage-candidates.integration.test.ts — 9 new tests inside the existing describe(\"getShortlist\") block (triaged/qualified/scanned/contacted/booked rungs, rejected terminal outranking booked_at + sent outreach per D-7-R2, newest-of-two-outreach-rows resolution per Pitfall 4, raw-input stripping, exhaustive 12-value membership); all 17 getShortlist/getTriageCandidates tests pass"
        status: pass
      - kind: unit
        ref: "grep gates: exactly 1 `from \"@/lib/lifecycle\"` import site, exactly 1 `from(\"outreach_messages\")` call site, git diff --stat on the route file reports no change, writer-count for lifecycle_state unchanged (lib/outreach-queue.ts:274, lib/prospect-upsert.ts:127)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The Shortlist tab renders a Stage pill column between Status and Released, unconditionally, coloured by funnel group, with the fixed 12-value uppercase-underscore-stripped label vocabulary"
    requirement: "TRK-02"
    verification:
      - kind: automated_ui
        ref: "components/admin/shortlist-table.test.tsx — 10 tests: pill style per funnel group (parametrised over all 6 groups), SCAN QUEUED label formatting, REJECTED overriding a done scan_status, header order Domain/Triage score/Status/Stage/Released/Signals, exactly one pill per row across a 3-row table"
        status: pass
      - kind: unit
        ref: "grep gates: zero deriveLifecycleState references in the component (renders a server-resolved value only), stagePillStyles has exactly 6 entries typed Record<FunnelGroup, string>"
        status: pass
    human_judgment: false

duration: ~30min
completed: 2026-08-02
status: complete
---

# Phase 07 Plan 04: Shortlist Stage Column Summary

**`getShortlist()` now resolves `stage: FineLifecycleState` server-side via the shared `deriveLifecycleState()` ladder, and a new `Stage` pill column between `Status` and `Released` renders it on the admin Shortlist tab — one derivation feeding both the Reporting funnel and this per-prospect view**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-08-02
- **Tasks:** 2 (1 TDD, 1 auto)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- `lib/triage-candidates.ts`: `ShortlistRow` gains `stage: FineLifecycleState`, imported as a type from `@/lib/lifecycle`. `getShortlist()`'s `prospects` SELECT widens to include `lifecycle_state`, `triage_checked_at`, `booked_at`; its `outreach_messages` SELECT widens to `status, created_at` ordered ascending so one query builds both `draftedIds` (any row) and the newest-per-prospect status map — no third round trip, and the two answers can never describe different rows for the same prospect (Pitfall 4)
- `lib/triage-candidates.integration.test.ts`: 9 new tests inside the existing `describe("getShortlist")` block prove every ladder rung at this surface (not just the unit-tested derivation) — including the D-7-R2 case where a stored `rejected` prospect with `booked_at` set and a `sent` outreach row still resolves to `rejected`, and the newest-of-two-outreach-rows case that resolves `drafted` while `has_outreach_draft` stays `true`
- `components/admin/shortlist-table.tsx`: `StagePill` renders `row.stage` unconditionally (no null branch — stage is total, D-7-02) through a 6-entry `stagePillStyles` keyed by `FUNNEL_GROUPS`, the exact palette from `07-UI-SPEC.md` § Color. A new `<th>Stage</th>` / `<td>` pair sits between the existing `Status` and `Released` columns
- `components/admin/shortlist-table.test.tsx` (new): 10 tests — one per funnel group's pill style, `SCAN QUEUED` label formatting (underscore-to-space, uppercase), a `rejected` row rendering red even with `scan_status: "done"`, header column order, and exactly one pill per row across a 3-row table
- `app/api/admin/shortlist/route.ts` confirmed unmodified by reading it — it spreads `ShortlistRow` through unnamed, so `stage` reaches the admin client with zero route changes

## Task Commits

TDD gate sequence (Task 1, `tdd="true"`):

1. **Task 1 RED — failing stage-resolution tests for getShortlist** — `c713afc` (test)
2. **Task 1 GREEN — resolve stage server-side** — `425f911` (feat)
3. **Task 2: render the Stage pill column** — `7fc6118` (feat)

**Plan metadata:** committed alongside this SUMMARY

## Files Created/Modified
- `lib/triage-candidates.ts` (modified) — `ShortlistRow.stage`, widened SELECTs, single-pass outreach derivation
- `lib/triage-candidates.integration.test.ts` (modified) — fixture helpers extended (`lifecycleState`, `scanStatus`, `bookedAt`, outreach `status`/`createdAt` overrides), 9 new assertions
- `components/admin/shortlist-table.tsx` (modified) — `stagePillStyles`, `StagePill`, new column
- `components/admin/shortlist-table.test.tsx` (new) — 10 component tests

## Decisions Made
- `app/api/admin/shortlist/route.ts` needed no edit — verified by reading it, not assumed, matching the 06-08 convention this plan's own must-haves called out.
- Stray local-Supabase fixture rows from an earlier interrupted 07-03 test run were deleted (see Deviations below) — a data-cleanup action, not a code change, confined to the local-only database this project's safety constraints already flag as prone to exactly this contention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stray fixture rows from a prior interrupted test run blocked `npx vitest run`**
- **Found during:** Task 2 (`npx vitest run`, the full three-project suite, before any acceptance criteria could be confirmed green)
- **Issue:** `lib/reporting-aggregates.integration.test.ts` (07-03, unrelated to this plan's file changes) failed 8/8 of its own tests with `duplicate key value violates unique constraint "prospects_domain_unique_idx"`. Investigation via direct REST queries against the local Supabase instance found 14 `prospects` rows with fixed (non-randomised) domains matching that test file's `test-reporting-agg-` prefix, with `created_at` timestamps from an earlier session — an interrupted or crashed prior run that never reached its own `afterEach` cleanup. This is exactly the contention risk this plan's `<project_safety_constraints>` names explicitly ("leftover rows from exactly this contention").
- **Fix:** Deleted the 14 stray `prospects` rows (and one dependent `scans` row a foreign key required removing first) via direct REST calls against the local-only Supabase instance, using the identical prefix-scoped delete pattern the test file's own `afterEach` runs (`domain like 'test-reporting-agg-%'`). No test file, assertion, or application code was touched.
- **Files modified:** none (data-only, local database)
- **Verification:** `npx vitest run` — 408/408 passing across all three projects (was 405/408 before cleanup)
- **Committed in:** not applicable (no file change to commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking, data cleanup only)
**Impact on plan:** No scope creep — the fix touched zero files in this plan or any other plan, and restored a pre-existing, unrelated test file to the passing state it was presumably in before an earlier session's run was interrupted.

## Issues Encountered
None beyond the stray-fixture-row cleanup documented above.

## User Setup Required
None — no external service configuration required. No new env var was introduced.

## Next Phase Readiness
- `ShortlistRow.stage` and `StagePill` are live on the Shortlist tab; the same `deriveLifecycleState()` call this plan makes is the identical function `lib/reporting-aggregates.ts` (07-02/07-03) calls for the Reporting funnel, so the two surfaces cannot disagree about a prospect's stage.
- FA-TRK-01 (flagged by this plan, not resolved): `getShortlist()`'s `.not("triage_score", "is", null)` filter means an untriaged `new` prospect and every `no_website` prospect never appear on the Shortlist tab at all — those two of the twelve `FineLifecycleState` values are visible on the Reporting funnel cards but invisible on this row-level view. Nothing in this phase's CONTEXT.md, UI-SPEC, or ROADMAP resolves whether that filter should widen; not changed here (would alter an existing shipped surface's meaning, outside this phase's boundary).
- Not yet exercised against the live production database — matches this project's standing convention that live verification happens at ship time, not per-plan.

---
*Phase: 07-lifecycle-reporting-retention*
*Completed: 2026-08-02*

## Self-Check: PASSED

All created/modified files and commit hashes verified present on disk / in git log.
