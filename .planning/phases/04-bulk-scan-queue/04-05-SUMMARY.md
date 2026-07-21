---
phase: 04-bulk-scan-queue
plan: 05
subsystem: ui
tags: [react, nextjs, supabase, admin-dashboard]

# Dependency graph
requires:
  - phase: 04-bulk-scan-queue (plans 01-04)
    provides: migration 017 (scan_status/scan_attempts/scan_status_reason columns, claim_next_scan_batch), run-batch and requeue-scan API routes, drain-scan-queue cron
provides:
  - Shortlist tab shows per-prospect scan status (queued/scanning/done/failed) alongside the existing triage columns
  - Done rows link to /report/[id]; failed rows show their reason plus a Re-queue action
  - RunBatchButton beside the existing Release button, confirming spend before arming a batch
  - Shortlist fetch failures render as a visible error banner instead of a silent empty state
affects: [04-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Status pill token style reused verbatim across GATED/queued/scanning/done/failed badges"
    - "Column order in a table with a hard min-content width: put decorative/non-actionable columns last so they absorb overflow, not the columns carrying primary actions"

key-files:
  created:
    - components/admin/run-batch-button.tsx
  modified:
    - lib/triage-candidates.ts
    - app/api/admin/shortlist/route.ts
    - components/admin/shortlist-table.tsx
    - app/admin/page.tsx
    - vitest.config.ts

key-decisions:
  - "Signals column (decorative chips from Phase 3) moved to last position so it absorbs horizontal overflow before Status/Released, which carry the report link and Re-queue action this plan exists to add."
  - "Shortlist table's eligibleCount === 0 empty-state guard widened to also check for existing scan_status/scan_released_at, so released/in-flight rows stay visible once nothing is eligible at the current cutoff."
  - "Checkpoint verified against local Supabase only, reached via a gitignored .env.development.local override; .env.local points at the remote database where migration 017 is not yet applied (that's plan 04-06's human-gated task)."

patterns-established: []

requirements-completed: [SCAN-01, SCAN-03, SCAN-04, SCAN-07]

coverage:
  - id: D1
    description: "getShortlist()/ShortlistRow widened with scan_status, scan_attempts, scan_status_reason, latest_scan_id; sort order and pure-read contract unchanged"
    requirement: "SCAN-01"
    verification:
      - kind: unit
        ref: "lib/triage-candidates.integration.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Status pill (queued/scanning/done/failed) per row; done links to /report/[id]; failed shows reason + Re-queue; table no longer collapses to empty state once anything is released or queued"
    requirement: "SCAN-03"
    verification: []
    human_judgment: true
    rationale: "Requires observing rendered pills, link behavior, and Re-queue round-trip against seeded local rows in each of the four states — a UI behavior checkpoint, not something the unit suite asserts."
  - id: D3
    description: "RunBatchButton confirms the count about to be armed and the per-click ceiling before POSTing to /api/admin/run-batch"
    requirement: "SCAN-04"
    verification: []
    human_judgment: true
    rationale: "Confirm-dialog copy and the arm/cron hand-off were checkpoint-verified by clicking through, not asserted by an automated test."
  - id: D4
    description: "Report link on done rows opens the same hosted report the public scanner produces, unauthenticated (D-11/D-12 reused verbatim)"
    requirement: "SCAN-07"
    verification: []
    human_judgment: true
    rationale: "Verified by the human opening the link and eyeballing the report; no automated assertion of report content fidelity exists in this plan."
  - id: D5
    description: "Column reorder: Signals moved after Released so Status/Released (the report link and Re-queue action) survive viewport narrowing instead of being clipped first"
    verification:
      - kind: unit
        ref: "npx vitest run (198/198 passing, no regression)"
        status: pass
    human_judgment: true
    rationale: "The measured overflow widths and the visual correctness of the new column order were established by the human's checkpoint feedback, not by an automated layout test; unit suite only confirms no functional regression."

# Metrics
duration: 1h48m
completed: 2026-07-21
status: complete
---

# Phase 4 Plan 5: Shortlist Queue Surface Summary

**Shortlist tab gains a scan-status pill, report link, and Re-queue action per prospect, plus a Run Batch button — with Signals reordered last so it absorbs table overflow instead of the action columns.**

## Performance

- **Duration:** 1h 48m
- **Started:** 2026-07-21T18:07:43Z
- **Completed:** 2026-07-21T19:55:10Z
- **Tasks:** 4 (3 auto + 1 checkpoint)
- **Files modified:** 6 (5 source files + vitest.config.ts deviation)

## Accomplishments
- `getShortlist()`/`ShortlistRow` widened with the four migration-017 queue columns (`scan_status`, `scan_attempts`, `scan_status_reason`, `latest_scan_id`) in a single select-list edit; pure-read contract and existing sort order untouched.
- Shortlist table renders a status pill per state (queued/scanning/done/failed), links `done` rows to `/report/[id]`, and shows a reason plus Re-queue button on `failed` rows.
- `RunBatchButton` added beside the existing Release button, confirming the count about to be armed and the per-click ceiling before POSTing to `/api/admin/run-batch`.
- Checkpoint (Task 4) presented, found a defect on first pass, fixed, re-presented, and approved with one further change requested (column reorder) — see Deviations below for the full sequence.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend getShortlist with the queue columns** - `9965e7c` (feat)
2. **Task 2: Status column, report link and re-queue action in the Shortlist table** - `c6def5c` (feat)
   - Deviation (Rule 3, blocking): `cb56421` (chore) — vitest test-discovery fix, see below
3. **Task 3: RunBatchButton and admin page wiring** - `b3bc546` (feat)
4. **Task 4 checkpoint fix (pre-approval, Rule 1 bug):** `a45f1ef` (fix) — shortlist fetch-failure visibility, see below
5. **Task 4 checkpoint fix (post-approval, requested change):** `acb6bfa` (fix) — Signals column reorder, see below

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/triage-candidates.ts` - `ShortlistRow` widened with `scan_status`/`scan_attempts`/`scan_status_reason`/`latest_scan_id`; `getShortlist()` select list extended
- `app/api/admin/shortlist/route.ts` - error serialization fix for thrown Supabase `PostgrestError` objects
- `components/admin/shortlist-table.tsx` - Status pill, report link, Re-queue button, widened empty-state guard, Signals column reorder
- `components/admin/run-batch-button.tsx` - new client component mirroring `ReleaseButton`'s confirm-then-POST shape
- `app/admin/page.tsx` - wires `RunBatchButton` and the table's new `secret`/`onRequeued` props; adds error banner rendering to the authenticated layout
- `vitest.config.ts` - excludes nested worktrees from test discovery (deviation, see below)

## Decisions Made
- Signals column (decorative, inherited from Phase 3) moved to the last position in the Shortlist table so it, not Status/Released, absorbs horizontal overflow as the viewport narrows below the table's 790px min-content width.
- The `eligibleCount === 0` empty-state guard was widened at Task 2 to also check for existing `scan_status`/`scan_released_at`, per the plan's own instruction — this was planned work, not a deviation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Excluded nested git worktrees from vitest test discovery**
- **Found during:** Task 1/2 verification
- **Issue:** vitest's positional-arg filter matched the same integration test inside a sibling `.claude/worktrees/` checkout, running both copies concurrently against the one shared local Supabase and colliding on `prospects_domain_unique_idx`.
- **Fix:** Added `**/.claude/worktrees/**` to vitest's `exclude` list in `vitest.config.ts`.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npx vitest run` green with no duplicate test execution.
- **Committed in:** `cb56421`

**2. [Rule 1 - Bug] Fixed shortlist fetch failures rendering as an empty state**
- **Found during:** Task 4 checkpoint, first presentation (checkpoint was NOT approved on this pass — a defect was found before Joshua reached the column-order feedback)
- **Issue:** `fetchShortlist` only special-cased 401 and swallowed every other failure, so a 500 rendered identically to "no triaged prospects yet" — indistinguishable from the genuinely-empty state. Root cause ran deeper than the fetch function alone: the `error` state it (and the pre-existing `fetchData`) set was never rendered anywhere in the authenticated admin layout, only in the pre-login form. `fetchData`'s error handling had been correct all along but equally invisible.
- **Fix:** Added the missing non-401 branch to `fetchShortlist` (mirroring `fetchData`), and added an error banner in the authenticated layout so either function's error state actually renders.
- **Files modified:** `app/admin/page.tsx`, `app/api/admin/shortlist/route.ts`
- **Verification:** Manually triggered a 500 locally; error banner rendered instead of the empty-state copy.
- **Committed in:** `a45f1ef`

**3. [Rule 1 - Bug, bundled with #2] Fixed `[object Object]` error logging in the shortlist route**
- **Found during:** Task 4 checkpoint, same pass as #2 — surfaced while tracing why the fetch error had no readable message.
- **Issue:** Supabase throws plain `PostgrestError` objects that are not `instanceof Error`, so the route's `String(e)` fallback serialized to the literal string `"[object Object]"` in both the server log and the JSON `detail` field, making the underlying DB error unreadable.
- **Fix:** Prefer `.message` when present on the thrown value, falling back to `JSON.stringify(e)` only for genuinely non-Error, non-message-bearing throws.
- **Files modified:** `app/api/admin/shortlist/route.ts`
- **Scope note:** the sibling admin routes `run-batch`, `release-prospects`, `requeue-scan`, and `stats` carry the **identical** `String(e)`-on-thrown-object bug. This was deliberately left out of scope — fixing it was not part of this plan's `files_modified` and doing so here would have been scope creep beyond the checkpoint defect. Flagged for a future pass, not silently left undiscovered.
- **Committed in:** `a45f1ef` (same commit as #2 — the two fixes touch the same two files and were verified together)

**4. [Requested change, post-approval] Reordered the Signals column to last**
- **Found during:** Task 4 checkpoint, second presentation — Joshua approved with this one change requested, not found by the executor.
- **Issue:** Column order was `[gated] | Domain | Triage score | Signals | Status | Released`. The table has a hard min-content width of 790px. Measured behaviour: no overflow above ~850px viewport width; 33px overflow at 820px (Released clipped); 308px overflow at 529px (Status and Released both entirely off-screen). Status and Released carry the report link and Re-queue action this plan exists to add, and they were the first columns to disappear as the window narrowed, while the purely decorative Signals chips (inherited from Phase 3) kept their space.
- **Fix:** Moved both the `<th>` and matching `<td>` for Signals to the end of the row: `[gated] | Domain | Triage score | Status | Released | Signals`. Reorder only — no responsive breakpoints, card-reflow, sticky columns, new CSS utilities, or width changes were added, per the explicit scope instruction.
- **Files modified:** `components/admin/shortlist-table.tsx`
- **Verification:** `npx tsc --noEmit` clean, `npx next lint --file components/admin/shortlist-table.tsx` clean, `npx vitest run` 198/198 passing. Header/body alignment confirmed by reading the rendered markup directly (see below) — not by an automated DOM assertion, since no existing test targets this table's column order.
- **Committed in:** `acb6bfa`

---

**Total deviations:** 4 (1 Rule 3 blocking, 2 Rule 1 bugs bundled in one commit, 1 requested post-approval change)
**Impact on plan:** All four were necessary — two blocked correct verification/observability, one is the user's explicit checkpoint condition for approval. No scope creep: the `[object Object]` fix was deliberately bounded to the one route this plan touches, and the reorder was deliberately bounded to a pure column move.

## Issues Encountered

**Checkpoint alignment verification (thead/tbody column-index match):** After the reorder, thead order is `[empty] | Domain | Triage score | Status | Released | Signals` (6 columns, 0-indexed 0-5) and tbody order is `[gated badge] | domain | score | status | released | signals` (same 6, same indices). STATUS is column index 3 in both; RELEASED is index 4 in both. This was confirmed by reading the full rendered JSX for both `<thead>` and `<tbody>` side by side after the edit, not by an automated snapshot or DOM test — no such test exists for this component today.

## User Setup Required

None - no external service configuration required.

## Verification Environment Caveat

**Read before treating this checkpoint as production-verified.** The Task 4 checkpoint (in both passes) was verified against the **local** Supabase instance only, reached through a gitignored `.env.development.local` override present in this working copy. The project's tracked `.env.local` points at the **remote** database, and migration 017 — the `scan_status`/`scan_attempts`/`scan_status_reason` columns and `claim_next_scan_batch` function this entire plan depends on — is **not applied there**. Applying it remotely is plan 04-06's explicitly human-gated task. Anyone re-running this checkpoint's verification steps must set up the same local override first, or they will be pointed at production with columns that don't exist yet.

## Next Phase Readiness
- The Shortlist tab's queue surface (status pill, report link, Re-queue, Run Batch) is code-complete and checkpoint-approved with the requested reorder applied.
- Blocked on 04-06: migration 017 has not been applied to the remote/production Supabase instance. Nothing in this plan is safe to consider "live" until that human-gated migration runs.
- Known, deliberately out-of-scope: the `[object Object]` error-serialization bug is still present in `run-batch`, `release-prospects`, `requeue-scan`, and `stats` routes.

---
*Phase: 04-bulk-scan-queue*
*Completed: 2026-07-21*

## Self-Check: PASSED

All 6 modified/created files confirmed present on disk. All 6 referenced commit hashes (`9965e7c`, `cb56421`, `c6def5c`, `b3bc546`, `a45f1ef`, `acb6bfa`) confirmed present in git log.
