---
phase: 06-draft-generation-approval-queue
plan: 06
subsystem: api
tags: [outreach-queue, admin-api, state-machine, vitest, integration-test]

requires:
  - phase: 06-draft-generation-approval-queue
    provides: "computeVerdict()/getWeakestCategory() from lib/scoring.ts (06-01)"
  - phase: 06-draft-generation-approval-queue
    provides: "generateDraft()/buildReportUrl() and DraftInput/DraftDeps/GeneratedDraft types from lib/draft-generator.ts (06-04)"
  - phase: 06-draft-generation-approval-queue
    provides: "selectCitableMetric() from lib/draft-metric-selector.ts and localeForCountry()/Locale from lib/draft-prompt.ts (06-03)"
provides:
  - "lib/outreach-queue.ts — listOutreachDrafts/applyDraftEdit/approveDraft/rejectDraft/regenerateDraft/generateDraftForProspect, all single-record"
  - "app/api/admin/outreach/route.ts — GET/PATCH/POST, x-admin-secret auth, no bulk action"
affects: [06-07-outreach-tab-ui, 06-08-manual-generate-shortlist]

tech-stack:
  added: []
  patterns:
    - "Thin-route-over-tested-lib: all state-transition logic lives in lib/outreach-queue.ts, unit-testable against real Postgres without constructing HTTP requests (mirrors app/api/admin/shortlist/route.ts over lib/triage-candidates.ts)"
    - "Per-handler literal x-admin-secret check (not a shared auth helper) — the acceptance grep gate and the established route convention both require the comparison to appear verbatim in each handler"
    - "Local-Supabase integration harness copied verbatim from lib/suppression.integration.test.ts / lib/draft-on-scan-complete.integration.test.ts (env override at top of file, afterEach cascade cleanup keyed on a test-domain prefix)"

key-files:
  created:
    - lib/outreach-queue.ts
    - lib/outreach-queue.integration.test.ts
    - app/api/admin/outreach/route.ts
  modified: []

key-decisions:
  - "listOutreachDrafts() duplicates a small ~10-line localizedTopIssueTitles() helper rather than exporting lib/draft-generator.ts's private resolveTopIssueTitles() — that module's only declared job this phase is turning a scan into a draft, and exporting a second entry point from an unlisted file was a larger footprint than duplicating a pure function that composes two already-exported helpers (applyIssuesAlt, and the top-3 slice)."
  - "The three x-admin-secret/ADMIN_SECRET checks in app/api/admin/outreach/route.ts are NOT factored into a shared helper, even though the initial draft did exactly that. Reverted after the grep gate (>=3 occurrences each) failed at 1: the plan's acceptance criteria and the shortlist-route analog both require the literal comparison duplicated per handler, matching this codebase's copy-paste auth convention rather than introducing shared middleware."
  - "The 401 branch for GET/PATCH/POST was verified by reading each handler rather than by a live curl round-trip: a local `npm run dev` curl against both the new route and the pre-existing, working /api/admin/shortlist route returned an identical 307-to-/login redirect with no `/login` reference anywhere in the codebase — confirmed to be an environment-level interception unrelated to this change, not a regression, since it reproduces identically on unmodified code. The acceptance criteria's own phrasing (\"or assert the branch by reading the handler\") anticipates exactly this fallback."
  - "generateDraftForProspect() checks lifecycle_state === 'rejected' and contact_email presence but never contact_email_type — deliberate, matching D-6-06's whole reason for existing (clearing a named-person prospect by judgement)."

patterns-established:
  - "First caller of generateDraft() that loads its own prospect+scan context outside the scan-complete webhook (regenerateDraft, generateDraftForProspect) — both reuse the exact DraftInput shape lib/draft-on-scan-complete.ts established, no adapter needed."

requirements-completed: [QUE-01, QUE-02, QUE-03]

