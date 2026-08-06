---
phase: quick
plan: 260806-ntm
subsystem: ui
tags: [nextjs, admin, ndjson, streaming, child-process, duckdb, overture, vitest]

requires: []
provides:
  - "Three local-only admin routes (/api/admin/pipeline/{drain,triage,import}) that 404 in production before auth, before body parsing, and before any Supabase client or child process is constructed, proven behaviourally and structurally by app/api/admin/pipeline/guard.test.ts"
  - "A sixth 'Pipeline' admin tab (dev-gated as cosmetic defence only) holding Import, Triage and Drain controls in that order"
  - "scripts/pipeline-runner.ts — a third CLI spawned as a child process, wrapping ImportDeps/TriageDeps to emit NDJSON progress, with zero edits to scripts/import-prospects.ts or scripts/triage-prospects.ts"
  - "lib/overture-bboxes.ts — the country/region bbox tables extracted out of lib/overture-client.ts so the Import form's dropdowns read the exact tables the importer resolves against, with no @duckdb/node-api in the browser bundle"
affects: [admin-dashboard, prospect-import, prospect-triage, scan-queue-drain]

actuals:
  tokens: 16992
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Local-only admin route guard: NODE_ENV !== 'development' returns a bare-body 404 as the literal first statement of the handler, before the x-admin-secret check, before body parsing, before any DB client or child process — proven both behaviourally (404 not 401 on a wrong secret) and structurally (source-order assertion on the handler-body slice)"
    - "A second CLI (scripts/pipeline-runner.ts) wraps an existing script's dependency-injection seam (ImportDeps/TriageDeps) to add NDJSON progress events, rather than editing the script — the seam is the extension point, so the terminal and the button can never drift apart on validation"
    - "A route that must stay out of the Next.js server bundle spawns the work as a child process with an absolute binary path and array argv (never shell:true, never a concatenated command string) instead of importing the script's exports directly"

key-files:
  created:
    - app/api/admin/pipeline/guard.test.ts
    - app/api/admin/pipeline/drain/route.ts
    - app/api/admin/pipeline/triage/route.ts
    - app/api/admin/pipeline/import/route.ts
    - lib/pipeline-run.ts
    - lib/pipeline-run.test.ts
    - lib/overture-bboxes.ts
    - scripts/pipeline-runner.ts
    - components/admin/pipeline-run.tsx
    - components/admin/pipeline-tab.tsx
    - components/admin/drain-button.tsx
    - components/admin/triage-form.tsx
    - components/admin/import-form.tsx
  modified:
    - app/admin/page.tsx
    - lib/overture-client.ts

key-decisions:
  - "Drain invokes the existing cron GET handler (app/api/cron/drain-scan-queue) directly rather than re-calling reconcileInFlightScans/claimNextScanBatch/dispatchClaimedProspects, to avoid duplicating the reconcile-before-claim ordering that SCAN-03 depends on"
  - "Import/Triage run as a spawned child process (node_modules/.bin/tsx, absolute path, array argv), never an in-process call, because lib/overture-client.ts imports @duckdb/node-api (109 MB native binary) and a value import from the Next.js server would drag it into the production bundle for the first time"
  - "The pipeline run lock lives on globalThis under a namespaced key, not a module-level variable, so it survives Next dev's HMR module re-evaluation"
  - "The NDJSON line splitter buffers trailing (post-last-newline) content across chunks so a JSON object split mid-write across two child-process 'data' events is never emitted half-parsed"
  - "usePipelineRun's runStream treats 'stream ended with no result event' as a failure outcome, closing the silent-hang hole a naive success-by-default would leave"
  - "Zero-row import results render as a loud amber 'empty' tone, distinct from both error (red) and success-with-writes (green) — CONTEXT.md flags this as the single most probable way the UI wastes time"

requirements-completed: [QT-260806-ntm]

