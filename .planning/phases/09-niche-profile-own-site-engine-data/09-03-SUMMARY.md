---
phase: 09-niche-profile-own-site-engine-data
plan: 03
subsystem: prospect-import
tags: [eng-06, overture, migration-022, coordinates, retention, d-9-16, d-9-17, d-9-22, d-9-25]
requires:
  - phase: 09-niche-profile-own-site-engine-data
    provides: "09-01 toolchain baseline and the ENG-07 Google-content guard (column names here pass its schema assertion)"
provides:
  - "Migration 022: prospects.latitude, longitude, not_scoreable_reason, scoreable_checked_at and prospect_sources.raw_operating_status, with two guarded CHECK constraints"
  - "buildPlacesSql projects ST_X / ST_Y and operating_status; mapOvertureRow carries them onto OverturePlaceRow.lon / .lat / .operatingStatus"
  - "maybeFillCoordinates: a database-side fill-only-when-null coordinate write, called in all three upsert branches"
  - "latitude and longitude in ANONYMIZED_PROSPECT_FIELDS, with a both-direction test"
affects: [09-04, 09-06, 09-09, phase-10]
tech-stack:
  added: []
  patterns:
    - "Fill-only-when-null enforced by a .is(column, null) filter on the update, not a read-then-write"
    - "Pure row mapper extracted from the DuckDB call so the projection is testable without live DuckDB"
    - "A new personal-data column ships with its retention entry and its test in the same plan"
key-files:
  created:
    - supabase/migrations/022_add_prospect_coordinates_and_scoreable_marker.sql
  modified:
    - lib/overture-client.ts
    - lib/overture-client.test.ts
    - types/scanner.ts
    - tests/fixtures/overture.ts
    - lib/prospect-upsert.ts
    - lib/prospect-upsert.integration.test.ts
    - scripts/import-prospects.ts
    - lib/retention-constants.ts
    - lib/retention.integration.test.ts
key-decisions:
  - "Task 1 resolved proceed-as-recorded (2026-11-13): coordinates are stored on prospects at import, a one-way door per D-9-16"
  - "latitude and longitude are anonymised (D-9-25); not_scoreable_reason and scoreable_checked_at are deliberately kept, because they hold a reason code and a timestamp, no personal data, and keeping them preserves the reporting record D-7-17 chose anonymise-over-delete to protect"
  - "lib/retention.ts reads ANONYMIZED_PROSPECT_FIELDS (line 247) and hard-codes no column list, so no second edit exists to drift"
requirements-completed: []
duration: "about 22 min of commit time (16:19 to 16:40 +01:00); the production checkpoint wait is not counted"
completed: 2026-11-13
status: complete
actuals:
  tokens: 75000
  tasks: 4
  commits: 2
plan_head_before: bd64b669989f8d15bc9418dd414c5f4d25f7878c
plan_head_after: 87cd07a20e615dc5bbefd97f4ff85459bfd7b44b
---

# Phase 9 Plan 03: Overture point, operating status and the not-scoreable marker Summary

One Overture point is now captured once at import and stored on `prospects`, Overture's `operating_status` reaches `prospect_sources`, a re-import can fill a null coordinate but never move a stored one, and an anonymised prospect keeps no business location. Migration 022 is applied locally and, by Joshua's hand, in production, with the limits of that production evidence stated below.

`actuals.tokens: 75000` is the plan's own estimate carried over; it was not re-measured with chars/4 over the realised diff (the diff is 336 insertions and 24 deletions summed over the two commits, touching 10 distinct files, which is well under it). Treat it as unmeasured.

## Accomplishments

