---
phase: 06-draft-generation-approval-queue
plan: 07
subsystem: ui
tags: [admin, react, outreach-queue, next.js, accessibility]

requires:
  - phase: 06-draft-generation-approval-queue
    provides: "listOutreachDrafts/applyDraftEdit/approveDraft/rejectDraft/regenerateDraft and app/api/admin/outreach/route.ts (06-06)"
provides:
  - "components/admin/outreach-table.tsx — fourth admin tab, single-open expandable table, status filter, stat cards"
  - "components/admin/outreach-row-panel.tsx — editor + evidence pane + Article 14 block + approve/reject/regenerate/save actions"
  - "app/admin/page.tsx — Tab union extended with outreach, fetchOutreach wired identically to fetchShortlist"
affects: [06-08-manual-generate-shortlist, phase-7-lifecycle-reporting]

tech-stack:
  added: []
  patterns:
    - "In-DOM role=\"alertdialog\" confirmation (aria-modal, focus management, Escape cancels) replacing window.confirm() for actions whose exact copy is a stated acceptance criterion — window.confirm()/window.alert() are suppressible per-origin by the browser and return false/no-op silently, which makes a Regenerate or Reject button look dead with zero feedback and makes the required confirmation copy uninspectable in that state"
    - "Inline role=\"alert\" failure banner replacing window.alert() for the same suppressibility reason, across all four panel actions (Save edit, Regenerate, Approve, Reject)"

key-files:
  created:
    - components/admin/outreach-table.tsx
    - components/admin/outreach-row-panel.tsx
  modified:
    - app/admin/page.tsx
    - lib/draft-generator.ts
    - app/api/health/route.ts
    - lib/draft-prompt.ts
    - lib/draft-metric-selector.ts

key-decisions:
  - "expandedId is a single nullable string with no second piece of state tracking additional open rows (QUE-05, T-06-BULK) — grep-gated at zero `new Set` and zero `type=\"checkbox\"` occurrences in outreach-table.tsx."
  - "The cited-number highlight is applied in the evidence pane (labeled as the figure the draft is required to contain) rather than inside the draft body, because the body is an editable textarea that cannot carry inline markup — commented in the panel source per the plan's explicit either/or instruction."
  - "Both confirmation dialogs (Regenerate-when-edited, Reject) were rewritten from window.confirm() to an in-DOM role=\"alertdialog\" during Task 3 verification (deviation, see below) — window.confirm() is per-origin suppressible in Chrome and silently returns false when suppressed, which made both buttons appear dead with no error and made the required exact copy (T-06-SUP mitigation) impossible to verify on screen."
  - "All four panel actions were changed from window.alert() to an inline role=\"alert\" banner for the same suppressibility reason — a suppressed alert on failure is indistinguishable from an action that silently no-ops."

patterns-established:
  - "Single-open-row invariant enforced structurally (one nullable id, no collection type) rather than by convention — this is the pattern any future multi-item admin surface in this codebase should copy to make bulk actions structurally unrepresentable, not just discouraged."

requirements-completed: [QUE-01, QUE-02, QUE-03, QUE-04, QUE-05, DRA-06]