coverage:
  - id: D1
    description: "All three pipeline routes return a bare-body 404 when NODE_ENV is not 'development', before auth, before body parsing, and before any Supabase client or child process is constructed — proven behaviourally (404 not 401 on a wrong secret) and structurally (NODE_ENV precedes every present guard marker in the handler-body source)"
    requirement: "QT-260806-ntm"
    verification:
      - kind: unit
        ref: "app/api/admin/pipeline/guard.test.ts (18 tests: 3 routes x 6 assertions each)"
        status: pass
    human_judgment: false
  - id: D2
    description: "NDJSON line splitter correctly reassembles a JSON object split mid-write across two chunks, flushes a trailing no-newline fragment exactly once, and passes non-JSON log lines through untouched"
    requirement: "QT-260806-ntm"
    verification:
      - kind: unit
        ref: "lib/pipeline-run.test.ts (4 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "lib/overture-bboxes.ts extraction preserves resolveBbox/pickProvinceDivisionId/buildPlacesSql behaviour exactly, proven by the pre-existing regression suite passing unchanged"
    requirement: "QT-260806-ntm"
    verification:
      - kind: unit
        ref: "lib/overture-client.test.ts (12 tests, unchanged file)"
        status: pass
    human_judgment: false
  - id: D4
    description: "scripts/import-prospects.ts and scripts/triage-prospects.ts remain byte-identical to their pre-task contents"
    requirement: "QT-260806-ntm"
    verification:
      - kind: other
        ref: "git diff --quiet -- scripts/triage-prospects.ts scripts/import-prospects.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "@duckdb/node-api never enters the Next.js server bundle"
    requirement: "QT-260806-ntm"
    verification:
      - kind: other
        ref: "npm run build && grep -rqi duckdb .next/server (zero matches)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Full existing test suite, tsc --noEmit, and npm run lint all stay green after every change in this plan"
    requirement: "QT-260806-ntm"
    verification:
      - kind: unit
        ref: "npm run test (590 tests, 52 files), npx tsc --noEmit, npm run lint"
        status: pass
    human_judgment: false
  - id: D7
    description: "In next dev, the Pipeline tab renders with working Import (dropdowns + free-text category + dry-run), Triage (live count) and Drain controls, and a wrong-category import shows an unmistakable zero-row state"
    requirement: "QT-260806-ntm"
    verification: []
    human_judgment: true
    rationale: "This session's tool permissions deny all access to .env.local/.env (project secrets.md rule), so ADMIN_SECRET/CRON_SECRET could not be read to drive a live curl or browser session against next dev. All automated proxies for this behaviour pass (guard tests, splitter tests, full suite, build, duckdb grep), but the actual rendered UI states were not visually confirmed this session — Joshua needs to open /admin -> Pipeline locally and run the three controls once."

duration: ~14min
completed: 2026-08-06
status: complete
---

# Quick Task 260806-ntm: Local-only admin UI buttons for import, triage, and drain Summary

**A sixth "Pipeline" admin tab replaces the three hand-run CLI scripts with buttons — a route-level NODE_ENV 404 (proven structurally and behaviourally, before auth or any DB/child-process work) keeps the mechanism out of production, and a spawned third CLI streams live NDJSON progress from the scripts' own unedited dependency-injection seams.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-08-06T17:33:00+02:00 (approx)
- **Completed:** 2026-08-06T17:47:06+02:00
- **Tasks:** 3
- **Files modified:** 15 (13 created, 2 modified)

## Accomplishments

- Three admin routes (`/api/admin/pipeline/{drain,triage,import}`) each 404 with an empty body whenever `NODE_ENV !== "development"`, as the literal first statement of the handler — before the `x-admin-secret` check, before body parsing, before any Supabase client or child process. Proven by an 18-test table-driven suite covering all three routes both behaviourally (production+wrong-secret still returns 404, not 401) and structurally (source-order assertion on the handler body).
- A new third CLI, `scripts/pipeline-runner.ts`, wraps `TriageDeps`/`ImportDeps` — the existing scripts' own injection seams — to emit `start`/`progress`/`result`/`error` NDJSON events, with zero edits to `scripts/triage-prospects.ts` or `scripts/import-prospects.ts` (verified byte-identical via `git diff --quiet` after every task).
- `lib/overture-bboxes.ts` extracted the country/region bbox tables out of `lib/overture-client.ts` (which imports the 109 MB `@duckdb/node-api` native package) into a dependency-free module, so the Import form's dropdowns read the exact tables the importer resolves against with no risk of drift and no duckdb in the browser bundle. `lib/overture-client.test.ts` passes unchanged, proving the extraction preserved behaviour exactly.
- A production build (`npm run build`) followed by a grep of `.next/server` confirms `@duckdb/node-api` never enters the Next.js server bundle — the entire reason Import/Triage spawn a child process instead of calling the scripts in-process.
- The Pipeline tab is dev-gated as cosmetic defence only (`process.env.NODE_ENV === "development"`, statically inlined in the client bundle); the route-level 404 is the real guard and holds independently, as proven by the guard test running with no dependency on the tab rendering.
- Drain, Triage, and Import all share one `usePipelineRun`/`PipelineRunPanel` run-state layer, with three visually distinct result tones — `ok` (green), the deliberately loud `empty` (amber, never mistakable for success), and `error` (red).

