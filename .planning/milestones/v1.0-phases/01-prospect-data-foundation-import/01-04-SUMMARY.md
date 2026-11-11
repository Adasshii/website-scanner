---
phase: 01-prospect-data-foundation-import
plan: 04
subsystem: database
tags: [duckdb, overture-maps, geoparquet, supabase, cli, ssrf, dedupe]

# Dependency graph
requires:
  - phase: 01-prospect-data-foundation-import (plan 01-02)
    provides: OverturePlaceRow type, makeOverturePlace fixture, @duckdb/node-api + tldts deps
  - phase: 01-prospect-data-foundation-import (plan 01-03)
    provides: normalizeDomain, upsertOverturePlace (GERS-first-then-domain identity/dedupe)
provides:
  - "queryOverturePlaces() — in-process DuckDB query of Overture's public S3 GeoParquet with runtime category-field detection"
  - "scripts/import-prospects.ts — the repeatable CLI that turns a country/region/category slice into durable prospects"
  - "Exact province-boundary filtering via the Overture divisions theme (replaces a border-bleeding rectangular bbox)"
  - "Aggregator/directory-domain denylist (isAggregatorDomain) so directory links never become prospect identity"
affects: [phase-2-compliance-spine, phase-3-triage, phase-4-scan-queue]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Runtime category-field detection (DESCRIBE-based) instead of hardcoding categories.primary vs taxonomy.primary/basic_category"
    - "Rectangular bbox as row-group pruning ONLY; ST_Within against the Overture divisions polygon as the exact region boundary"
    - "Registrable-domain denylist checked via the existing normalizeDomain, applied inside upsertOverturePlace as the single mapping choke point"
    - "Dependency-injection seams (ImportDeps) so the CLI's arg-validation, dry-run, and --limit behavior are unit-tested without live DuckDB/S3/Supabase"

key-files:
  created:
    - lib/overture-client.ts
    - scripts/import-prospects.ts
    - scripts/import-prospects.test.ts
  modified:
    - lib/domain-normalize.ts
    - lib/domain-normalize.test.ts
    - lib/prospect-upsert.ts
    - lib/prospect-upsert.integration.test.ts

key-decisions:
  - "Region scoping cannot use addresses[1].region (NULL on every sampled NL row); a country/region bbox table (REGION_BBOXES) is used as row-group-pruning pre-filter instead, with a documented escalation path"
  - "The bbox alone bled in neighboring-province border towns; the exact region boundary is now the Overture divisions-theme polygon (subtype='region', class='land') via ST_Within, resolved once per run and validated against ambiguous/zero matches"
  - "Aggregator/directory domains (tripadvisor.com, facebook.com, etc.) are never valid prospect identity — a row resolving to one is treated as a no-website prospect (null domain, null prospects.website_url, lifecycle_state='no_website'), while prospect_sources.raw_website_url still preserves the original URL untouched"
  - "The Overture release is a single hand-bumped constant (OVERTURE_RELEASE), not auto-discovered — simplest thing that works per the research's own recommendation"

patterns-established:
  - "Pure/synchronous SQL-building and matching functions (buildPlacesSql, pickProvinceDivisionId, resolveBbox) are split out for static unit testing; only the actual S3/DuckDB fetch stays untested by unit suites"
  - "Aggregator-domain checks live in one choke point (upsertOverturePlace's domain computation) rather than being duplicated per caller"

requirements-completed: [IMP-01, IMP-02, IMP-07]

