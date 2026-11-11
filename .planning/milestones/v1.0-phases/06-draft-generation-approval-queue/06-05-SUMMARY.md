---
phase: 06-draft-generation-approval-queue
plan: 05
subsystem: api
tags: [webhook, eligibility-gate, draft-generation, vitest, integration-test]

requires:
  - phase: 06-draft-generation-approval-queue
    provides: "generateDraft()/buildReportUrl() and DraftInput/DraftDeps/GeneratedDraft types from lib/draft-generator.ts (06-04)"
  - phase: 06-draft-generation-approval-queue
    provides: "computeVerdict()/getWeakestCategory() from lib/scoring.ts (06-01)"
provides:
  - "lib/draft-on-scan-complete.ts — maybeGenerateDraftForProspectScan(sb, scan, deps?): the D-6-05 eligibility gate, never throws, returns a DraftHookResult"
  - "app/api/internal/scan-complete/route.ts's prospect branch — the live hook point that calls the gate on every scan-complete callback"
affects: [06-06-regenerate, 06-08-manual-generate-shortlist]

tech-stack:
  added: []
  patterns:
    - "Eligibility gate as a pure composition layer over generateDraft() — this module owns zero generation logic, only the seven skip/proceed decisions"
    - "Local-Supabase integration harness copied verbatim from lib/suppression.integration.test.ts (env override at top of file, afterEach cascade cleanup)"

key-files:
  created:
    - lib/draft-on-scan-complete.ts
    - lib/draft-on-scan-complete.integration.test.ts
  modified:
    - app/api/internal/scan-complete/route.ts

key-decisions:
  - "The integration test file is named lib/draft-on-scan-complete.integration.test.ts, not app/api/internal/scan-complete/route.integration.test.ts as 06-VALIDATION.md's map names it — the logic under test is the extracted lib helper (thin-route-over-tested-lib convention, matching app/api/admin/shortlist/route.ts over lib/triage-candidates.ts), and no precedent exists in this repo for constructing a NextRequest inside a test. Coverage is identical; this rename was called out in the plan itself, not discovered during execution."
  - "Gates 1-7 all resolve to outcome 'skipped' with a distinct reason string; only a null return from generateDraft() (and an unexpected Supabase throw during insert) resolves to 'failed' — this mirrors the plan's <behavior> block exactly, which reserves 'failed' for the generation step alone."
  - "The webhook's prospect branch wraps the awaited helper call in a .catch() even though maybeGenerateDraftForProspectScan itself never throws — defense in depth for T-06-BLAST, since the helper's own internal try/catch is the primary control and the route-level .catch() is a second, cheap backstop."
  - "scan.issues_alt is deliberately NOT added to the route's select() — the plan's Task 2 scoped the query change to prospect_id and pages only ('change nothing else about the query'); resolveTopIssueTitles() in lib/draft-generator.ts already handles issuesAlt being undefined by falling back to the scan's primary-locale issue titles, so this is a graceful degradation, not a bug."

patterns-established:
  - "First non-generation-logic caller of lib/draft-generator.ts — establishes that generateDraft() is a leaf function callers slot straight into DraftInput without adapters."

requirements-completed: [DRA-01]