coverage:
  - id: D1
    description: "Fourth admin tab (Outreach) lists pending drafts worst-score-first, with a status filter (Pending/Approved/Rejected) and stat cards (Pending/Approved/Rejected/Total)"
    requirement: "QUE-01, D-6-04"
    verification:
      - kind: automated
        ref: "npx tsc --noEmit && npm run lint && npm run build (all exit 0); grep gates in 06-07-PLAN.md Task 1 acceptance criteria, all passing"
        status: pass
      - kind: manual_procedural
        ref: "Task 3 checklist item 2 (Default view) — verified live against seeded local Supabase, three pending rows ordered 31/44/57"
        status: pass
    human_judgment: false
  - id: D2
    description: "Single-open invariant: expandedId is one nullable string, opening a second row auto-collapses the first, no checkbox/select-all/bulk action exists anywhere on the tab"
    requirement: "QUE-05, T-06-BULK, D-6-02, D-6-R1"
    verification:
      - kind: automated
        ref: "grep -c expandedId >=3, grep -c 'new Set'==0, grep -c 'type=\"checkbox\"'==0 in outreach-table.tsx"
        status: pass
      - kind: manual_procedural
        ref: "Task 3 checklist item 1 (Single-open invariant) — expanding row B while row A was open collapsed row A on screen"
        status: pass
    human_judgment: false
  - id: D3
    description: "Expanded panel shows an editable draft (subject + body) beside its scan evidence (score, verdict, critical/major counts, top three issues, report link) without scrolling away from the draft"
    requirement: "QUE-04"
    verification:
      - kind: manual_procedural
        ref: "Task 3 checklist item 3 (Evidence alongside) — confirmed on screen"
        status: pass
    human_judgment: false
  - id: D4
    description: "The cited number in the draft matches the corresponding figure in the linked hosted report"
    requirement: "DRA-02, D-6-03"
    verification:
      - kind: manual_procedural
        ref: "Task 3 checklist item 4 (Cited number) — verified after fixing buildReportUrl's hardcoded production host (commit 813672e); confirmed against seeded fixture scans only, not a real crawl (see Known Stubs)"
        status: pass
    human_judgment: true
    rationale: "Requires reading a rendered figure in the panel against the same figure in the linked report and judging they match — not mechanically checkable without a browser."
  - id: D5
    description: "GDPR Article 14 notice renders as a read-only sibling block outside the textarea, captioned, and cannot be edited away"
    requirement: "D-6-12, DRA-05, T-06-A14"
    verification:
      - kind: automated
        ref: "grep -c 'GDPR ARTICLE 14 NOTICE'==1, grep -c 'pending counsel review'==1 in outreach-row-panel.tsx; markup confirmed outside the textarea element in source"
        status: pass
      - kind: manual_procedural
        ref: "Task 3 checklist item 5 (Article 14 block) — confirmed on screen"
        status: pass
    human_judgment: false
  - id: D6
    description: "Save edit flips status to EDITED; Regenerate confirms with the exact overwrite copy when already edited, and Cancel preserves the unsaved edit"
    requirement: "QUE-02, D-6-13, D-6-14"
    verification:
      - kind: manual_procedural
        ref: "Task 3 checklist item 6 (Edit and regenerate) — verified after replacing window.confirm() with an in-DOM alertdialog (commit 8b57343)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Reject dialog names the domain and states explicitly that rejection does not add the prospect to the suppression list"
    requirement: "QUE-03, D-6-15, T-06-SUP"
    verification:
      - kind: automated
        ref: "grep -c 'does not add them to the suppression list'==1 in outreach-row-panel.tsx"
        status: pass
      - kind: manual_procedural
        ref: "Task 3 checklist item 7 (Reject copy) — dialog text read verbatim after the alertdialog fix"
        status: pass
    human_judgment: false
  - id: D8
    description: "Tone of the first generated drafts reads as an acceptable, on-voice cold pitch before any are approved"
    requirement: "DRA-04"
    verification:
      - kind: manual_procedural
        ref: "Task 3 checklist item 8 (Tone) — Joshua read a live regenerated draft and approved it after the 06-03 prompt rewrite (commits 53c712f, 0b58ea7, bf29f8a, ea7762f, b6c52d0, 8f8a93a, b26afe3, 7972b0f)"
        status: pass
    human_judgment: true
    rationale: "Tone/voice acceptability is inherently a human editorial judgment, stated as such in the plan's own acceptance criteria."

duration: ~2h (includes verification-driven fixes and a prompt rewrite cycle)
completed: 2026-07-30
status: complete
---

# Phase 6 Plan 7: Outreach Review Queue UI Summary

**A fourth admin tab (Outreach) with a single-open expandable table and a review panel that puts an editable draft beside its scan evidence, verified end to end against a live seeded database — a pass that also caught and fixed five defects (one from 06-02, two from 06-04, two from this plan) and forced a full rewrite of the 06-03 pitch prompt after Joshua rejected the first generated copy.**

## Performance

- **Duration:** ~2h (2 implementation tasks plus an extended verification session that produced defect fixes and a prompt rewrite)
- **Completed:** 2026-07-30
- **Tasks:** 3 (2 auto, 1 checkpoint:human-verify)
- **Files modified:** 3 in this plan's own scope (`app/admin/page.tsx`, `components/admin/outreach-table.tsx`, `components/admin/outreach-row-panel.tsx`), plus defect fixes touching `lib/draft-generator.ts`, `app/api/health/route.ts`, `lib/draft-prompt.ts`, `lib/draft-metric-selector.ts` discovered during verification and attributed to their originating plans (06-02, 06-04)

