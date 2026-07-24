---
phase: 05-contact-extraction-classification
plan: 03
subsystem: database
tags: [supabase, postgres, contact-extraction, scan-queue, vitest]

# Dependency graph
requires:
  - phase: 05-contact-extraction-classification (05-01, 05-02)
    provides: migration 018 (commercial_contact_invited, sole_proprietorship, contact_email_type CHECK), lib/contact-extraction.ts aggregateContacts(), types/scanner.ts ContactExtraction/PageData.contactExtraction
provides:
  - "reconcileInFlightScans() derives and persists contact_email/contact_email_type/commercial_contact_invited/sole_proprietorship on the scan done transition, reading scans.pages already in hand (no second fetch)"
  - "fill-only-when-null guarantee: a prospect with an existing contact_email is never overwritten by a later reconcile pass"
  - "integration test coverage against local Supabase proving generic-preferred win, named-person classification, no-overwrite, and commercial/sole-proprietorship persistence"
affects: [phase-06-outreach-drafting]

# Tech tracking
tech-stack:
  added: []
  patterns: ["fill-only-when-null guard on a re-derivable field (mirrors the D-07/D-04 single-write invariants already established in lib/scan-queue.ts)"]

key-files:
  created: []
  modified:
    - lib/scan-queue.ts
    - lib/scan-drain.integration.test.ts
    - lib/scan-queue.test.ts

key-decisions:
  - "aggregateContacts is called per-prospect inside the done-transition loop (not batched) so each prospect's own domain scores its own candidates correctly — matches the plan's single per-prospect .update() requirement"
  - "lib/scan-queue.test.ts (pre-existing mocked unit test, not in this plan's files_modified) was updated because it directly asserts reconcileInFlightScans' update payload, which Task 1 changed by design"

requirements-completed: [CON-01, CON-04, CON-05]

coverage:
  - id: D1
    description: "reconcileInFlightScans derives contact_email/contact_email_type/commercial_contact_invited/sole_proprietorship from scans.pages on the done transition for a NULL-contact prospect (CON-01/CON-04)"
    requirement: "CON-01"
    verification:
      - kind: unit
        ref: "lib/scan-queue.test.ts#reconcileInFlightScans > derives contact fields for a NULL-contact done prospect and maps a failed scan to failed with its error_message as reason"
        status: pass
      - kind: integration
        ref: "lib/scan-drain.integration.test.ts#reconcileInFlightScans — contact extraction (CON-01/CON-04/CON-05) > a NULL-contact prospect gets the generic same-domain address on the done transition (CON-01/CON-04)"
        status: pass
    human_judgment: false
  - id: D2
    description: "named-person classification is stored on contact_email_type (CON-05 storage half)"
    requirement: "CON-05"
    verification:
      - kind: integration
        ref: "lib/scan-drain.integration.test.ts#reconcileInFlightScans — contact extraction (CON-01/CON-04/CON-05) > a named-person-only page yields contact_email_type = 'named-person' (CON-05 storage)"
        status: pass
    human_judgment: false
  - id: D3
    description: "a re-scan never overwrites an existing contact_email or classification (fill-only-when-null)"
    verification:
      - kind: unit
        ref: "lib/scan-queue.test.ts#reconcileInFlightScans > writes scan_status only for a done prospect that already has a contact_email (fill-only-when-null)"
        status: pass
      - kind: integration
        ref: "lib/scan-drain.integration.test.ts#reconcileInFlightScans — contact extraction (CON-01/CON-04/CON-05) > a prospect that already has contact_email keeps it after reconcile (fill-only-when-null, never overwrite)"
        status: pass
    human_judgment: false
  - id: D4
    description: "commercial_contact_invited and sole_proprietorship are persisted alongside the contact fields"
    verification:
      - kind: integration
        ref: "lib/scan-drain.integration.test.ts#reconcileInFlightScans — contact extraction (CON-01/CON-04/CON-05) > persists commercial_contact_invited and sole_proprietorship from the aggregate (eenmanszaak page)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-24
status: complete
---

# Phase 05 Plan 03: Contact extraction wired into the scan done transition Summary

**`reconcileInFlightScans()` now derives the winning contact + classification from `scans.pages` via `aggregateContacts()` on every done transition, writing it with a fill-only-when-null guard that makes re-scans safe.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-24T19:00:00Z
- **Completed:** 2026-07-24T19:25:00Z
- **Tasks:** 2
- **Files modified:** 3 (2 planned + 1 pre-existing unit test updated to match)

