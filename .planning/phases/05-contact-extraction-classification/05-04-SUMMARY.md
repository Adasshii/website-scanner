---
phase: 05-contact-extraction-classification
plan: 04
subsystem: ui

tags: [supabase, admin, shortlist, contact-classification, railway, vercel, production-verification]

# Dependency graph
requires:
  - phase: 05-contact-extraction-classification (05-01, 05-02, 05-03)
    provides: migration 018 (contact_email_type + CHECK), lib/contact-extraction.ts aggregateContacts(), reconcileInFlightScans() writing contact_email/contact_email_type/commercial_contact_invited/sole_proprietorship on the done transition
provides:
  - "ShortlistRow.contact_email_type read into the existing admin Shortlist (lib/triage-candidates.ts)"
  - "NAMED-PERSON pill on shortlist-table.tsx for contact_email_type === 'named-person', mirroring the CRITICAL/UNREACHABLE pattern with the orange/major token palette"
  - "migration 018 applied to the live Supabase project"
  - "scanner-service (extractor harvest) deployed to Railway from aeb38c4"
  - "Prospect Radar app deployed to Vercel production (scan.adashi.io) from aeb38c4"
  - "first real-batch confirmation that contact_email populates from a live scan (2 of the 11 physiotherapy prospects verified done with generic contact_email; remainder queued or failed at checkpoint close)"
affects: [phase-06-outreach-drafting]

# Tech tracking
tech-stack:
  added: []
  patterns: ["priority-cell pill pattern extended a third time (CRITICAL / UNREACHABLE / NAMED-PERSON), always reading a stored classification, never adding a filter or new admin surface"]

key-files:
  created: []
  modified:
    - lib/triage-candidates.ts
    - components/admin/shortlist-table.tsx

key-decisions:
  - "CON-05 is delivered as visibility-only in this plan (D-5-02): the pill flags a named-person-only prospect for manual review by reading contact_email_type. Keeping such prospects out of an automated default outreach flow is Phase 6's job once that flow exists — there is no outreach flow yet for the enforcement half to apply to. REQUIREMENTS.md CON-05 was already marked Complete during 05-03 on the storage half; this plan supplies the visibility half the checkbox was scoped against, so the status stands as-is with this caveat recorded here rather than being re-litigated."
  - "The live migration (018) was applied via the Supabase Dashboard SQL Editor, never `supabase db push`, matching this project's existing convention for prior migrations."
  - "The 3 re-queued prospects were re-armed by scoping the reset UPDATE to `contact_email is null`, so no already-completed work was put at risk when 'Run batch' subsequently armed the full eligible pool (armBatch's normal behavior, not a bug)."

requirements-completed: [CON-05]