coverage:
  - id: D1
    description: "queryOverturePlaces() runs a country/region/category slice against Overture's public GeoParquet via DuckDB, with runtime category-field detection (categories.primary vs taxonomy.primary/basic_category)"
    requirement: "IMP-01"
    verification:
      - kind: unit
        ref: "lib/overture-client.test.ts (buildPlacesSql, resolveBbox, pickProvinceDivisionId, detectCategoryColumn shape)"
        status: pass
      - kind: manual_procedural
        ref: "npx tsx scripts/import-prospects.ts --country=NL --region=noord-holland --category=restaurant --dry-run --limit=200 — 200 rows returned, 153 with domain / 47 no-website"
        status: pass
    human_judgment: false
  - id: D2
    description: "scripts/import-prospects.ts CLI enforces required --country/--region/--category filters before any Overture query or DB write, supports --dry-run (zero writes) and --limit"
    requirement: "IMP-02"
    verification:
      - kind: unit
        ref: "scripts/import-prospects.test.ts#parseImportArgs rejects a run missing --country, --region, or --category"
        status: pass
      - kind: unit
        ref: "scripts/import-prospects.test.ts#runCli — missing filter has zero DB/Overture side effects (D-10)"
        status: pass
      - kind: unit
        ref: "scripts/import-prospects.test.ts#runImport — --limit caps a real (writing) run"
        status: pass
    human_judgment: false
  - id: D3
    description: "A row with no websites entry (or an aggregator/directory URL) routes to the no_website path; a malformed row is logged and skipped, never fatal"
    requirement: "IMP-07"
    verification:
      - kind: integration
        ref: "lib/prospect-upsert.integration.test.ts#IMP-07/D-06: rows with no website import with domain NULL and lifecycle_state='no_website'"
        status: pass
      - kind: integration
        ref: "lib/prospect-upsert.integration.test.ts#D-11 fix: a row whose website resolves to an aggregator domain (tripadvisor.com) imports as no_website with null domain/website_url"
        status: pass
      - kind: unit
        ref: "scripts/import-prospects.test.ts#runImport — --limit caps a real (writing) run: a bad row is logged and skipped, not fatal (IMP-07 / T-01-07)"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-11 blocking-human sample audit: Joshua eyeballs a real dry-run sample for data-quality failure classes before any real (writing) import"
    verification: []
    human_judgment: true
    rationale: "Overture data quality is a proven risk (98% false-positive read before correction) — this is a human judgment call Overture's own confidence score cannot make. Approved 2026-07-18 conditional on the aggregator-domain fix, now implemented and verified."

duration: ~50min (across sessions, split by the D-11 human checkpoint)
completed: 2026-07-18
status: complete
---

# Phase 1 Plan 4: Overture Importer + D-11 Data-Quality Gate Summary

**DuckDB-based Overture Places importer (`queryOverturePlaces` + `scripts/import-prospects.ts`) with exact province-boundary filtering, SSRF-safe dry-run sampling, and an aggregator-domain denylist so directory listings never masquerade as prospect identity.**

## Performance