coverage:
  - id: E1
    description: "listOutreachDrafts with the pending filter returns only 'draft'/'edited' rows and excludes approved/rejected"
    requirement: "QUE-01, D-6-04"
    verification:
      - kind: integration
        ref: "lib/outreach-queue.integration.test.ts#pending filter returns only 'draft' and 'edited' rows, excludes approved/rejected"
        status: pass
    human_judgment: false
  - id: E2
    description: "listOutreachDrafts orders rows lowest overall score first"
    requirement: "D-6-04"
    verification:
      - kind: integration
        ref: "lib/outreach-queue.integration.test.ts#orders rows lowest overall score first"
        status: pass
    human_judgment: false
  - id: E3
    description: "Each row carries domain, locale, overall score, verdict, critical/major issue counts, top issue titles, cited metric and report URL, all derived fresh rather than read from a stale stored value"
    requirement: "QUE-01, D-6-03"
    verification:
      - kind: integration
        ref: "lib/outreach-queue.integration.test.ts#each row carries domain, locale, overall score, verdict, issue counts, top issues and cited metric"
        status: pass
    human_judgment: false
  - id: E4
    description: "applyDraftEdit overwrites subject/body and flips status draft->edited or edited->edited; rejects empty, whitespace-only, and over-length bodies without writing"
    requirement: "QUE-02, D-6-13"
    verification:
      - kind: integration
        ref: "lib/outreach-queue.integration.test.ts#applyDraftEdit (5 tests)"
        status: pass
    human_judgment: false
  - id: E5
    description: "approveDraft writes status/approved_by/approved_at only, leaves the send-dispatch columns null, and never changes the prospect's lifecycle_state"
    requirement: "QUE-02, D-6-16, D-6-R2"
    verification:
      - kind: integration
        ref: "lib/outreach-queue.integration.test.ts#approveDraft (2 tests)"
        status: pass
    human_judgment: false
  - id: E6
    description: "rejectDraft sets the message status to 'rejected' AND the prospect's lifecycle_state to 'rejected', and writes no row to suppressions"
    requirement: "QUE-03, D-6-15, T-06-REJ, T-06-SUP"
    verification:
      - kind: integration
        ref: "lib/outreach-queue.integration.test.ts#rejectDraft (2 tests)"
        status: pass
    human_judgment: false
  - id: E7
    description: "regenerateDraft overwrites body/subject and resets status to 'draft' on a real generate() result; a null result leaves the row completely unchanged"
    requirement: "QUE-02, D-6-14"
    verification:
      - kind: integration
        ref: "lib/outreach-queue.integration.test.ts#regenerateDraft (2 tests)"
        status: pass
    human_judgment: false
  - id: E8
    description: "generateDraftForProspect creates a first row for a named-person prospect and refuses a second row for a prospect that already has one"
    requirement: "D-6-06, D-6-14"
    verification:
      - kind: integration
        ref: "lib/outreach-queue.integration.test.ts#generateDraftForProspect (2 tests)"
        status: pass
    human_judgment: false
  - id: E9
    description: "The send boundary is grep-provable: no import of lib/suppression, lib/email, or lib/scanner-client; no reference to sent_at or List-Unsubscribe anywhere in lib/outreach-queue.ts"
    requirement: "D-6-16, T-06-SEND, T-06-SUP"
    verification:
      - kind: automated
        ref: "grep -c gates on lib/outreach-queue.ts (sent_at=0, List-Unsubscribe=0, @/lib/suppression=0, @/lib/email=0, @/lib/scanner-client=0, computeVerdict>=1, selectCitableMetric>=1, APPROVED_BY>=2)"
        status: pass
    human_judgment: false
  - id: E10
    description: "The admin route has exactly three handlers, each authenticated with the literal x-admin-secret/ADMIN_SECRET comparison, no handler accepts a collection of ids, and GET's error copy matches the UI contract"
    requirement: "T-06-AC, QUE-05, D-6-R1"
    verification:
      - kind: automated
        ref: "grep -c gates on app/api/admin/outreach/route.ts (x-admin-secret=3, ADMIN_SECRET=3, GET|PATCH|POST=3, ids=0, forbidden-imports=0, 'Failed to fetch drafts'=1)"
        status: pass
    human_judgment: false
  - id: E11
    description: "tsc/lint/build all succeed and the full suite passes with the new files in place"
    requirement: "verification section"
    verification:
      - kind: automated
        ref: "npx tsc --noEmit; npm run lint; npm run build; npm test"
        status: pass
    human_judgment: false

duration: ~15min
completed: 2026-07-28
status: complete
---

# Phase 6 Plan 6: Outreach Queue Library and Admin API Summary

**`lib/outreach-queue.ts` is the single-record state machine behind the Outreach tab — list, edit, approve, reject, regenerate, and manually generate — with `approveDraft()` provably stopping at three columns and `rejectDraft()` provably never touching the suppression table; `app/api/admin/outreach/route.ts` is the thin GET/PATCH/POST surface over it, authenticated exactly like every other admin route.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-28
- **Tasks:** 2 completed
- **Files created:** 3 (1 modified along the way inside Task 2, reverted back before commit — see Decisions)

## Accomplishments

- `lib/outreach-queue.ts` exports `listOutreachDrafts`, `applyDraftEdit`, `approveDraft`, `rejectDraft`, `regenerateDraft`, and `generateDraftForProspect` — every function addresses exactly one `outreach_messages` row or one prospect by id (QUE-05, D-6-R1), and none of them import `lib/suppression`, `lib/email`, or `lib/scanner-client` (grep-gated)
- `lib/outreach-queue.integration.test.ts`: 16 tests against a real local Postgres (exceeds the 13-test floor), run via RED (module-not-found, confirmed by temporarily moving the implementation out of the working tree) → GREEN (16/16 passing)
- `app/api/admin/outreach/route.ts`: `GET` (status filter, defaults to pending), `PATCH` (single id + edit/approve/reject/regenerate action), `POST` (single prospectId, manual generate) — three handlers, each with its own literal `x-admin-secret` check, matching `app/api/admin/shortlist/route.ts`'s convention verbatim

## Task Commits

Task 1 followed RED → GREEN (TDD):