coverage:
  - id: D1
    description: "ShortlistRow carries contact_email_type and getShortlist() selects it (read path, no new fetch)"
    requirement: "CON-05"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (green) + grep -q 'contact_email_type' lib/triage-candidates.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "shortlist-table.tsx renders a NAMED-PERSON pill in the priority cell only when contact_email_type === 'named-person', using the orange/major token palette, with no new filter/column/route"
    requirement: "CON-05"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (green) + grep -q 'NAMED-PERSON' components/admin/shortlist-table.tsx"
        status: pass
    human_judgment: true
    rationale: "Visual placement, color distinction from CRITICAL/UNREACHABLE, and absence of unwanted row-priority border treatment are visual judgment calls not covered by the grep/tsc checks — no named-person example appeared in the live batch to screenshot-verify against (see Known Gaps)."
  - id: D3
    description: "Migration 018 is live on the production Supabase project (commercial_contact_invited, sole_proprietorship, contact_email_type + CHECK constraint columns exist on prospects)"
    verification:
      - kind: manual_procedural
        ref: "Supabase Dashboard SQL Editor: select column_name from information_schema.columns where table_name='prospects' and column_name in ('commercial_contact_invited','sole_proprietorship') returned both rows"
        status: pass
    human_judgment: false
  - id: D4
    description: "scanner-service (extractor harvest) deployed to Railway from commit aeb38c4, and the Vercel app deployed to production from the same commit"
    verification:
      - kind: manual_procedural
        ref: "Railway dashboard: Deployment successful, Deployed via GitHub, commit message matches aeb38c4; Deploy Logs show 'Scanner service running on port 8080'. Vercel: npx vercel --prod -> readyState READY, aliased to scan.adashi.io; curl https://scan.adashi.io/api/health -> 200 {status:ok, db.ok:true}"
        status: pass
    human_judgment: false
  - id: D5
    description: "A real batch against production confirms contact_email populates from a live scan with correct generic classification"
    verification:
      - kind: manual_procedural
        ref: "Supabase SQL Editor spot-check: favrolijk.nl and fysiovolkers.nl both scan_status=done, contact_email populated, contact_email_type=generic"
        status: pass
    human_judgment: true
    rationale: "Only 2 of the 11-prospect batch had drained by checkpoint close (Vercel Hobby cron fires once daily, not every 10 minutes); 6 failed (pre-existing Unreachable triage signal, not independently confirmed via scan_status_reason) and ~10 remained queued. No named-person example appeared, so that classification path has no live confirmation yet — recorded as a known gap, not verified complete."
duration: "~2 days elapsed (blocking human-gated checkpoint spanning live migration, two production deploys, and a daily-cron-gated batch drain); active build time for Task 1 was under 10 minutes"
completed: 2026-07-26
status: complete
---

# Phase 05 Plan 04: Shortlist NAMED-PERSON pill + production ship-and-verify Summary

**Admin Shortlist now flags named-person-only prospects via a stored-classification pill; migration 018, scanner-service, and the app are all live in production, with a first real batch confirming `contact_email` populates end-to-end (generic classification, 2/2 verified).**

## Performance

- **Duration:** ~2 days elapsed (checkpoint-gated: live migration + Railway deploy + Vercel deploy + daily-cron batch drain), active build ~10 min
- **Started:** 2026-07-24T19:00:00Z (Task 1)
- **Completed:** 2026-07-26T22:20:00Z (checkpoint approved, plan closed)
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `ShortlistRow` gains `contact_email_type: string | null`; `getShortlist()` selects it — no new fetch, the column flows straight through the existing shortlist route/admin page/table props.
- `shortlist-table.tsx` renders an orange/amber `NAMED-PERSON` pill in the existing priority cell for `contact_email_type === 'named-person'`, mirroring the CRITICAL/UNREACHABLE pill pattern with no new filter, column, route, or admin surface (D-5-02).
- Migration 018 applied live via the Supabase Dashboard SQL Editor (not `supabase db push`), confirmed by querying `information_schema.columns` for the new `prospects` columns.
- scanner-service deployed to Railway (git-connected auto-build off `origin/main` at aeb38c4) and confirmed healthy via the Railway dashboard and deploy logs.
- The Prospect Radar app deployed to Vercel production (`npx vercel --prod`), aliased to `scan.adashi.io`, confirmed via `/api/health` returning 200.
- A real batch against 2 previously-scanned-by-old-extractor prospects (re-queued via a `contact_email is null`-scoped reset) confirmed the new extractor populates `contact_email` and `contact_email_type=generic` end-to-end in production (favrolijk.nl, fysiovolkers.nl).

## Task Commits

Each task was committed atomically:

1. **Task 1: Shortlist NAMED-PERSON pill (getShortlist + ShortlistRow + table)** - `aeb38c4` (feat)
2. **Task 2: Ship & verify — live migration, deploys, real-batch extraction check** - human-gated checkpoint; no code commit (production actions only: Supabase SQL Editor, Railway auto-deploy trigger, `npx vercel --prod`, admin "Run batch")

**Plan metadata:** pending (this commit)