- **Migration 022** (`supabase/migrations/022_add_prospect_coordinates_and_scoreable_marker.sql`, migration 019 shape): five `add column if not exists` columns, `prospects_not_scoreable_reason_check` (`no_own_domain`, `no_unique_match`, `no_location`, `permanently_closed`) and `prospects_coordinates_range_check` (latitude -90 to 90, longitude -180 to 180, when both are non-null), both through guarded `do $$ ... pg_constraint` blocks. No index, no RLS policy.
- **Projection** (`lib/overture-client.ts`): `ST_X(place.geometry) AS lon`, `ST_Y(place.geometry) AS lat` and `place.operating_status AS operating_status` added to the `buildPlacesSql` SELECT. The bbox pre-filter and the `ST_Within` province check are untouched. The raw geometry is not selected into Node.
- **Types and fixture**: `OverturePlaceRow` gains optional `lat`, `lon`, `operatingStatus`; `makeOverturePlace` gains the same, all defaulting to null, so every existing stub compiles unchanged.
- **Upsert** (`lib/prospect-upsert.ts`): `maybeFillCoordinates` follows the `maybeRefreshWebsiteUrl` shape, with `.is("latitude", null)` as the database-side guard and `if (error) throw error;`. Called in the existing-source and domain-collapse branches; the new-insert branch writes the point in its insert payload. `raw_operating_status` is written beside `raw_confidence` on every branch that writes the source row. The header comment now names the coordinate behaviour.
- **Dry-run path** (`scripts/import-prospects.ts`): `formatSampleLine` prints the projected coordinates (a one-line change to an existing formatter, no new output mode).
- **Retention** (`lib/retention-constants.ts`): `latitude: null` and `longitude: null` added to `ANONYMIZED_PROSPECT_FIELDS`; the doc comment names the two cleared columns and the two deliberately kept ones. `ANONYMIZED_SCAN_FIELDS` is untouched (the scans column lands in 09-09, and D-9-25 binds each column to the plan that creates it).

## Verification (measured)

| Check | Result |
|-------|--------|
| `npx supabase migration up` (local) | applied 022, exit 0, no reset |
| Same SQL run a second time through psql, `ON_ERROR_STOP=1` | exit 0, five "already exists, skipping" notices: idempotent |
| CHECK proofs, rolled-back transactions | `not_scoreable_reason='something_else'` rejected; `permanently_closed` accepted; latitude 95 rejected |
| `lib/overture-client.test.ts` (unit) | 16 passed |
| `lib/prospect-upsert.integration.test.ts` | 12 passed |
| `lib/retention.integration.test.ts` | 40 passed, including the new D-9-25 both-direction test |
| `npx tsc --noEmit` | exit 0 |
| Full suite | 58 files, 685 tests passed (629 at the 09-01 baseline) |
| `git diff --exit-code -- scanner-service/Dockerfile scanner-service/tsconfig.json` | exit 0 (D-9-13 held) |
| Mutation check | removing the `.is("latitude", null)` filter made the "never overwrites a non-null coordinate" test fail (1 failed, 11 passed); the file was restored with `git checkout --` and nothing from that run was committed |

### Live projection check (closes assumption A2)

`npx tsx scripts/import-prospects.ts --country=NL --region=noord-holland --category=roofing --limit=5 --dry-run` exited 0 and wrote nothing. It returned five real businesses with numeric coordinates, longitude 4.57 to 4.64 and latitude 52.26 to 52.27, all inside the expected Dutch range (longitude 3 to 7, latitude 50 to 54). `place.operating_status` selected successfully, so the column exists in the live Overture release. ST_X and ST_Y therefore behave under `@duckdb/node-api` ^1.5.4-r.1 as they did under the Python duckdb 1.4.5 the research probed with. The five sample lines were measured by the previous dispatch; this closing dispatch did not re-run the dry-run and did not re-capture them verbatim, so only the ranges are recorded here.

## Production migration (Task 4, resolved by Joshua)

Joshua ran migration 022 by hand in the production Supabase dashboard SQL Editor on 2026-11-13, in the main session, and reported "done, verified". The evidence, with its limits:

- **Verified on screen:** the `prospects` column check returned 4 rows: `latitude`, `longitude`, `not_scoreable_reason`, `scoreable_checked_at`. Joshua showed the result grid.
- **Not re-run after the successful migration:** the `prospect_sources` / `raw_operating_status` check, and the baseline `select count(*) from prospects where latitude is null;`. Both were run before the migration, when they correctly returned nothing. **Not captured**: there is no post-migration value for either. The `alter table prospect_sources` statement was in the same block that succeeded, so `raw_operating_status` is expected to exist, but it was not independently confirmed. The null-coordinate baseline count is also unrecorded.
- **One earlier false start:** on the first attempt only the three read-only checks were run, not the migration file. They returned 0 rows, 0 rows, and `ERROR: 42703: column "latitude" does not exist`. The migration was then run and the first check passed. Nothing was wrong with the file.

