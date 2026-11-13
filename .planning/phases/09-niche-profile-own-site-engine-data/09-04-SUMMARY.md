---
phase: 09-niche-profile-own-site-engine-data
plan: 04
subsystem: triage-eligibility
tags: [eng-06, scoreable-rule, is-releasable, d-9-r1, d-9-14, d-9-15, d-9-17, d-9-22, t-9-07, t-9-08]
requires:
  - phase: 09-niche-profile-own-site-engine-data
    provides: "09-03: migration 022 (prospects.latitude, longitude, not_scoreable_reason; prospect_sources.raw_operating_status), the coordinate capture at import"
provides:
  - "MIN_MATCH_CONFIDENCE = 0.5 (inclusive) in lib/triage-constants.ts, with the measurement beside it"
  - "scoreableVerdict(row, minConfidence) and ScoreableFailureReason, folded into isReleasable as its fourth clause"
  - "ScoreableRow, ScoreableSource, ScoreableVerdict types: six required row fields, so a caller that omits one is a compile error"
  - "selectWorstN and getShortlist select the scoreable fields and the prospect_sources embed"
  - "ShortlistRow.sources and ShortlistRow.not_scoreable_reason; a NOT SCOREABLE pill in the Shortlist"
affects: [09-06, phase-10]
tech-stack:
  added: []
  patterns:
    - "One predicate, one place: the rule lives inside isReleasable and its only caller in production code is isReleasable"
    - "Required row fields plus positive-evidence checks, so absence fails closed at compile time and at runtime"
    - "A rule that must be unit-tested at a fixed limit takes the limit as a parameter; the tunable constant is applied only by isReleasable"
key-files:
  created: []
  modified:
    - lib/triage-constants.ts
    - lib/triage-eligibility.ts
    - lib/triage-eligibility.test.ts
    - lib/triage-release.ts
    - lib/triage-release.integration.test.ts
    - lib/triage-candidates.ts
    - lib/triage-candidates.integration.test.ts
    - app/admin/page.tsx
    - components/admin/shortlist-table.tsx
    - components/admin/shortlist-table.test.tsx
key-decisions:
  - "MIN_MATCH_CONFIDENCE = 0.5 with >= stays as seeded; the 2026-11-13 production histogram (70 rows, 4 below 0.5, 44 at 0.9 or 1.0) confirmed it and the check was not re-run"
  - "The row field is `sources` (confidence plus operating status per source), not a bare `source_confidences` array: condition 4 needs the status of the qualifying source, so a confidence-only array cannot express it"
  - "Absence is read as failure with positive-evidence checks (non-empty text, a number) instead of `!== null`, so an undefined field from an untyped cast cannot pass the rule"
  - "A not-scoreable row is shown by the Shortlist even when it is the only row; it is not hidden behind the raise-the-cutoff empty state"
requirements-completed: []
duration: "about 9 min of wall clock (16:59 to 17:09 +01:00)"
completed: 2026-11-13
status: complete
actuals:
  tokens: 12000
  tasks: 3
  commits: 4
plan_head_before: b083abdffee6fff731ff9f193b7e3c36eedeb785
plan_head_after: 22151c13e1b7a2d5b8dee6872aa2a2b4d149c14f
coverage:
  - deliverable: "One predicate (isReleasable, with scoreableVerdict inside it) decides releasability; the release path and both admin counts call it"
    verification:
      - kind: test
        ref: "lib/triage-eligibility.test.ts#isReleasable"
        status: pass
      - kind: test
        ref: "lib/triage-release.integration.test.ts#ENG-06: the scoreable rule inside the single releasability predicate"
        status: pass
    human_judgment: false
  - deliverable: "Four-condition truth table with every probe-named boundary (>= at 0.5, adjacent duplicates, zero sources, null, fixed order, float neighbours)"
    verification:
      - kind: test
        ref: "lib/triage-eligibility.test.ts#scoreableVerdict"
        status: pass
    human_judgment: false
  - deliverable: "Six new row fields are required; a partial row is a compile error and fails closed at runtime (T-9-07)"
    verification:
      - kind: command
        ref: "npx tsc --noEmit (six @ts-expect-error cases in lib/triage-eligibility.test.ts)"
        status: pass
      - kind: test
        ref: "lib/triage-eligibility.test.ts#isReleasable row contract (T-9-07: required fields, never fail open)"
        status: pass
    human_judgment: false
  - deliverable: "Shortlist keeps a not-scoreable business visible with its reason, and no raw prospect_sources row reaches the browser (D-9-17, T-9-08)"
    verification:
      - kind: test
        ref: "lib/triage-candidates.integration.test.ts#getShortlist"
        status: pass
      - kind: test
        ref: "components/admin/shortlist-table.test.tsx#ShortlistTable NOT SCOREABLE pill (D-9-17)"
        status: pass
    human_judgment: false
  - deliverable: "The NOT SCOREABLE pill reads as a neutral, non-priority state next to CRITICAL and UNREACHABLE"
    verification: []
    human_judgment: true
    rationale: "Visual adequacy of the pill in the live admin page was not looked at; tests assert it renders, with its title, not that it looks right."