## Files Created/Modified
- `lib/triage-candidates.ts` - `ShortlistRow` interface + `getShortlist()` select list gain `contact_email_type`
- `components/admin/shortlist-table.tsx` - `NAMED-PERSON` pill added to the priority cell, orange/major token palette, with a comment noting outreach-flow exclusion is Phase 6's job

## Decisions Made
- CON-05 is delivered as visibility-only here (D-5-02): the pill is the "flagged for manual review" half. The "never enters the default outreach flow automatically" half has no automated outreach flow to apply to yet — that's Phase 6's job once drafting/sending exists. REQUIREMENTS.md's CON-05 checkbox, set to Complete during 05-03 (storage half), now has its visibility half also shipped; left as Complete rather than reopened, since the plan explicitly scoped CON-05's phase-05 delivery to storage + visibility only.
- Migration 018 applied via Supabase Dashboard SQL Editor per existing project convention (never `supabase db push` against the live project).
- The 3 re-queued verification prospects were reset via an UPDATE scoped to `contact_email is null`, so clicking "Run batch" (which arms the full eligible pool per normal `armBatch` behavior, not just the 3) could not put any already-completed prospect's data at risk.

## Deviations from Plan

None - plan executed exactly as written. Task 1 code matches the plan's acceptance criteria; Task 2's checkpoint was executed by the orchestrator/Joshua exactly per the plan's `<how-to-verify>` steps, in the specified order (migration before both deploys).

## Issues Encountered

- **Vercel Hobby-tier cron constraint** (pre-existing, not a phase-5 regression): the drain cron fires once daily at 07:00 UTC rather than the originally-designed 10-minute tick, so most of the 11-prospect batch was still `queued` when this checkpoint closed rather than fully drained. This is documented project-wide (see MEMORY.md `reference_website_scanner_deploy_and_crons.md`), not new to this plan.
- **6 of the batch failed** (mollerino.nl, frankderotte.nl, fysiotherapierijsenhout.nl, hosfysiotherapie.nl, instituut-ares.nl, uwcoachinbeweging.nl). All six carried the `Unreachable` triage signal in the admin Shortlist UI *before* this scan batch ran. This is the most likely explanation and is not believed to be a phase-5 regression — but the exact `scan_status_reason` per failed row was not independently queried, so this is an inference from the pre-existing triage signal, not a confirmed root cause.

## Known Gaps (Not Verified)

- **Named-person classification path has no live production example.** All 2 confirmed-done prospects in this batch resolved to `generic`. The named-person branch (and therefore the NAMED-PERSON pill's real-world rendering) remains covered only by the 05-02 unit tests (23 passing) and 05-03 integration tests (4 cases against local Supabase) — not a real-world production instance. Flag for the next batch that includes a named-person-only site.
- **~10 of the 11-prospect batch were still `queued`** at checkpoint close, pending the next daily drain tick. Their extraction outcome is unconfirmed.
- **Failed-domain root cause is inferred, not hard-confirmed.** The pre-existing `Unreachable` triage signal is the working explanation for the 6 failures, but `scan_status_reason` was not pulled per row to confirm.

## User Setup Required
None remaining - the checkpoint's required external actions (migration, Railway deploy, Vercel deploy) are complete; no further manual configuration is outstanding for this plan.

## Next Phase Readiness
- CON-05 is fully delivered for phase 5's scope: stored classification (05-03) + visible flag (05-04 Task 1). Enforcement against an automated outreach flow is explicitly Phase 6's responsibility once that flow exists.
- The full pipeline (extractor on Railway, wiring on Vercel, migration 018 live) is proven end-to-end against at least 2 real prospects; a named-person live example and the remaining ~10 queued prospects are open items to watch as the daily drain continues, not blockers to closing this phase.
- Phase 05 is now 4/4 plans complete.

---
*Phase: 05-contact-extraction-classification*
*Completed: 2026-07-26*

## Self-Check: PASSED
- FOUND: lib/triage-candidates.ts
- FOUND: components/admin/shortlist-table.tsx
- FOUND commit: aeb38c4
