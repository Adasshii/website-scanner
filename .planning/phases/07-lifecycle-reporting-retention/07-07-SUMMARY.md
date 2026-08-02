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
affects: [phase-closure, LIA/legal-review, future retention-window changes]

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
  - ".env.example was not touched. This session's global Claude Code permission settings deny all Read/Bash access to any path matching .env.* — including .env.example, which carries no secrets — with no override available inside this session. Documented below as a deferred item for Joshua to add by hand."

requirements-completed: []  # CMP-13/14/15 not marked complete — Task 3's decision is what phase-level checks (line 632 of the plan) treat as closing them; see 'Next Phase Readiness' below.

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
    description: "deleteProspects() removes prospect/scan/outreach rows in the only FK-safe order, proven load-bearing by a dedicated failing-naive-order test"
    requirement: "CMP-13"
    verification:
      - kind: integration
        ref: "lib/retention.integration.test.ts — 'deleteProspects — FK order and cascade (D-7-16, Task 2)' describe block, in particular the 'deleting the scan before nulling latest_scan_id raises a foreign-key error' test"
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
    rationale: "Task 3 is a blocking checkpoint:decision by design (D-7-16's one-way-door reversibility). It requires a live Vercel deploy, a dashboard check, an authenticated production HTTP call, and a hand-run SQL count — none of which this executor may perform without a human decision on the record."

# Metrics
duration: ~35min (this session; Task 1 was completed in a prior interrupted session)
completed: 2026-08-02
status: blocked
---

# Phase 7 Plan 07: Retention anonymise/delete modes and the monthly cron Summary

**Delete mode's FK-safe three-statement order (null latest_scan_id, delete scans, delete prospects) proven load-bearing by a dedicated test, both writing modes chunked at RETENTION_ID_CHUNK_SIZE, and a fifth vercel.json cron entry — Task 3's production mode decision deliberately left unresolved.**

## Performance

- **Duration:** ~35 min this session (resuming Task 2, uncommitted on disk at session start)
- **Started:** 2026-08-02T14:32Z (this session)
- **Completed:** 2026-08-02T14:41Z (Task 2 committed; Task 3 checkpoint reached)
- **Tasks:** 2 of 3 complete (Task 3 is a blocking checkpoint, intentionally not executed)
- **Files modified:** 3 (lib/retention.ts, lib/retention.integration.test.ts, vercel.json)

## Accomplishments