---

# Phase 9 Plan 04: The scoreable rule inside isReleasable Summary

A business is now scoreable only when it has its own domain, exactly one Overture match at or above 0.5, an address or a stored point, and is not marked permanently closed. That rule sits inside the existing `isReleasable`, so the release path and both admin eligible counts get it with no second copy of any condition. A business that fails keeps its row and its reason stays readable in the Shortlist.

`actuals.tokens: 12000` is chars/4 over the realised diff (48,369 characters across the four commits, 10 files, 677 insertions and 52 deletions). The plan estimated 80,000; the real figure is far under it and is not rounded toward it.

## Accomplishments

- **The constant** (`lib/triage-constants.ts`): `MIN_MATCH_CONFIDENCE = 0.5`, marked a tunable default, in the cutoff and ceiling block. The comment carries the research measurement (Overture's default is 0.5; 55% of installer rows sit at exactly 0.5; at 0.5 inclusive about 86% of hosts keep one match, at 0.7 about 75% drop) and the 2026-11-13 production confirmation, and says that raising it needs a marker refresh run.
- **The rule** (`lib/triage-eligibility.ts`): `scoreableVerdict(row, minConfidence)` evaluates, in one fixed documented order, (1) own domain via `isAggregatorDomain` (no second domain list), (2) exactly one qualifying match with `>=` and no rounding, (3) address text or a stored point, (4) not permanently closed, judged on the qualifying source only. The first failure is the single reported reason, so the stored marker is stable across runs. It reads no trade, no trade score, no `own_site` field. `isReleasable` keeps its three existing clauses unchanged, including the reachable short-circuit, and adds the verdict as the fourth; the no-HTTPS fast track does not override it.
- **Required fields** (T-9-07): `ScoreableRow` makes `domain`, `website_url`, `address`, `latitude`, `longitude` and `sources` required. Six `@ts-expect-error` cases prove `tsc` rejects a row missing any one. Runtime absence also fails closed (see deviation 3).
- **Read paths**: `selectWorstN` and `getShortlist` select the new columns and the `prospect_sources(raw_confidence, raw_operating_status)` embed. `selectWorstN` now maps the raw rows explicitly instead of casting, so a forgotten field cannot hide behind an `as`.
- **Shortlist** (`components/admin/shortlist-table.tsx`): a neutral NOT SCOREABLE pill, reason code as its `title`, same badge tokens as UNREACHABLE, no new colour vocabulary, no next-intl. Both eligible counts (`app/admin/page.tsx` and the table) call `isReleasable`; neither re-implements a condition.
- **ENG-06 edge items closed**: boundary (0.5 passes, 0.4999 fails), adjacency (`[0.5, 0.5]` is `no_unique_match`, never merged), empty (zero sources fails), ordering (a row failing three conditions reports exactly `no_own_domain`), precision (the two doubles either side of 0.5 land on opposite sides, null never qualifies).

## Verification (measured)

| Check | Result |
|-------|--------|
| `npx vitest run --project unit lib/triage-eligibility.test.ts` | 59 passed |
| `npx vitest run --project unit` | 36 files, 501 passed |
| `npx vitest run --project integration lib/triage-release.integration.test.ts` | 13 passed (3 new ENG-06 cases) |
| `npx vitest run --project integration lib/triage-candidates.integration.test.ts` | 23 passed (4 new) |
| `npx vitest run --project component components/admin/shortlist-table.test.tsx` | 14 passed (4 new) |
| Full suite `npx vitest run` | 58 files, 743 tests passed (685 at the 09-03 baseline) |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | completed, route table printed, `.next/BUILD_ID` fresh; no "Failed to compile" |
| `npx eslint` on every touched source and test file | no output |
| `git diff --exit-code -- scanner-service/Dockerfile scanner-service/tsconfig.json` | exit 0 (D-9-13 held) |
| `scoreableVerdict` call sites outside tests | one: inside `isReleasable` (`lib/triage-eligibility.ts:146`) |
| Literal `0.5` at a production `scoreableVerdict` call site | none; `isReleasable` passes `MIN_MATCH_CONFIDENCE` |

### Mutation checks (Task 2 tests are live)

Each mutation was applied to `lib/triage-eligibility.ts`, the unit file re-run, and the file restored with `git checkout --`; nothing from these runs was committed.

| Mutation | Result |
|----------|--------|
| `>=` changed to `>` | 5 failed |
| status check over every source instead of the qualifying one | 1 failed |
| conditions 1 and 2 swapped | 1 failed (the ordering case) |
| confidence rounded to 6 places | 1 failed (the float neighbour) |
| `!== 1` changed to `< 1` | 3 failed |
| restored | 59 passed |

## Task Commits

1. **Task 1** (tracer, TDD): RED `331e04a` test(09-04), GREEN `877699e` feat(09-04). RED evidence validated by `gsd_run check tdd-red-evidence` as `RED_EVIDENCE_OK` (`target_test_failed`): the target test "a not-scoreable row is false even when the no-HTTPS fast track (gated) would release it" failed on its planned assertion (expected false, got true), 9 of 23 unit tests failing, plus 3 of 13 integration tests failing on the same missing rule. Tracer gate: `human_verify_mode` is `end-of-phase` and the verify is automated-only, so the verify (unit, integration, tsc) was re-run end to end and passed; logged `Tracer verified end-to-end, expanding`.
2. **Task 2** (TDD): `f534967` test(09-04). See the TDD note below.
3. **Task 3**: `22151c1` feat(09-04).

`commits: 4` is measured from the plan-head ledger (`b083abd..22151c1`).

## TDD Gate Compliance

RED (`331e04a`) precedes GREEN (`877699e`) for Task 1, both present. No `refactor` commit; none was needed.

Task 2 produced no RED. Its tests passed on first run (59 of 59) because Task 1's action already prescribed the full four-condition implementation, including the qualifying-sources-only status check and filter-before-count, which are the two cases the plan says "change the implementation". Fail-fast rule 1 (unexpected green) was investigated rather than ignored: the feature exists by Task 1's own specification, not because the tests are wrong. The mutation table above is the substitute evidence that the tests are live: five targeted regressions each turned the suite red. Task 2 is therefore a single `test` commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] The Shortlist widening moved into Task 1**
- **Found during:** Task 1
- **Issue:** making the six fields required (T-9-07) breaks `ShortlistRow` callers at compile time, and Task 1's verify includes `npx tsc --noEmit` exiting 0. `getShortlist`'s select, the `ShortlistRow` fields and the `makeRow` fixture could not wait for Task 3.
- **Fix:** widened `ShortlistRow` and `getShortlist`, and updated `makeRow` in `components/admin/shortlist-table.test.tsx`, in the Task 1 GREEN commit. Task 3 kept the pill, the counts, the empty-state change and the new tests.
- **Files modified:** `lib/triage-candidates.ts`, `components/admin/shortlist-table.test.tsx`
- **Commit:** `877699e`

