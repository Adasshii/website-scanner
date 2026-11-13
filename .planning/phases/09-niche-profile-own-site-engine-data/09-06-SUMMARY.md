---
phase: 09-niche-profile-own-site-engine-data
plan: 06
subsystem: scoreable-marker
tags: [eng-06, nic-04, scoreable-marker, d-9-r1, d-9-11, d-9-17, t-9-12, t-9-13, random-import]
requires:
  - phase: 09-niche-profile-own-site-engine-data
    provides: "09-03: migration 022 (prospects.not_scoreable_reason, scoreable_checked_at, prospect_sources.raw_operating_status)"
  - phase: 09-niche-profile-own-site-engine-data
    provides: "09-04: the scoreable rule inside isReleasable, scoreableVerdict and ScoreableFailureReason"
  - phase: 09-niche-profile-own-site-engine-data
    provides: "09-02: INSTALLERS_PROFILE.overtureCategories and .regions"
provides:
  - "refreshScoreability(sb): writes not_scoreable_reason and scoreable_checked_at for un-released prospects, clears a reason that no longer applies, returns and logs a count per reason"
  - "scoreableFailureReason(row): the one production caller of scoreableVerdict and the one place MIN_MATCH_CONFIDENCE is applied; isReleasable and the refresh both go through it"
  - "A not_scoreable_reason gate beside the rejected check on the automatic draft path and the manual generate path, and a fresh scoreableFailureReason verdict in dispatchOne that does not depend on a stored marker"
  - "--category=random and --region=random, resolved from the installers profile before parseImportArgs returns"
affects: [09-09, phase-10]
tech-stack:
  added: []
  patterns:
    - "A persisted explanation is computed by the same function the gate uses, so it cannot drift from the gate"
    - "A read that could be silently truncated by the PostgREST row cap is paged instead"
    - "A new dependency added to a seam is wired at every site that builds that seam, including the runner that builds its own deps"
key-files:
  created:
    - lib/scoreability-refresh.ts
    - lib/scoreability-refresh.integration.test.ts
    - lib/bulk-scan-dispatch.integration.test.ts
  modified:
    - lib/triage-eligibility.ts
    - lib/draft-on-scan-complete.ts
    - lib/draft-on-scan-complete.integration.test.ts
    - lib/outreach-queue.ts
    - lib/outreach-queue.integration.test.ts
    - lib/bulk-scan-dispatch.ts
    - lib/bulk-scan-dispatch.test.ts
    - scripts/import-prospects.ts
    - scripts/import-prospects.test.ts
    - scripts/triage-prospects.ts
    - scripts/triage-prospects.test.ts
    - scripts/pipeline-runner.ts
key-decisions:
  - "Dispatch computes the scoreable verdict fresh (option (b), chosen by Joshua 2026-11-13): it reads the prospect's columns and prospect_sources and calls scoreableFailureReason, so a prospect released before migration 022, which has no stored marker, is still refused. The stored not_scoreable_reason is the Shortlist's readable explanation and is not consulted at dispatch. The refresh was NOT widened to released prospects"
  - "scoreableFailureReason(row) was added to lib/triage-eligibility.ts so scoreableVerdict keeps exactly one production caller after the refresh needed its reason: the refresh and isReleasable both call the wrapper, and the constant is applied in one place"
  - "dispatchOne records a refused prospect with markScanFailed(reason not_scoreable, attemptSpent false), the same way the robots and SSRF pre-flight skips are recorded, because the schema has no skipped state and returning without a write would strand the row in 'scanning'. Reviewed and accepted by the coordinator 2026-11-13; a recorded decision, not an open question"
  - "A failed fresh read at dispatch fails closed: the prospect is recorded as scoreable_check_failed with no attempt spent, never dispatched without a verdict"
  - "The refresh pages its read in 1000-row pages: PostgREST caps a plain select at 1000 rows and a silent cap would leave the later prospects unmarked"
  - "The random region is refused for a country other than the profile's, instead of failing later inside resolveBbox"
  - "The refresh does not run on a dry run of the triage script, matching the import script and the 'zero writes' promise of a dry run"
requirements-completed: [ENG-06, NIC-04]
duration: "about 9 min of wall clock for the original three tasks (23:40 to 23:49 +01:00), plus about 15 min for the option (b) follow-up; the read-in before the first command is not counted"
completed: 2026-11-13
status: complete
actuals:
  tokens: 15295
  tasks: 3
  commits: 8
