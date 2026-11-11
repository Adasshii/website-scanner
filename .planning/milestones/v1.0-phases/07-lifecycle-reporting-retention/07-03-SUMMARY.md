---
phase: 07-lifecycle-reporting-retention
plan: 03
subsystem: reporting
tags: [typescript, react, supabase, vitest, reporting, tdd]

requires:
  - phase: 07-02
    provides: "lib/lifecycle.ts's deriveLifecycleState()/FUNNEL_GROUPS; lib/reporting-aggregates.ts's getReportingData() funnel + sentGateOpen; components/admin/reporting-tab.tsx's ReportingTab/FunnelCards; app/admin/reporting-gate.test.tsx's E1 sent-gate backstop"
provides:
  - "lib/lifecycle.ts: REPLY_SIGNAL_AVAILABLE=false — the single flip point Phase 8 must find and change in the same commit that adds a real reply marker"
  - "lib/reporting-aggregates.ts: utcDay(), ReportingDay, getReportingData() extended with days: ReportingDay[] — a fixed 30-day UTC-bucketed window (imported/triaged/scanned/contacted, gated reply-rate/booked)"
  - "lib/reporting-format.ts: formatReplyRate() — the only place a rate becomes a string"
  - "components/admin/reporting-tab.tsx: PerDayTable — the 30-row per-day table, both empty states, gated Reply rate/Booked cells"
  - "app/admin/reporting-gate.test.tsx: E2 backstop evidence for the per-day table's sent-gate honesty treatment"
affects: [07-04, 07-05, 07-06, 07-07]

tech-stack:
  added: []
  patterns:
    - "utcDay() is the single bucketing function every per-day timestamp routes through (T-07-18) — never a per-source date computation, so a row's columns cannot describe different days"
    - "Component-level gating for Booked reads the payload's sentGateOpen boolean directly, not the per-cell field's own nullability — proven by a closed-gate test fixture that supplies real non-zero booked integers and asserts they never render"
    - "formatReplyRate() isolates rate-to-string formatting in a plain module so the D-7-13 precision/null-safety backstop is testable without a DOM"

key-files:
  created:
    - lib/reporting-format.ts
    - lib/reporting-format.test.ts
  modified:
    - lib/lifecycle.ts
    - lib/reporting-aggregates.ts
    - lib/reporting-aggregates.integration.test.ts
    - components/admin/reporting-tab.tsx
    - app/admin/reporting-gate.test.tsx

key-decisions:
  - "Booked cell gating reads payload.sentGateOpen directly (not day.booked === null) — makes the closed-gate suppression provable with a fixture that supplies real non-zero booked integers, matching the plan's explicit 'supplying zeros would prove nothing' instruction"
  - "Reply rate cell gating reads day.replyRate === null only, ignoring sentGateOpen entirely — this is what keeps the cell awaiting even once the sent-gate flips true, since REPLY_SIGNAL_AVAILABLE stays false until Phase 8"
  - "replyRate's true branch (REPLY_SIGNAL_AVAILABLE && sentGateOpen && contacted > 0) computes a literal 0 rather than a real numerator, because no replied marker/count exists anywhere in this codebase yet — the branch is provably unreachable while REPLY_SIGNAL_AVAILABLE is false; Phase 8 must supply the real numerator in the same change that flips the constant"

patterns-established:
  - "Fixed 30-day UTC window built once per getReportingData() call from a single `now`, never a filtered activity list — every day renders 0 when idle, and the window's server-side .gte() restriction (scans query) keeps that one new query from widening as the table grows"

requirements-completed: [TRK-03, TRK-05]

coverage:
  - id: D1
    description: "utcDay() buckets all per-day timestamps into UTC calendar days independent of process TZ; days: ReportingDay[] is a fixed 30-entry, newest-first window with imported/triaged/scanned/contacted counts matching hand-seeded fixtures, a NULL-prospect_id scan excluded, and an event older than 30 days excluded from every bucket but still counted in the funnel"
    requirement: "TRK-05"
    verification:
      - kind: integration
        ref: "lib/reporting-aggregates.integration.test.ts — 12 tests against real local Postgres, including the 23:59:59Z/00:00:01Z day-boundary pair asserted under TZ=Europe/Amsterdam"
        status: pass
    human_judgment: false
  - id: D2
    description: "replyRate is null under three independent guards (REPLY_SIGNAL_AVAILABLE, sentGateOpen, zero-contacted) so a division can never produce NaN/Infinity and a 0% can never read as a real answer; formatReplyRate() renders a locked whole-percent string or the awaiting literal, never a raw float artifact"
    requirement: "TRK-03"
    verification:
      - kind: unit
        ref: "lib/reporting-format.test.ts — 4 tests (33% rounding, 0% precision, 100% whole form, null awaiting literal with no NaN/Infinity/null substring)"
        status: pass
      - kind: integration
        ref: "lib/reporting-aggregates.integration.test.ts — replyRate null on every day including one with contacted > 0; bookedByDomain never exceeds booked"
        status: pass
    human_judgment: false
  - id: D3
    description: "PerDayTable renders exactly 30 rows always, Booked gates on the global sent-gate (not its own nullability), Reply rate keeps the awaiting treatment even with the gate open (REPLY_SIGNAL_AVAILABLE still false), both empty-state copy pairs render verbatim, and GET /api/admin/reporting returns a real 30-entry days array end to end"
    requirement: "TRK-03, TRK-05"
    verification:
      - kind: automated_ui
        ref: "app/admin/reporting-gate.test.tsx — new 'E2 per-day table' describe, 5 tests (gate closed/open with non-zero supplied booked integers, always-30-rows including zero-activity, both empty states)"
        status: pass
      - kind: manual_procedural
        ref: "curl -H 'x-admin-secret: wrong' -> 401; curl -H 'x-admin-secret: <real>' -> 200 with days.length===30, 30 distinct dates, newest-first, against local dev server pointed at local Supabase via .env.development.local"
        status: pass
    human_judgment: false

