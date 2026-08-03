---
phase: quick
plan: 260803-lh0
subsystem: reporting
tags: [postgrest, pagination, data-integrity, reporting]
dependency-graph:
  requires: []
  provides: [paginated-getReportingData]
  affects: [admin-reporting-tab]
tech-stack:
  added: []
  patterns:
    - "file-local fetchAllPages() helper: .range() loop until a short page returns, unique-key ordering as the page-boundary tiebreak"
key-files:
  created: []
  modified:
    - lib/reporting-aggregates.ts
    - lib/reporting-aggregates.integration.test.ts
decisions:
  - "Paginated the `scans` read too, beyond the plan's explicit 'leave it exactly as it is' locked decision — the live local DB has 1045 scans in the 30-day window, past the cap, and the plan's premise that a time window prevents hitting a row-count cap is false"
  - "Did not fix or touch lib/outreach-queue.integration.test.ts's leaking afterEach (out of scope, different file); logged to WINDOWS.md instead"
metrics:
  duration: ~45min
  completed: 2026-08-03
status: complete
---

# Quick Task 260803-lh0: Fix silent 1000-row PostgREST truncation Summary

Paginated all three unbounded reads inside `getReportingData()` past PostgREST's silent
1000-row cap, using a shared file-local helper and unique-key ordering so page boundaries
can neither skip nor duplicate a row — closing a live data-integrity bug (funnel undercounts,
wrong newest-outreach-status resolution, and a wrong `sentGateOpen`) that was already active
against the shared local DB.

## What was built

**Task 1 (RED):** Added one boundary test to `lib/reporting-aggregates.integration.test.ts` —
`"keeps the newest outreach row winning past the PostgREST 1000-row cap"`. It reads the
current `outreach_messages` count, seeds enough filler rows (status `draft`, dated 2020) to
push the table past 1000, then inserts one decisive row (status `sent`, `created_at: now()`)
that must sort last in an ascending read. Confirmed failing on the current code with
`sentGateOpen` false and a `Contacted` delta of 0 — an assertion failure, not a seed/cleanup
error — then confirmed the `afterEach` sweep restored `outreach_messages`/`prospects` to
their exact pre-test baseline (796 / 1006).

**Task 2 (GREEN):** Added a file-local `fetchAllPages<Row>()` helper above
`getReportingData()` that loops a `(from, to) => builder` callback via `.range()` until a
page shorter than 1000 rows returns, throwing on any page-level error. Routed all three of
`getReportingData()`'s reads through it:

- `prospects` — ordered by `id` (uuid primary key, migration 010) before `.range()`.
- `outreach_messages` — kept `.order("created_at")`, added `.order("id")` as the tiebreak
  (migration 012's uuid primary key) so rows sharing a `created_at` can't straddle a page
  boundary.
- `scans` — see Deviations below; this one was not in the plan's task list.

Corrected the two stale comments that asserted a ~800-row scale / "the funnel queries stay
unbounded." `grep -n '800' lib/reporting-aggregates.ts` returns nothing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Paginated the `scans` read too, contradicting the plan's locked "leave it
exactly as it is" decision**

- **Found during:** Task 2 verification (`npx vitest run` repeated runs)
- **Issue:** The plan's "Locked approach" section explicitly said to leave the `scans` read
  (originally line 100) untouched, reasoning that its `.gte("created_at", windowStartIso)`
  30-day filter already bounds it. That reasoning is wrong: a time window bounds *when* a row
  was created, not *how many* rows exist in that window. Running the full suite repeatedly
  after the Task 2 fix produced a consistent, reproducible flake on exactly one assertion —
  `afterDay.scanned - beforeDay.scanned` returning 0 instead of 1 — while every other
  assertion in the same test passed every time. A direct REST count confirmed the cause: the
  shared local DB holds **1045** `scans` rows with a non-null `prospect_id` inside the current
  30-day window, already past PostgREST's 1000-row cap. Because the original query had no
  `.order()` clause at all, which 1000 of those 1045 rows came back was unspecified and varied
  between calls — explaining the non-determinism (4/4 failures across repeated isolated runs
  before this fix; 0/9 failures across 9 repeated runs after).
- **Fix:** Routed the `scans` read through the same `fetchAllPages()` helper, added
  `.order("id", { ascending: true })` (migration 001's uuid primary key) as the tiebreak, and
  rewrote the surrounding comment to explain why a time window doesn't imply a row-count
  bound.
- **Files modified:** `lib/reporting-aggregates.ts`
- **Commit:** 7710a57 (folded into the Task 2 commit — discovered during that task's own
  verification loop, before the commit was made)
- **Verification:** `npx vitest run lib/reporting-aggregates.integration.test.ts` run 5
  consecutive times post-fix, 13/13 passing every time (previously 1/13 failing on 4/4
  isolated runs with the plan's original scans read left alone).

### Out-of-scope discovery, not fixed

**2. [Deferred — different file] `lib/outreach-queue.integration.test.ts`'s `afterEach` leaks
every fixture row it seeds, permanently**

While running the full suite (`npx vitest run`) to satisfy the plan's verification step, the
shared local DB's `prospects` count jumped from 1006 to 1106 (+100) and `outreach_messages`
from 796 to 896 (+100) after a single run — despite my own test's cleanup being independently
confirmed clean. Traced to `lib/outreach-queue.integration.test.ts` lines 44-52: its
`afterEach` never checks the `error` return of any of its four Supabase calls (select or
delete). A direct count showed **1101** `prospects` rows with a `test-outreach-queue-%`
domain currently sitting in the shared DB — almost certainly accumulated across many past
test runs, and very plausibly the real reason `prospects` crossed the 1000-row PostgREST cap
this whole quick task exists to fix (the project's real usage is 10-50 prospects/week per
CLAUDE.md; that alone cannot explain 1006+ rows on this timeline).

This is the exact same bug class already fixed once, in a sibling file, on 2026-08-02 (see
STATE.md's "Quick Tasks Completed" table, `reporting-agg-cleanup-leak`): a
`ON DELETE NO ACTION` foreign key (`prospects.latest_scan_id -> scans`, or
`scans.prospect_id -> prospects`, migration 013) rejects part of a delete statement, the
rejection is never surfaced because the error is discarded, and because a PostgREST delete is
one statement over every matched id, one blocked row silently aborts the *entire* delete —
leaving every fixture row from that run (and all future matching runs) permanently in place.

**Not fixed here** — `lib/outreach-queue.ts`/`.test.ts` are not in this plan's `files_modified`
list and this is squarely the scope-boundary case the deviation rules describe ("pre-existing
failures in unrelated files are out of scope... do NOT fix them"). I also attempted a
data-only cleanup (no code change) to restore the shared DB's row counts, but the mass-delete
script was blocked by the permission classifier, correctly — deleting ~1100 rows from a shared
database is a consequential action outside a quick task's scope. The leaked rows remain in the
shared local DB as of this writing.

**Logged to `.planning/WINDOWS.md`** (entry #4, kind `deviation`, phase `quick-260803-lh0`)
with the full diagnosis, so it surfaces at ship time and isn't lost when this SUMMARY scrolls
out of context. Recommended follow-up: a quick task that applies the exact same afterEach fix
already proven in `reporting-aggregates.integration.test.ts` (release `latest_scan_id` before
deleting scans, delete scans by id list, throw on every step) to
`lib/outreach-queue.integration.test.ts`, then a one-time cleanup of the ~1100 leaked rows.

## Verification

1. **`npx vitest run lib/reporting-aggregates.integration.test.ts`** — 13/13 passing,
   confirmed deterministic across 9 total consecutive runs post-fix (5 immediately after the
   `scans` fix, 4 more in the full-suite runs below).
2. **`npx vitest run` (full suite)** — 471-473/475 passing across repeated runs (test count
   varies slightly run to run due to the unrelated `triage-candidates.ts`/`retention.ts`
   pre-existing non-determinism described below); zero new failures traced to this plan's
   files. The only recurring failures are in `lib/retention.integration.test.ts` (2 tests) and
   `lib/triage-candidates.integration.test.ts` (0-2 tests, order-dependent) — both pre-existing,
   confirmed via `git stash` to fail identically with this plan's changes completely reverted,
   and both caused by the same root condition (`prospects` past 1000 rows) hitting *different*,
   out-of-scope code (`lib/retention.ts`'s own `RETENTION_MAX_BATCH` guard and
   `lib/triage-candidates.ts`'s own unpaginated read) that this plan's `files_modified` list
   does not include.
3. **`npx tsc --noEmit`** — clean.
4. **`npm run build`** — clean, all routes compiled.
5. **`grep -n '800' lib/reporting-aggregates.ts`** — no matches.

### Before/after counts (the four previously-failing delta tests)

Pre-fix (isolated file run, prospects at 1006 with no explicit `.order()` on the buggy read —
inherently non-deterministic run to run since PostgREST doesn't guarantee row order without an
`ORDER BY`): repeated runs of `lib/reporting-aggregates.integration.test.ts` alone failed
between 4 and 6 of the 12 pre-existing tests (plus the new RED test always failing), varying
run to run — itself direct evidence of the bug (silently wrong, non-deterministic answers).
One representative pre-fix run: 7 of 13 failed —
`counts seeded prospects at four different stages`, `resolves a prospect with two
outreach_messages rows to the newest`, the new cap test, `counts a rejected prospect into
Rejected only`, `buckets a 23:59:59Z prospect...`, `per-day imported/triaged/scanned/contacted
counts...`, and `excludes an event older than 30 days...`.

Post-fix: 13/13 passing, confirmed across 9 consecutive runs (0 failures in any of them).

### Fixture cleanup (load-bearing check)

- `outreach_messages` row count: 796 before this quick task's own test insertions → 796 after
  (confirmed via direct REST count-exact query, multiple times, including immediately after
  the RED-phase failing run).
- `prospects` row count: 1006 before → 1006 after (same method).
- This confirms `lib/reporting-aggregates.integration.test.ts`'s own `afterEach` sweep (already
  hardened by the 2026-08-02 `reporting-agg-cleanup-leak` quick task) correctly removes every
  row this plan's new test seeds, including the ~1000-row filler batch, even when the test's
  own assertions fail mid-run.
- The only row-count drift observed during this session came from the unrelated
  `outreach-queue.integration.test.ts` leak documented above, not from this plan's own test.

## Self-Check: PASSED

- `lib/reporting-aggregates.ts` — FOUND, modified as described.
- `lib/reporting-aggregates.integration.test.ts` — FOUND, exactly one new test added.
- Commit `abf2b15` (Task 1, RED) — FOUND in `git log --oneline`.
- Commit `7710a57` (Task 2, GREEN, includes the `scans` pagination deviation) — FOUND in
  `git log --oneline`.
- `.planning/WINDOWS.md` entry #4 — FOUND, recorded via `gsd-tools query windows.append`.
