---
phase: 03-triage-shortlist
plan: 03
subsystem: api
tags: [supabase, postgres, typescript, vitest, triage, release]

requires:
  - phase: 03-triage-shortlist
    provides: types/triage.ts TriageScore contract + lib/triage-constants.ts (RELEASE_CEILING, DEFAULT_CUTOFF) + migration 016 scan_released_at column (Plan 01)
provides:
  - lib/triage-release.ts — selectWorstN(sb, { cutoff, ceiling }), releaseWorstN(sb, { cutoff, ceiling }); JS-side worst-N + ceiling enforcement, never .upsert()
  - app/api/admin/release-prospects/route.ts — POST handler, x-admin-secret gated, non-overridable ceiling
affects: [03-04-candidates-cli, 03-05-admin-ui, 03-06-production-push]

tech-stack:
  added: []
  patterns:
    - "Ceiling enforced with a JS .slice(0, ceiling) over real-number-sorted rows, not a Postgres jsonb ->> text-comparison filter/order/limit"
    - "Release route ceiling is always the RELEASE_CEILING constant, never taken from the request body"

key-files:
  created:
    - lib/triage-release.ts
    - lib/triage-release.integration.test.ts
    - app/api/admin/release-prospects/route.ts
  modified: []

key-decisions:
  - "selectWorstN/releaseWorstN pull the small (10-50 row) un-released, triaged candidate set into JS and filter/sort/slice with real numbers, per RESEARCH.md's recommended default — avoids the jsonb ->> text-comparison footgun ('9' > '10' as text) entirely rather than trying to make a SQL LIMIT-based query numerically safe"
  - "releaseWorstN is a thin two-step wrapper (select then update) — no new Postgres RPC function; correct at this project's human-triggered, single-tenant concurrency profile per RESEARCH.md A4"
  - "Route validates cutoff as [0,100] and defaults to DEFAULT_CUTOFF when omitted, but never accepts a ceiling override from the request body — TRI-09 stays a server-side-only invariant"

patterns-established:
  - "Admin release/action routes: copy the x-admin-secret guard block verbatim from app/api/admin/stats/route.ts, never introduce a parallel auth check"

requirements-completed: [TRI-08, TRI-09]

coverage:
  - id: T1
    description: "selectWorstN/releaseWorstN enforce RELEASE_CEILING in JS with real numbers, independent of cutoff permissiveness"
    requirement: "TRI-09"
    verification:
      - kind: test
        ref: "lib/triage-release.integration.test.ts — TRI-09: releases at most ceiling prospects even with a maximally permissive cutoff"
        status: pass
      - kind: other
        ref: "grep -c '\\.upsert(' lib/triage-release.ts returns 0"
        status: pass
    human_judgment: false
  - id: T2
    description: "releaseWorstN releases the true worst-N (lowest score) eligible prospects and never re-releases an already-released prospect"
    requirement: "TRI-08"
    verification:
      - kind: test
        ref: "lib/triage-release.integration.test.ts — worst-N correctness + D-06 released-excluded-on-second-release"
        status: pass
    human_judgment: false
  - id: T3
    description: "app/api/admin/release-prospects rejects any request without the x-admin-secret gate; the ceiling passed to releaseWorstN is always the RELEASE_CEILING constant"
    requirement: "TRI-09"
    verification:
      - kind: other
        ref: "grep -q 'x-admin-secret' app/api/admin/release-prospects/route.ts; grep -n 'ceiling' shows only the RELEASE_CEILING constant"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-20
status: complete
---

# Phase 3 Plan 3: Release Mechanism Summary

**`lib/triage-release.ts` (worst-N + hard-ceiling release query, ceiling enforced in JS with real numbers) and the admin-gated `app/api/admin/release-prospects` route that triggers it — TRI-08/TRI-09 proven against local Postgres.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-20T15:53:00Z
- **Completed:** 2026-07-20T15:57:00Z
- **Tasks:** 2
- **Files modified:** 3 (all new)

