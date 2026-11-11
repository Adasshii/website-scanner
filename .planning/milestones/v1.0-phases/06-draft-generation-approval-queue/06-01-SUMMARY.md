---
phase: 06-draft-generation-approval-queue
plan: 01
subsystem: scoring
tags: [typescript, vitest, tsconfig-paths, scanner-service]

# Dependency graph
requires: []
provides:
  - "computeVerdict() and getWeakestCategory() exported from lib/scoring.ts as the single verdict source (DRA-06)"
  - "scanner-service imports the shared verdict function via a @shared-lib/* tsconfig path alias instead of holding its own copy"
  - "lib/scoring.test.ts as the first-ever test file for lib/scoring.ts"
affects: [06-02, 06-03, 06-04, draft-generation, evidence-pane]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cross-boundary shared-lib import: scanner-service consumes a Next.js-side lib/ module via a dedicated tsconfig path alias (@shared-lib/*), scoped to one included file rather than the whole directory"

key-files:
  created:
    - lib/scoring.test.ts
  modified:
    - lib/scoring.ts
    - scanner-service/tsconfig.json
    - scanner-service/src/index.ts

key-decisions:
  - "Ported the scanner service's richer 90/70/50-band generateVerdict()/getWeakestCategory() verbatim into lib/scoring.ts, deleting the dead 95/85/70/50 chain entirely (no commented-out remnant) — the scanner service was the only live verdict producer, so this changes zero production behavior"
  - "Added @/* -> ../* to scanner-service/tsconfig.json paths (Rule 3 auto-fix, blocking issue): lib/scoring.ts's own internal import of @/types/scanner does not resolve under scanner-service's tsconfig without it, since only @shared/* and the new @shared-lib/* were previously mapped there. This is required for the @shared-lib/scoring import to compile at all, not a scope expansion — only lib/scoring.ts is in scanner-service's include list"

requirements-completed: [DRA-06]

coverage:
  - id: D1
    description: "computeVerdict()/getWeakestCategory() exported from lib/scoring.ts as the single verdict source, with full band/boundary/weakest-category test coverage"
    requirement: "DRA-06"
    verification:
      - kind: unit
        ref: "lib/scoring.test.ts (13 tests: computeVerdict bands/boundaries/criticalCount branch, getWeakestCategory ranking, buildSummary routing, aggregateScores weighting)"
        status: pass
    human_judgment: false
  - id: D2
    description: "scanner-service/src/index.ts imports computeVerdict from @shared-lib/scoring instead of defining its own generateVerdict/getWeakestCategory; both root and scanner-service tsc --noEmit pass"
    requirement: "DRA-06"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (root) and cd scanner-service && npx tsc --noEmit — both exit 0"
        status: pass
    human_judgment: false

duration: ~15min
completed: 2026-07-28
status: complete
---

# Phase 06 Plan 01: Verdict Consolidation Summary

**Collapsed the two divergent verdict-threshold functions (lib/scoring.ts's dead 95/85/70/50 chain and scanner-service's live 90/70/50 generateVerdict()) into one computeVerdict() exported from lib/scoring.ts, consumed by the scanner service via a new @shared-lib/* tsconfig path alias.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-28T11:08Z (approx, first commit)
- **Completed:** 2026-07-28T11:11Z
- **Tasks:** 3 (TDD: RED / GREEN / integration)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- `lib/scoring.ts` now owns the only verdict-threshold implementation in the repo: `computeVerdict(scores, criticalCount)` and `getWeakestCategory(scores)`, ported verbatim from the scanner service's richer 90/70/50-band logic
- `lib/scoring.ts` has a first-ever test file (`lib/scoring.test.ts`, 13 tests) covering every band, the >=90/70/50 boundaries, the critical-vs-major wording branch, weakest-category ranking, and `buildSummary()`'s routing through `computeVerdict()`
- `scanner-service/src/index.ts` deleted its local `generateVerdict()`/`getWeakestCategory()` and imports `computeVerdict` from `@shared-lib/scoring`; `aggregateScores()` and the per-page-vs-aggregate branch are untouched
- Production report copy is unaffected: the four verdict strings in `lib/scoring.ts` are character-for-character what previously lived in `scanner-service/src/index.ts`

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the Wave 0 test file for lib/scoring.ts against the target thresholds** - `97662cf` (test)
2. **Task 2: Export the single verdict function from lib/scoring.ts** - `79238b5` (feat)
3. **Task 3: Point the scanner service at the shared verdict function** - `14af0a9` (feat)

**Plan metadata:** (this commit, pending)

_Note: this plan was TDD-gated (`tdd="true"` on Task 1) — RED (`test`) then GREEN (`feat`) commits both present in git log, in order._

## Files Created/Modified
- `lib/scoring.test.ts` - New Vitest suite: `computeVerdict`/`getWeakestCategory` bands, boundaries, criticalCount branch; `buildSummary` routing; `aggregateScores` weighting regression check
- `lib/scoring.ts` - Added `export function computeVerdict()` and `export function getWeakestCategory()`; `buildSummary()` now calls `computeVerdict()` instead of its own inline 95/85/70/50 chain (deleted, not commented out)
- `scanner-service/tsconfig.json` - Added `@shared-lib/*` path alias (mirrors `@shared/*`), `../lib/scoring.ts` to `include` (scoped to that one file, not all of `../lib/**/*`), and a new `@/*` alias so `lib/scoring.ts`'s own internal `@/types/scanner` import resolves
- `scanner-service/src/index.ts` - Imports `computeVerdict` from `@shared-lib/scoring`; deleted the local `generateVerdict`/`getWeakestCategory` duplicate

## Decisions Made
- Ported the scanner service's bands into `lib/scoring.ts` (not the reverse) because `lib/scoring.ts` was confirmed dead code — imported by nothing in the Next.js app — so migrating in its direction changes zero production behavior (D-6-R4)
- Added a `@/*` path alias to `scanner-service/tsconfig.json`, scoped narrowly, to resolve `lib/scoring.ts`'s own transitive `@/types/scanner` import — see Deviations below

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `@/*` path alias to scanner-service/tsconfig.json**
- **Found during:** Task 3 (pointing the scanner service at the shared verdict function)
- **Issue:** After adding the `@shared-lib/*` alias and including `../lib/scoring.ts`, `cd scanner-service && npx tsc --noEmit` failed with `error TS2307: Cannot find module '@/types/scanner'` — `lib/scoring.ts` itself imports its types via the Next.js-only `@/*` alias (`@/*` -> `./*` in the root tsconfig), which scanner-service's tsconfig never mapped
- **Fix:** Added `"@/*": ["../*"]` to `scanner-service/tsconfig.json`'s `compilerOptions.paths`, mirroring the existing `@shared/*` pattern (baseUrl is scanner-service's own directory, so `../*` points at the project root, matching root tsconfig's `@/*` -> `./*` semantics)
- **Files modified:** scanner-service/tsconfig.json
- **Verification:** `cd scanner-service && npx tsc --noEmit` exits 0; root `npx tsc --noEmit` and `npx vitest run lib/scoring.test.ts` both still pass
- **Committed in:** 14af0a9 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to make the `@shared-lib/scoring` import (the plan's core deliverable) actually compile. No scope creep — the alias is scoped narrowly (scanner-service only has `../lib/scoring.ts` in its `include` list, so `@/*` cannot pull in unrelated Next.js-only modules like the Supabase client).

## Issues Encountered
None beyond the blocking issue documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The single verdict source (`computeVerdict`/`getWeakestCategory` in `lib/scoring.ts`) is ready for the draft generator (06-02/06-03) and the evidence pane (D-6-03) to both cite the same verdict text
- `T-06-VD` (verdict divergence, medium severity) is closed: the scanner-service threshold chain grep-gates to zero, and both consumers import the one function
- No blockers for the next plan in Wave 1

---
*Phase: 06-draft-generation-approval-queue*
*Completed: 2026-07-28*

## Self-Check: PASSED

All created/modified files confirmed present on disk; all three task commits (97662cf, 79238b5, 14af0a9) confirmed present in git log.