- Verified Task 1 (`anonymizeProspects()`, the three field-list constants, the anonymise test block) was already complete and committed as `f501195` — not redone.
- Reviewed the ~307 lines of uncommitted Task 2 work found on disk at session start, corrected two defects (see Deviations), and committed it as one atomic commit.
- `deleteProspects()` — nulls `prospects.latest_scan_id`, deletes the owned scans, deletes the prospects (outreach cascades via migration 012's `ON DELETE CASCADE`) — the only order migration 013's reciprocal no-`ON DELETE` foreign keys permit.
- A dedicated test proves the naive order (deleting scans before nulling `latest_scan_id`) actually raises a foreign-key error, satisfying `07-VALIDATION.md`'s requirement for "an explicit assertion on FK-safe delete ordering, not merely 'the job completed without throwing'."
- `vercel.json` carries a fifth cron entry, `/api/cron/retention` at `0 3 1 * *`, added with no change to the four existing entries.
- Full suite: `npx vitest run` — 41 files, 459 tests, all passing. `npx tsc --noEmit` clean. `npm run build` succeeds.
- `npx vitest run lib/retention.integration.test.ts -t suppression` selects 5 tests across dry-run/anonymize/delete and all pass — CMP-15's gate.

## Task Commits

Each task was committed atomically:

1. **Task 1: Anonymise mode — field lists and the three-table pass** - `f501195` (feat) — completed in a prior, interrupted session; verified, not redone.
2. **Task 2: Delete mode, the FK-safe order, and the monthly schedule** - `a275b18` (feat)

**Task 3 (checkpoint:decision, gate="blocking") was reached and deliberately NOT executed.** No plan-metadata commit exists yet; it will follow once Task 3 resolves.

## Files Created/Modified

- `lib/retention.ts` - `deleteProspects()` (new), chunking added to both writing functions, `runRetention()`'s delete arm wired
- `lib/retention.integration.test.ts` - delete-mode describe block (9 tests), placeholder `mode: "delete"` rejection test removed, unused import removed
- `vercel.json` - fifth cron entry for `/api/cron/retention`

## Decisions Made

See `key-decisions` in frontmatter. Summary: kept the uncommitted chunking fix (matches an established pattern and closes a real production-scale hazard), reworded one doc comment to satisfy a literal grep-based prohibition check, removed one unused import that blocked the build, and left `.env.example` untouched because this session's Claude Code permission settings globally deny any tool from reading or writing `.env.*` paths.

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

---

**Total deviations:** 3 auto-fixed (1 kept-and-verified correctness improvement, 2 blocking build/grep fixes)
**Impact on plan:** All three necessary for the acceptance criteria to actually pass (build, vitest, grep checks). No scope creep — none touch the anonymise/delete field lists, the FK order, or the cron schedule the plan specifies.

## Issues Encountered

**`.env.example` could not be modified.** Task 2's action requires documenting `RETENTION_MODE` and `RETENTION_MONTHS` by name with empty values in `.env.example`, matching how `GEMINI_API_KEY` was documented in Phase 6. This executor's session has a global Claude Code permission setting (`.claude/settings.json` → `permissions.deny: ["Read(.env.*)", ...]`) that blocks every tool — `Read`, `Bash cat`, `Bash grep`, `Bash wc` — from touching any path matching `.env.*`, including `.env.example` itself, which carries no secrets. This is deliberate security hardening (see the sibling project's `secrets.md` rule about never printing `.env` files to a transcript) and this executor did not attempt to route around it.

**What's needed:** add these two lines to `.env.example` by hand (content per the plan's Task 2 action — exact values are empty, matching the existing convention):

```
# RETENTION_MODE: anonymize | delete | unset (unset = dry-run, the non-writing default)
RETENTION_MODE=
# RETENTION_MONTHS: retention window in months. Default 12 is a placeholder pending the LIA, not a legal fact.
# Setting RETENTION_MODE to a writing value in the Vercel project environment is the one-way step Task 3 gates.
RETENTION_MONTHS=
```

This is a doc-only, non-functional gap — no code, test, or migration depends on `.env.example`'s contents. It does not block Task 3 or the retention job's correctness. It should be closed before or alongside Task 3's resolution so the file matches what actually got deployed.

## User Setup Required

None from Tasks 1-2 - no new external service configuration. Task 3 (below, unresolved) requires a production deploy and manual dashboard/SQL verification by Joshua; see Next Phase Readiness.

## Next Phase Readiness

**Task 3 (`checkpoint:decision`, `gate="blocking"`) was reached and is returned to the orchestrator unresolved — see the CHECKPOINT REACHED block in this executor's final message.** It requires: `npx vercel --prod` deploy, a Vercel dashboard confirmation that `/api/cron/retention` shows `0 3 1 * *`, one authenticated GET to the deployed route with its JSON body recorded, a matching SQL count from the Supabase Dashboard SQL Editor, and an explicit choice among `stay-dry-run` / `anonymize` / `delete`.

Until Task 3 resolves:
- Phase 7 is not closed. The plan's own success criteria and the phase-level checks (07-07-PLAN.md line ~632) treat CMP-13/14/15 as finished by Task 3, not by Tasks 1-2 alone.
- `RETENTION_MODE` remains unset in every environment this plan touches — `grep -c 'RETENTION_MODE' vercel.json` returns 0, confirmed.
- `.env.example`'s two-line gap (above) should be closed by hand before Task 3's deploy, so the deployed environment's documentation matches what's live.

---
*Phase: 07-lifecycle-reporting-retention*
*Completed: 2026-08-02 (Tasks 1-2 only; Task 3 pending)*

## Self-Check: PASSED

- FOUND: commit f501195 (Task 1)
- FOUND: commit a275b18 (Task 2)
- FOUND: lib/retention.ts
- FOUND: lib/retention.integration.test.ts
- FOUND: vercel.json
- FOUND: .planning/phases/07-lifecycle-reporting-retention/07-07-SUMMARY.md
