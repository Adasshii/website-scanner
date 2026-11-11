---
phase: 07-lifecycle-reporting-retention
plan: 08
subsystem: database
tags: [supabase, postgres, retention, gdpr, anonymisation]

# Dependency graph
requires:
  - phase: 07-lifecycle-reporting-retention
    provides: "lib/retention.ts and lib/retention-constants.ts (07-06, 07-07) — the dry-run clock, allowlist and anonymize/delete writing modes this plan extends"
provides:
  - "prospect_sources added to RETENTION_TABLE_ALLOWLIST with anonymize mode deleting its rows for expiring prospects"
  - "07-DECISION-RECORD.md — the durable, cited compliance decision closing FA-CMP-13-SOURCES"
  - "RetentionResult.sourcesAnonymized counter"
affects: [07-lifecycle-reporting-retention-plan-10, retention-deploy-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Anonymise-by-delete for a not-null-unique public identifier column that cannot be nulled in place, documented at the call site and in a dedicated decision record rather than folded silently into the existing field-list pattern"

key-files:
  created:
    - .planning/phases/07-lifecycle-reporting-retention/07-DECISION-RECORD.md
  modified:
    - lib/retention-constants.ts
    - lib/retention.ts
    - lib/retention.integration.test.ts

key-decisions:
  - "FA-CMP-13-SOURCES resolved as B-delete-source-rows (blocking checkpoint:decision, answered by the user, not the executor). prospect_sources rows are deleted outright during an anonymise pass rather than field-list-cleared, because overture_gers_id is not-null/unique and upsertOverturePlace's branch-1 update (lib/prospect-upsert.ts:43-83) rewrites raw_name/raw_address/raw_website_url on every re-import matching a surviving gers_id, undoing an in-place clear on the next regional import. Accepted cost: the next regional import creates a second, unlinked prospect row for the same business (IMP-03 idempotency breaks for that prospect), bounded by this project's 10-50 prospects/week scale and by CMP-15 (suppression survives independently of any prospect row)."

patterns-established:
  - "A field that cannot be anonymised in place (not-null/unique, or subject to re-population by another write path) gets its owning row deleted rather than nulled, with the reason and the accepted cost written both at the code call site and in a dedicated decision-record artifact — not folded into a code comment alone."

requirements-completed: []  # CMP-13/CMP-14 deliberately NOT marked complete here — plan 07-10 owns that call per this plan's own <output> instruction; it still depends on the production-deploy evidence 07-07's Task 3 never gathered.

coverage:
  - id: D1
    description: "Anonymise mode deletes a prospect's prospect_sources rows outright (past-window fixture, verified by prospect_id, source id, and overture_gers_id)"
    requirement: CMP-14
    verification:
      - kind: integration
        ref: "lib/retention.integration.test.ts#anonymize: a source row for a prospect past the window is deleted outright, not blanked"
        status: pass
    human_judgment: false
  - id: D2
    description: "A prospect_sources row belonging to an in-window (not-yet-expiring) prospect is left untouched, column for column, by an anonymise pass"
    requirement: CMP-14
    verification:
      - kind: integration
        ref: "lib/retention.integration.test.ts#anonymize: a source row for a prospect inside the window is untouched, column for column"
        status: pass
    human_judgment: false
  - id: D3
    description: "Delete mode still clears prospect_sources rows via migration 011's ON DELETE CASCADE, re-asserted after the allowlist change"
    requirement: CMP-13
    verification:
      - kind: integration
        ref: "lib/retention.integration.test.ts#delete: a source row for a prospect past the window is gone via migration 011's ON DELETE CASCADE"
        status: pass
    human_judgment: false
  - id: D4
    description: "CMP-15's suppression-survival gate and the leads/public-scan-survival assertions still pass unchanged after widening RETENTION_TABLE_ALLOWLIST to 4 entries"
    requirement: CMP-15
    verification:
      - kind: integration
        ref: "npx vitest run lib/retention.integration.test.ts -t suppression (5 passed)"
        status: pass
      - kind: integration
        ref: "npx vitest run lib/retention.integration.test.ts (39 passed, full file including scope/leads/public-scan tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The compliance decision (which option, why, what was accepted) is recorded in a durable, cited artifact rather than a self-flag comment"
    verification:
      - kind: other
        ref: ".planning/phases/07-lifecycle-reporting-retention/07-DECISION-RECORD.md (exists, names B-delete-source-rows, contains FA-CMP-13-SOURCES)"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-08-02
status: complete
---

# Phase 7 Plan 08: FA-CMP-13-SOURCES Gap Closure Summary

**Anonymise mode now deletes a prospect's `prospect_sources` rows outright (not a field-list null) because `overture_gers_id` can't be nulled and a re-import writes the raw columns straight back**

## Performance

- **Duration:** ~20 min (Task 1 checkpoint resolution + Task 2 implementation, verification, and commit)
- **Completed:** 2026-08-02T19:26:32Z
- **Tasks:** 2 (Task 1: blocking decision checkpoint, resolved by the user; Task 2: implementation)
- **Files modified:** 3 code files + 1 new decision record

## Accomplishments
- Closed FA-CMP-13-SOURCES / 07-REVIEW.md WR-03: anonymise mode no longer leaves `prospect_sources` un-cleared and joinable back to an anonymised prospect
- Confirmed, by direct code read rather than assumption, that `upsertOverturePlace`'s re-import path would have silently undone the rejected field-list option (A) — this finding is what moved the decision to B
- Added `prospect_sources` to `RETENTION_TABLE_ALLOWLIST` (now 4 entries) with the CMP-15 suppression-survival gate re-proven green after the widen, per the allowlist's own risk profile (T-07-08-02)
- Wrote `07-DECISION-RECORD.md`: the first durable, cited compliance artifact for this gap, replacing three documents' worth of self-flagged, unresolved comment

## Task Commits

Task 1 produced no code artifact — it was a blocking `checkpoint:decision` returned to the orchestrator and answered by the user outside this execution. Task 2 implements the resolved decision in one commit:

1. **Task 2: Implement and pin the decision (B-delete-source-rows), end to end through a real anonymise run** - `1f11d03` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE.md/ROADMAP.md update)