## Task Commits

Each task was committed atomically:

1. **Task 1: Drain button end-to-end — the production guard, proven** — `6b32a44` (feat)
2. **Task 2: The NDJSON runner and the Triage form with live progress** — `b0bcc27` (feat)
3. **Task 3: The Import form — shared bbox tables, dropdowns, and loud zero-row results** — `b38bd1a` (feat)

**Plan metadata:** commit pending (orchestrator-owned final commit)

## Files Created/Modified

- `app/api/admin/pipeline/guard.test.ts` - Table-driven guard test, RED before each route existed, GREEN after; 18 assertions across 3 routes
- `app/api/admin/pipeline/drain/route.ts` - Local-only trigger invoking the existing cron GET handler
- `app/api/admin/pipeline/triage/route.ts` - Local-only trigger streaming triage NDJSON
- `app/api/admin/pipeline/import/route.ts` - Local-only trigger streaming import NDJSON, no value import of the import script or overture-client
- `lib/pipeline-run.ts` - `acquirePipelineLock`/`releasePipelineLock` (globalThis-backed), `NdjsonLineSplitter`, `streamPipelineRun`
- `lib/pipeline-run.test.ts` - Splitter tests: single-chunk, chunk-boundary-split, trailing-fragment-flush, non-JSON-passthrough
- `lib/overture-bboxes.ts` - `Bbox`, `COUNTRY_BBOXES`, `REGION_BBOXES`, `slugifyRegion`, `resolveBbox` extracted verbatim out of `lib/overture-client.ts`
- `lib/overture-client.ts` - Re-exports the moved bindings; internal use of `resolveBbox`/`slugifyRegion` now imported from the new module
- `scripts/pipeline-runner.ts` - Third CLI, `triage`/`import` modes, wraps each script's DI seam to emit NDJSON
- `components/admin/pipeline-run.tsx` - `usePipelineRun` hook (`runJson` + `runStream`) and shared `PipelineRunPanel`
- `components/admin/pipeline-tab.tsx` - Sixth tab body, Import -> Triage -> Drain in order
- `components/admin/drain-button.tsx` - Drain control
- `components/admin/triage-form.tsx` - Triage control, dry-run-by-default, live count
- `components/admin/import-form.tsx` - Import control, country/region dropdowns from `lib/overture-bboxes.ts`, free-text category
- `app/admin/page.tsx` - Sixth "pipeline" tab in the `Tab` union, tab list, render ladder, and the tab-fetch effect; excluded "pipeline" from the pagination footer's tab guard

## Decisions Made

- Drain invokes the existing cron `GET` handler directly rather than re-implementing its reconcile-before-claim sequence, since that ordering is load-bearing (SCAN-03) and this task is explicitly forbidden from touching scan-queue semantics.
- Import/Triage run as a spawned child process (absolute `node_modules/.bin/tsx` path, array argv, no `shell: true`) rather than an in-process call, because `lib/overture-client.ts` imports `@duckdb/node-api` and a value import from the Next.js server would drag the 109 MB native package into the production bundle for the first time — a direct hit on the Blast radius constraint.
- The pipeline run lock is stored on `globalThis` under a namespaced key, not a plain module-level variable, so it survives Next dev's HMR module re-evaluation.
- `usePipelineRun`'s `runStream` treats "stream ended with no result event" as a failure, closing the silent-hang hole a naive success-by-default would leave.
- Zero-row import results render as a loud amber `empty` tone with the category string echoed back, distinct from both `error` and `ok` — per CONTEXT.md, this is the single most probable way this UI wastes time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Excluded the "pipeline" tab from the pagination footer's tab guard**
- **Found during:** Task 1 (`app/admin/page.tsx` edit)
- **Issue:** The plan's four scoped edits to `app/admin/page.tsx` did not mention the pagination footer's `tab !== "shortlist" && tab !== "outreach" && tab !== "reporting" && totalPages > 1` condition. Since the Pipeline tab never calls `fetchData`, `totalPages` retains whatever value it held from the last table tab (Scans/Leads) visited — switching to Pipeline after paging through Scans would show a stale, meaningless "Page X of Y" footer under the Pipeline tab's buttons.
- **Fix:** Added `tab !== "pipeline"` to the same condition.
- **Files modified:** `app/admin/page.tsx`
- **Verification:** `tsc --noEmit` clean, `npm run build` succeeds, JSX structure unchanged.
- **Committed in:** `6b32a44` (Task 1 commit)