**2. [Plan inconsistency] `sources`, not `source_confidences`**
- **Found during:** Task 1
- **Issue:** the plan's behaviour lines and key_links say `source_confidences`; its action text and "Artifacts this phase produces" say `sources` with both columns. A confidence-only array cannot carry the operating status condition 4 needs.
- **Fix:** used `sources` throughout. Tests build rows with a `sourcesAt(...)` helper.
- **Commit:** `877699e`

**3. [Rule 2 - Missing critical functionality] Fail-closed absence checks**
- **Found during:** Task 1
- **Issue:** the plan's condition text (`row.domain !== null`) passes an `undefined` field, which is exactly how an untyped `as` cast reaches the rule at runtime. That is the fail-open shape T-9-07 exists to prevent.
- **Fix:** each check asks for positive evidence: non-empty text for domain, website and address; a number for each coordinate; `sources ?? []`. Consequences: an empty-string domain also fails, and a half point (latitude without longitude) is not a point. Both are tested.
- **Files modified:** `lib/triage-eligibility.ts`, `lib/triage-eligibility.test.ts`
- **Commit:** `877699e`, `f534967`

**4. [Rule 2 - Missing critical functionality] A not-scoreable row is never hidden by the empty state**
- **Found during:** Task 3
- **Issue:** when no row was eligible and nothing was released, the table collapsed to "Nothing eligible at this cutoff, try raising the cutoff". A lone not-scoreable row would vanish behind it, which is the opposite of D-9-17, and raising the cutoff cannot fix it.
- **Fix:** `hasNotScoreable` keeps the table rendering. Added a `data-eligible-count` attribute on the table wrapper so the count, otherwise only a number inside `page.tsx`'s unexported `ShortlistTab`, can be asserted in a component test.
- **Files modified:** `components/admin/shortlist-table.tsx`, `components/admin/shortlist-table.test.tsx`
- **Commit:** `22151c1`