1. **Task 1: Outreach queue library and its state transitions**
   - `115195f` test(06-06): add failing integration test for outreach queue transitions
   - `5741858` feat(06-06): add outreach queue library with list/edit/approve/reject/regenerate
2. **Task 2: Admin outreach API route**
   - `440b79f` feat(06-06): add admin outreach API route (GET/PATCH/POST)

**Plan metadata:** (this commit) docs(06-06): complete plan

_RED confirmed via `Cannot find module './outreach-queue'` (implementation file moved to /tmp for the RED run, then restored); GREEN confirmed via `npx vitest run lib/outreach-queue.integration.test.ts` (16/16 passing against local Supabase) and the full `npm test` suite (313/313 passing)._

## Files Created/Modified

- `lib/outreach-queue.ts` — `OutreachFilter`, `OutreachQueueRow`, `OutreachActionResult`, `OutreachCreateResult`, `APPROVED_BY`, `MAX_DRAFT_SUBJECT_LENGTH`, `MAX_DRAFT_BODY_LENGTH`, and the six exported functions
- `lib/outreach-queue.integration.test.ts` — 16 tests, `seedProspect`/`seedScan`/`seedMessage` fixture builders, `afterEach` cascade cleanup (outreach_messages → scans → prospects) keyed on a `test-outreach-queue-` domain prefix
- `app/api/admin/outreach/route.ts` — `GET`/`PATCH`/`POST` handlers, `runtime = "nodejs"`

## Decisions Made

- `listOutreachDrafts()` derives verdict and cited metric fresh on every call via `computeVerdict()` (06-01) and `selectCitableMetric()` (06-03) rather than reading any stored copy, so the evidence pane can never drift from the one verdict function or the one number the draft was told to cite.
- Duplicated a small `localizedTopIssueTitles()` helper (~10 lines) rather than exporting `lib/draft-generator.ts`'s private `resolveTopIssueTitles()` — kept this plan's file footprint to the three files it declared, at the cost of one small duplicated pure function.
- The three auth checks in the admin route are deliberately NOT factored into a shared helper. An initial draft did exactly that and the `x-admin-secret`/`ADMIN_SECRET` grep gates (which require ≥3 occurrences each — one per handler) failed at 1. Reverted to the literal per-handler comparison, matching both the acceptance criteria and the shortlist route's established copy-paste convention.
- The 401 branch was verified by reading each handler's auth check rather than by a live curl round-trip against `npm run dev`: curling both the new route and the pre-existing `/api/admin/shortlist` route (unmodified, known-working) with no `x-admin-secret` header returned an identical 307 redirect to `/login` — a string that appears nowhere in this codebase, confirming an environment-level interception unrelated to either route. The acceptance criteria's own alternative ("or assert the branch by reading the handler") covers exactly this case.
- `generateDraftForProspect()` checks `lifecycle_state === 'rejected'` (D-6-14: a rejected prospect stays rejected unless Joshua explicitly regenerates via this manual path) but deliberately never checks `contact_email_type` — that omission is the entire reason this function exists (D-6-06).

## Deviations from Plan

None beyond the auth-helper false start described above, which was caught and reverted before any commit — the committed code matches the plan's action text and acceptance criteria exactly.

## Issues Encountered

None.

## Known Stubs

None. No hardcoded empty values, placeholder text, or unwired data sources were introduced by this plan.

## Threat Flags

None beyond the threats already named and mitigated in this plan's own `<threat_model>` (T-06-AC, T-06-VAL, T-06-REJ, T-06-SUP, T-06-SEND, T-06-BULK, T-06-PI, T-06-SSRF, T-06-KEY) — no new network endpoint, auth path, or schema change was introduced outside that register. No migration was authored (per the plan's own critical-constraints note: `outreach_messages` and `prospects.lifecycle_state` already carry every column this plan needed).

## User Setup Required

None. `GEMINI_API_KEY` remains unset in this environment; every integration test injects `deps.generate` and never constructs the real Gemini client, matching 06-04/06-05's established test convention.

## Next Phase Readiness

- `listOutreachDrafts`, `applyDraftEdit`, `approveDraft`, `rejectDraft`, `regenerateDraft`, and the three-handler `app/api/admin/outreach/route.ts` are ready for 06-07 (the Outreach tab UI) to call directly — the `OutreachQueueRow` shape already carries every field the UI-SPEC's evidence pane needs (domain, locale, score, verdict, issue counts, top issue titles, cited metric, report URL).
- `generateDraftForProspect` and the route's `POST` handler are ready for 06-08 (manual "Generate draft" action on named-person Shortlist rows) to call with no adapter needed.
- No open dependency specific to this plan. The Phase 8 hosted-LIA-URL gap and the send-channel decision noted in prior summaries still apply unchanged — this plan touches neither.

---
*Phase: 06-draft-generation-approval-queue*
*Completed: 2026-07-28*

## Self-Check: PASSED

All 3 created files and all 3 task commit hashes (`115195f`, `5741858`, `440b79f`) verified present on disk / in git history.