plan_head_before: 96d184db62b8f28ad68cbd5f2588d41d923918d3
plan_head_after: 5cad85fa0731f694bf6cc4b59372ddd62f9796d1
coverage:
  - deliverable: "The marker refresh writes the verdict's reason verbatim, clears it when a prospect becomes scoreable, skips released prospects byte-identically, and returns per-reason counts that match the database"
    verification:
      - kind: test
        ref: "lib/scoreability-refresh.integration.test.ts#refreshScoreability"
        status: pass
    human_judgment: false
  - deliverable: "Import and triage scripts (and the admin pipeline runner) refresh the marker after a non-dry run and never on a dry run"
    verification:
      - kind: test
        ref: "scripts/import-prospects.test.ts#runImport marker refresh"
        status: pass
      - kind: test
        ref: "scripts/triage-prospects.test.ts#runTriage marker refresh"
        status: pass
    human_judgment: false
  - deliverable: "A marked prospect is refused by the automatic draft path, the manual generate path and the dispatch loop, each beside its existing terminal-state check"
    verification:
      - kind: test
        ref: "lib/draft-on-scan-complete.integration.test.ts#ENG-06/D-9-17"
        status: pass
      - kind: test
        ref: "lib/outreach-queue.integration.test.ts#generateDraftForProspect not scoreable"
        status: pass
      - kind: test
        ref: "lib/bulk-scan-dispatch.test.ts#T-9-12"
        status: pass
    human_judgment: false
  - deliverable: "--category=random and --region=random sample the profile's lists through an injectable source, explicit values are unchanged, every profile region resolves"
    verification:
      - kind: test
        ref: "scripts/import-prospects.test.ts#parseImportArgs random category and region"
        status: pass
      - kind: command
        ref: "npx tsx scripts/import-prospects.ts --country=NL --region=random --category=random --limit=3 --dry-run"
        status: pass
    human_judgment: false
  - deliverable: "A prospect released or queued before this phase, with no stored marker, is stopped at dispatch"
    verification:
      - kind: test
        ref: "lib/bulk-scan-dispatch.test.ts#T-9-12 (released prospect, no stored marker, fails the rule)"
        status: pass
      - kind: test
        ref: "lib/bulk-scan-dispatch.integration.test.ts#ENG-06 re-check, against real rows"
        status: pass
    human_judgment: false
---

# Phase 9 Plan 06: Persist the not-scoreable reason and refuse to draft for it Summary

A business that fails the scoreable rule now has the reason written to its row at the end of every import and triage run, a marked prospect is refused by the automatic draft path, the manual generate path and the dispatch loop, and `--category=random` and `--region=random` sample the installers profile's own lists. One hole remains and is stated first under Open items: the dispatch check cannot stop a prospect that was released before this phase shipped.

## Follow-up, 2026-11-13: option (b) for the pre-migration gap

The first version of this plan's dispatch gate read the stored marker. The refresh only ever touches un-released prospects, so a prospect released before migration 022 carried no marker and would have passed dispatch (and then the draft gates). Joshua was shown three options in the main session on 2026-11-13 and chose (b): compute the verdict fresh at dispatch. Option (a), widening the refresh to released prospects, was rejected because a first marker on a historical row would put a NOT SCOREABLE pill on history the rule never judged at the time; (c), accepting the gap, was not chosen. `dispatchOne` now reads the prospect's `domain`, `website_url`, `address`, `latitude`, `longitude` and `prospect_sources(raw_confidence, raw_operating_status)` in one select and calls `scoreableFailureReason`. The stored `not_scoreable_reason` is not consulted there. A failed read fails closed as `scoreable_check_failed` with no attempt spent. The refresh was not widened and `scoreableVerdict` still has one production caller.

`actuals.tokens: 15295` is chars/4 over the realised non-planning diff (61,181 characters across the eight commits before the final docs commit, 15 files, 1,016 insertions and 15 deletions). The plan estimated 80,000 and the real figure is not rounded toward it. `commits: 8` is measured from the plan-head ledger and includes the first docs commit.

## Accomplishments