**5. [Rule 1 - Bug] Fixture counter race in the release integration test**
- **Found during:** Task 1 RED
- **Issue:** `seedTriaged` is called under `Promise.all`; reading the shared `domainCounter` after an `await` gave all thirty fixtures the same `overture_gers_id`, which is unique.
- **Fix:** captured the counter into a local before the first await.
- **Files modified:** `lib/triage-release.integration.test.ts`
- **Commit:** `331e04a`

**Total deviations:** 5 (1 blocker, 1 plan inconsistency, 2 missing critical, 1 bug). **Impact:** none on the plan's contract; all five tighten it.

## Authentication Gates

None.

## Known Stubs

None. `scoreableVerdict` is complete. `not_scoreable_reason` is read and displayed but still not written by anything: the writer is the marker refresh in 09-06, by plan. `isReleasable` deliberately does not trust the stored marker and recomputes from the row, so an unwritten or stale marker can neither release nor block a prospect; it only drives the pill.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: information-disclosure | lib/triage-candidates.ts | `ShortlistRow` now carries `address`, `latitude`, `longitude` and `website_url` to the admin browser so the client can call `isReleasable`. The admin route is secret-gated and `address` was already on `prospects`, but T-9-08 only covers the source embed. Coordinates are anonymised by retention (D-9-25), so they do not outlive an erasure. |

T-9-07 is mitigated and tested (compile error and runtime fail-closed). T-9-08 is mitigated for the embed: only `raw_confidence` and `raw_operating_status` cross to the client, asserted by `Object.keys` and by the absence of a `prospect_sources` property.

## Open items

- **Production dependency, read before deploying:** `selectWorstN` and `getShortlist` now select `prospect_sources.raw_operating_status`. 09-03's SUMMARY records that this column was **not independently re-checked in production** after migration 022 (the four `prospects` columns were). If it is missing there, both the Shortlist API and the release route will return a database error. Run the one-row read-only check in production first: `select raw_operating_status from prospect_sources limit 1;`. This plan's tests ran against the local database only.
- **After-count not measured:** the eligible-count comparison (before: 54 prospects with a domain and a triage score) needs the first production marker refresh, which is 09-06. Nothing here produces it.
- Marker refresh must be re-run if `MIN_MATCH_CONFIDENCE` is ever raised; the comment on the constant says so.
- The NOT SCOREABLE pill was not viewed in the live admin page (see the `human_judgment` entry in `coverage`).

## Next Phase Readiness

09-06 can write `prospects.not_scoreable_reason` using `scoreableVerdict`'s reason, which already matches migration 022's CHECK values character for character (asserted against the migration file). ENG-06 is declared by 09-03, 09-04 and 09-06; the predicate has landed here but the marker refresh has not, so it is not marked complete.

## Self-Check: PASSED

- FOUND: all ten key-files on disk.
- FOUND commits `331e04a`, `877699e`, `f534967`, `22151c1` as ancestors of HEAD; ledger count `b083abd..22151c1` is 4; `gsd_run check evaluation-scope --plan 09-04 --commits-only` resolved the same commits.
- RED and GREEN gate commits both present for the plan (`test(09-04)` x2, `feat(09-04)` x2).
- Not re-measured at close: the production histogram (taken from the plan's closed human-check, as the orchestrator stated).