Consequence for later plans: the `prospects` columns are confirmed in production; `prospect_sources.raw_operating_status` is expected but unconfirmed. Any later plan that reads it in production should run the one-row check first. Nothing in Phase 9 depends on the baseline count (ENG-06's location condition is already satisfied by address text), so its absence blocks nothing; Phase 10 will need the real figure once a re-import has run.

## Task Commits

1. **Task 1** (decision gate, no commit): resolved `proceed-as-recorded` by Joshua, 2026-11-13.
2. **Task 2** (tracer): `86903e0` feat(09-03): capture Overture point and operating status at import. Migration 022, the projection, types, fixture, upsert helper, unit and integration tests. Tracer gate: the verify (vitest unit, vitest integration, tsc) was re-run end to end and passed before expansion.
3. **Task 3**: `87cd07a` feat(09-03): re-import coordinate guards, dry-run projection, retention entries.
4. **Task 4** (human action, no commit): resolved by Joshua, 2026-11-13, evidence above.

`commits: 2` is measured from the plan-head ledger (`bd64b66..87cd07a`); Tasks 1 and 4 produce no commit by design.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Pure row mapper extracted from the inline `rows.map`**
- **Found during:** Task 2
- **Issue:** the acceptance criterion asserts that `rows.map` carries `lon`, `lat` and `operatingStatus` onto `OverturePlaceRow`, but the map sat inline inside `queryOverturePlaces` behind a live DuckDB call, so it could not be unit-tested.
- **Fix:** extracted `mapOvertureRow(row, fallbackCountry)`. Behaviour unchanged; the existing tests pass unchanged.
- **Files modified:** `lib/overture-client.ts`, `lib/overture-client.test.ts`
- **Commit:** `86903e0`

**2. [Plan addition] `makeOverturePlace` fixture fields**
- `makeOverturePlace` gained `lat`, `lon` and `operatingStatus`, all defaulting to null, so the plan's "add the two optional fields" became three (the third is `operatingStatus`, which the types change also carries). Commit `86903e0`.

**3. [Rule 1 - Stale wording] Test renamed "all six" to "every"**
- **Found during:** Task 3
- **Issue:** an existing retention test was titled for "all six" `ANONYMIZED_PROSPECT_FIELDS` columns; the map now has eight entries.
- **Fix:** renamed to "every". No assertion changed.
- **Files modified:** `lib/retention.integration.test.ts`
- **Commit:** `87cd07a`

**Total deviations:** 2 auto-fixed, 1 addition, 0 architectural. **Impact:** none on behaviour.

## Authentication Gates

None. Task 4 was a human-action checkpoint (a manual production SQL step), not an auth gate.

## Known Stubs

None. `not_scoreable_reason` and `scoreable_checked_at` exist but nothing writes them yet: that is by plan, the writer is the scoreable predicate and marker refresh in 09-04 and 09-06. Recorded here so the verifier does not read the unwritten columns as an orphan.

## Threat Flags

None beyond the plan's register. T-9-05 (coordinates survive anonymise) and T-9-06 (a shifted Overture centroid moves a stored point) are mitigated and tested: the first by the D-9-25 both-direction test, the second by the `.is("latitude", null)` filter plus the range CHECK, with the mutation check above proving the test fails when the filter is removed.

## Open items

- The `raw_operating_status` production check and the null-coordinate baseline count were not captured after the migration (see the production section). Re-run both read-only checks the first time a later plan reads them.
- Assumption A8 (09-RESEARCH.md) is unchanged by this plan: a re-import against a newer Overture release could insert a second `prospect_sources` row for one business through the domain-collapse branch. 09-06 logs per-reason counts at refresh time so a jump becomes visible.
- ENG-06 is declared by 09-03, 09-04 and 09-06, and the predicate itself lands in 09-04. It is therefore not marked complete here.

## Next Phase Readiness

The columns the scoreable predicate reads exist locally and in production (the `prospects` ones confirmed, `raw_operating_status` expected). 09-04 can now read `latitude`, `longitude` and `not_scoreable_reason`. Existing prospect rows carry null coordinates until a re-import fills them; ENG-06 does not need them because address text satisfies its location condition.

## Self-Check: PASSED

- FOUND: all ten key-files (one created, nine modified) on disk.
- FOUND commits `86903e0` and `87cd07a` as ancestors of HEAD; ledger count `bd64b66..87cd07a` is 2.
- `lib/retention.ts` line 247 updates from `ANONYMIZED_PROSPECT_FIELDS`, so no second column list exists.
- Not re-measured in this closing dispatch (taken from the previous dispatch's measurements, as stated by the orchestrator): the test counts, the live dry-run output, the local migration proofs and the mutation check.