- **The refresh** (`lib/scoreability-refresh.ts`): reads every un-released prospect with the same columns and `prospect_sources` embed the release path reads, calls `scoreableFailureReason` per row, groups ids by outcome, and writes `{ not_scoreable_reason, scoreable_checked_at }` in chunked `.in()` statements (150 ids, via `chunkIds`). It evaluates no condition of its own. It returns `{ considered, scoreable, byReason }` and logs one `[scoreability-refresh]` line with the per-reason counts, which is the detector for assumption A8 (a GERS id that changes between Overture releases turning one match into two). The header comment records that changing `MIN_MATCH_CONFIDENCE` leaves every stored reason stale until a refresh runs. `lib/triage-constants.ts` was not touched.
- **One caller, one constant** (`lib/triage-eligibility.ts`): `scoreableFailureReason(row)` returns the reason or null by applying `scoreableVerdict` at `MIN_MATCH_CONFIDENCE`. `isReleasable` now gates on `scoreableFailureReason(row) === null`, and the refresh persists the same function's output. A grep for `scoreableVerdict(` outside tests returns one line, inside the wrapper. The refresh never imports `MIN_MATCH_CONFIDENCE`.
- **Wired at every site that builds the seam**: `ImportDeps` and `TriageDeps` carry `refreshScoreability`. `runImport` calls it once after the upsert loop on a non-dry run; `runTriage` calls it once after the batch loop on a non-dry run. `scripts/pipeline-runner.ts` builds its own `TriageDeps` and `ImportDeps` for the admin Pipeline button and was not in the plan's file list; it is wired too, otherwise the button would skip the refresh the terminal run performs.
- **Three gates**: `lib/draft-on-scan-complete.ts` gains gate 6b beside the rejected check (header list updated, code order matches), resolving to `{ outcome: "skipped", reason: "not-scoreable" }` and never `failed`. `lib/outreach-queue.ts`'s manual path returns `{ ok: false, error: "prospect is not scoreable" }` beside its rejected check. `dispatchOne` computes the verdict fresh (see the follow-up section): it reads the prospect's columns and sources, calls `scoreableFailureReason`, and refuses before any network call, so a prospect released before migration 022 with no stored marker is still refused. The two draft gates are literal per-handler reads of the stored marker; no shared helper exists. The atrium `owner` gate does not exist on this branch and was not written or anticipated; gate 6b sits next to gate 6 and does not touch the area where atrium's Gate 3b lands.
- **Random import** (`scripts/import-prospects.ts`): `parseImportArgs(argv, random = Math.random)` resolves `random` for `--region` (drawn first) and `--category` from `INSTALLERS_PROFILE.regions` and `.overtureCategories` before returning, so `runImport`, the Overture query, `resolveBbox` and the containment check see ordinary values. Both flags stay required. `ImportDeps.random` is optional and `runCli` passes it through. The usage text names `random` for both flags. No inline category or region list exists in the file.

## Verification (measured)

| Check | Result |
|-------|--------|
| `npx vitest run --project integration lib/scoreability-refresh.integration.test.ts` | 10 passed |
| `npx vitest run --project unit lib/bulk-scan-dispatch.test.ts` | 15 passed |
| `npx vitest run --project integration lib/bulk-scan-dispatch.integration.test.ts` | 5 passed (select proven against real rows) |
| `npx vitest run --project integration lib/draft-on-scan-complete.integration.test.ts lib/outreach-queue.integration.test.ts` | 30 passed |
| `npx vitest run --project unit scripts/import-prospects.test.ts` | 26 passed |
| Full suite `npx vitest run` | 62 files, 866 tests passed (60 files, 826 tests at the 09-05 baseline) |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0, no "Failed to compile" |
| `npx eslint` on the 13 touched source and test files | exit 0 |
| `git diff --exit-code -- scanner-service/Dockerfile scanner-service/tsconfig.json` | exit 0 (D-9-13 held) |
| `scoreableVerdict(` call sites outside tests | one, inside `scoreableFailureReason` (`lib/triage-eligibility.ts:134`) |
| Live `npx tsx scripts/import-prospects.ts --country=NL --region=random --category=random --limit=3 --dry-run` | exit 0, summary line `NL/gelderland/building_contractor: 3 rows (2 with domain, 1 no-website)`; both values are members of the profile lists; zero writes |

### Mutation checks (the new tests are live)

Each mutation was applied, the relevant file re-run, and the file restored (from a copy, or `git checkout --` where the file was already committed); nothing from these runs was committed.