## Accomplishments

- `app/admin/page.tsx`: `Tab` union extended with `"outreach"`, a fourth `TabButton` labelled "Outreach", `outreachRows`/`outreachLoading` state, and `fetchOutreach` modelled line for line on `fetchShortlist` (same secret header, same 401 handling, same error-banner pattern). Scans, Leads and Shortlist branches untouched.
- `components/admin/outreach-table.tsx`: stat-card row (Pending/Approved/Rejected/Total), a three-button status filter defaulting to Pending, a table reusing the Shortlist's row shell and `StatusPill`/`statusPillStyles` (extended with `draft`/`edited`/`approved`/`rejected` keys, not duplicated), and `expandedId: string | null` as the sole expansion state — opening a second row closes the first with no explicit collapse call.
- `components/admin/outreach-row-panel.tsx`: two-column responsive panel — editable subject/body on the left with a read-only GDPR Article 14 sibling block beneath the textarea, and a score/verdict/issue-count/top-three-issues/report-link evidence pane on the right. Four actions (Save edit, Regenerate, Approve draft, Reject prospect) each addressing one message id via a single fetch to `/api/admin/outreach`, each disabling its button in flight, each refetching on success.
- Verified end to end against a freshly reset local Supabase with five seeded rows (three pending at scores 31/44/57, one approved, one rejected): all eight manual checks in Task 3 passed, two (cited-number match, tone) requiring human judgment by design.
- Along the way, fixed five defects that blocked or would have silently broken the review surface (see Deviations), and rewrote the 06-03 pitch prompt after Joshua rejected the first generated copy on read (Check 8).

## Task Commits

1. **Task 1: Outreach tab wiring and the collapsed table** — `fd03352` feat(06-07): add Outreach tab wiring and collapsed table
2. **Task 2: Expanded review panel — editor, evidence pane, Article 14 block, actions** — `689ae7a` feat(06-07): add expanded review panel with evidence pane and actions
3. **Task 3: Verify the review surface against the manual-only criteria** — checkpoint, resolved by Joshua driving the live surface against seeded local Supabase; see Deviations for the fixes it produced

**Plan metadata:** (this commit) docs(06-07): complete plan

## Files Created/Modified

- `components/admin/outreach-table.tsx` — collapsed table, stat cards, status filter, `expandedId` single-open state
- `components/admin/outreach-row-panel.tsx` — editor, evidence pane, Article 14 block, four actions, in-DOM confirmation dialogs
- `app/admin/page.tsx` — `Tab` union, fourth tab button, `fetchOutreach`, conditional render branch

## Decisions Made

- The cited-number highlight lives in the evidence pane, labeled as the figure the draft is required to contain, rather than inside the editable textarea — the textarea cannot carry inline markup, and the plan's action text explicitly allowed either placement as long as the choice was commented. Commented in `outreach-row-panel.tsx`.
- `expandedId` is a plain `string | null`, never a `Set` or array, with the grep gates (`new Set`==0, `type="checkbox"`==0) enforcing this structurally rather than by convention, per T-06-BULK.
- Both confirmation dialogs (Regenerate-when-edited, Reject) moved from `window.confirm()` to an in-DOM `role="alertdialog"` (aria-modal, focus management, Escape cancels) during Task 3 verification. `window.confirm()` is suppressible per-origin in Chrome and silently returns `false` when suppressed — this made Regenerate and Reject look like dead buttons and made the required exact confirmation copy (a stated acceptance criterion, and the T-06-SUP mitigation) impossible to verify on screen.
- All four panel actions moved from `window.alert()` to an inline `role="alert"` banner for the identical reason: a suppressed alert on failure is indistinguishable from a silent no-op, which is worse than no feedback at all for an irreversible-feeling action.

## Deviations from Plan

### Auto-fixed Issues (found during Task 3 live verification)