## Accomplishments
- `reconcileInFlightScans` selects `domain, contact_email` (prospects) and `pages` (scans) alongside its existing fields — no new fetch introduced.
- On the done transition, a NULL-contact prospect gets `contact_email`, `contact_email_type`, `commercial_contact_invited`, and `sole_proprietorship` written from `aggregateContacts(scan.pages, domain)` in a single per-prospect `.update()`.
- A done prospect that already carries a `contact_email` is written `scan_status`-only — the fill-only-when-null guard, proven both by a mocked unit case and a real-Postgres integration case.
- Four new integration cases against local Supabase: generic same-domain win (CON-01/CON-04), named-person storage (CON-05), no-overwrite guarantee, and `commercial_contact_invited`/`sole_proprietorship` persistence on an eenmanszaak fixture.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend reconcileInFlightScans to derive + persist contact fields (fill-only-when-null)** - `c72df6d` (feat)
2. **Task 2: Integration cases — contact fields written from scans.pages, and never overwritten** - `e893238` (test)

**Plan metadata:** pending (this commit)

## Files Created/Modified
- `lib/scan-queue.ts` - `reconcileInFlightScans` extended: wider select, per-prospect fill-only-when-null contact write via `aggregateContacts`
- `lib/scan-drain.integration.test.ts` - new `describe("reconcileInFlightScans — contact extraction ...")` block, 4 cases, campaign-tag-scoped seeds/cleanup
- `lib/scan-queue.test.ts` - existing mocked `reconcileInFlightScans` test updated to the new select shape and update payload; added a mocked fill-only-when-null case

## Decisions Made
- Contact derivation runs per-prospect inside the done loop (one `aggregateContacts` call + one `.update()` per NULL-contact prospect) rather than batching all done prospects into one `.update().in(...)` call, because each prospect's own `domain` must score its own candidates — a shared update would lose that per-prospect signal.
- Updated `lib/scan-queue.test.ts` even though it isn't in this plan's `files_modified` list: it's a pre-existing unit test that asserts the exact `update()` payload Task 1 changed, so leaving it stale would break `npx vitest run` (full suite), which this plan's own `<verification>` requires to stay green (Rule 1 — the test itself, not application code, but it's covering the same function this task changed).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/stale coverage] Updated lib/scan-queue.test.ts to match the new reconcileInFlightScans contract**
- **Found during:** Task 1 verification (running the full suite before commit)
- **Issue:** `lib/scan-queue.test.ts`'s mocked `reconcileInFlightScans` test asserted the old two-field-select / `{ scan_status: 'done' }`-only update payload. After Task 1's change, that mocked fixture (rows with no `domain`/`contact_email` and scans with no `pages`) produced a different, correct-per-the-new-contract payload the old assertion didn't expect — a genuine test failure, not a design ambiguity.
- **Fix:** Updated the fixture rows to include `domain`/`contact_email`/`pages`, updated the expected payload to the new four-field shape, and added a second case covering the fill-only-when-null path at the unit level (mirroring the new integration case).
- **Files modified:** lib/scan-queue.test.ts
- **Verification:** `npx vitest run lib/scan-queue.test.ts` green (11/11); full suite green (242/242).
- **Committed in:** e893238 (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — stale test coverage)
**Impact on plan:** Necessary to keep the plan's own `<verification>` requirement ("full suite stays green") true. No scope creep — same function, no new behavior introduced beyond the plan's Task 1 spec.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required. Migration 018 (contact classification columns) was already applied to local Supabase in wave 1 (05-01).

## Next Phase Readiness
- CON-01/CON-04/CON-05 storage half are complete: a scan's done transition now populates `contact_email`, `contact_email_type`, `commercial_contact_invited`, and `sole_proprietorship` with no additional fetch, and re-scans can never clobber a reviewed contact.
- Phase 6 (outreach drafting) can now read `prospects.contact_email_type = 'named-person'` to keep named-person prospects out of the default outreach flow (CON-05 enforcement half — deliberately out of scope here per the plan's boundary note).
- Plan 05-04 (next in this phase) is unblocked by this plan's dependency chain.

---
*Phase: 05-contact-extraction-classification*
*Completed: 2026-07-24*

## Self-Check: PASSED
- FOUND: lib/scan-queue.ts
- FOUND: lib/scan-drain.integration.test.ts
- FOUND: .planning/phases/05-contact-extraction-classification/05-03-SUMMARY.md
- FOUND commit: c72df6d
- FOUND commit: e893238