| Mutation | Result |
|----------|--------|
| Refresh without the `scan_released_at is null` filter | 2 failed |
| Refresh skipping the scoreable (null) group, so stale reasons stay | 3 failed |
| Import script never calls the refresh | 1 failed |
| Triage script refreshes on a dry run too | 1 failed |
| Stored-marker dispatch gate removed (first version, since replaced) | 1 failed |
| Fresh dispatch verdict never refuses | 4 failed unit, 4 failed integration |
| Dispatch reads a missing prospect_sources embed as one good match | 1 failed (survived the first test set; a null-embed case was added) |
| Dispatch treats a failed read as a pass | 1 failed |
| Automatic draft gate 6b removed | 1 failed |
| Manual generate gate removed | 1 failed |
| Random pick ignores the source (always index 0) | 3 failed |
| Random pick without the clamp for a source returning 1 | 1 failed |
| Random region accepted for a country other than the profile's | 1 failed |
| Explicit region drawn from the random source | 1 failed |
| All restored | refresh 10 passed, import and triage 28 passed, dispatch 15 unit and 5 integration passed, draft and outreach 30 passed |

## Task Commits

1. **Task 1** (tracer, TDD): RED `2a527ee` test(09-06), GREEN `54ec4e4` feat(09-06). RED evidence validated by `gsd_run check tdd-red-evidence` as `RED_EVIDENCE_OK` (`target_test_failed`) from a `tap-flat` report: the target test "writes no_own_domain and a checked-at timestamp for a prospect whose website is an aggregator listing" failed on its planned assertion (`expected null to be 'no_own_domain'`), 9 of 10 failing. Semantic assessment: the target executed and failed on the planned assertion for the intended reason; the one passing case (released prospect untouched) passes against a no-op by construction and is covered by the mutation table. Tracer gate: `human_verify_mode` is `end-of-phase` and the verify is automated-only, so the verify (integration, unit, tsc) was re-run end to end before expansion and passed; logged `Tracer verified end-to-end, expanding`.
2. **Task 2**: `daede22` feat(09-06). The two draft gates and the first (stored-marker) dispatch gate, with tests.
3. **Task 3**: `1f2ce42` feat(09-06). Random category and region.
4. **Docs**: `e5d803d` docs(09-06). First SUMMARY, STATE, ROADMAP, REQUIREMENTS.
5. **Option (b) follow-up** (TDD): RED `9c0d296` test(09-06) and `ac26259` test(09-06), GREEN `5cad85f` feat(09-06). See the TDD note.

`commits: 8` is measured from the plan-head ledger (`96d184d..5cad85f`) and includes the first docs commit. The final docs commit lands after this SUMMARY is written.

## TDD Gate Compliance

Task 1: RED `2a527ee` precedes GREEN `54ec4e4`, both present. No `refactor` commit; none was needed. The RED commit carries an inert scaffold stub of `lib/scoreability-refresh.ts` so the target test fails on its assertion instead of on a missing module (a missing module is INVALID_RED). Tasks 2 and 3 are `type="auto"` without `tdd`, so one `feat` commit each; their tests were proved live by the mutation table, and for Task 3 the new cases were run before the implementation and 7 of 26 failed on their planned assertions (`expected 'random' to be 'roofing'` and similar).

Option (b) follow-up: RED `9c0d296` and `ac26259`, GREEN `5cad85f`. Against the stored-marker implementation, 5 of the new cases failed on their planned assertions (the prospect was dispatched when the rule says refuse). The first RED run was rejected by the classifier as `INVALID_RED` (`invalid_record`, "Non-TAP data in report"): vitest's TAP reporter prints a multi-line `toEqual` diff as unindented text, which breaks the TAP block. I did not treat that as passing. The refusal case now leads with a single-line scalar assertion (`ac26259`), and the target alone was re-run with `-t` and returned `RED_EVIDENCE_OK` (`target_test_failed`, `expected undefined to be 'not_scoreable'`). Semantic assessment: the target executed and failed because dispatch read only the stored marker, which is the planned reason. Slip to own: `9c0d296` was committed in the same shell command as the first classifier run, without the verdict gating the commit; the evidence was then repaired in `ac26259` before any GREEN code was written.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] `scripts/pipeline-runner.ts` wired**
- **Found during:** Task 1 (`tsc` exit 2)
- **Issue:** the runner builds its own `TriageDeps` and `ImportDeps` for the admin Pipeline button. Making `refreshScoreability` a required field broke it at compile time, and leaving it unwired would have meant the button skips the refresh the terminal run performs.
- **Fix:** imported `refreshScoreability` and passed it in both modes. The file was not in the plan's `files_modified`.
- **Files modified:** `scripts/pipeline-runner.ts`
- **Commit:** `54ec4e4`