**1. [Rule 1 - Bug] `buildReportUrl` hardcoded the production host**
- **Found during:** Task 3, Check 4 (cited number vs. linked report) — the "View full report" link was unusable outside production and could drift from `lib/email.ts`'s own base-URL logic.
- **Issue:** `lib/draft-generator.ts`'s `buildReportUrl()` hardcoded `https://scan.adashi.io` instead of reading `NEXT_PUBLIC_SITE_URL`.
- **Fix:** Read the report base URL from `NEXT_PUBLIC_SITE_URL`, matching `lib/email.ts`'s convention.
- **Files modified:** `lib/draft-generator.ts`
- **Commit:** `813672e` fix(06-04): read report base URL from NEXT_PUBLIC_SITE_URL
- **Amends:** Plan 06-04.

**2. [Rule 1 - Bug] Panel actions reported failures via `window.alert()`**
- **Found during:** Task 3 — Regenerate appeared to be a dead button with zero feedback in a browser that suppresses `alert()`.
- **Issue:** All four panel actions (Save, Regenerate, Approve, Reject) surfaced failures with `window.alert()`, which some browsers suppress silently.
- **Fix:** Replaced with an inline `role="alert"` banner.
- **Files modified:** `components/admin/outreach-row-panel.tsx`
- **Commit:** `8e168ff` fix(06-07): show action failures inline instead of a suppressed alert

**3. [Rule 2 - Missing Critical] `GEMINI_API_KEY` missing from the health check**
- **Found during:** Task 3 setup — draft generation had never once executed end to end in this environment; root cause traced to the health check's `REQUIRED_VARS` list omitting the key entirely, masking the missing credential.
- **Fix:** Added `GEMINI_API_KEY` to `app/api/health/route.ts`'s `REQUIRED_VARS`.
- **Files modified:** `app/api/health/route.ts`
- **Commit:** `f393036` fix(06-02): add GEMINI_API_KEY to the health check required vars
- **Amends:** Plan 06-02.

**4. [Rule 1 - Bug] Missing-key, timeout and thrown-error draft failures collapsed into one log line**
- **Found during:** Task 3 debugging — indistinguishable failure modes made root-causing the missing `GEMINI_API_KEY` slower than necessary.
- **Fix:** Distinguished missing-key, timeout, and API-error paths in the draft-generation error log.
- **Files modified:** `lib/draft-generator.ts`
- **Commit:** `6e4bfdc` fix(06-04): distinguish missing-key, timeout and API-error draft failures
- **Amends:** Plan 06-04.

**5. [Rule 1 - Bug] Confirmation dialogs used `window.confirm()`, silently returning `false` when suppressed**
- **Found during:** Task 3, Checks 6 and 7 (Regenerate, Reject) — both buttons appeared dead with no feedback, and their exact confirmation copy is a stated acceptance criterion that must be inspectable on screen.
- **Fix:** Replaced with an in-DOM `role="alertdialog"` confirmation (`aria-modal`, focus management, Escape cancels).
- **Files modified:** `components/admin/outreach-row-panel.tsx`
- **Commit:** `8b57343` fix(06-07): replace native confirm dialogs with an in-DOM confirmation

### Architectural rework (not a bug fix — a rejected editorial deliverable)

**6. [Rule 4 - user-directed] Pitch prompt rewritten after Joshua rejected the generated copy on read (Check 8, Tone)**

The first drafts read against DRA-04's tone requirement failed on read. This was not a code bug in the sense of broken logic — the prompt executed and produced text — but the text was not on-voice, and DRA-04's acceptance criterion is explicitly "Joshua reads and approves the first several drafts before the pattern is trusted." Joshua rejected the first pass and directed a prompt rewrite, which proceeded as a sequence of small TDD-covered changes rather than one large edit:

- `53c712f` feat(06-03): rewrite the cold-outreach pitch prompt
- `0b58ea7` feat(06-04): use the model-authored subject, with a code fallback
- `bf29f8a` feat(06-03): give the prompt one finding instead of a list
- `ea7762f` feat(06-03): pin informal register and greeting in the pitch prompt
- `b6c52d0` fix(06-04): let code own the report link instead of the model
- `8f8a93a` fix(06-04): keep a valid model subject when the BODY label is missing
- `b26afe3` feat(06-03): require a business-specific subject, not the example's
- `7972b0f` fix(06-03): informal register and real plurals in the citable-metric strings