## Files Created/Modified
- `lib/retention-constants.ts` - `RETENTION_TABLE_ALLOWLIST` gains `"prospect_sources"`; comment paragraph names the decision and cites `07-DECISION-RECORD.md`
- `lib/retention.ts` - `anonymizeProspects()`'s chunk loop deletes the id set's `prospect_sources` rows; new `sources` return field threaded to `RetentionResult.sourcesAnonymized` (0 in dry-run and delete arms); comment at the call site explains why an anonymise pass performs a delete here and names the accepted IMP-03 cost
- `lib/retention.integration.test.ts` - new `seedProspectSource()` fixture helper; new `describe("runRetention — prospect_sources (FA-CMP-13-SOURCES, Task 2)")` block (3 tests: past-window deletion, in-window survival, delete-mode cascade re-assertion); allowlist length assertion updated 3→4 with a `leads`-absence check added; two `anonymizeProspects()` direct-call `toEqual` assertions updated to include the new `sources: 0` key
- `.planning/phases/07-lifecycle-reporting-retention/07-DECISION-RECORD.md` (new) - the decision, rationale, `upsertOverturePlace` write-through finding, accepted cost, and the code/test that enforce it

## Decisions Made
- **B-delete-source-rows**, selected by the user at the Task 1 checkpoint after the executor surfaced the `upsertOverturePlace` write-through finding (see `key-decisions` above and `07-DECISION-RECORD.md` for the full rationale). Option A (field-list clear, keep `overture_gers_id`) was rejected because it silently self-reverses on the next regional import. Option C (permanently out of scope) was not selected — the user chose to close the gap now rather than defer it further.

## Deviations from Plan

None — plan executed exactly as written for Task 2's `B-delete-source-rows` branch. Task 1's blocking checkpoint was handled per protocol: the executor did not self-select an option, performed the required `<read_first>` reading (including the `upsertOverturePlace` write-through check the checkpoint notice specifically demanded), and returned the checkpoint unresolved. The coordinator returned with the user's decision, which Task 2 then implemented verbatim.

## Issues Encountered

None. The `lib/reporting-aggregates.integration.test.ts` fixture-leak hazard flagged in this plan's `<assumptions>` did not manifest — no `test-reporting-agg-*` duplicate-key errors occurred during any of the three full-suite runs performed (targeted file, suppression subset, full `npx vitest run`).

## User Setup Required

None - no external service configuration required. `RETENTION_MODE` remains unset everywhere in this codebase (confirmed: this plan's diff touches no `.env.*` file and no deploy config).

## Next Phase Readiness

- FA-CMP-13-SOURCES is closed: anonymise mode's treatment of `prospect_sources` is a decided, documented, test-enforced behavior.
- CMP-13/CMP-14 remain **not** marked complete in this plan's frontmatter — plan 07-10 owns that call per this plan's own `<output>` instruction. The remaining gap for CMP-13/14 is unchanged by this plan: the production deploy + live cron confirmation + authenticated dry-run read + SQL cross-check that 07-07's Task 3 never performed (07-VERIFICATION.md's first `human_verification` item). This plan closed the second of the two `gaps_found` reasons; the first (undeployed cron) is still open and is plan 07-10's or a later plan's responsibility.
- `RETENTION_TABLE_ALLOWLIST` now has 4 entries; any future plan that reads "3 entries" from an older document (07-VERIFICATION.md, 07-REVIEW.md) should treat this SUMMARY and `07-DECISION-RECORD.md` as the current source of truth.

---
*Phase: 07-lifecycle-reporting-retention*
*Completed: 2026-08-02*

## Self-Check: PASSED

All claimed files exist on disk; commit `1f11d03` found in `git log`.
