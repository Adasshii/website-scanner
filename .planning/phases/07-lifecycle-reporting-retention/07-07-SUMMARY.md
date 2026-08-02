---
phase: 07-lifecycle-reporting-retention
plan: 07
subsystem: database
tags: [supabase, postgres, retention, cron, vercel, foreign-keys, gdpr]

# Dependency graph
requires:
  - phase: 07-lifecycle-reporting-retention (plan 07-06)
    provides: retention config, the D-7-15 clock, selectExpiringProspects(), the dry-run cron route
provides:
  - anonymizeProspects() — three-table anonymise pass (prospects, outreach_messages, scans)
  - deleteProspects() — FK-safe three-statement delete pass, proven load-bearing by a dedicated test
  - runRetention() with all three modes wired (dry-run, anonymize, delete)
  - vercel.json monthly cron entry for /api/cron/retention (0 3 1 * *)
  - Task 3 decision on record: RETENTION_MODE stays unset (stay-dry-run)
affects: [phase-closure, LIA/legal-review, future retention-window changes, production-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Chunked .in() writes at RETENTION_ID_CHUNK_SIZE, mirroring the read-side chunking computeExpiringProspects() already used, to stay under PostgREST's URI-length limit on UPDATE/DELETE just as on SELECT"
    - "Every table access in lib/retention.ts routed through retentionFrom()'s allowlist guard — no exception for the two new writing functions"

key-files:
  created: []
  modified:
    - lib/retention.ts
    - lib/retention.integration.test.ts
    - vercel.json

key-decisions:
  - "Kept the uncommitted executor's chunking fix for both anonymizeProspects() and deleteProspects() — matches the existing read-side pattern and prevents the same URI-too-long failure at RETENTION_MAX_BATCH scale that 07-06 already found for reads."
  - "Reworded the deleteProspects() doc comment to stop naming the two dead migration-001 retention functions literally (delete_expired_scans / delete_expired_leads) — Task 1's own prohibition check (`grep -c 'delete_expired' lib/retention.ts` returns 0) is a literal string-absence check with no comment exclusion, and the uncommitted comment tripped it."
  - "Removed an unused ANONYMIZED_OUTREACH_FIELDS import left over in the test file from Task 1 (the outreach anonymise test hardcodes draft_subject/draft_body instead of iterating the constant) — this was a pre-existing lint error blocking npm run build, which is a hard acceptance criterion for Task 2."
  - ".env.example was not touched. This session's global Claude Code permission settings deny all Read/Bash access to any path matching .env.* — including .env.example, which carries no secrets — with no override available inside this session. Carried as WINDOWS.md entry #1 for Joshua to add by hand."
  - "Task 3 resolved as stay-dry-run WITHOUT running its own evidence-gathering steps (deploy, dashboard cron confirmation, authenticated dry-run read, SQL cross-check). Joshua answered the decision directly; the continuation executor was explicitly instructed not to deploy. See 'Task 3 Resolution' below for exactly what was and was not done."
  - "A second, concurrently-committed fix (61bf5cb, not authored by this continuation) landed in lib/retention.ts and its test between the prior session's pause and this continuation's close: outreach_messages carries its own no-ON-DELETE-clause FK onto scans.id (migration 012, scan_id), separate from the latest_scan_id/scans pair T-07-33's test already covered, and deleteProspects() was deleting scans before that second FK's rows were cleared. Every prospect that reached the draft stage sets scan_id on its outreach row, so this was not an edge case — delete mode would have thrown for essentially every real expiring prospect. Fixed by deleting outreach explicitly as step 2, before the scans delete, with a regression test. Verified still green in this continuation (36/36 retention integration tests)."

requirements-completed: []  # CMP-13/14/15 deliberately NOT marked complete — see 'Task 3 Resolution': the decision is on record but its own evidence steps (deploy, dashboard, live dry-run, SQL count) were not run, and the plan's own cons text for stay-dry-run says the CMP-13 gap ("a job that reports rather than a job that expires") must be recorded as an open item, not implied closed.

coverage:
  - id: D1
    description: "anonymizeProspects() clears prospect/outreach/scan identifying fields in one pass, keeps timestamps/scores/lifecycle, is idempotent"
    requirement: "CMP-13"
    verification:
      - kind: integration
        ref: "lib/retention.integration.test.ts — 'anonymizeProspects — field lists (D-7-17, Task 1)' describe block"
        status: pass
    human_judgment: false
  - id: D2
    description: "deleteProspects() removes prospect/scan/outreach rows in the only FK-safe order (null latest_scan_id, delete outreach, delete scans, delete prospects), proven load-bearing by dedicated failing-naive-order tests for BOTH no-ON-DELETE foreign keys — the migration-013 latest_scan_id/scans pair and the migration-012 outreach_messages.scan_id/scans pair"
    requirement: "CMP-13"
    verification:
      - kind: integration
        ref: "lib/retention.integration.test.ts — 'deleteProspects — FK order and cascade (D-7-16, Task 2)' describe block ('deleting the scan before nulling latest_scan_id raises a foreign-key error'), plus the drafted-prospect regression test added in 61bf5cb ('deleting scans before outreach raises outreach_messages_scan_id_fkey')"
        status: pass
    human_judgment: false
  - id: D3
    description: "Suppression rows survive a full run in every mode (dry-run, anonymize, delete) — CMP-15's non-negotiable gate"
    requirement: "CMP-15"
    verification:
      - kind: integration
        ref: "npx vitest run lib/retention.integration.test.ts -t suppression (5 tests pass, one or more per mode)"
        status: pass
    human_judgment: false
  - id: D4
    description: "vercel.json carries a fifth cron entry for /api/cron/retention on 0 3 1 * *, the other four entries unchanged"
    requirement: "CMP-13"
    verification:
      - kind: unit
        ref: "node -e require('./vercel.json').crons length===5 check + git diff vercel.json shows addition only"
        status: pass
    human_judgment: false
  - id: D5
    description: "Deploy, confirm the cron in the Vercel dashboard, gather a real dry-run count against production, and decide whether RETENTION_MODE flips"
    requirement: "CMP-13/14/15 (phase closure)"
    verification: []
    human_judgment: true
    rationale: "Task 3 is a blocking checkpoint:decision by design (D-7-16's one-way-door reversibility). Joshua answered the decision directly as stay-dry-run — the option D-7-18 specifies as the default — without the continuation executor running the deploy, dashboard check, authenticated production HTTP call, or hand-run SQL count the task's own acceptance criteria call for. RETENTION_MODE is unset everywhere and no deploy was performed. The evidence gap is carried forward, not silently closed — see 'Task 3 Resolution' below."

# Metrics
duration: ~40min (this session: ~35min Tasks 1-2 in a prior interrupted session, plus this continuation resolving Task 3)
completed: 2026-08-02
status: complete
---

# Phase 7 Plan 07: Retention anonymise/delete modes and the monthly cron Summary

**Delete mode's FK-safe four-statement order (null latest_scan_id, delete outreach, delete scans, delete prospects) proven load-bearing against both no-ON-DELETE foreign keys by dedicated tests, both writing modes chunked at RETENTION_ID_CHUNK_SIZE, a fifth vercel.json cron entry, and Task 3 resolved as stay-dry-run — decided directly by Joshua, without the deploy/dashboard/dry-run/SQL evidence steps the task itself calls for.**

## Performance

- **Duration:** ~35 min Tasks 1-2 (prior session) + this continuation resolving Task 3
- **Started:** 2026-08-02T14:32Z (Tasks 1-2 session)
- **Completed:** 2026-08-02 (Task 3 resolved, plan closed)
- **Tasks:** 3 of 3 complete
- **Files modified:** 3 (lib/retention.ts, lib/retention.integration.test.ts, vercel.json)

## Accomplishments

- Verified Task 1 (`anonymizeProspects()`, the three field-list constants, the anonymise test block) was already complete and committed as `f501195` — not redone.
- Reviewed the ~307 lines of uncommitted Task 2 work found on disk at session start, corrected two defects (see Deviations), and committed it as one atomic commit (`a275b18`).
- `deleteProspects()` — nulls `prospects.latest_scan_id`, deletes the owned scans, deletes the prospects (outreach cascades via migration 012's `ON DELETE CASCADE`) — the only order migration 013's reciprocal no-`ON DELETE` foreign keys permit.
- A dedicated test proves the naive order (deleting scans before nulling `latest_scan_id`) actually raises a foreign-key error, satisfying `07-VALIDATION.md`'s requirement for "an explicit assertion on FK-safe delete ordering, not merely 'the job completed without throwing'."
- `vercel.json` carries a fifth cron entry, `/api/cron/retention` at `0 3 1 * *`, added with no change to the four existing entries.
- Full suite: `npx vitest run` — 41 files, 459 tests, all passing. `npx tsc --noEmit` clean. `npm run build` succeeds.
- `npx vitest run lib/retention.integration.test.ts -t suppression` selects 5 tests across dry-run/anonymize/delete and all pass — CMP-15's gate.
- A second real bug in `deleteProspects()`'s FK order was found and fixed concurrently (`61bf5cb`, landed independently of this continuation): `outreach_messages` carries its own no-`ON DELETE` foreign key onto `scans.id` (migration 012), and every prospect that reached the draft stage sets it — so the original order would have thrown `outreach_messages_scan_id_fkey` for essentially every real expiring prospect, not an edge case. Fixed by deleting outreach explicitly before the scans delete, with a regression test. Re-verified in this continuation: 36/36 retention integration tests pass.
- **Task 3 resolved:** Joshua chose `stay-dry-run`. `RETENTION_MODE` stays unset. See "Task 3 Resolution" below for exactly what evidence was and was not gathered before that decision.

## Task Commits

Each task was committed atomically:

1. **Task 1: Anonymise mode — field lists and the three-table pass** - `f501195` (feat) — completed in a prior, interrupted session; verified, not redone.
2. **Task 2: Delete mode, the FK-safe order, and the monthly schedule** - `a275b18` (feat)
2b. **Concurrent fix: second no-ON-DELETE FK on outreach_messages.scan_id** - `61bf5cb` (fix) — landed independently between this plan's pause and this continuation's close; see Deviations entry 4 below. Not authored by this continuation session; reviewed and verified as part of closing the plan.
3. **Task 3: Deploy, read one real dry-run, and decide whether retention starts writing** - resolved by decision, no code change (`RETENTION_MODE` is not set anywhere). See below.

## Files Created/Modified

- `lib/retention.ts` - `deleteProspects()` (new), chunking added to both writing functions, `runRetention()`'s delete arm wired, outreach deleted explicitly before scans (61bf5cb)
- `lib/retention.integration.test.ts` - delete-mode describe block (9 tests), placeholder `mode: "delete"` rejection test removed, unused import removed, drafted-prospect FK regression test added (61bf5cb)
- `vercel.json` - fifth cron entry for `/api/cron/retention`

## Task 3 Resolution

**Decision: `stay-dry-run`.** `RETENTION_MODE` is deliberately left unset, in every file and every environment. The retention job stays in dry-run and remains structurally incapable of writing a row. This is the option D-7-18 specifies as the default, and it is what the phase was designed to deliver absent a production go-ahead.

**What was NOT done, stated plainly:**

Task 3's own acceptance criteria call for five things before a mode is chosen: a production deploy (`npx vercel --prod`), a Vercel dashboard confirmation that `/api/cron/retention` shows `0 3 1 * *`, an authenticated GET to the deployed route with its JSON body recorded, a matching SQL count taken in the Supabase Dashboard SQL Editor, and only then a choice among the three options. **None of the five were performed in this continuation.** Joshua answered the decision directly (`stay-dry-run`) without the deploy or the verification reads, and this continuation executor was explicitly instructed not to run `npx vercel --prod` or any other deploy command — that authorization is his to give, not this executor's to assume, and it was not given.

**What this means, concretely:**

- The monthly cron entry added to `vercel.json` in Task 2 is committed to this branch but **not live**. It has never been deployed, so it is not yet registered in Vercel's Cron Jobs view and has never fired against production.
- The retention clock (`selectExpiringProspects()`'s cutoff logic, built in 07-06) has never been validated against real production data. No authenticated call to `/api/cron/retention` was made, no `expiring` count was read, and no SQL cross-check against the Supabase Dashboard was run. Whether the clock's cutoff computation matches what a human would call "old enough to expire" against the real ~800-row prospects table is unconfirmed.
- Because `stay-dry-run` was chosen without ever seeing the job report a number, the choice itself is not evidence-backed in the way the plan intends it to be — it is a decision to keep the door closed, made without first looking through it. That is a materially weaker basis than "we looked at the number and it made sense," but it carries no destructive risk, since dry-run cannot write.

**Consequence for anyone who later moves this job to `anonymize` or `delete`:** run Task 3's five steps first, in order — deploy, dashboard confirmation, authenticated dry-run read, SQL cross-check, magnitude sanity-check against ~10-50 prospects/week intake — before setting `RETENTION_MODE` to a writing value. Skipping straight to a writing mode on the strength of this plan's code alone would be exactly the failure D-7-16's one-way-door framing and D-7-18's dry-run mitigation exist to prevent. The code is ready to be exercised; it has not yet been exercised.

## Decisions Made

See `key-decisions` in frontmatter. Summary: kept the uncommitted chunking fix (matches an established pattern and closes a real production-scale hazard), reworded one doc comment to satisfy a literal grep-based prohibition check, removed one unused import that blocked the build, left `.env.example` untouched because this session's Claude Code permission settings globally deny any tool from reading or writing `.env.*` paths, and resolved Task 3 as `stay-dry-run` on Joshua's direct answer without running the task's own deploy/verification evidence steps.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Kept and verified the uncommitted executor's RETENTION_ID_CHUNK_SIZE chunking on both writing functions**
- **Found during:** Task 2 review of the uncommitted diff
- **Issue:** Task 1's committed `anonymizeProspects()` issued a single `.in("id", ids)` call over the full expiring-id set with no chunking. `computeExpiringProspects()` already chunks its own `.in()` reads at `RETENTION_ID_CHUNK_SIZE` because a set near `RETENTION_MAX_BATCH` (1000 ids) overflows PostgREST's URL-length limit — the same limit applies to UPDATE/DELETE `.in()` filters, since PostgREST encodes both into the request URL identically.
- **Fix:** The uncommitted work on disk had already applied `chunkIds(ids, RETENTION_ID_CHUNK_SIZE)` to both `anonymizeProspects()` (extending Task 1's already-committed function) and the new `deleteProspects()`. Reviewed it against the migrations and the existing read-side pattern, confirmed it was correct and consistent, and kept it.
- **Files modified:** `lib/retention.ts`
- **Verification:** `npx vitest run lib/retention.integration.test.ts` (35/35 pass), `npx tsc --noEmit` clean
- **Committed in:** `a275b18`

**2. [Rule 3 - Blocking] Removed unused `ANONYMIZED_OUTREACH_FIELDS` import blocking `npm run build`**
- **Found during:** Task 2's `npm run build` verification step
- **Issue:** `lib/retention.integration.test.ts` imported `ANONYMIZED_OUTREACH_FIELDS` (present since Task 1's commit `f501195`) but never referenced it — the outreach anonymise test hardcodes `draft_subject`/`draft_body` instead of iterating the constant's keys the way the prospect and scan blocks do. Next's `@typescript-eslint/no-unused-vars` failed the production build.
- **Fix:** Removed the unused import. `npm run build` is a literal Task 2 acceptance criterion ("`npx vitest run` (all three projects) is green and `npm run build` succeeds"), so this was blocking regardless of which task introduced it.
- **Files modified:** `lib/retention.integration.test.ts`
- **Verification:** `npm run build` succeeds; `npx vitest run` still 459/459
- **Committed in:** `a275b18`

**3. [Rule 3 - Blocking] Reworded a doc comment that tripped Task 1's own literal `delete_expired` grep prohibition**
- **Found during:** Task 2 acceptance-criteria check
- **Issue:** The uncommitted `deleteProspects()` doc comment named the two dead migration-001 retention functions literally (`` `delete_expired_scans` ``, `` `delete_expired_leads` ``) while explaining why not to use them. `grep -c 'delete_expired' lib/retention.ts` — a literal check with no comment exclusion, required by both Task 1's original prohibition and Task 2's acceptance criteria — returned 2 instead of the required 0.
- **Fix:** Reworded the comment to refer to the functions by file and line number ("at lines 43 and 51"), matching the phrasing the plan itself uses elsewhere, without naming them.
- **Files modified:** `lib/retention.ts`
- **Verification:** `grep -c 'delete_expired' lib/retention.ts` returns 0
- **Committed in:** `a275b18`

**4. [Rule 1 - Bug, fixed concurrently] `deleteProspects()` missed a second no-`ON DELETE` foreign key on `outreach_messages.scan_id`**
- **Found during:** Between this plan's pause point and this continuation's close, by a concurrent process (commit `61bf5cb`, not authored by this continuation session).
- **Issue:** `deleteProspects()` nulled `prospects.latest_scan_id`, deleted scans, then deleted prospects, relying on migration 012's `prospect_id` cascade to clear `outreach_messages`. That cascade only covers the `prospect_id` edge and fires at the prospect delete — after the scans delete. `outreach_messages` carries a second foreign key onto `scans` (`scan_id`, declared inline in migration 012 with no `ON DELETE` clause, defaulting to `NO ACTION` like the migration-013 pair T-07-33's original test covered). The scans delete therefore ran while outreach rows still pointed at the scans being removed, raising `outreach_messages_scan_id_fkey`. This was not an edge case: `lib/draft-on-scan-complete.ts` sets `scan_id` on every draft it inserts, so delete mode would have thrown for essentially every real expiring prospect that had reached the draft stage. The original test suite missed it because its fixture seeding never set `scan_id`.
- **Fix:** Outreach is now deleted explicitly as step 2 (before the scans delete), and the delete's returned row count replaces a separate counting SELECT. A regression test seeds the drafted-prospect shape (`scan_id` set) and asserts the fix; verified it fails against the unfixed code with `outreach_messages_scan_id_fkey` and passes with the fix. The suite's own `afterEach` had the same ordering gap and was corrected alongside.
- **Files modified:** `lib/retention.ts`, `lib/retention.integration.test.ts`
- **Verification:** `npx vitest run lib/retention.integration.test.ts` — 36/36 pass (re-verified in this continuation); `npx tsc --noEmit` clean per the commit message.
- **Committed in:** `61bf5cb`

### Not Auto-fixed — Recorded as Residuals

**5. [Rule 4 - Architectural/authorization boundary] Task 3's decision was made without its own evidence-gathering steps**
- **Found during:** This continuation, resolving the Task 3 blocking checkpoint
- **Issue:** Task 3's acceptance criteria require a production deploy, a Vercel dashboard cron confirmation, an authenticated production dry-run read, and a matching SQL count before any option is selected. Joshua answered the decision (`stay-dry-run`) directly, and this continuation was explicitly instructed not to deploy.
- **Resolution:** Recorded honestly rather than treated as done. See "Task 3 Resolution" above and the corresponding WINDOWS.md entry for the unrun verification steps.
- **Files modified:** None (no code change — `RETENTION_MODE` remains unset everywhere, confirmed by `grep -c 'RETENTION_MODE' vercel.json` returning 0).
- **Committed in:** This plan-closure commit (docs-only).

---

**Total deviations:** 4 auto-fixed (3 in Tasks 1-2 by this continuation's prior session, 1 real bug fixed concurrently in `61bf5cb`) + 1 residual (Task 3, recorded not fixed)
**Impact on plan:** All four fixes were necessary for the plan's own acceptance criteria to hold — the concurrent fix in particular closes a gap that would have made delete mode fail for essentially every real prospect that reached the draft stage, which is squarely within this plan's own FK-safety guarantee (D-7-16, T-07-33) even though this continuation did not author the fix itself. Nothing touches outside the anonymise/delete field lists, the FK order, or the cron schedule. The Task 3 residual is a deliberate authorization boundary, not a defect in the code — the code is correct and untriggered; the evidence that would justify triggering it has not been gathered.

## Issues Encountered

**`.env.example` could not be modified.** Task 2's action requires documenting `RETENTION_MODE` and `RETENTION_MONTHS` by name with empty values in `.env.example`, matching how `GEMINI_API_KEY` was documented in Phase 6. This executor's session has a global Claude Code permission setting (`.claude/settings.json` → `permissions.deny: ["Read(.env.*)", ...]`) that blocks every tool — `Read`, `Bash cat`, `Bash grep`, `Bash wc` — from touching any path matching `.env.*`, including `.env.example` itself, which carries no secrets. This is deliberate security hardening (see the sibling project's `secrets.md` rule about never printing `.env` files to a transcript) and this executor did not attempt to route around it. Still open — tracked as WINDOWS.md entry #1.

**What's needed:** add these two lines to `.env.example` by hand (content per the plan's Task 2 action — exact values are empty, matching the existing convention):

```
# RETENTION_MODE: anonymize | delete | unset (unset = dry-run, the non-writing default)
RETENTION_MODE=
# RETENTION_MONTHS: retention window in months. Default 12 is a placeholder pending the LIA, not a legal fact.
# Setting RETENTION_MODE to a writing value in the Vercel project environment is the one-way step Task 3 gates.
RETENTION_MONTHS=
```

This is a doc-only, non-functional gap — no code, test, or migration depends on `.env.example`'s contents. It does not block the code's correctness. It should be closed by hand before any future deploy that intends to actually run the retention job's evidence-gathering steps.

**Task 3's evidence steps were not run.** See "Task 3 Resolution" above — no deploy, no dashboard confirmation, no authenticated dry-run read, no SQL cross-check. Tracked as a second WINDOWS.md entry (kind: unrun-verify).

## User Setup Required

None. Task 3's remaining work — a production deploy, a Vercel dashboard cron confirmation, an authenticated dry-run read, and a Supabase SQL cross-check — is deferred, not required to close this plan. It becomes required only if and when someone (Joshua) decides to move `RETENTION_MODE` off dry-run in the future; see "Task 3 Resolution" for the exact steps to run first.

## Next Phase Readiness

**Plan 07-07 is complete: 3 of 3 tasks resolved.** Task 3's decision (`stay-dry-run`) is on record. `RETENTION_MODE` remains unset in every environment this plan touches — `grep -c 'RETENTION_MODE' vercel.json` returns 0, confirmed.

What is carried forward, not closed by this plan:
- `.env.example`'s two-line gap (WINDOWS.md #1) — a hand-add, doc-only.
- Task 3's unrun evidence steps (WINDOWS.md #2, new) — deploy, dashboard confirmation, authenticated dry-run read, SQL cross-check. Required before any future move off dry-run, not required for this plan's own completion.
- Whether phase 7 as a whole is ready to close is a verification-step question, not decided by this plan closure — the phase's own success criteria (`07-07-PLAN.md`'s "Phase-level checks") name the deployed job's live dashboard confirmation as part of what closes CMP-13/14/15, and that has not happened.

---
*Phase: 07-lifecycle-reporting-retention*
*Completed: 2026-08-02*

## Self-Check: PASSED

- FOUND: commit f501195 (Task 1)
- FOUND: commit a275b18 (Task 2)
- FOUND: commit 61bf5cb (concurrent FK fix, verified not authored by this continuation)
- FOUND: lib/retention.ts
- FOUND: lib/retention.integration.test.ts
- FOUND: vercel.json
- FOUND: .planning/phases/07-lifecycle-reporting-retention/07-07-SUMMARY.md
- FOUND: RETENTION_MODE unset — `grep -c 'RETENTION_MODE' vercel.json` returns 0