- **Duration:** ~50 min across sessions (Tasks 1-3 in one session; the D-11 checkpoint paused for Joshua's manual sample audit; this session implemented the approved aggregator-domain fix and closed the plan)
- **Started:** 2026-07-18T20:08:15Z (Task 1 commit)
- **Completed:** 2026-07-18T20:53:16Z (aggregator-fix commit)
- **Tasks:** 4 (3 auto + 1 blocking-human checkpoint)
- **Files modified:** 8 (3 created, 5 modified — including the D-11 audit follow-up fixes)

## Accomplishments

- `lib/overture-client.ts`: `queryOverturePlaces()` queries Overture's public S3 GeoParquet in-process via DuckDB, with runtime detection of whether the release exposes `categories.primary` or `taxonomy.primary`/`basic_category`
- `scripts/import-prospects.ts`: the CLI orchestrator — required `--country`/`--region`/`--category`, `--dry-run` (write-free, SSRF-safe reachability sample via `validateUrlSafe`), `--limit`, per-row log-and-skip resilience
- D-11 audit follow-up #1 (bbox escalation): `addresses[1].region` is NULL on every sampled NL row, so region scoping moved to a bbox pre-filter (`REGION_BBOXES`) for row-group pruning
- D-11 audit follow-up #2 (exact boundary): the rectangular bbox alone bled in neighboring-province border towns (e.g. Zuid-Holland's Leiden/Sassenheim/Warmond inside a Noord-Holland slice) — replaced with an exact `ST_Within` polygon check against the Overture divisions theme, filtered to `class='land'` to exclude the maritime/territorial-waters duplicate rows every coastal province has
- D-11 audit follow-up #3 (this session): aggregator/directory denylist (`AGGREGATOR_DOMAINS` + `isAggregatorDomain()`) — a row whose website resolves to tripadvisor.com, facebook.com, etc. now imports as a `no_website` prospect (null domain, null `prospects.website_url`) instead of collapsing every listing sharing that aggregator into one wrong prospect; the raw aggregator URL is still preserved in `prospect_sources.raw_website_url`
- D-11 human gate: Joshua approved the sample and province-boundary fix, conditional on the aggregator-domain fix — now implemented, tested, and re-verified via a live dry-run

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/overture-client.ts — DuckDB Overture query with runtime category-field detection** - `276edd4` (feat)
2. **Task 2: scripts/import-prospects.ts — CLI, dry-run sample, SSRF-safe reachability, orchestration** - `f420089` (feat)
3. **Task 3: scripts/import-prospects.test.ts — CLI arg-validation and dry-run/limit behavior** - `81918f6` (test)
   - Follow-up fix — `69b1451` (fix): bbox pre-filter + region bbox resolution (research-authorized escalation)
   - Follow-up fix — `c179182` (fix): exact province boundary via divisions theme (D-11 audit follow-up)
   - Follow-up fix — `31e709f` (fix): filter divisions to class=land, drop invalid ST_GeomFromWKB cast
4. **Task 4: D-11 manual sample audit** - human checkpoint; approved 2026-07-18 conditional on the aggregator-domain fix below
   - Closing fix — `63e0e4d` (fix): aggregator-domain denylist — directory links never become prospect identity

**Plan metadata:** (this commit) — `docs(01-04): complete Overture importer + D-11 data-quality gate plan`

## Files Created/Modified

- `lib/overture-client.ts` - `queryOverturePlaces()`, `detectCategoryColumn()`, `resolveBbox()`, `resolveProvinceDivisionId()`, `pickProvinceDivisionId()`, `buildPlacesSql()`, `OVERTURE_RELEASE`, `COUNTRY_BBOXES`, `REGION_BBOXES`
- `scripts/import-prospects.ts` - CLI entrypoint, `parseImportArgs`, `runImport`, `runCli`, SSRF-safe `checkReachability` (now also labels aggregator rows distinctly), `pickRandomSample`
- `scripts/import-prospects.test.ts` - CLI arg-validation, dry-run write-freeness, `--limit` cap, SSRF-blocked-fixture, and aggregator-labeling tests
- `lib/domain-normalize.ts` - added `AGGREGATOR_DOMAINS` denylist + `isAggregatorDomain()` helper
- `lib/domain-normalize.test.ts` - unit tests for `isAggregatorDomain`
- `lib/prospect-upsert.ts` - `upsertOverturePlace()` now resolves an aggregator-domain `websiteUrl` to `null` before computing `domain`/writing `prospects.website_url`, while `prospect_sources.raw_website_url` still stores the original raw URL
- `lib/prospect-upsert.integration.test.ts` - integration test proving two different tripadvisor.com listings never collapse into one prospect and that the raw URL survives in `prospect_sources`

## Decisions Made

- Region matching via `addresses[1].region` is impossible (field is NULL on real NL data) — bbox pre-filter substituted, with the exact boundary later resolved via the Overture divisions theme rather than trusting the bbox as the region definition
- Coastal NL provinces have two `subtype='region'` division rows (land + maritime) sharing a name; `class='land'` excludes the territorial-waters duplicate rather than tripping the ambiguity fail-fast on every coastal province
- Aggregator-domain resolution lives in a single choke point (`upsertOverturePlace`'s domain computation), not duplicated in the CLI and the upsert function separately — the CLI's dry-run labeling and count adjustments call the same `isAggregatorDomain()` helper for consistency, but the identity/dedupe decision itself is made once

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, research-pre-authorized] bbox pre-filter escalation**
- **Found during:** Task 1/2 real-slice testing
- **Issue:** `addresses[1].region` string predicate is NULL on every sampled NL row — a country+category-only query against it forced a full unpruned S3 scan (9+ minutes, zero possible matches)
- **Fix:** Added `REGION_BBOXES`/`COUNTRY_BBOXES` and a `resolveBbox()` pre-filter on the native `bbox.xmin/xmax/ymin/ymax` columns (23s vs 9+ min on a real probe) — this escalation was explicitly pre-authorized in RESEARCH.md's documented trade-off
- **Files modified:** `lib/overture-client.ts`
- **Verification:** `npx tsc --noEmit` green; live dry-run returns real NL rows in seconds
- **Committed in:** `69b1451`

**2. [Rule 1 - Bug, D-11 audit follow-up] Exact province boundary via divisions theme + class='land' + native GEOMETRY handling**
- **Found during:** D-11 human sample audit
- **Issue:** The rectangular bbox pre-filter bled in neighboring-province border towns (Zuid-Holland's Leiden/Sassenheim/Warmond appearing inside a Noord-Holland slice); a first attempt at `ST_GeomFromWKB` on the divisions geometry also failed as a type mismatch since both the places and divisions Parquet already expose native `GEOMETRY` columns via GeoParquet metadata
- **Fix:** Added `resolveProvinceDivisionId()` (queries the Overture divisions theme, `subtype='region'`, `class='land'` to exclude the maritime/territorial-waters duplicate every coastal province has) and `pickProvinceDivisionId()` (pure matching logic, unit-tested); `buildPlacesSql()` adds `ST_Within(place.geometry, province.geometry)` as the exact boundary when a region is given, keeping the bbox as pruning only
- **Files modified:** `lib/overture-client.ts`
- **Verification:** re-run against a real slice showed 0 border towns in 200 rows; Joshua's manual audit confirmed the fix
- **Committed in:** `c179182`, `31e709f`

**3. [Rule 2 - Missing critical, human-approved D-11 condition] Aggregator-domain denylist**
- **Found during:** D-11 human sample audit — the initial approval was conditional on this fix
- **Issue:** A row whose Overture `websites[0]` is an aggregator/directory link (tripadvisor.com, facebook.com, etc.) would otherwise collapse with every other listing sharing that domain into one wrong prospect via the domain-collapse branch of `upsertOverturePlace` — directory links are never a business's own identity
- **Fix:** Added `AGGREGATOR_DOMAINS` + `isAggregatorDomain()` (lib/domain-normalize.ts); `upsertOverturePlace` now treats an aggregator-resolved `websiteUrl` as no-website (null `domain`, null `prospects.website_url`, `lifecycle_state='no_website'`) while `prospect_sources.raw_website_url` keeps the original raw URL; the CLI's dry-run reachability check labels such rows `"aggregator"` (never fetched) and excludes them from `hasDomainCount`
- **Files modified:** `lib/domain-normalize.ts`, `lib/prospect-upsert.ts`, `scripts/import-prospects.ts`, plus their test files
- **Verification:** `npx tsc --noEmit` green; `npx vitest run` — 45/45 tests pass, including a new integration test proving two different tripadvisor.com rows never collapse into one prospect and the raw URL survives in `prospect_sources`; live dry-run re-run (NL/Noord-Holland/restaurant/--limit=200) confirmed the counts pipeline reflects the aggregator-aware split (153 with domain, 47 no-website)
- **Committed in:** `63e0e4d`

---

**Total deviations:** 3 auto-fixed (1 research-pre-authorized escalation, 2 D-11-audit-driven bug/critical-functionality fixes)
**Impact on plan:** All three were necessary for correctness against real Overture data; none were scope creep — the first two were explicitly anticipated escalation paths in RESEARCH.md, and the third was the human-approved condition attached to the D-11 sign-off itself.

## Issues Encountered

None beyond the deviations above — all were resolved within this plan's scope before the D-11 gate closed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 1's user-facing deliverable (the repeatable importer) is complete and Joshua-approved: `npx tsx scripts/import-prospects.ts --country=NL --region=<region> --category=<category> [--dry-run] [--limit=N]`
- The first real (writing) import against production Supabase is a manual command Joshua runs when ready — deliberately NOT run as part of this plan's closeout
- Phase 1 (Prospect Data Foundation & Import) is now fully executed (4/4 plans); Phase 2 (compliance spine) has no dependency on this phase and may proceed in parallel per the roadmap decision log

---
*Phase: 01-prospect-data-foundation-import*
*Completed: 2026-07-18*

## Self-Check: PASSED

All files created/modified in this plan verified present on disk (lib/overture-client.ts, scripts/import-prospects.ts, scripts/import-prospects.test.ts, lib/domain-normalize.ts, lib/domain-normalize.test.ts, lib/prospect-upsert.ts, lib/prospect-upsert.integration.test.ts). All referenced commit hashes (276edd4, f420089, 81918f6, 69b1451, c179182, 31e709f, 63e0e4d) verified present in git history.