**2. [Plan conflict] `scoreableFailureReason` added to `lib/triage-eligibility.ts`**
- **Found during:** Task 1
- **Issue:** the plan has the refresh call `scoreableVerdict(row, MIN_MATCH_CONFIDENCE)` directly, which makes a second production caller. The dispatch for this plan requires `scoreableVerdict` to keep exactly one.
- **Fix:** added a four-line wrapper that applies the constant and returns the reason or null, and made `isReleasable` call it. Behaviour of `isReleasable` is unchanged (all 59 eligibility tests pass untouched). Neither the refresh nor dispatch imports the constant, so it is applied in one place. This edits a file the plan does not list.
- **Files modified:** `lib/triage-eligibility.ts`
- **Commit:** `54ec4e4`

**3. [Recorded decision, accepted 2026-11-13] The dispatch skip is recorded as a failed scan_status**
- **Found during:** Task 2
- **Issue:** the plan says to skip "rather than marking it failed". `prospects.scan_status` is constrained to queued, scanning, done or failed. A claimed row is already `scanning`; returning without a write strands it there with no `latest_scan_id`, which `reconcileInFlightScans` ignores, so it would read as scanning forever. Re-arming it to null would put it back in `armBatch`'s pool on every run.
- **Fix:** `markScanFailed(sb, id, "not_scoreable", { attemptSpent: false })`, the exact treatment of the robots and SSRF pre-flight skips: reason kept, no attempt spent, no `scans` row created. I found no reader of prospect-level failed counts as a health signal; the scanner's own monitoring reads `scans`, which is untouched. The coordinator reviewed it against those two skips and accepted it.
- **Files modified:** `lib/bulk-scan-dispatch.ts`
- **Commit:** `daede22`, carried into `5cad85f`

**4. [Rule 2 - Missing critical functionality] The refresh pages its read**
- **Found during:** Task 1
- **Issue:** a plain `select` is capped at 1000 rows by PostgREST. Past that the refresh would silently leave later prospects unmarked, in a feature whose whole job is a safety marker.
- **Fix:** read in 1000-row pages ordered by id.
- **Files modified:** `lib/scoreability-refresh.ts`
- **Commit:** `54ec4e4`