**2. [Rule 3 - Blocking] Fixed a self-inflicted `*/` inside a JSDoc comment**
- **Found during:** Task 2 (`scripts/pipeline-runner.ts` authoring)
- **Issue:** The file's header doc comment originally read `their exported parse*/run* functions`, and the literal `*/` inside that phrase prematurely closed the block comment, producing ~60 TypeScript parse errors starting at line 12.
- **Fix:** Reworded to `their exported parse-args and run-mode functions`.
- **Files modified:** `scripts/pipeline-runner.ts`
- **Verification:** `npx tsc --noEmit` clean immediately after.
- **Committed in:** `b0bcc27` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 3 blocking issue)
**Impact on plan:** Both are small, self-contained fixes directly caused by this plan's own changes — no scope creep, no architectural impact.

## Issues Encountered

This session's tool permissions deny all access to `.env.local`/`.env` files (per `.claude/rules/secrets.md`, enforced at the tool layer). `ADMIN_SECRET` and `CRON_SECRET` could not be read, so the human-check portion of Task 3's `<verify>` block (opening `next dev`, navigating to `/admin` -> Pipeline, running a real import with a wrong category, a dry-run import with a real category, and a real triage run) could not be exercised live from this session. Every automated proxy for that behaviour passes (the 18-test guard suite, the 4-test splitter suite, the full 590-test suite, `tsc --noEmit`, `npm run lint`, `npm run build`, and the duckdb-absence grep on the built server output), but the actual rendered UI states were not visually confirmed. This is recorded as `D7` in the coverage block above with `human_judgment: true`.

## User Setup Required

None for code to run — no new environment variables, no new dependencies (`node:child_process`, `node:path`, `tsx` were already present). **Recommended before relying on this daily:** open `next dev`, sign in to `/admin`, and click through Import (with a deliberately wrong category, to confirm the zero-row state), Triage, and Drain once, per the `<human-check>` step Task 3's plan called for and this session could not perform.

## Next Phase Readiness

- All three controls are wired end-to-end and covered by automated tests; the mechanism is ready for Joshua's first live click-through in `next dev`.
- Both `scripts/import-prospects.ts` and `scripts/triage-prospects.ts` remain byte-identical to their pre-task contents and still run unchanged from the terminal.
- No blockers for any other in-flight work — this task touched no scan-queue, send-gate, outreach, or public-scanner code.

---
*Phase: quick*
*Completed: 2026-08-06*

## Self-Check: PASSED

- FOUND: app/api/admin/pipeline/guard.test.ts
- FOUND: app/api/admin/pipeline/drain/route.ts
- FOUND: app/api/admin/pipeline/triage/route.ts
- FOUND: app/api/admin/pipeline/import/route.ts
- FOUND: lib/pipeline-run.ts
- FOUND: lib/pipeline-run.test.ts
- FOUND: lib/overture-bboxes.ts
- FOUND: scripts/pipeline-runner.ts
- FOUND: components/admin/pipeline-run.tsx
- FOUND: components/admin/pipeline-tab.tsx
- FOUND: components/admin/drain-button.tsx
- FOUND: components/admin/triage-form.tsx
- FOUND: components/admin/import-form.tsx
- FOUND: app/admin/page.tsx
- FOUND: lib/overture-client.ts
- FOUND: 6b32a44 (git log --oneline --all)
- FOUND: b0bcc27 (git log --oneline --all)
- FOUND: b38bd1a (git log --oneline --all)