Net effect: a code-owned `[RAPPORT]` token replaces the model authoring the report link (removing SSRF/hallucination surface from the link itself), an informal je-register with a "Hi," greeting, a model-authored subject with a code fallback, one finding cited instead of a list, and real singular/plural forms in the citable-metric strings. Measured before/after across live generations: subject fallback rate 3/6 → 0/6, distinct subjects 1/6 → 6/6.

- **Files modified:** `lib/draft-prompt.ts`, `lib/draft-generator.ts`, `lib/draft-metric-selector.ts`
- **Amends:** Plan 06-03 and 06-04.

---

**Total deviations:** 5 auto-fixed bugs/missing-critical (1 Rule 2, 4 Rule 1) plus 1 user-directed prompt rewrite.
**Impact on plan:** All five bug fixes were necessary for the review surface to be verifiable at all — the missing `GEMINI_API_KEY` entry meant this phase's central feature had never once executed end to end before this verification pass. The prompt rewrite was a direct response to a failed editorial checkpoint (DRA-04), not scope creep — Task 3's own instructions require the tone check to pass before the plan can be marked complete.

## Issues Encountered

**Root cause worth carrying into Phase 7:** `GEMINI_API_KEY` existed only in `scanner-service/.env`, which the Next.js runtime never loads. Plan 06-02 was marked complete on a human attestation with no machine check of the key's actual presence in the Next.js process, so draft generation had silently never run end to end until this verification session. The fix (defect 3 above) closes the immediate gap; the broader lesson is that "human attested this env var is set" is not equivalent to "the runtime that needs it can see it," and future phases should prefer a machine health check over an attestation wherever the two runtimes (Next.js / scanner-service) have separate env files.

## Known Stubs

**Check 4 (cited number vs. linked report) and Check 8 (tone) were verified against seeded fixture scans, not a real crawl.** The linked report rendered in English while the draft was Dutch during this verification pass. This is believed to be the seed fixture not setting `scan.locale` correctly rather than a product defect — `lib/draft-generator.ts` resolves locale from `prospect.country` only (an established, deliberate 06-04 decision, RESEARCH Pitfall 4), and the report page's own locale resolution is a separate, already-shipped code path this plan did not touch — but it was **not** confirmed against a real NL scan end to end. Recorded as an open follow-up for the next real crawl through this surface, not as a defect fixed in this plan.

## Threat Flags

None beyond the threats already named and mitigated in this plan's own `<threat_model>` (T-06-BULK, T-06-PI, T-06-AC, T-06-A14, T-06-SUP, T-06-SEND, T-06-SSRF, T-06-KEY). The code-owned `[RAPPORT]` token introduced during the prompt rewrite (defect 6) *reduces* T-06-SSRF surface relative to the original plan, since the model no longer authors the report URL at all — the link is now assembled entirely server-side, as the threat register already required.

## User Setup Required

None. `GEMINI_API_KEY` is provisioned in this environment per 06-02/06-06's established convention; the health-check fix (defect 3) makes its absence visible rather than requiring new setup.

## Next Phase Readiness

- The Outreach tab is feature-complete against QUE-01 through QUE-05 and DRA-06, verified live against seeded data with all eight manual checks passing.
- The 06-08 manual-generate action on Shortlist rows already targets this same queue library and route (06-06), and needs no further wiring from this plan.
- **Open follow-up, not a blocker:** confirm the cited-number-vs-report-locale match against a real NL crawl the first time this surface handles genuine production data, since the fixture-only verification could not rule out a fixture-specific locale gap.
- Phase 8 (hosted-LIA-URL, send-channel decision) remains the only standing external blocker; this plan touches neither.

---
*Phase: 06-draft-generation-approval-queue*
*Completed: 2026-07-30*

## Self-Check: PASSED

All 2 created files (`components/admin/outreach-table.tsx`, `components/admin/outreach-row-panel.tsx`) and all task/defect commit hashes (`fd03352`, `689ae7a`, `813672e`, `8e168ff`, `f393036`, `6e4bfdc`, `8b57343`, `53c712f`, `0b58ea7`, `bf29f8a`, `ea7762f`, `b6c52d0`, `8f8a93a`, `b26afe3`, `7972b0f`) verified present on disk / in git history.