**5. [Plan addition] Test and wiring additions beyond the listed cases**
- `lib/outreach-queue.integration.test.ts` carries the manual-path case (the plan's verify and acceptance name it but its file list omits it). `lib/bulk-scan-dispatch.integration.test.ts` is new and proves the dispatch select against real rows, which the stubbed unit suite cannot. A country guard for `--region=random`, a clamp for a source returning exactly 1, and a triage dry-run exemption were added with tests.
- **Commits:** `54ec4e4`, `daede22`, `1f2ce42`, `5cad85f`

**6. [Direction change, Joshua 2026-11-13] Dispatch trusts a fresh verdict, not the stored marker**
- **Found during:** review of the first SUMMARY
- **Issue:** the plan's dispatch check read the stored marker, which a prospect released before migration 022 never has.
- **Fix:** option (b), described in the follow-up section. The temporary `DispatchProspect` type from `daede22` was removed again; `ClaimedProspect` is used unchanged.
- **Files modified:** `lib/bulk-scan-dispatch.ts`, `lib/bulk-scan-dispatch.test.ts`, `lib/bulk-scan-dispatch.integration.test.ts`
- **Commit:** `5cad85f`

**Total deviations:** 6 (1 blocker, 1 plan conflict, 1 recorded decision, 1 missing critical, 1 addition group, 1 direction change). **Impact:** the plan's stated goal (a prospect released before this phase is never dispatched) is now met, by a different mechanism than the plan prescribes.

## Authentication Gates

None.

## Known Stubs

None. The scaffold stub of `lib/scoreability-refresh.ts` that existed in the RED commit was replaced in the GREEN commit.

## Threat Flags

None beyond the plan's register. T-9-12 is mitigated on all three routes. Dispatch computes the verdict, so it does not depend on a marker existing; the two draft gates read the stored marker and, for a prospect released before migration 022, rely on dispatch having already refused it, because a refused prospect is never scanned and so never reaches scan-complete. T-9-13 is accepted as planned: a sampled value is only ever a member of the profile's committed arrays.

## Production reads of `prospect_sources.raw_operating_status`

Verified in production on 2026-11-13: Joshua ran `select raw_operating_status from prospect_sources limit 1;` in the production Supabase SQL Editor and it returned one row with the value NULL. The column exists and is unfilled, which is expected because no import has re-run against production yet. Migration 022 is now fully confirmed in production (four `prospects` columns verified earlier, this column now). Every production code path that reads or writes it, in one place:

| Path | File | Reads or writes | Reached from |
|------|------|-----------------|--------------|
| Release | `lib/triage-release.ts` (`selectWorstN`, `releaseWorstN`) | read, via the `prospect_sources` embed | `app/api/admin/release-prospects/route.ts` |
| Shortlist | `lib/triage-candidates.ts` (`getShortlist`) | read, via the embed | `app/api/admin/shortlist/route.ts` |
| Marker refresh | `lib/scoreability-refresh.ts` (`refreshScoreability`) | read, via the embed | end of `scripts/import-prospects.ts`, end of `scripts/triage-prospects.ts`, and both modes of `scripts/pipeline-runner.ts` (the admin Pipeline button), on any non-dry run |
| Dispatch | `lib/bulk-scan-dispatch.ts` (`dispatchOne`) | read, via the embed (new in the option (b) follow-up) | `app/api/cron/drain-scan-queue/route.ts` and `app/api/admin/pipeline/drain/route.ts` |
| Import | `lib/prospect-upsert.ts` | write, beside `raw_confidence` | `scripts/import-prospects.ts` and the pipeline runner |
| Rule | `lib/triage-eligibility.ts` (`scoreableVerdict`) | consumes the value, no query | called only by `scoreableFailureReason` |

The migration itself is `supabase/migrations/022_add_prospect_coordinates_and_scoreable_marker.sql`. Reads were added to the release and Shortlist paths by 09-04; the refresh and dispatch reads are this plan's.

## Open items

- **First marker refresh in production not run, and it will write.** The import and triage scripts load `.env.local`, which points at production, so the first non-dry run there now runs the refresh against it and writes `not_scoreable_reason` and `scoreable_checked_at` on every un-released production prospect. The after-count of eligible prospects that 09-04 asked for (before: 54 with a domain and a triage score) still needs that first refresh. Nothing here produces it.
- **A stale marker can refuse a draft for a now-scoreable prospect (fails closed).** The two draft gates still read the stored marker. A marker set by one refresh, then a re-import that fixes the row, then a release (which recomputes and passes) leaves the old marker on a released prospect that the refresh no longer touches. Dispatch no longer trusts the marker, so the prospect is scanned, but both draft gates would then refuse to draft it. Wrong in the safe direction. Not fixed because the draft gates are meant to read the stored marker per the plan.
- **Dispatch adds one read per dispatched prospect.** A drain tick claims at most 10 prospects, so this is at most 10 small reads per tick.
- **Pre-existing lint error, out of scope:** `scripts/triage-prospects.test.ts` line 116 (`_payload` unused) fails `@typescript-eslint/no-unused-vars` at HEAD before this plan. Not touched.
- **Assumption A8 stays unmeasured.** The per-reason log is the detector; a jump in `no_unique_match` after a re-import is the signal. The `last_seen_at` recency filter in Open Question 3 is deliberately not shipped.
- **Cross-branch note kept intact.** `lib/draft-on-scan-complete.ts` is where this plan's gate 6b and the atrium branch's Gate 3b will meet. The plan file's uncommitted note edits were read and followed and the file was not staged.

## Next Phase Readiness

09-09 can rely on the marker being written at the end of import and triage and on the draft gates reading it, and on dispatch refusing any prospect that fails the rule whether or not it carries a marker. ENG-06 is marked complete: it is declared by 09-03, 09-04 and 09-06, all three now have a SUMMARY (`gsd_run query requirements.ready-ids` returned it ready under the shared-ID rule), and the hole that blocked it in the first version of this SUMMARY is closed. NIC-04 is marked complete: the importer reads its category and region lists from the profile, adding a niche is a change to the profile, and the isolation test still holds.

## Self-Check: PASSED

- FOUND: all 15 key-files on disk (3 created, 12 modified).
- FOUND commits `2a527ee`, `54ec4e4`, `daede22`, `1f2ce42`, `9c0d296`, `ac26259`, `5cad85f` as ancestors of HEAD; ledger count `96d184d..5cad85f` is 8 including the first docs commit `e5d803d`; `gsd_run check evaluation-scope --plan 09-06 --commits-only` resolves the plan's commits.
- RED and GREEN gate commits present for both TDD sequences (`test(09-06)` x3, `feat(09-06)` x4).
- `scoreableVerdict(` has one production call site, inside `scoreableFailureReason`; dispatch, the refresh and `isReleasable` all go through `scoreableFailureReason`.
- Full suite 62 files, 866 tests passing; `tsc`, eslint on the touched files and the D-9-13 diff check all clean.