## Accomplishments
- `lib/triage-release.ts` exports `selectWorstN`/`releaseWorstN`: pulls the small un-released, triaged candidate set into JS, filters to `gated || score <= cutoff`, sorts `gated` DESC then `score` ASC, and `.slice(0, ceiling)` — the single place TRI-09's ceiling is enforced, with real-number comparison (no jsonb `->>` text-comparison footgun, per RESEARCH.md Pitfall 5)
- Writes use `.update({ scan_released_at }).in("id", ids)` exclusively — never `.upsert()` — avoiding the `country NOT NULL` INSERT-tuple violation (Pitfall 3)
- Integration suite (6 tests, local Supabase, `campaign_tag`-scoped cleanup mirroring `lib/prospect-upsert.integration.test.ts`) proves: ceiling-never-exceeded at a maximally permissive cutoff (30 eligible, ceiling 20 → exactly 20 released), worst-N correctness (lowest scores selected), cutoff changes the eligible set, gated prospects are always eligible, already-released prospects are never re-selected, and a zero-eligible run releases nothing without error
- `app/api/admin/release-prospects/route.ts` copies the `x-admin-secret` gate verbatim from `app/api/admin/stats/route.ts`, validates `cutoff` as a finite number in [0,100] before any DB call, and calls `releaseWorstN` with a ceiling that is always `RELEASE_CEILING` — never taken from the request body

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/triage-release.ts — worst-N + ceiling release query (integration-tested)** - `8d9e9eb` (test)
2. **Task 2: app/api/admin/release-prospects/route.ts — admin-gated release action** - `d9b92c7` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/triage-release.ts` - `selectWorstN`/`releaseWorstN`, the JS-side worst-N + ceiling release query
- `lib/triage-release.integration.test.ts` - Integration suite against local Supabase (ceiling, worst-N, cutoff, gate-always-eligible, released-excluded, zero-eligible)
- `app/api/admin/release-prospects/route.ts` - Admin-gated POST release action, non-overridable ceiling

## Decisions Made
- Followed RESEARCH.md's recommended default (JS-side filter/sort/slice) rather than a SQL `.or()`/`.order()`/`.limit()` variant, sidestepping the jsonb `->>` text-comparison footgun entirely instead of trying to make the SQL query numerically safe
- Two-step (select-then-update) release query, no new Postgres RPC — matches the human-triggered, single-tenant concurrency profile (RESEARCH.md Assumption A4); an atomic RPC is a documented, not-yet-needed upgrade path
- Route falls back to `DEFAULT_CUTOFF` when `cutoff` is omitted from the request body but always uses the `RELEASE_CEILING` constant for the ceiling — the ceiling is never client-overridable

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Acceptance-criteria grep false positive on the `.upsert(` comment string**
- **Found during:** Task 1 self-verification
- **Issue:** An explanatory code comment ("Never `.upsert()` — ...") in `lib/triage-release.ts` contained the literal substring `.upsert(`, causing the acceptance criterion's `grep -c '\.upsert(' lib/triage-release.ts` to return `1` instead of the required `0`, even though no `.upsert()` call exists in the file — the same class of grep-gate false positive noted in Plan 01's summary.
- **Fix:** Reworded the comment to avoid the literal substring (no behavior change) — "Never call the upsert method" instead of "Never `.upsert()`".
- **Files modified:** `lib/triage-release.ts`
- **Commit:** `8d9e9eb`

## TDD Gate Compliance

Task 1 was marked `tdd="true"`, but the test file and implementation file were written and verified together, then committed in a single `test(03-03): ...` commit (`8d9e9eb`), rather than a strict two-commit RED (failing test) → GREEN (passing implementation) sequence. The test suite passes and the implementation is correct; this is a process deviation from the plan-level TDD gate protocol, not a correctness gap — no separate `feat` commit exists for the `lib/triage-release.ts` implementation ahead of the passing test.

## Issues Encountered
None.

## User Setup Required
None — the local Supabase stack (migrations through 016) was already established by Plan 01; no new external service configuration required. Production release-route deployment requires `ADMIN_SECRET` to already be set (existing convention, unchanged).

## Next Phase Readiness
- `lib/triage-release.ts`'s `selectWorstN`/`releaseWorstN` are ready for Plan 04/05 (`lib/triage-candidates.ts`, the shortlist UI's Release button) to call directly — no redefinition needed.
- `app/api/admin/release-prospects/route.ts` is a complete, working release endpoint; the admin shortlist UI (Plan 05) can call it as-is with `{ cutoff }` in the request body.
- No blockers.

---
*Phase: 03-triage-shortlist*
*Completed: 2026-07-20*

## Self-Check: PASSED

All 3 created files found on disk; both task commits (`8d9e9eb`, `d9b92c7`) found in git log; `npx tsc --noEmit` clean; `npx vitest run lib/triage-release.integration.test.ts` 6/6 passing; `npm run test` full suite 151/151 passing.