coverage:
  - id: E1
    description: "A generic-contact-email prospect scan produces exactly one outreach_messages row with status 'draft', the scan id, and a non-empty subject/body"
    requirement: "DRA-01, D-6-05"
    verification:
      - kind: integration
        ref: "lib/draft-on-scan-complete.integration.test.ts#DRA-01/D-6-05: a generic contact email produces exactly one draft row"
        status: pass
    human_judgment: false
  - id: E2
    description: "Re-scanning the same prospect produces no second row and never overwrites an existing draft, including when its status is 'edited' or 'approved'"
    requirement: "D-6-05 (gate 7)"
    verification:
      - kind: integration
        ref: "lib/draft-on-scan-complete.integration.test.ts#re-scanning the same prospect produces NO second row..."
        status: pass
      - kind: integration
        ref: "lib/draft-on-scan-complete.integration.test.ts#a re-scan skips even when the existing draft's status is 'edited' or 'approved'"
        status: pass
    human_judgment: false
  - id: E3
    description: "No contact email, named-person contact type, and rejected lifecycle_state each produce no row and a skip outcome"
    requirement: "D-6-06, D-6-07, D-6-15/T-06-REJ"
    verification:
      - kind: integration
        ref: "lib/draft-on-scan-complete.integration.test.ts#D-6-07 / D-6-06 / D-6-15 tests"
        status: pass
    human_judgment: false
  - id: E4
    description: "A null prospect_id skips without querying prospects; an incomplete scan (wrong status, missing scores/summary) skips before any prospect lookup"
    requirement: "D-6-05 (gates 1-2)"
    verification:
      - kind: integration
        ref: "lib/draft-on-scan-complete.integration.test.ts#a null prospect_id.../a scan whose status is not 'completed'.../a scan with missing scores or summary..."
        status: pass
    human_judgment: false
  - id: E5
    description: "An injected generate() returning null produces no row, a 'failed' outcome, and does not throw"
    requirement: "D-6-05"
    verification:
      - kind: integration
        ref: "lib/draft-on-scan-complete.integration.test.ts#an injected generate that returns null..."
        status: pass
    human_judgment: false
  - id: E6
    description: "A score of 12 and a score of 88 both get a drafted row — proving no score threshold gates drafting"
    requirement: "D-6-08"
    verification:
      - kind: integration
        ref: "lib/draft-on-scan-complete.integration.test.ts#D-6-08: a low-scoring (12) and a high-scoring (88) prospect BOTH get a row..."
        status: pass
    human_judgment: false
  - id: E7
    description: "The prospect branch in the webhook sits strictly before the scan.email readiness guard, and the public-lead email path is untouched"
    requirement: "D-6-05, RESEARCH Pitfall 2, T-06-BLAST"
    verification:
      - kind: automated
        ref: "branch-order awk gate (maybeGenerateDraftForProspectScan line < scan.email line) + git diff showing zero changes to sendReportReadyEmail/sendAdminNotificationEmail call sites"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-07-28
status: complete
---

# Phase 6 Plan 5: Scan-Complete Draft Hook Summary

