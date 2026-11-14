---
phase: quick
plan: 261114-olb
subsystem: outreach
tags: [eng-06, scoreable, manual-draft, shortlist, tdd]
requires:
  - phase: 09
    provides: scoreableFailureReason and the dispatch-time fresh verdict
provides:
  - fresh scoreable verdict on the manual draft route
  - scoreability condition on the Shortlist Generate draft button
affects: [lib/outreach-queue.ts, components/admin/shortlist-table.tsx, lib/scoreability-refresh.ts]
tech-stack:
  added: []
  patterns: [fresh verdict through scoreableFailureReason only, fail closed on a missing embed]
key-files:
  created: []
  modified:
    - lib/outreach-queue.ts
    - lib/outreach-queue.integration.test.ts
    - components/admin/shortlist-table.tsx
    - components/admin/shortlist-table.test.tsx
    - lib/scoreability-refresh.ts
decisions:
  - "Keep both the stored-marker check and the fresh verdict on the manual route (D-9-17): the marker is the readable explanation, the fresh verdict is what catches a prospect released before migration 022."
  - "Do not widen the scan_released_at filter in scoreability-refresh.ts: that would write markers onto released history."
status: complete
commits: 3
plan_head_before: bd8c31c86946e883379a9b76e899606b3246a835
plan_head_after: eec1129946e2fae047492eadad6ddf1e36a00afc
actuals:
  tokens: 5500
  tasks: 3
  commits: 3
requirements-completed: [ENG-06, QT-261114-olb]
completed: 2026-11-14
---

# Quick 261114-olb: Close the ENG-06 manual-draft scoreability gap Summary

The manual draft route and the Shortlist Generate draft button now compute the scoreable verdict fresh through `scoreableFailureReason`, so a prospect released and scanned before migration 022 can no longer be drafted from the admin UI.

## What changed

- `lib/outreach-queue.ts`: `generateDraftForProspect` selects `website_url`, `address`, `latitude`, `longitude` and `prospect_sources(raw_confidence, raw_operating_status)` in its existing single read. After the stored-marker check it refuses on a fresh `scoreableFailureReason`. A missing embed maps to an empty source list, which fails closed. An unreadable row still returns the existing error outcome.
- `components/admin/shortlist-table.tsx`: `canGenerateDraft` also requires `scoreableFailureReason(row) === null`. `ShortlistRow` already extends `ScoreableRow` and `getShortlist` already selects every field the rule reads (verified before editing), so no query, row-shape or API change was needed. The NOT SCOREABLE pill still reads the stored marker.
- `lib/scoreability-refresh.ts`: header comment only. It now says a released prospect never gets a first marker from this module, and that `lib/bulk-scan-dispatch.ts` and `lib/outreach-queue.ts` both compute the verdict fresh. Filter and logic untouched.
- Tests: `seedProspect` in the integration suite now produces a scoreable row by default (own website, street address, one 0.9 source with its own `overture_gers_id`) and takes an optional source list.

## What the tests prove

- RED (commit `825af03`, before any production code): the new integration case failed on `expected true to be false` (a draft was created), and two of the three button cases failed on the button being rendered. The scoreable-row button case passed, as intended. All 17 other integration tests stayed green under the widened fixture.
- GREEN: a released, scanned, unmarked prospect with no qualifying source is refused with zero `outreach_messages` rows. A stored-marker prospect is still refused. A scoreable named-person prospect with a completed scan still gets a draft, so the gate is not over-tightened. The Shortlist offers no button for a not-scoreable row, marked or unmarked, and still offers it for a scoreable one.

## Verification

- `npx vitest run --project integration lib/outreach-queue.integration.test.ts`: 18 passed.
- `npx vitest run --project component components/admin/shortlist-table.test.tsx`: 17 passed.
- `npx vitest run --project unit lib/triage-eligibility.test.ts`: 59 passed.
- `npx vitest run --project integration lib/scoreability-refresh.integration.test.ts`: 10 passed.
- `npx tsc --noEmit` and `npm run lint`: clean.
- The full `npx vitest run` suite was deliberately not run (project memory: it times out and reports a false failure).
- Invariant: `grep -rn "scoreableVerdict(" lib app components scripts | grep -v "\.test\." | wc -l` printed `2` (the declaration at `lib/triage-eligibility.ts:97` and the single call at `lib/triage-eligibility.ts:134` inside `scoreableFailureReason`).

## Deviations from Plan

None. The plan was executed as written.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or schema change; no field was added to the row or API payload.

## Open for Joshua

Whether any affected row exists in production:
`select count(*) from prospects where scan_released_at is not null and latest_scan_id is not null and not_scoreable_reason is null;`
then check those rows against the four conditions. The fix is correct either way.

## Self-Check: PASSED

Commits `825af03`, `911058b`, `eec1129` are on `gsd/phase-09-niche-profile`; all five files in `files_modified` were changed; the other session's files were left untouched.