duration: ~50min
completed: 2026-08-02
status: complete
---

# Phase 07 Plan 03: Per-Day Reporting Table & Reply-Rate Honesty Gate Summary

**30-day UTC-bucketed per-day table (imported/triaged/scanned/contacted) plus a reply-rate cell that is structurally incapable of rendering a number until Phase 8 ships a real reply marker**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-08-02
- **Tasks:** 3 (1 TDD, 2 auto)
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments
- `lib/lifecycle.ts`: added `REPLY_SIGNAL_AVAILABLE = false` — the single flip point named so Phase 8 does not have to hunt for the gate when it ships a real reply marker
- `lib/reporting-aggregates.ts`: `utcDay()` (the one bucketing function every per-day timestamp routes through, T-07-18), `ReportingDay`, and `getReportingData()` extended with a fixed 30-entry `days[]` window — `scanned` carries the `.not("prospect_id", "is", null)` ownership filter (T-07-17), `booked`/`bookedByDomain` stay `null` until `sentGateOpen`, `replyRate` stays `null` under three independent guards (T-07-16) so a division can never produce `NaN`/`Infinity`
- `lib/reporting-format.ts`: `formatReplyRate()` — the only place a rate becomes a string, proven by a 4-test unit suite covering rounding, zero precision, the whole-number form, and the null awaiting literal
- `components/admin/reporting-tab.tsx`: `PerDayTable` renders the 30-row, 7-column table (Date/Imported/Triaged/Scanned/Contacted/Reply rate/Booked) plus the second empty state (prospects exist, zero 30-day activity) distinct from the tab-level empty state; Booked gates on the global `sentGateOpen`, Reply rate always goes through `formatReplyRate()`
- `app/admin/reporting-gate.test.tsx`: new "E2 per-day table" `describe` — the closed-gate test supplies real non-zero booked integers and proves the UI suppresses them (not merely that zeros happen to render); the open-gate test proves Reply rate keeps the awaiting treatment even with the sent-gate open, because `REPLY_SIGNAL_AVAILABLE` is still false
- Live-verified end to end: `GET /api/admin/reporting` against a local dev server pointed at local Supabase returns a 30-entry, newest-first, distinct-date `days` array with real production-shaped local data (`imported: 219`, `scanned: 218` for today)

## Task Commits

TDD gate sequence (Task 1, `tdd="true"`):

1. **Task 1 RED — failing tests for per-day aggregates and reply-rate formatting** — `e30bf48` (test)
2. **Task 1 GREEN — per-day UTC aggregates and the reply-rate capability gate** — `e66e4b0` (feat)
3. **Task 2: render the 30-day table, both empty states, and awaiting cells** — `c1a6c32` (feat)
4. **Task 3: extend the held-out render test with E2 backstop assertions** — `319d6db` (test)

**Plan metadata:** committed alongside this SUMMARY

## Files Created/Modified
- `lib/lifecycle.ts` (modified) — added `REPLY_SIGNAL_AVAILABLE` export only; no change to `deriveLifecycleState()` or its exports
- `lib/reporting-aggregates.ts` (modified) — `utcDay()`, `ReportingDay`, `getReportingData()` extended with `days: ReportingDay[]`
- `lib/reporting-aggregates.integration.test.ts` (modified) — extended with a `utcDay` describe and a 7-test `days` describe, all against real local Postgres
- `lib/reporting-format.ts` (new) — `formatReplyRate(rate: number | null): string`
- `lib/reporting-format.test.ts` (new) — 4 unit tests
- `components/admin/reporting-tab.tsx` (modified) — `PerDayTable` export added; `ReportingTab` extended with the zero-30-day-activity empty state and the table render
- `app/admin/reporting-gate.test.tsx` (modified) — 3 existing `ReportingPayload` fixtures gained `days: []` (Rule 3, needed for the interface extension to keep `tsc` clean); new "E2 per-day table" describe with 5 tests