**`maybeGenerateDraftForProspectScan()` is the seven-gate eligibility check that turns a completed prospect scan into an automatic outreach draft, wired into the scan-complete webhook as a sibling branch that runs before the existing public-lead email guard — so a prospect scan (which carries no email by construction) never 400s before it ever reaches drafting.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-28T11:34:38+02:00 (from 06-04's completion commit)
- **Completed:** 2026-07-28T11:41:18+02:00
- **Tasks:** 2 completed
- **Files modified:** 3 (2 new, 1 modified)

## Accomplishments
- `lib/draft-on-scan-complete.ts` exports `maybeGenerateDraftForProspectScan(sb, scan, deps?)`: seven ordered gates (not-a-prospect-scan, scan-not-ready, prospect-not-found, no-contact-email, named-person-only, prospect-rejected, already-drafted), each returning a distinct skip reason, calling `generateDraft()` from 06-04 only after all seven pass, and inserting exactly one `outreach_messages` row on success
- `lib/draft-on-scan-complete.integration.test.ts`: 11 tests against a real local Postgres, covering every line of the plan's `<behavior>` block, run via RED (module-not-found) → GREEN (11/11 passing) TDD gates
- `app/api/internal/scan-complete/route.ts` gained the prospect branch, `prospect_id`/`pages` in the scan select, and `maxDuration = 60` — with the existing public-lead email path proven byte-identical via `git diff`

## Task Commits

Task 1 followed RED → GREEN (TDD):

1. **Task 1: Eligibility gate and draft insert, with a local-Supabase integration suite**
   - `1faa25c` test(06-05): add failing integration test for maybeGenerateDraftForProspectScan
   - `8fe0717` feat(06-05): add maybeGenerateDraftForProspectScan eligibility gate
2. **Task 2: Add the prospect branch to the scan-complete webhook**
   - `517f7ba` feat(06-05): hook draft generation into scan-complete webhook

**Plan metadata:** (this commit) docs(06-05): complete plan

_RED confirmed via `Cannot find module './draft-on-scan-complete'` (implementation file moved out of the working tree for the RED run, then restored); GREEN confirmed via `npx vitest run lib/draft-on-scan-complete.integration.test.ts` (11/11 passing against local Supabase) and the full `npm test` suite (297/297 passing)._

## Files Created/Modified
- `lib/draft-on-scan-complete.ts` — `ScanCompleteRow`, `DraftHookResult` types; `maybeGenerateDraftForProspectScan()`
- `lib/draft-on-scan-complete.integration.test.ts` — 11 tests, `seedProspect`/`seedScan` fixture builders, `afterEach` cascade cleanup (outreach_messages → scans → prospects) keyed on a `test-draft-hook-` domain prefix
- `app/api/internal/scan-complete/route.ts` — added `maxDuration = 60`, `prospect_id`/`pages` to the scan select, and the prospect branch (immediately after the scan fetch, before the `!scan.email` readiness guard)

## Decisions Made
- Named the integration test `lib/draft-on-scan-complete.integration.test.ts` per the plan's own explicit direction (06-VALIDATION.md's `app/api/internal/scan-complete/route.integration.test.ts` naming is superseded — recorded here as required by the plan's objective section).
- Reserved the `failed` outcome exclusively for `generateDraft()` returning null (and an unexpected Supabase throw on insert); every eligibility gate (1 through 7) resolves to `skipped` with its own reason string, matching the plan's `<behavior>` block precisely.
- The webhook's `.catch()` around the awaited helper call is deliberate defense-in-depth: `maybeGenerateDraftForProspectScan` already wraps its own body in try/catch and never throws, but the route-level catch costs one line and guarantees T-06-BLAST holds even if that internal contract is ever violated by a future edit.
- `scan.issues_alt` was not added to the route's select — Task 2's action explicitly scoped the query change to `prospect_id` and `pages` only. `generateDraft()`'s title-resolution helper already treats a missing `issuesAlt` as "use the primary-locale issue titles," so this is a known, accepted narrowing (draft copy for NL prospects quotes English issue titles until a future plan threads `issues_alt` through), not a defect introduced here.

## Deviations from Plan

None — plan executed exactly as written. Both tasks' acceptance criteria (grep gates, branch-order awk check, `git diff` byte-identity check, `tsc`/`lint`/`vitest` exit codes) were verified directly rather than assumed.

## Issues Encountered

None.

## Known Stubs

None. No hardcoded empty values, placeholder text, or unwired data sources were introduced by this plan.

## Threat Flags

None beyond the threats already named and mitigated in this plan's own `<threat_model>` (T-06-REJ, T-06-AUTH, T-06-PI, T-06-SSRF, T-06-KEY, T-06-BLAST) — no new network endpoint, auth path, or schema change was introduced outside that register.

## User Setup Required

None. `GEMINI_API_KEY` remains unset in this environment per the phase's environment notes (06-02 provisioning it in parallel); every integration test injects `deps.generate` and never constructs the real Gemini client. Manual verification of the live path — that a real bulk scan's scanner-service callback still results in an `outreach_messages` row despite the scanner-service's own 10-second callback timeout (RESEARCH assumption A1) — is deferred to phase-level verification, as the plan's own `<verification>` section specifies.

## Next Phase Readiness

- `maybeGenerateDraftForProspectScan` and its `DraftHookResult`/`ScanCompleteRow` types are ready for 06-06 (regenerate) and 06-08 (manual generate from the Shortlist) to reuse: both need the same "does a draft already exist" and "is this prospect eligible" logic, though 06-06's regenerate action is explicitly the deliberate-overwrite path this gate's gate 7 does NOT take.
- No open dependency specific to this plan. The Phase 8 hosted-LIA-URL gap (noted in 06-03-SUMMARY.md and 06-04-SUMMARY.md) still applies unchanged, since this plan calls `generateDraft()` without modification.

---
*Phase: 06-draft-generation-approval-queue*
*Completed: 2026-07-28*

## Self-Check: PASSED

All 4 created/modified files and all 3 task commit hashes (`1faa25c`, `8fe0717`, `517f7ba`) verified present on disk / in git history.