## Decisions Made
- Booked cell gating reads `payload.sentGateOpen` directly rather than `day.booked === null` — this is what makes the closed-gate suppression provable with a fixture carrying real non-zero booked integers (the plan's own instruction: "supplying zeros here would prove nothing"). Reply rate, by contrast, gates on `day.replyRate === null` alone and deliberately ignores `sentGateOpen`, which is what keeps it awaiting past the gate flip while `REPLY_SIGNAL_AVAILABLE` is false — two different gating rules for two columns with different truth sources, both traced back to their respective UI-SPEC/CONTEXT decisions in code comments.
- `replyRate`'s theoretically-true branch (`REPLY_SIGNAL_AVAILABLE && sentGateOpen && contacted > 0`) computes a literal `0` rather than a real numerator — no `replied` marker or count exists anywhere in this codebase, so the branch is provably unreachable while the constant is `false`. A comment documents that Phase 8 must supply the real per-day replied count in the same change that flips `REPLY_SIGNAL_AVAILABLE`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extending `ReportingPayload` with a required `days` field broke `tsc --noEmit` on 07-02's existing test fixtures**
- **Found during:** Task 1 (`npx tsc --noEmit` after extending `ReportingPayload`)
- **Issue:** `app/admin/reporting-gate.test.tsx` (written in 07-02) constructs three `ReportingPayload` object literals for its E1 tests. Adding the required `days: ReportingDay[]` field to the interface made all three fail to type-check (`TS2741: Property 'days' is missing`).
- **Fix:** Added `days: []` to each of the three existing literals. No assertion logic in the existing E1 tests was touched — per the plan's own instruction ("Do not modify the existing funnel-card describe"), Task 3's new E2 describe block is fully additive alongside this minimal fixture fix.
- **Files modified:** `app/admin/reporting-gate.test.tsx`
- **Verification:** `npx tsc --noEmit` clean; the existing 5 E1 tests still pass unchanged
- **Committed in:** `e66e4b0` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking)
**Impact on plan:** Required to satisfy Task 1's own written acceptance criteria (`tsc --noEmit` clean). No scope creep — a pure fixture addition, zero assertion changes to the existing E1 describe.

## Issues Encountered
- `npm run build` twice stalled indefinitely in the background sandbox at the "Linting and checking validity of types..." step (near-zero CPU over several minutes, matching the exact symptom 07-02's SUMMARY already documented) — killed and re-ran in the foreground, which completed normally. No code change was involved; sandbox/process noise, not a deviation.
- The shared local Postgres (`supabase_db_website-scanner`) was under concurrent load from a sibling project's (`oro-app`) vitest run during this session, and separately from this project's own `unit`/`component` vitest projects competing with `integration` for CPU during a full `npx vitest run` — both caused transient timeouts and, in one case, an `afterEach` cleanup that appeared to run (test reported "passed") but left residual `test-reporting-agg-*` prospect rows behind, causing `duplicate key` errors on a subsequent run. Diagnosed via `ps aux` (found the concurrent `oro-app` vitest workers), waited for contention to clear, manually cleaned residual rows via a one-off Supabase client script, and re-ran to green (`389/389` across all three projects, `12/12` in the reporting-aggregates integration file alone and within the full suite). Not a defect in this plan's code — matches this project's documented shared-local-Supabase hazard (STATE.md / project memory: "concurrent vitest runs cause false timeouts"). No test code was weakened to work around it.

## User Setup Required
None — no new external service configuration. No new environment variables introduced.

## Next Phase Readiness
- `lib/reporting-aggregates.ts`'s `ReportingPayload` (now including `days: ReportingDay[]`) and `lib/lifecycle.ts`'s `REPLY_SIGNAL_AVAILABLE` are both stable exports; later plans in this phase (07-04's Shortlist `Stage` column, 07-05's booking-attribution webhook extension) do not need to touch either.
- `REPLY_SIGNAL_AVAILABLE` is the one flip point Phase 8 must find — named explicitly in `lib/lifecycle.ts`'s header comment and exercised by a dedicated assertion in `app/admin/reporting-gate.test.tsx` that is expected to change the moment the constant flips.
- The Reporting tab's full 30-day table is live and passes the complete acceptance chain (vitest all three projects, tsc, build, curl 401/200 against local Supabase); not yet exercised against the live production database, matching this project's standing convention that live verification happens at ship time.

---
*Phase: 07-lifecycle-reporting-retention*
*Completed: 2026-08-02*

## Self-Check: PASSED

All created/modified files and all four task commit hashes verified present on disk / in git log.
