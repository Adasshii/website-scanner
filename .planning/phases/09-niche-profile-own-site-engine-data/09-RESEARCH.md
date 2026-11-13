# Phase 9: Niche Profile & Own-Site Engine Data - Research

**Researched:** 2026-11-12
**Domain:** Node/TypeScript engine work inside an existing Playwright scanner (JSON-LD and microdata value extraction, Dutch keyword scoring, Overture GeoParquet via DuckDB, Supabase migrations, vitest enforcement tests)
**Confidence:** MEDIUM-HIGH. The code seams and the Overture facts are verified against the repo and live data this session. The keyword lists, scoring weights and thresholds are seeds measured on a 53-site sample and stay `[ASSUMED]` until tuned on the real list.

> **Erratum, 2026-11-13: the migration numbers in this document are superseded.**
> This research was written when 021 and 022 were the next free numbers. Since then the
> unmerged branch `feat/atrium-routes` (commit `837882f`) has claimed
> `supabase/migrations/021_add_prospect_owner.sql`, so Phase 9's two migrations moved up by one.
>
> | This document says | The plans say, and the plans are authoritative |
> |---|---|
> | migration 021, prospect coordinates and the scoreable marker | **migration 022**, `022_add_prospect_coordinates_and_scoreable_marker.sql` |
> | migration 022, own-site facts on `scans` | **migration 023**, `023_add_scans_own_site_facts.sql` |
>
> Everywhere below that names "021" or "022" for Phase 9 work, read 022 and 023. The ordering
> advice is unchanged: apply the first before the importer and triage deploy, and the second
> before the scanner deploys. The body is left as it was written, because it carries `[VERIFIED]`
> citations and is a record of what was measured, not a live instruction sheet.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Locked by ROADMAP / PROJECT / prior phases (do not re-litigate)

- **D-9-R1: `isReleasable` stays the single releasability rule.** Carried from Phase 4.1
  (D-4.1-03). A divergent copy re-introduces the mislead that phase fixed. ENG-06 extends that
  one predicate; it does not add a second one.
- **D-9-R2: Config lists live in a named constants module, never as inline strings at the call
  site.** Carried from Phase 4.1 (D-4.1-02). Geography and vertical are project parameters.
- **D-9-R3: Country and locale are parameters, never hardcoded** (PROJECT.md Geography). NL is
  the first target, not the only one. NIC-03 restates it; this phase proves it.
- **D-9-R4: Nothing Google returns is written to the database.** Only `place_id` may be kept.
  Maps Platform Terms section 3.2.3 forbid storing, re-hosting and deriving from ratings,
  reviews, names and addresses. ENG-07 enforces this in code. No Google call exists in this phase
  at all; the guard ships before Phase 12 writes the first one.
- **D-9-R5: Scale is 10 to 50 prospects per week.** Solutions sized for thousands are rejected on
  sight (PROJECT.md Constraints).
- **D-9-R6: Nothing in this phase may put the public scanner's scanning or email at risk**
  (PROJECT.md blast radius). D-9-13 exists to hold that line.
- **D-9-R7: The report never invents a loss figure** (plan section 7). D-9-04 is this rule applied
  to a trade whose job value is not yet verified.

### Job values and the money figure

- **D-9-01: Claude researches each job value from Dutch public sources; Joshua approves each one
  individually.** Each value ships with a citation to the source it came from (NIC-02). A value
  Joshua has not approved does not enter the profile.
- **D-9-02: The job value is the customer invoice total**, meaning what the homeowner pays for the
  job, not the installer's gross margin. Chosen because invoice totals are published and
  checkable, while margins are not, so a margin figure would be a guess wearing a citation.
- **D-9-03: All six trades ship in the first profile:** heat pump, solar panels, bathroom,
  kitchen, roofing, central heating. Six values to research and approve before the profile is
  complete.
- **D-9-04: A trade with no approved value renders no money line.** The value field is optional in
  the profile type; the citation field is required whenever a value is present. The report still
  renders every other section and a total score. The profile does not refuse to load, and the
  engine never substitutes a figure.
  — **Reversibility:** reversible — one optional field and one render branch.
- **D-9-18: All six values are researched and approved. They live in `09-JOB-VALUES.md`, which is
  the source the profile copies from.** Approved by Joshua on 2026-11-12: heat pump € 12.000,
  solar panels € 3.200, bathroom € 7.500, kitchen € 11.000, roofing € 5.700, central heating
  € 2.100. Each carries its source, its URL, the page's own last-updated date and the read date.
  Two primary-source figures (heat pump, central heating) and one dated primary figure (solar) come
  from Milieu Centraal; bathroom, kitchen and roofing come from dated Homedeal averages, because
  Milieu Centraal does not cover those trades. Nothing comes from a single installer's own price
  page.
- **D-9-19: The job value is the pre-subsidy invoice total.** The heat pump figure is € 12.000, not
  € 8.975. The installer invoices the full amount and the homeowner claims the € 3.025 ISDE
  subsidy back from RVO separately. This follows D-9-02.
- **D-9-20: Three copy obligations travel with three of the values, and Phase 12 must honour them.**
  The solar copy names its basis ("a set of 8 panels"), because € 3.200 is Milieu Centraal's
  8-panel example and a typical 2026 job is larger. The kitchen citation states that € 11.000 is
  the midpoint of the € 7.000 to € 15.000 range the source gives, because no source publishes
  € 11.000 outright. Central heating prints no money line (D-9-21).
- **D-9-21: Central heating carries a value and still shows no money line.** At € 2.100 a boiler
  swap does not cover one Adashi project at € 2.500 or more, so the plan's sentence "a website pays
  for itself with one extra job" would be false for that trade. Joshua chose to print nothing
  rather than rewrite it as a two-job line. **Consequence for the profile type:** the per-trade
  money-line switch is separate from "has a value", because this trade has a value and shows no
  line. A planner that models the switch as `value === undefined` gets this wrong.
  — **Reversibility:** reversible — one extra boolean on the trade type and one render branch.

### Trade assignment

- **D-9-05: A prospect's trade is read off the business's own site during the scan, not inferred
  from its Overture category.** Measured, not assumed: `data/overture-categories.json` across four
  NL provinces shows 10,491 businesses that have a website sitting in the bare `contractor`
  category, plus 5,638 in `building_or_construction_service`. Overture has no heat pump, solar,
  kitchen or bathroom category at all. Mapping the category would leave the money line blank for
  most of the list.
- **D-9-06: A per-trade Dutch keyword list in the profile decides the trade. Code counts the
  matches and picks the winner.** No model is involved. The trade selects the job value, so a
  model naming the trade would be a model indirectly choosing a number, which the DRA-02 rule
  (`lib/draft-metric-selector.ts`) exists to prevent.
- **D-9-07: One primary trade per business**, the strongest keyword match. Not a ranked set. One
  money line, one set of trade checks, one set of AI questions for Phase 10 to read.
  — **Reversibility:** costly — widening to a ranked set later changes the stored shape that
  Phase 10, 11 and 12 all read.
- **D-9-08: A business whose trade cannot be read is still scoreable.** It keeps all six checks and
  a total score. Only the money line goes quiet, per D-9-04. A vague website is a reason to pitch
  a business, not a reason to drop it.

**Consequence the planner must respect.** The trade is produced by the full scan, and ENG-06 runs
before the full scan. The scoreable rule therefore cannot read the trade, and must not be written
to depend on it.

### The niche profile

- **D-9-09: The profile is a TypeScript module, split into a small folder of modules (trades,
  copy, checks) that export one profile object.** Joshua asked which form suited the job; this is
  Claude's recommendation and Joshua did not object. Four reasons: the type can force NIC-02's
  citation field to exist, which JSON cannot without a hand-written validator; every engine
  parameter in this repo already lives in a typed constants module (`lib/triage-constants.ts`,
  `lib/retention-constants.ts`, `lib/bulk-scan-constants.ts`); a typo in a trade name becomes a
  build error instead of a blank money line in front of a prospect; and the JSON win of editing
  without a deploy is weak when the file also holds prospect-facing copy, which should not change
  unreviewed. `data/overture-categories.json` is generated data, a different job.
  — **Reversibility:** reversible — the profile has one consumer surface, and moving the same
  shape into JSON later is a loader change plus a validator.
- **D-9-10: Report copy moves into the profile.** NIC-01 read literally: a new niche is a new
  profile plus a landing page. The profile holds its own copy for the report sections, the "Adashi
  fixes this" lines and the tips.
  — **Reversibility:** costly — `messages/en.json` and `messages/nl.json` serve the public scanner
  through next-intl today, so this splits copy across two systems and the bilingual handling for
  profile copy is new work. The public scanner's own UI copy stays in next-intl, untouched.
- **D-9-11: The profile holds both category lists.** The Overture categories to import (the
  positive list the folded todo asks for) and the trades with their keyword lists. Two lists, two
  jobs, one file, so adding a niche stays one file (NIC-04). `EXCLUDED_CATEGORIES` stays in
  `lib/triage-constants.ts`, because `lib/triage-eligibility.ts` reads it as a negative release
  guard. The planner must make sure the two lists cannot contradict each other.
- **D-9-12: The profile slice the scanner needs is passed in the existing scan request.** The
  Railway scanner does not read the profile from disk.
  — **Reversibility:** costly — this changes the scan request contract across
  `lib/scanner-client.ts` and the scanner-service route.
- **D-9-13: The Dockerfile and the scanner tsconfig are not changed.** Measured:
  `scanner-service/Dockerfile:22` copies exactly one file out of `lib/` (`lib/scoring.ts`), and
  `scanner-service/tsconfig.json:21` names that same file in `include`. Adding a second shared
  file needs both edits, and that is the exact change the v1.0 quick tasks `260806-kbi` and
  `260806-luk` found could break the Railway build or its boot with nothing looking wrong. D-9-12
  avoids the edit entirely. This is D-9-R6 applied to the build.

### The scoreable rule (ENG-06)

- **D-9-14: The three conditions fold into `isReleasable`.** One rule in one place (D-9-R1). Cheap
  triage still runs on every prospect; the expensive full scan is what the rule gates, which
  satisfies "dropped before any scan cost is spent".
  — **Reversibility:** costly — `isReleasable` is called by the server release path
  (`lib/triage-release.ts`) and the admin eligible count, and is the single rule by design.
- **D-9-15: "Exactly one Overture match" counts only `prospect_sources` rows above the confidence
  limit.** A weak duplicate row is ignored rather than disqualifying the business. A second match
  is an Overture data-quality fault, not the business's fault, and `prospect_sources.raw_confidence`
  is already stored by migration 011.
- **D-9-16: Coordinates are stored at import, in this phase.** `prospects` has a nullable
  `address` text column and nothing else; Overture geometry is used for the `ST_Within` province
  check and then discarded. ENG-06's third condition needs a point, and Phase 10's competitor
  radius needs the same point, so the work happens once here. Existing rows fill on the next
  re-import, which upserts on `overture_gers_id`.
  — **Reversibility:** one-way — needs an additive migration on `prospects`, an importer change,
  and a re-import to backfill; removing it needs a second migration, and Phase 10 depends on it.
- **D-9-17: A business that fails the rule keeps its row, marked not scoreable.** It is never
  released and never drafted, and it stays visible so the reason it was dropped is readable. Same
  shape as the Phase 4.1 unreachable rule (D-4.1-03), which keeps the row visible in the Shortlist
  while making it unreleasable. Deleting would lose the record and a re-import would bring it
  straight back.
  — **Reversibility:** costly — needs an additive migration for the marker.

### Claude's Discretion

Joshua chose to leave these to Claude rather than discuss them. Research and planning decide them.

- **Where the extracted facts are stored.** A new jsonb column on `scans`, a new table, or inside
  the existing `scans.pages[].data`. Success criterion 2 requires that Joshua can read back from
  Supabase what the site publishes **and which fields are missing**, so absence must be
  representable, not merely absent. This shape is read by Phase 11 and Phase 12.
- **The shape of the ENG-07 guard.** The model is `lib/outreach-isolation.test.ts`, which is a pure
  source-and-config assertion using `node:fs`, strips comment lines before matching, and asserts
  the files it guards exist so a rename fails loudly. A banned-token assertion over the write paths
  plus a schema assertion that no column names a Google field is the expected pair, but the exact
  split is open.
- **Whether on-site `AggregateRating` review counts are read and stored.** ENG-02 asks "how many"
  and "how recent". A count published in the business's **own** site's JSON-LD is their data, not
  Google's, so D-9-R4 does not forbid it. Confirm that reading before relying on it.
- **The numeric confidence limit for D-9-15**, seeded from the real distribution of
  `prospect_sources.raw_confidence` across the rows already imported, as a tunable constant.
- **The seed keyword lists per trade**, confirmed against real Dutch installer sites rather than
  guessed, following the way `EXCLUDED_CATEGORIES` was seeded then confirmed against real data.
- **The migration shape** for the coordinates (D-9-16) and the not-scoreable marker (D-9-17).
  Project convention: an idempotent migration applied by Joshua through the Supabase dashboard SQL
  Editor, never `supabase db push`.
- **How the profile folder is split into modules**, and the module and file naming.
- **Test approach** per project conventions (vitest, local Supabase pinned to 127.0.0.1).

### Deferred Ideas (OUT OF SCOPE)

None. The discussion stayed inside the phase boundary.

Three decisions were offered and Joshua chose to leave them to Claude rather than defer them. They
are recorded under Claude's Discretion above, not here: the storage shape for extracted facts, the
shape of the ENG-07 guard, and whether on-site `AggregateRating` counts are read.

Two items named in the roadmap belong to later phases and are not touched here: the score weights
(Phase 11's open question) and the Places session-hold rule (Phase 12's open question).

(Folded todo, in scope per CONTEXT.md: "Add random import mode, TARGET_CATEGORIES and TARGET_REGIONS sampling." Scope folded in: the positive category list moves into the profile (D-9-11), and `scripts/import-prospects.ts` accepts `--category=random` sampling from it. `TARGET_REGIONS` and `--region=random` come with it. Explicit `--category=<value>` and `--region=<value>` keep working unchanged. Joshua's confirmation of the seed lists is still owed.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NIC-01 | An installers profile holds trades, job values, AI questions, competitor rules, trade-specific website checks and all copy | Profile folder layout, type design (citation, money-line switch, tie-break rank), slice builder, engine-isolation test (sections Architecture Patterns 1 and 6) |
| NIC-02 | Each default job value carries a citation to the source it came from | Type-level citation requirement, `derivation` field for the kitchen midpoint, values-match-09-JOB-VALUES unit test, stale-value helper (Pattern 1) |
| NIC-03 | Country and locale are parameters of the profile, never hardcoded | `country`/`locales` as profile fields, no-hardcoded-geography static test over engine files (Pattern 1, Validation Architecture) |
| NIC-04 | Adding a niche is a new profile plus a landing page, with no change to the engine | Engine modules receive a typed slice and never import the profile; static vocabulary-absence test over named engine files (Pattern 6) |
| ENG-01 | Scan reads business facts from the site's own structured data: address, phone, opening hours, service area, certifications | JSON-LD/microdata harvest plus Node-side graph resolver; real-sample shapes and hit rates; field state model for missing values (Patterns 2 and 3) |
| ENG-02 | Scan detects on-site social proof: shown at all, how many, how recent, machine-readable | Review widget host list, count and recency sources, "markup absent on 53 of 53 sampled sites" finding, `AggregateRating` reading confirmed safe under D-9-R4 (Pattern 4) |
| ENG-05 | Scan checks whether a customer can request a quote: form, tap-to-call, project photos, certifications | Per-trade check terms carried in the slice, evidence on false positives for certification terms, Dutch CTA gap in the existing `hasCta` (Pattern 5) |
| ENG-06 | One predicate decides whether a business is scoreable; failing businesses are skipped and never emailed | `scoreableVerdict` folded into `isReleasable`, embed query for source confidences, measured confidence distribution, marker column, draft-gate hook (Pattern 7) |
| ENG-07 | Nothing Google returns is written to the database, enforced in code | Verified Place field list, banned-token design that does not collide with Overture coordinates, schema assertion, fail-first procedure (Pattern 8) |
</phase_requirements>

## Summary

The phase is mostly an extension of seams that already exist, and the research found five places where the obvious plan would go wrong. (1) The scanner's `full-async` route writes the finished scan straight to Supabase from Railway, so any new column the scanner writes becomes a deploy-order hazard for the live public scanner; the recommended fix is a separate best-effort update, not a change to the main one. (2) Overture's `confidence` is not a smooth score: 55% of installer-category rows with a website sit at exactly 0.5, so a limit above 0.5 would drop about three quarters of the list; a limit of 0.5 (inclusive) drops about 14% of businesses and 0.3 drops about 8%. (3) The scoreable rule's third condition is nearly vacuous with Overture data: 9,567 sampled NL rows all had a POINT geometry and all but 23 had a street address line; Overture has no service-area field. (4) ENG-07 cannot ban generic words like `rating`, `location`, `latitude` or `address`, because D-9-16 stores Overture coordinates and `prospects.address` already exists; the guard must ban Places-specific field names and Google endpoints instead. (5) Retention anonymisation (`lib/retention-constants.ts`) enumerates columns to clear; any new column holding a phone, address or coordinate must be added there or anonymised prospects keep personal data.

The own-site extractors should live in two new scanner-service modules (a browser-side harvester and a Node-side pure parser), called from `scanPage` right after `extractPageData`, with their output carried in `ScanPageResultWithScreenshot` (the existing non-persisted carrier), aggregated across pages in the `full-async` handler, and stored as one site-level jsonb value. Leaving `extractor.ts`'s single large `page.evaluate` untouched isolates the new code's failures from the existing scan. Facts use a three-state field model (`found`, `missing`, `unreadable`) so absence is queryable. Trade detection is a pure weighted count over zone text (title, h1, nav, link paths, h2/h3, body) with prefix or substring matching, no stemmer, a minimum score and a stored margin; on 53 real NL installer homepages the zone-weighted approach picked the right trade for every roofer and flagged the genuinely mixed sites as narrow.

**Primary recommendation:** Build ENG-06 (with the coordinate migration and importer change) first, ENG-07 as an independent fail-first test, the profile folder next, and the own-site scanner modules last. Store own-site facts in a new nullable `scans.own_site_facts` jsonb written by a separate try/caught update, and add every new personal-data column to the retention anonymise lists in the same plan that creates it.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Scoreable predicate (ENG-06) | API / Backend (Next.js server, `lib/`) | Browser (admin count calls the same function) | Pure function over a prospect row; called by `selectWorstN` and the admin Shortlist, so it must be isomorphic and dependency-light |
| Overture coordinate capture (D-9-16) | Import script (`scripts/`, Node + DuckDB) | Database (additive columns) | Geometry only exists in the Overture query; the importer is the only place it can be projected |
| JSON-LD / microdata harvest | Browser context inside Playwright (scanner-service) | , | Only the rendered DOM has the scripts and microdata; must stay a thin, bounded harvester |
| Value parsing, graph resolution, trade scoring, check evaluation | Scanner service Node side (`scanner-service/src/`) | , | D-9-12/D-9-13: profile slice arrives in the request and `lib/` is not in the image, so parsing cannot import `lib/` |
| Profile (trades, values, copy, checks, categories) | API / Backend (`lib/niche-profile/`) | Scanner (receives a slice only) | Single typed source; the scanner never reads it from disk |
| Request contract (profile slice) | API / Backend (`lib/scanner-client.ts`) | Scanner route validates | Slice is built Next-side and validated Scanner-side as untrusted input |
| Own-site facts persistence | Database (`scans.own_site_facts` jsonb) | Scanner service writes it | The scanner already writes the scan row with a service-role client |
| ENG-07 guard | Test runner (vitest `unit` project, `node:fs`) | Runtime helper module for Phase 12 | Static assertion today; a runtime allowlist helper is what Phase 12's Google client must call |
| Retention of new personal data | Database + `lib/retention-constants.ts` | , | Anonymise lists are explicit column maps |

## Standard Stack

### Core

No new runtime packages are recommended. Everything below is already in the repo.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^4.1.10 | Unit, integration, component projects | Already the project runner, three projects in `vitest.config.ts` [VERIFIED: package.json] |
| playwright | 1.58.2 | Rendered DOM for the harvest `page.evaluate` | Already the scanner browser; the harvest rides the same loaded page [VERIFIED: scanner-service/package.json] |
| @duckdb/node-api | ^1.5.4-r.1 | Overture query; add `ST_X`/`ST_Y` projection | Already used by `lib/overture-client.ts` [VERIFIED: package.json] |
| @supabase/supabase-js | ^2.99.3 | Resource embed `prospect_sources(raw_confidence)`, scanner write | Already used in both tiers [VERIFIED: package.json] |
| tldts | ^7.4.9 | `isAggregatorDomain` for the own-domain condition | Already behind `lib/domain-normalize.ts` [VERIFIED: package.json] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs`, `node:path` | Node 24.22.1 locally | ENG-07 and NIC-04 source assertions | Same as `lib/outreach-isolation.test.ts` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written, bounded JSON-LD resolver | `jsonld` (digitalbazaar) expand/flatten | Handles full `@context` semantics but loads remote contexts over the network (SSRF and latency inside the scanner), adds a dependency to `npm ci` in the image, and the phase only needs about ten properties. Not recommended. [ASSUMED: library behaviour from training] |
| Prefix/substring matching with a normalised string | A Dutch stemmer (Snowball/`natural`) | A stemmer adds a scanner dependency and mis-stems compounds (`zonnepanelen` shares no stem step with `zonnepaneel` anyway). The measured fix is a stem like `zonnepane`. Not recommended. |
| `scans.own_site_facts` column | Facts inside `scans.pages[].data` | Zero migration and covered by the existing `pages: []` anonymisation, but facts are per page so every consumer re-aggregates, and Joshua's readback is a jsonb array path query. See Pattern 3 for the full comparison. |

**Installation:** none.

**Version verification:** `package.json` and `scanner-service/package.json` were read this session; no package is added, so no registry check applies. DuckDB behaviour was probed with Python `duckdb` 1.4.5 in a scratch venv (probe only, never added to the project); the repo's `@duckdb/node-api` is ^1.5.4-r.1, so the `ST_X`/`ST_Y` projection must be confirmed once with a live `--dry-run` against the node client [ASSUMED: same spatial behaviour across 1.4.5 and 1.5.x].

## Package Legitimacy Audit

No external packages are installed by this phase. `duckdb` from PyPI was installed once into a scratch virtualenv under the session scratchpad to probe Overture data; it is a research tool only and does not appear in any recommendation.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | , | , | , | , | , | , |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 IMPORT (script, manual)                      TRIAGE + RELEASE (existing, extended)
 ----------------------                       -------------------------------------
 profile.overtureCategories ──┐
 --category=random|<value> ───┤              prospects ──select + embed prospect_sources(raw_confidence)
 --region=random|<value> ─────┘                  │
        │                                        ▼
        ▼                                 scoreableVerdict(row)   ◄── MIN_MATCH_CONFIDENCE (triage-constants)
 DuckDB: ST_X/ST_Y + existing ST_Within          │   (own domain, one match above limit, address or point)
        │                                        ▼
        ▼                                 isReleasable(row, cutoff)  = reachable && !excluded && scoreable && (gated || score<=cutoff)
 upsertOverturePlace                             │                        │
   fill-only-when-null lat/lon                   │                        └─► not_scoreable_reason marker (kept visible, never released, never drafted)
        │                                        ▼
        ▼                                 releaseWorstN → scan_released_at → queue → dispatchOne
 prospects(lat, lon, not_scoreable_reason)                                         │
                                                                                   ▼
 SCAN REQUEST (Next → Railway)                                          ScannerClient.fullScanBulk(url, { ..., nicheSlice })
 ----------------------------                                                      │  POST /api/scan/full-async (bearer)
 lib/niche-profile/* ──toScannerSlice()──► NicheScanSlice (types/niche-scan-slice.ts)│
                                                                                   ▼
 SCANNER (Railway, per page)                                            route validates slice (size, shape, counts)
 --------------------------                                                        │
 scanPage: goto → axe → extractPageData (UNCHANGED) → harvestOwnSite(page, slice)  │  try/catch, never fails the page
        │                                                                          │
        ▼                                                                          ▼
 ScanPageResultWithScreenshot.ownSiteHarvest (non-persisted, like the screenshot buffers)
        │
        ▼ after all pages (index.ts full-async)
 aggregateOwnSite(harvests[], slice) → OwnSiteFacts { business facts (3-state), socialProof, trade, quoteReadiness }
        │
        ├─► main scans.update({... status: "completed" ...})   UNCHANGED
        └─► second, best-effort scans.update({ own_site_facts })  try/catch + log, awaited BEFORE the callback fetch
                                                                          │
 RETENTION: ANONYMIZED_SCAN_FIELDS += own_site_facts; ANONYMIZED_PROSPECT_FIELDS += latitude, longitude
 ENG-07:   lib/google-content-guard.test.ts reads lib/, app/, scanner-service/src/, scripts/, types/ and supabase/*.sql
```

### Recommended Project Structure

```
lib/
├── niche-profile/
│   ├── types.ts                 # NicheProfile, TradeProfile, JobValue, Citation, TradeId, SiteCheckId
│   ├── index.ts                 # export INSTALLERS_PROFILE, getNicheProfile(), toScannerSlice()
│   └── installers/
│       ├── trades.ts            # six trades: ids, keywords, job values with citations, moneyLine switch
│       ├── checks.ts            # per-trade check terms, review widget hosts
│       ├── copy.ts              # { nl: ..., en: ... } blocks known today (see Open Question 4)
│       └── categories.ts        # Overture categories to import, regions, competitor rules, AI question templates
├── triage-eligibility.ts        # + scoreableVerdict, isReleasable extended
├── triage-constants.ts          # + MIN_MATCH_CONFIDENCE
├── google-content-guard.ts      # constants + findGoogleFieldViolations + toStorableGooglePlace (Phase 12 calls it)
└── google-content-guard.test.ts # ENG-07
scanner-service/src/
├── own-site-harvest.ts          # browser-side: page.evaluate wrapper, bounded raw material only
└── own-site-facts.ts            # Node-side pure: graph resolver, fact extraction, trade scoring, checks, aggregation
types/
├── niche-scan-slice.ts          # the slice type (copied into the image automatically, D-9-13 holds)
└── own-site.ts                  # OwnSiteFacts, FieldState<T>
supabase/migrations/
├── 021_add_prospect_coordinates_and_scoreable_marker.sql
└── 022_add_scans_own_site_facts.sql
tests (root vitest tree, never inside scanner-service/src):
lib/own-site-facts.test.ts, lib/own-site-harvest.test.ts, lib/trade-detection.test.ts,
lib/niche-profile/*.test.ts, lib/google-content-guard.test.ts
```

### Pattern 1: The profile as a typed module (NIC-01..04)

**What:** One `NicheProfile` object assembled from small modules. The type makes the rules a compile error instead of a convention.

```typescript
// lib/niche-profile/types.ts (shape to implement; every field below is a decision, not an observation)
export type TradeId = "heat_pump" | "solar" | "bathroom" | "kitchen" | "roofing" | "central_heating";

export interface Citation {
  source: string;        // "Milieu Centraal", "Homedeal"
  url: string;           // https URL read on readOn
  pageUpdated?: string;  // the page's own last-updated date, as printed ("23/04/2026")
  readOn: string;        // ISO date, "2026-11-12"
  note?: string;         // free text, required by the type when derivation is "midpoint-of-range"
}

export type JobValue =
  | { amountEur: number; derivation: "published"; citation: Citation; recheckAfter: string }
  | { amountEur: number; derivation: "midpoint-of-range"; range: readonly [number, number];
      citation: Citation & { note: string }; recheckAfter: string };

export interface TradeProfile {
  id: TradeId;
  jobValue?: JobValue;       // D-9-04: optional; citation is inside the union so it cannot be omitted
  showMoneyLine: boolean;    // D-9-21: separate from "has a value" (central_heating: value present, false)
  copyObligation?: string;   // D-9-20 ("a set of 8 panels" for solar), surfaced to Phase 12
  tieBreakRank: number;      // deterministic tie-break for trade scoring (Pattern 6)
  keywords: readonly KeywordTerm[];
  siteChecks: TradeSiteChecks;
  aiQuestions: Record<Locale, readonly string[]>; // templates with {trade} and {city}; read in Phase 10
}

export interface NicheProfile {
  id: "installers";
  country: string;           // "NL", never hardcoded in engine files (NIC-03)
  locales: readonly Locale[];
  defaultLocale: Locale;
  currency: "EUR";
  overtureCategories: readonly string[];  // positive import list (D-9-11)
  regions: readonly string[];             // for --region=random
  competitor: { radiusKm: number; maxCompetitors: number }; // Phase 10 reads; Phase 9 only holds
  trades: readonly TradeProfile[];
  copy: Record<Locale, ProfileCopy>;
}
```

The six approved values and their citations are copied from `09-JOB-VALUES.md`: heat pump 12000, solar 3200, bathroom 7500, kitchen 11000 (midpoint of 7000 to 15000), roofing 5700, central heating 2100 with `showMoneyLine: false` [VERIFIED: 09-JOB-VALUES.md lines 31-38, "Heat pump | € 12.000 ... Central heating | € 2.100, **no money line**"]. Test them by number against a literal table in the test file, not against the profile itself.

**Staleness:** 09-JOB-VALUES.md asks for a re-check date ("Set a re-check when the profile is built") [VERIFIED: 09-JOB-VALUES.md line 177-178]. Put `recheckAfter` on each `JobValue` and export a pure `staleJobValues(profile, now)` for Phase 12's admin surface; unit-test it with an injected clock. Do NOT make a test fail on the real date, that turns CI red on a calendar day with no code change.

**Slice builder:** `toScannerSlice(profile)` returns only what the scanner needs (trade ids, keyword terms, per-trade check terms, review widget hosts). It must not include job values, copy or citations: they are prospect-facing and not needed on Railway.

**Engine isolation (NIC-03/NIC-04 as tests):** the named engine files (`scanner-service/src/own-site-harvest.ts`, `scanner-service/src/own-site-facts.ts`, `lib/triage-eligibility.ts`, `lib/google-content-guard.ts`) must contain no Dutch trade vocabulary and no country literal. A static test reads those files, strips comment lines, and fails on any of `warmtepomp`, `zonnepane`, `badkamer`, `keuken`, `dakdekk`, `installq`, `"NL"`, `"nl"`. This turns the "no change to the engine for a new niche" claim into a failing build, same family as `lib/outreach-isolation.test.ts`.

**Overlap check (D-9-11):** a unit test asserts the intersection of `profile.overtureCategories` and `EXCLUDED_CATEGORIES` (lower-cased) is empty.

### Pattern 2: Reading JSON-LD and microdata values (ENG-01)

**What:** Harvest raw material in the browser with hard caps, parse Node-side. The existing code only records `@type` names [VERIFIED: scanner-service/src/extractor.ts:136-152, `const schemaTypes: string[] = []; let schemaInvalidCount = 0;`]. Leave that block and the big `page.evaluate` untouched; add a second, separate `page.evaluate` in a new module so a failure there cannot fail `extractPageData` for the page.

**Hook point.** `scanPage` calls `const data = await extractPageData(page, effectiveUrl);` [VERIFIED: scanner-service/src/scanner.ts:304]. Add the harvest on the next lines, wrapped in try/catch, only when the request carried a slice. `page.evaluate(fn, arg)` with one serialisable argument is already the pattern in this repo [VERIFIED: extractor.ts:18 `page.evaluate((origin: string) =>` and :375 `}, baseUrl.origin);`].

**Browser side (thin, bounded):**

```typescript
// scanner-service/src/own-site-harvest.ts (browser function body; no parsing logic beyond DOM walking)
// Caps: 20 JSON-LD blocks, 200_000 chars each; 50 microdata items, depth 4; 100 link hrefs; 100 script/iframe hosts.
const jsonLdBlocks = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
  .slice(0, 20).map((s) => (s.textContent || "").slice(0, 200_000));
// microdata: walk [itemscope] roots, return { type, props } where value follows the HTML spec rule:
// meta[content], a/link[href], img/source[src], time[datetime], data/meter[value], else textContent.trim()
```

Also harvest the zones trade scoring needs: `title`, `h1[]`, `h2h3[]` (capped), `navTexts[]` (anchors inside `nav, [role=navigation], header`), `internalPaths[]` (pathnames of internal anchors, deduped, capped), `bodyText` (first 20_000 chars of `innerText`), `telHrefs[]`, `formSummaries[]` (field count and submit label per form), `imgHints[]` (alt and src filename, capped), `widgetHosts[]` (hostnames of `script[src]` and `iframe[src]`). Do not persist this raw harvest: carry it in `ScanPageResultWithScreenshot` the way the screenshot buffers travel [VERIFIED: scanner.ts:210-216, "/** Extended result with screenshot data — only used internally, not stored in DB */"].

**Node side (pure, dependency-free, in `own-site-facts.ts`):**

1. Parse each block with `JSON.parse` inside try/catch; count failures (`jsonLdInvalid`). Do NOT use the in-browser parse result.
2. Flatten into one node pool: a top-level array, `@graph` arrays, and nested objects that carry `@type` or `@id`. Real samples contained all of these: of 53 NL installer homepages, 28 had JSON-LD, 24 used `@graph`, 2 had a top-level array, 6 had more than one block, 1 had an invalid block, and 64 nodes carried at least one `{ "@id": ... }` reference object [VERIFIED: live sample, 53 homepages fetched and parsed in scratch, 2026-11-12].
3. Build `Map<@id, node>` across ALL blocks; dereference a value that is an object with only `@id` (depth limit 4, cycle guard).
4. Normalise types: strip `https://schema.org/`, `http://schema.org/` and `schema:`; compare lower-case.
5. Pick business nodes in priority order: nodes whose types intersect the LocalBusiness family first, then `Organization`/`Corporation`/`ProfessionalService`. The verified schema.org subtypes of `HomeAndConstructionBusiness` are `Electrician, GeneralContractor, HVACBusiness, HousePainter, Locksmith, MovingCompany, Plumber, RoofingContractor` [CITED: https://schema.org/HomeAndConstructionBusiness, chain Thing > Organization > LocalBusiness > HomeAndConstructionBusiness]. Take the first found value per field in node priority order; do not merge conflicting values.
6. Search `Service` nodes for `areaServed`: real samples put `areaServed` on Service nodes as lists of `City` and `Place` objects.
7. Wrap the whole extraction in try/catch returning an `unreadable` result: a bug must never fail the scan (D-9-R6).

**Field shapes seen in real data and what to accept:**

| Field | Shapes observed or standard | Rule |
|-------|-----------------------------|------|
| address | `PostalAddress` object (`streetAddress`, `postalCode`, `addressLocality`, `addressRegion`, `addressCountry`), plain string, array, `{@id}` ref | found when `streetAddress`, or `postalCode` with locality, or a non-empty string |
| telephone | string, array, or inside `contactPoint[].telephone` | found when at least one value has 9 or more digits after stripping |
| opening hours | `openingHoursSpecification` objects with `dayOfWeek` as array or single, `opens`, `closes`; or `openingHours` strings like `"Mo,Tu,We,Th,Fr 09:00-17:00"` | found when one entry parses; flag `looksDefault` when all seven days read `00:00` to `23:59` (a plugin placeholder seen in the sample) |
| serviceArea | `areaServed` as text, `AdministrativeArea`, `Place`, `City`, `GeoShape` (with `GeoCircle`: `geoMidpoint` and `geoRadius`); legacy `serviceArea` | found when at least one name or a geo shape; schema.org range is `AdministrativeArea, GeoShape, Place, Text` [CITED: https://schema.org/areaServed] |
| certifications | `hasCredential` (`EducationalOccupationalCredential`, `name`), `hasCertification` (`Certification`), `award`, `memberOf` | found when at least one name; `hasCertification` exists on Organization and is not marked pending [CITED: https://schema.org/hasCertification] |

**Hit rates on the real sample (n=53, static HTML):** JSON-LD present on 28; address on 8, telephone on 7, `openingHoursSpecification` on 3 and `openingHours` on 2, `areaServed` on 5, `hasCredential` on 2, `geo` on 5, `aggregateRating` on 0 [VERIFIED: live sample, scratch analysis]. So most fields will legitimately come back `missing`. That is the finding the product sells, and it means the three-state model in Pattern 3 is load-bearing, not decoration.

**Microdata fallback:** harvested in the browser as the same `{type, props}` shape and converted Node-side into the JSON-LD-like pool, so one extraction path serves both. 15 of 53 sampled pages contained `itemscope` text (not all business data, breadcrumbs are common).

### Pattern 3: Representing and storing missing fields (success criterion 2)

**Field state model:**

```typescript
// types/own-site.ts
export type FieldState<T> =
  | { state: "found"; value: T; source: "jsonld" | "microdata" }
  | { state: "missing"; reason: "no_structured_data" | "not_in_markup" }
  | { state: "unreadable" };   // blocks existed but none parsed; never read as "absent"
```

Every key is always present in the stored object, so `own_site_facts -> 'business' -> 'openingHours' ->> 'state'` answers "is it missing" in plain SQL. Consequences: Phase 11 scores `missing` and ignores `unreadable` (no penalty for what we could not read); Phase 12's to-do list only proposes "add X to your markup" on `missing`; Phase 12 can show the reason without recomputing.

**Storage options:**

| Option | Migration | Blast radius | Readback by Joshua | Retention | Verdict |
|--------|-----------|--------------|--------------------|-----------|---------|
| A. Inside `scans.pages[].data` | none | none | jsonb array path, per page | covered by `pages: []` in `ANONYMIZED_SCAN_FIELDS` | Safest, but site-level facts re-aggregated by every reader, and `PageData` is persisted so raw harvest would bloat it |
| B. New `scans.own_site_facts` jsonb | one additive migration | main update untouched if the write is separate (below) | one column, one query | add `own_site_facts: null` to `ANONYMIZED_SCAN_FIELDS` | **Recommended** |
| C. New table | one migration | none for the scanner if Next-side writes | join | must be added to `RETENTION_TABLE_ALLOWLIST` | Heavier than a one-to-one value needs |

**Why B needs care.** The full-async handler writes the completed scan with one `supabase.from("scans").update({...}).eq("id", scanId)` and does not read the returned `error` [VERIFIED: scanner-service/src/index.ts:620-640, `.update({ status: "completed", scores, summary, pages: enhancedResults, ...`]. If the scanner is deployed before Joshua applies a migration through the dashboard, an update that names an unknown column fails and the scan never reaches `completed`, which would break public full scans too (same handler). Therefore: keep the main update exactly as is, and write `own_site_facts` in a **second** update inside try/catch (log, never throw), awaited before the callback `fetch` at index.ts:646-661. Order the plan so migration 022 is applied (human checkpoint) before the scanner deploy, but make the code safe even if the order slips. Only run any own-site work when the request carried a slice, so public scans are byte-identical.

**Legacy safety:** nothing is added to `PageData`, so scans persisted before this phase need no change. If the planner prefers to also expose a per-page field, it must be optional like `schemaTypes?` [VERIFIED: types/scanner.ts:119-122, `schemaTypes?: string[]` and `schemaInvalidCount?: number`].

**Suggested stored shape** (versioned, so Phase 10 to 12 can evolve it): `{ schemaVersion: 1, readAt, pagesRead, structuredData: { jsonLdBlocks, jsonLdInvalid, microdataItems }, business: { address, telephone, openingHours, serviceArea, certifications }, socialProof, trade, quoteReadiness }`. Store the per-trade score map (six small integers) inside `trade`, even though D-9-07 picks one primary: it keeps the stored shape stable if a ranked set is ever wanted, at the cost of six numbers.

### Pattern 4: On-site social proof (ENG-02)

- **Shown at all.** Do not reuse `hasTrustSignals` as is: its selector matches `[class*="trust"]`, `[class*="client"][class*="logo"]` and similar [VERIFIED: extractor.ts:286-287], which over-matches. Build `shown` from specific signals: review widget hosts in `script[src]`/`iframe[src]`, Dutch review words in headings, a rating pattern in visible text, `AggregateRating`/`Review` in markup.
- **Widget hosts seen in the sample:** `klantenvertellen` on 2 pages, `trustpilot` on 1, `trustindex` on 1 [VERIFIED: live sample, scratch]. Add `kiyoh` and `feedbackcompany` as seeds [ASSUMED: known Dutch review platforms from training, not seen in the 53 pages]. The list lives in `checks.ts` and travels in the slice.
- **How many.** Order of trust: `aggregateRating.reviewCount` then `ratingCount`; else a visible-text pattern such as `\d+ (reviews|beoordelingen|recensies|waarderingen)`. In the sample only 2 pages had a rating pattern and 4 a count phrase [VERIFIED: live sample, scratch].
- **How recent.** Only `review[].datePublished` in markup gives a date; widgets rarely expose one. Expect `FieldState` `missing` almost everywhere, and say so.
- **Marked up.** `aggregateRating` appeared on 0 of 53 sampled homepages [VERIFIED: live sample, scratch]. This will read `false` for nearly every prospect, which is the pitch.
- **Reading an on-site `AggregateRating` is permitted under D-9-R4.** The Google restriction applies to Google Maps Content obtained through the Maps Platform; the Places policies say place IDs are exempt from caching and other Maps content may be stored only as the terms expressly permit [CITED: https://developers.google.com/maps/documentation/places/web-service/policies]. A count printed in the business's own JSON-LD is read off their public page by our scanner, not obtained from a Google API. Caveat to record: some review-widget plugins copy Google numbers into on-site markup; we still store it as "what the site says about itself", labelled `source: "jsonld"`, never as a Google figure. [ASSUMED: this legal reading; no counsel review. Flag for Joshua alongside the Phase 12 Places question.]

### Pattern 5: Quote-request readiness (ENG-05)

Four boolean checks, each with evidence text, evaluated from the harvest using per-trade terms from the slice:

| Check | Signal | Gap found in existing code |
|-------|--------|----------------------------|
| quote form | a form with 2 or more fillable fields, or a link/button whose text matches the trade's quote terms (`offerte`, `prijsopgave`, `afspraak`, `vrijblijvend`) | The existing `hasCta` pattern is English: `/get started\|contact\|book\|try\|sign up\|schedule\|quote\|free\|demo/i` [VERIFIED: extractor.ts:270]. It has no `offerte`. 30 of 53 sampled pages contained `offerte`, `prijsopgave` or `vrijblijvend` [VERIFIED: live sample, scratch] |
| tap-to-call | an `a[href^="tel:"]` | `hasContactInfo` merges `tel:` and `mailto:` and body text patterns [VERIFIED: extractor.ts:240-246], so it cannot answer tap-to-call. 25 of 53 had a `tel:` link |
| project photos | a project term (`projecten`, `portfolio`, `realisaties`, `referenties`, `ons werk`) in nav, a path, or a heading, plus enough images | 34 of 53 had a project word; treat it as a signal, not proof |
| certifications | trade-specific terms matched in visible text, link hrefs and image alt or filename, with word boundaries | see pitfall below |

**Certification terms are a false-positive trap.** Raw-HTML substring counts on the sample read `vca` 11, `stek` 10, `kvk` 14, `installq` 4. With visible text only and word boundaries: `vca` 3, `stek` 0, `installq` 2, `erkend` 7, `gecertificeerd` 8, `kvk` 14 [VERIFIED: live sample, scratch]. So `stek` was entirely noise, `kvk` is a chamber of commerce number in nearly every footer and proves nothing, and two real `installq` mentions live in image attributes, which is why the match must include `alt` and `src` filenames. Do not use `kvk`, `erkend` or `iso` alone.

**Seed terms.** Heat pump: `installq`, `techniek nederland`, `f-gas`. Solar: `installq`, `zonnekeur`, `techniek nederland`, `holland solar`. Central heating: `installq`, `techniek nederland`. These names are confirmed to exist as certifying or industry bodies [CITED: InstallQ erkenningsregeling documents and Stichting Zonnekeur via web search, 2026-11-12; the InstallQ solar PV scheme BRL 7000 was still a draft concept in the copy found]. Roofing, bathroom and kitchen: no authoritative scheme was found by search [VERIFIED: two searches returned only directory listings]; seed with the generic terms `keurmerk`, `gecertificeerd`, `gecertificeerde` only, and mark the trade lists `[ASSUMED]` until sampled.

**Discovery limit:** `pagePriority` in `discovery.ts` ranks `contact` 2, `services` 4, `work|portfolio|cases|projects|clients` 7, everything else 99, and has no `offerte`, `projecten`, `werkgebied` or trade slugs [VERIFIED: scanner-service/src/discovery.ts:83-91]. A full scan reads at most 7 pages [VERIFIED: lib/bulk-scan-constants.ts:29 `export const BULK_MAX_PAGES = 7;`]. The homepage's own nav and link paths are therefore the most reliable evidence that a service page exists, which is why the trade scorer uses an internal-link-path zone. Do not change `pagePriority` in this phase unless sampling shows the quote or project page is routinely missed.

### Pattern 6: Dutch trade detection (D-9-06, D-9-07)

**Where the text is.** `extractPageData` already reads `doc.body?.innerText` per page but does not return it (only `wordCount` and a 50k `contactText` for contact parsing) [VERIFIED: extractor.ts:94, 241, 261]. The new harvest reads its own capped copy and scores in memory; only counts are stored.

**Algorithm (pure function, unit-testable in the root vitest tree):**

1. Normalise both text and terms: lower-case, map every hyphen variant (`-`, U+2010 to U+2015) and `_` to a space, collapse whitespace, so `cv-ketel`, `cv ketel` and `cv‑ketel` all match.
2. Zone weights per page: title 5, h1 5, nav 3, internal-link path 3, h2/h3 2 (cap 5 hits), body 1 (cap 10 hits).
3. Aggregate across pages: **sum** title, h1, h2/h3 and body (they differ per page); take the **distinct union** for nav and link paths (the same nav repeats on every page and would otherwise multiply a keyword by the page count).
4. Each term has a match mode: `substring` for long unique stems (`warmtepomp`, `badkamer`, `keuken`), `prefix` (word start) for short stems (`dak`), `word` for abbreviations. Never `new RegExp` from a profile string: escape the literal.
5. Winner: the highest score at or above `MIN_TRADE_SCORE`. Record the runner-up and margin. If the margin is below `DOMINANCE_RATIO`, still set the trade (this is D-9-07: the strongest match) but store `confidence: "narrow"`, resolve exact ties by `tieBreakRank`, and let Phase 12 decide whether a narrow trade earns a money line. Below the minimum: `trade.id = null`, `confidence: "unreadable"` (D-9-08: still scoreable, money line quiet).
6. No model participates at any step.

**Measured behaviour (homepage-only prototype on 53 real NL homepages; real scans read up to 7 pages so scores will be higher):**

| Site class | Observed |
|------------|----------|
| Roofers (8) | 7 clear roofing wins, 18 to 63 points; 1 scored zero (see compound finding) |
| HVAC with heat pumps | heat pump 14 to 51; two sites tied heat pump 30 vs central heating 30 and 35 vs 22 |
| Plumbers | one site scored bathroom 13, roofing 12, heat pump 10 (a genuine multi-trade site, narrow) |
| Generic contractors, electricians, energy companies | mostly all zeros: trade unreadable, which D-9-08 explicitly allows |

[VERIFIED: live sample, scratch prototype; the weights, minimum 8 and ratio 1.5 are `[ASSUMED]` seeds from that run]

**Dutch-specific pitfalls found by running it:**

- **Compounds.** The first prototype used `\bdak(?:en|renovatie|...)?\b` and scored `dakreparatie.nu` zero for roofing, because `dakreparatie` is a compound the list did not enumerate. Prefix matching (`\bdak\w*`) fixes it. Dutch compounds put the head word last, so most trade words appear as prefixes of longer words.
- **Plurals with vowel change.** The plural of `paneel` is `panelen`, so neither `zonnepaneel` nor `zonnepanelen` matches the other. The stem that covers both is `zonnepane`.
- **Bare `cv`.** `cv` also means curriculum vitae on every job-vacancy block. Never use bare `cv`; use `cv ketel`, `cv installatie`, `centrale verwarming`, `hr ketel`, `gasketel`. [ASSUMED: reasoned, no false positive observed in the sample]
- **Heat pump vs central heating overlap.** Hybrid installers legitimately mention both. This is why the margin and `tieBreakRank` exist. Seed rank: heat pump before central heating [ASSUMED].
- **Mentions are not offers.** A roofer's body text mentioning `zonnepanelen` scored 4 against roofing 34. The minimum score, the zone weights and the dominance ratio are the guard; no negation parsing.

**Seed keyword terms per trade** (all `[ASSUMED]`, to be confirmed on the real list): heat pump `warmtepomp` (substring), `lucht water`, `bodem water`, `hybride warmtepomp`; solar `zonnepane` (substring), `zonne energie`, `omvormer`, `thuisbatterij`; bathroom `badkamer` (substring), `sanitair`, `inloopdouche`; kitchen `keuken` (substring); roofing `dak` (prefix), `dakdekk`, `dakbedekking`, `bitumen`, `epdm`; central heating `cv ketel`, `cv installatie`, `centrale verwarming`, `hr ketel`, `gasketel`. Add a committed fixture of trimmed zone objects (title, h1, nav, paths, short body) from about 15 sampled sites rather than saved third-party HTML.

### Pattern 7: The scoreable predicate folded into `isReleasable` (ENG-06)

**Current rule** [VERIFIED: lib/triage-eligibility.ts:32-41]:

```typescript
export function isReleasable(
  row: { triage_score: TriageScore; category: string | null },
  cutoff: number
): boolean {
  return (
    row.triage_score.reachable &&
    !isExcludedCategory(row.category) &&
    (row.triage_score.gated || row.triage_score.score <= cutoff)
  );
}
```

**Extension.** Add a pure `scoreableVerdict(row, minConfidence)` returning `{ scoreable: true } | { scoreable: false; reason: "no_own_domain" | "no_unique_match" | "no_location" }`, and make `isReleasable` call it so there is still one rule:

- **own domain:** `row.domain !== null && row.website_url !== null && !isAggregatorDomain(row.website_url)`. `upsertOverturePlace` already nulls `domain` and `website_url` for aggregator links [VERIFIED: lib/prospect-upsert.ts, `const effectiveWebsiteUrl = isAggregator ? null : place.websiteUrl;`], so this condition is true by construction for imported rows, but the explicit check keeps the predicate honest for any other writer.
- **exactly one match:** `source_confidences.filter((c) => c !== null && c >= minConfidence).length === 1` (D-9-15).
- **location:** `(address ?? "").trim() !== "" || (latitude !== null && longitude !== null)`.

**The row needs new inputs.** `selectWorstN` selects `"id, triage_score, category"` and `getShortlist` selects a fixed column list [VERIFIED: lib/triage-release.ts:44-49 and lib/triage-candidates.ts getShortlist select]. Both gain `domain, website_url, address, latitude, longitude, not_scoreable_reason, prospect_sources(raw_confidence)`. PostgREST resource embedding works because `prospect_sources.prospect_id` references `prospects(id)` [VERIFIED: supabase/migrations/011_create_prospect_sources.sql, `prospect_id uuid not null references prospects(id) on delete cascade`]. Map the embed to `source_confidences: (number | null)[]` inside the two query modules so only the numbers reach the client component. Make the new row fields required in the type: a caller that forgets them becomes a compile error, which is the single-rule guarantee. Existing fixtures in `lib/triage-eligibility.test.ts` need a small row factory.

**The three callers.** `lib/triage-release.ts`, `app/admin/page.tsx:553` and `components/admin/shortlist-table.tsx:195` call `isReleasable` [VERIFIED: grep over app, lib, components]. A fourth gate is still needed for "never drafted": `maybeGenerateDraftForProspectScan` has a documented gate order (rejected check is gate 6) and the manual generate path checks `lifecycle_state === "rejected"` [VERIFIED: lib/draft-on-scan-complete.ts header, lib/outreach-queue.ts:379]. Add a `not_scoreable_reason` check beside the rejected check in both, reading the marker. Prospects released or queued before this phase ships are not re-checked by `selectWorstN`; add the same cheap re-check in `dispatchOne` or run a one-time sweep, and decide which in the plan.

**Marker (D-9-17) and why it is not a second rule.** `scoreableVerdict` is the only place the rule lives. A small `refreshScoreability(sb)` writes its output (`not_scoreable_reason` text with a CHECK limited to the three reasons, plus `scoreable_checked_at`) for un-released prospects; call it at the end of the import script and the triage script. The marker is a persisted explanation and a draft-gate input, not an independent decision; document that changing `MIN_MATCH_CONFIDENCE` requires a refresh run. Seed `MIN_MATCH_CONFIDENCE` in `lib/triage-constants.ts` beside `DEFAULT_CUTOFF` (D-9-R2).

**The real confidence distribution** (Overture release 2026-10-21.0, NL, Noord-Holland bbox, nine installer-relevant categories, rows with a website, 6,567 rows over 6,038 distinct hosts):

| Limit (>=) | Hosts with exactly 1 row | Hosts with 0 rows (dropped) | Hosts with 2+ rows |
|------------|--------------------------|-----------------------------|--------------------|
| 0.3 | 5,454 (90.3%) | 506 (8.4%) | 78 |
| 0.5 | 5,164 (85.5%) | 821 (13.6%) | 53 |
| 0.7 | 1,477 (24.5%) | 4,544 (75.3%) | 17 |

By 0.1 band: 0.0: 13, 0.1: 169, 0.2: 229, 0.3: 213, 0.4: 175, **0.5: 3,605**, 0.6: 237, 0.7: 327, 0.8: 259, 0.9: 803, 1.0: 537 [VERIFIED: live DuckDB query against s3://overturemaps-us-west-2/release/2026-10-21.0, scratch]. The mass at 0.5 is Overture's default, not a measurement. **Recommended seed: `MIN_MATCH_CONFIDENCE = 0.5` with `>=`**: it keeps the default-confidence rows and excludes only rows Overture itself scored below its default (about 12% of rows). Anything above 0.5 is a mistake. This is the sample, not Joshua's database: before locking, run the histogram on the real `prospect_sources` (query in Open Question 1). Duplicate hosts (2+ rows) are about 2% of hosts and often the same business listed under two categories at the same point (observed: `contractor` and `roofing` rows at one address, both 0.5).

**Condition 3 is almost vacuous with Overture data.** In 9,567 sampled NL rows every geometry was a `POINT`, every row had an `addresses` entry, and only 23 (0.24%) had a null or empty `freeform` line [VERIFIED: live DuckDB probes, scratch]. The Overture places schema has no service-area or radius column; the columns are `id, geometry, confidence, websites, emails, socials, phones, brand, addresses, names, sources, operating_status, basic_category, taxonomy, version, bbox, theme, type` [VERIFIED: live `DESCRIBE` of the 2026-10-21.0 places parquet]. "A declared work-area centre" therefore cannot come from Overture and cannot come from the site (ENG-06 runs before the scan). Practical meaning: the stored Overture point. Define the condition as address text or a stored point (written above), tell the planner it will rarely fail, and note that conditions 1 and 2 do the real filtering. Because address text satisfies the rule, rows are not blocked while waiting for the re-import backfill.

### Pattern 8: The ENG-07 enforcement test and how to make it fail first

**Verified Google field names** (Places API New, Place resource): `name, id, displayName, types, primaryType, nationalPhoneNumber, internationalPhoneNumber, formattedAddress, shortFormattedAddress, postalAddress, addressComponents, plusCode, location, viewport, rating, googleMapsUri, websiteUri, reviews, photos, businessStatus, priceLevel, currentOpeningHours, regularOpeningHours, editorialSummary, generativeSummary, reviewSummary, userRatingCount, pureServiceAreaBusiness` and more [CITED: https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places]. Policy: the place ID "is exempt from the caching restrictions ... You can therefore store place ID values indefinitely"; coordinates may be cached "for up to 30 consecutive calendar days"; other content only as expressly permitted [CITED: https://developers.google.com/maps/documentation/places/web-service/policies]. D-9-R4 is stricter than that (only `place_id`), keep it.

**Design constraints measured in the repo:**

- Generic words cannot be banned. `rating` appears in 5 source files and `reviews` in 3 (own-site trust-signal code in `extractor.ts`, `analyzer.ts`, `types/scanner.ts`); `latitude`, `longitude`, `lat`, `lng` appear in none today but D-9-16 adds Overture coordinates; `prospects.name` and `prospects.address` exist from Overture [VERIFIED: grep over app, lib, scanner-service/src, scripts, types, supabase; supabase/migrations/010_create_prospects.sql `name text, address text`].
- Distinctive names are clean today: `userRatingCount, user_ratings_total, formattedAddress, formatted_address, regularOpeningHours, opening_hours, internationalPhoneNumber, international_phone_number, nationalPhoneNumber, websiteUri, editorialSummary, googleMapsUri, businessStatus, priceLevel, addressComponents, address_components, plusCode, places.googleapis, maps.googleapis, X-Goog, GOOGLE_PLACES, GOOGLE_MAPS` each returned 0 files; `displayName` returns 1 file, `components/ui/button.tsx` (React `displayName`), which is outside the scanned roots [VERIFIED: grep this session].
- Scan explicit roots, never the repo root. `.claude/worktrees/*` holds full copies of the repo and `scanner-service/dist` holds compiled output; both would be walked by a naive recursive scan [VERIFIED: ls .claude/worktrees; vitest.config.ts already excludes `**/.claude/worktrees/**`].

**The guard, in three parts:**

1. `lib/google-content-guard.ts`: `GOOGLE_STORABLE_FIELDS = ["place_id"] as const`; `GOOGLE_BANNED_FIELD_TOKENS` (the distinctive names above); `GOOGLE_ENDPOINT_TOKENS`; `findGoogleFieldViolations(source: string): string[]` (comment lines stripped, same two-marker method as the model test); and a runtime `toStorableGooglePlace(raw)` returning only `{ place_id }`, which Phase 12's single Google client must call before any write.
2. `lib/google-content-guard.test.ts` (unit project, `node:fs` only): (a) the guarded roots exist and yield more than zero files, so a rename fails loudly; (b) no non-comment line in any non-test source under `lib/`, `app/`, `scanner-service/src/`, `scripts/`, `types/` contains a banned field token, excluding `lib/google-content-guard.ts` itself and `*.test.ts`; (c) no file outside `ALLOWED_GOOGLE_CLIENT_FILES` (empty array today, Phase 12 adds exactly one) contains a Google endpoint token; (d) a schema assertion over `supabase/migrations/*.sql` and `supabase/schema.sql` extracting column identifiers from `create table` and `add column` statements and failing on any snake_case form of a banned name (`formatted_address`, `user_ratings_total`, `user_rating_count`, `regular_opening_hours`, `opening_hours`, `international_phone_number`, `national_phone_number`, `website_uri`, `editorial_summary`, `google_maps_uri`, `business_status`, `price_level`, `address_components`, `plus_code`, `display_name`) plus any column named `rating`, `reviews`, `google_rating` or `place_rating`; `place_id` is the only permitted Google-derived column name. Cases where the column is generic (`name`, `address`) stay allowed because Overture owns them.
3. **Fail first.** (i) Write the test before the module exists: it imports `./google-content-guard`, so the first run fails at import, proving the wiring. (ii) Inside the test, include canary cases that assert the detector flags synthetic violating snippets (for example `sb.from("prospects").update({ rating: place.rating, userRatingCount: n })` and `create table x (formatted_address text)`); these fail until the detector works, so the test tests itself. (iii) As an acceptance step for the executor, add a throwaway `lib/zz-google-canary.ts` containing `formattedAddress`, confirm the suite goes red, delete it. Not committed.

**Honest limit to record in the plan:** a static token ban cannot catch a write that copies a Google object wholesale. That is why part 1's runtime allowlist exists and why part 2(c) forces any Google call into one file.

### Pattern 9: Capturing Overture coordinates (D-9-16)

**Query change.** The current SELECT is `place.id AS gers_id, place.names.primary AS name, place.websites, place.addresses, place.${categoryColumn} AS category, place.confidence` [VERIFIED: lib/overture-client.ts buildPlacesSql]. Add `ST_X(place.geometry) AS lon, ST_Y(place.geometry) AS lat`. The `geometry` column is a native GEOMETRY type in this release [VERIFIED: live DESCRIBE, `('geometry', 'GEOMETRY', ...)`; repo comment in buildPlacesSql says the same]. Verified on a live query: `ST_X(geometry) AS lon, ST_Y(geometry) AS lat` returned numeric values such as `4.4984826, 52.1602462`, and `ST_GeometryType` was `POINT` for all 9,567 rows [VERIFIED: live DuckDB probe, scratch, duckdb 1.4.5]. Do not select the raw `geometry` column into Node; project the two doubles. Longitude is X, latitude is Y.

**Release note:** the 2026-10-21.0 places parquet exposes `taxonomy` and `basic_category` and has no `categories` column, which `detectCategoryColumn` handles (`taxonomy.primary`) [VERIFIED: live DESCRIBE; lib/overture-client.ts detectCategoryColumn]. Overture also has `operating_status`: of the same 6,567 rows, 246 (3.7%) were `permanently_closed` and 1,274 null [VERIFIED: live probe]. The importer ignores it today. It is not one of D-9-14's three conditions; raise it in Open Questions rather than adding it silently.

**Importer and upsert changes:**

- `OverturePlaceRow` gains `lat?: number | null` and `lon?: number | null` (optional so `tests/fixtures/overture.ts` and existing stubs keep compiling) [VERIFIED: types/scanner.ts OverturePlaceRow]; map them in the `rows.map` in `queryOverturePlaces`.
- Migration 021: `alter table prospects add column if not exists latitude double precision;` and `longitude`, plus `not_scoreable_reason text` and `scoreable_checked_at timestamptz`, with range and enum CHECK constraints added through the guarded `do $$ ... pg_constraint` block exactly as migrations 018 and 019 do [VERIFIED: supabase/migrations/019_add_booked_at_to_prospects.sql]. No new index is needed at this scale.
- `upsertOverturePlace` gets one helper, `maybeFillCoordinates`, that runs `.update({ latitude, longitude }).eq("id", prospectId).is("latitude", null)` in all three branches (existing source, domain collapse, new insert includes the values directly). Fill-only-when-null mirrors the `contact_email` guard in `reconcileInFlightScans`. Update the function's D-04 header comment, which lists the columns re-import never writes, and add an integration assertion that re-import neither overwrites a non-null coordinate nor touches `lifecycle_state`.
- **Backfill behaviour.** The existing-source branch matches on `overture_gers_id` and currently updates only `prospect_sources` fields and calls the two `maybe*` helpers, so a plain re-import fills coordinates once the helper is added. Re-import is per country, region and category and respects `--limit`, so a prospect gets coordinates only if its slice is re-run. Provide a one-line count query for the plan's checkpoint: prospects where `latitude is null`. Phase 10 depends on full coverage, ENG-06 does not (address text satisfies condition 3).
- **Open risk, unmeasured:** the existing-source branch never sets `overture_release`, so that column is null everywhere [VERIFIED: lib/prospect-upsert.ts inserts and updates carry no `overture_release`]. If an Overture GERS id changes between releases, a re-import would insert a second `prospect_sources` row for the same business through the domain-collapse branch, turning one match into two and failing condition 1 falsely. [ASSUMED: id churn between releases; not measured]. Log the count of `no_unique_match` rows at refresh time so a jump is visible.

**Random mode (folded todo).** `--category=random` and `--region=random` resolve a concrete value from `profile.overtureCategories` and `profile.regions` before `parseImportArgs` returns, via an injectable RNG for tests; explicit values behave exactly as today, and `--category`/`--region` stay required (D-10) [VERIFIED: scripts/import-prospects.ts parseImportArgs]. Regions must be keys known to `REGION_BBOXES`; test that every profile region resolves through `resolveBbox`. Seed category proposal from measured NL counts (count, with website): `roofing` 2,538/1,908; `hvac_service` 1,018/953; `plumbing` 3,218/2,094; `electrician` 2,551/1,997; `energy_company` 3,425/3,345; `building_contractor` 1,464/1,118; `building_or_construction_service` 7,474/5,638; `contractor` 21,871/10,491 [VERIFIED: data/overture-categories.json aggregated across its four provinces, and the live Overture query confirmed these `taxonomy.primary` strings return rows]. Joshua's confirmation of the seed lists is still owed (CONTEXT.md folded todo).

### Pattern 10: The scan request contract (D-9-12, D-9-13)

**Current contract.** `ScannerClient.fullScanBulk` posts to `/api/scan/full-async` with `{ url, scanId, maxPages, source: "bulk", userAgent, prospectId }` and a 30s timeout [VERIFIED: lib/scanner-client.ts fullScanBulk]. The route destructures `{ url, scanId, maxPages = 7, locale = "en", source, userAgent, prospectId }`, returns `{ accepted: true, scanId }` immediately, and runs the scan in the background, writing results to Supabase [VERIFIED: scanner-service/src/index.ts:397-427]. There is no response body carrying results for this path: "the scan response path carries the extracted facts back" means the scanner's own database write (Pattern 3). Quick and sync-full routes return JSON bodies but the prospect pipeline does not use them.

**Add** an optional `nicheSlice?: NicheScanSlice` to `fullScanBulk`'s opts and body, and to the route's destructuring. Absent slice means no own-site work and an identical scan (public scanner untouched).

**Slice shape** (type-only file `types/niche-scan-slice.ts`; `types/` is copied into the image and included by the scanner tsconfig, so no Dockerfile or tsconfig edit is needed): [VERIFIED: scanner-service/Dockerfile:6 `COPY types/ ./types/`, scanner-service/tsconfig.json:21 `"include": ["src/**/*", "../types/**/*", "../lib/scoring.ts"],`]

```typescript
export interface NicheScanSlice {
  nicheId: string;
  trades: Array<{
    id: string;
    terms: Array<{ term: string; match: "substring" | "prefix" | "word" }>;
    tieBreakRank: number;
    checks: { quoteTerms: string[]; projectTerms: string[]; certificationTerms: string[] };
  }>;
  reviewWidgetHosts: string[];
  minTradeScore: number;
  dominanceRatio: number;
}
```

**Validate it as untrusted input scanner-side** (the route already treats `source` and `userAgent` as untrusted labels [VERIFIED: index.ts:415-419 comment]): cap trades at 12, terms at 60 per trade, string length at 80, slice JSON under 20KB; reject on violation by ignoring the slice (scan proceeds without own-site work and logs why), never 400 the whole scan. `express.json()` uses the default 100kb body limit [VERIFIED: index.ts:82 `app.use(express.json());`]; six trades of about 30 short terms is a few KB, far below it. Compile terms by escaping literals, never by `new RegExp(rawString)`.

**Testing placement.** New scanner-side modules must be dependency-free and imported by tests in the root tree, because the scanner's `tsc` build would break on a test importing `vitest`, which `scanner-service/package.json` does not list. This is the established placement [VERIFIED: lib/scanner-design-prompt.test.ts header, "Lives in the root Vitest tree, not beside scanner-service/src/design-prompt.ts"; same for `lib/scanner-capacity.test.ts`].

### Anti-Patterns to Avoid

- **Editing `scanner-service/Dockerfile` or `tsconfig.json`, or importing anything but `types/` and `lib/scoring.ts` from the scanner.** Locked by D-9-13.
- **Adding the harvest into `extractPageData`'s existing `page.evaluate`.** A thrown error there fails the page for every scan, public included. Use a separate call in try/catch.
- **Putting `own_site_facts` in the main completed update.** It couples the live public scanner's completion to a manually applied migration.
- **A second releasability function.** `scoreableVerdict` is internal to `isReleasable`'s module; no caller imports it to decide releasability on its own.
- **Reading the trade inside the scoreable rule.** Locked out by the D-9-08 consequence.
- **Banning generic words in the ENG-07 test.** Breaks on own-site review code and Overture coordinates; ban Places-specific names and endpoints.
- **Recursively scanning the repo root in a test.** Walks `.claude/worktrees` copies and `scanner-service/dist`.
- **A test that goes red on the calendar date** (stale job values). Surface staleness through a helper, not through CI.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Domain and aggregator detection | A new domain list or parser | `isAggregatorDomain()` and `normalizeDomain()` in `lib/domain-normalize.ts` | Already public-suffix aware via `tldts`; ENG-06's own-domain condition is one call |
| Province containment | A new point-in-polygon check | The existing `ST_Within` against the divisions polygon | Already built and tested in `buildPlacesSql`; only add the coordinate projection |
| Comment stripping for source assertions | A new tokenizer | The two-marker line filter from `lib/outreach-isolation.test.ts` | Proven, and its limits are known (block comments by leading `*`) |
| Contact parsing precedent | A new harvest/parse split | The `ContactExtraction` pattern: bounded harvest in the browser, parse Node-side | Same boundary rule (D-5-R1) |
| Migration idempotence | New constraint-guard syntax | The `do $$ ... pg_constraint` block from migrations 018 and 019 | Postgres has no `ADD CONSTRAINT IF NOT EXISTS` |
| Chunked `.in()` lookups | Ad hoc batching | `chunkIds` in `lib/chunk-ids.ts` | Already solved the PostgREST URL-length failure |
| Full JSON-LD semantics (`@context` expansion, remote contexts) | A JSON-LD processor | Nothing: a bounded resolver over ten properties | The phase needs a few fields; a processor adds network and dependency risk inside the scanner |

**Key insight:** every hard part here already has a house pattern in this repo. The risk is in the joins between them: the scanner write path, the retention lists, and the ENG-07 vocabulary.

## Runtime State Inventory

Not a rename or migration phase, but it adds stored personal data, so the equivalent audit applies.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | New `prospects.latitude/longitude` (business location, derived from an address; for a sole proprietor effectively a home or office point) and `scans.own_site_facts` (phone and address read from the site). `ANONYMIZED_PROSPECT_FIELDS` currently clears `name, domain, website_url, contact_email, website_url_pending, address` and `ANONYMIZED_SCAN_FIELDS` clears `pages, url, domain, summary, screenshots, ...` [VERIFIED: lib/retention-constants.ts:147-154 and 207-224] | Code edit in the same plan that adds each column: add `latitude: null, longitude: null` (and decide on `not_scoreable_reason`, which carries no personal data) to the prospect map, `own_site_facts: null` to the scan map; extend the retention integration test. This is a code edit, not a data migration, because the columns are new and empty |
| Live service config | Railway scanner env and image: none change (D-9-13). Supabase dashboard: migrations 021 and 022 are applied by Joshua through the SQL Editor | Human checkpoint to apply 021 before importer/triage deploys and 022 before the scanner deploys |
| OS-registered state | None: verified by the project's own constraints (Vercel cron, Railway; no OS tasks involved) | None |
| Secrets/env vars | None added | None |
| Build artifacts | `scanner-service/dist` exists in the working tree and is rebuilt by the Docker build; not committed state that this phase must touch | None; exclude it from any test glob |

## Common Pitfalls

### Pitfall 1: A confidence limit above 0.5 silently empties the list
**What goes wrong:** at 0.7, 75% of hosts have zero rows above the limit and all become not scoreable.
**Why it happens:** Overture's default confidence is 0.5 and 55% of rows sit exactly there.
**How to avoid:** seed 0.5 with `>=`; run the histogram on the real `prospect_sources`; log counts per reason at refresh.
**Warning signs:** the admin eligible count collapses after the refresh run.

### Pitfall 2: Migration not applied before the scanner deploy
**What goes wrong:** the scanner's final update names an unknown column, the scan never completes, public full scans stall until the 15-minute timeout marks them failed.
**How to avoid:** separate try/caught second update; human checkpoint ordering; the slice-absent path touches nothing.
**Warning signs:** scans stuck in `scanning` with no `error_message`.

### Pitfall 3: Personal data outliving retention
**What goes wrong:** anonymised prospects keep coordinates and phone numbers.
**How to avoid:** extend both anonymise maps in the plan that adds the column, with a test (Runtime State Inventory).

### Pitfall 4: A test file under `scanner-service/src`
**What goes wrong:** the scanner's `tsc` build includes it and fails on `vitest` in the image.
**How to avoid:** tests in `lib/` importing `../scanner-service/src/...` (existing practice).

### Pitfall 5: Counting nav links once per page
**What goes wrong:** a nav that mentions `warmtepomp` is counted seven times on a 7-page scan and swamps the real signal.
**How to avoid:** distinct union for nav and link-path zones; sum only per-page-distinct zones.

### Pitfall 6: Short certification acronyms in raw HTML
**What goes wrong:** `stek` 10 and `vca` 11 hits on the sample were mostly noise; `kvk` matches every footer.
**How to avoid:** visible text plus `alt`/`src` filenames, word boundaries, no `kvk`/`erkend`/`iso` alone.

### Pitfall 7: Placeholder opening hours read as real
**What goes wrong:** a plugin default of all seven days `00:00` to `23:59` counts as published hours.
**How to avoid:** store the value but flag `looksDefault`; Phase 11/12 decide the weight.

### Pitfall 8: `isReleasable` row type widened but fixtures not
**What goes wrong:** existing tests and `tsc --noEmit` break, or worse, a caller passes a partial row at runtime and the rule fails open.
**How to avoid:** required fields in the type, a row factory in tests, no optional defaults that make a missing field read as scoreable.

### Pitfall 9: Overture GERS id churn creating a second source
**What goes wrong:** one business reads as two matches after a re-import against a newer release (unmeasured).
**How to avoid:** log reason counts; consider `last_seen_at` recency as a follow-up (Open Question 3).

### Pitfall 10: `express.json()` default limit and slice growth
**What goes wrong:** if copy ever leaks into the slice, the request exceeds 100kb and every bulk scan returns 413.
**How to avoid:** `toScannerSlice` takes only the listed fields; a test asserts the serialised slice stays under 20KB and contains no `jobValue`, `citation` or `copy`.

## Code Examples

### Dereferencing an `@id` reference across blocks

```typescript
// Illustrative resolver shape (pure, bounded). Pattern verified against real Yoast-style @graph samples.
type Node = Record<string, unknown>;

function buildPool(blocks: unknown[]): { nodes: Node[]; byId: Map<string, Node> } {
  const nodes: Node[] = [];
  const visit = (v: unknown, depth: number): void => {
    if (depth > 6 || v === null || typeof v !== "object") return;
    if (Array.isArray(v)) { v.forEach((x) => visit(x, depth + 1)); return; }
    const o = v as Node;
    if (Array.isArray(o["@graph"])) visit(o["@graph"], depth + 1);
    if (o["@type"] || o["@id"]) nodes.push(o);
    for (const [k, val] of Object.entries(o)) if (k !== "@graph") visit(val, depth + 1);
  };
  blocks.forEach((b) => visit(b, 0));
  const byId = new Map<string, Node>();
  for (const n of nodes) if (typeof n["@id"] === "string" && Object.keys(n).length > 1) byId.set(n["@id"] as string, n);
  return { nodes, byId };
}

function deref(v: unknown, byId: Map<string, Node>, hops = 0): unknown {
  if (hops > 4 || v === null || typeof v !== "object" || Array.isArray(v)) return v;
  const o = v as Node;
  const keys = Object.keys(o);
  if (keys.length === 1 && keys[0] === "@id") return byId.get(String(o["@id"])) ?? null;
  return o;
}
```

### Projecting the Overture point

```typescript
// lib/overture-client.ts buildPlacesSql SELECT (existing columns plus two projections)
// SELECT place.id AS gers_id, place.names.primary AS name, place.websites, place.addresses,
//        place.${categoryColumn} AS category, place.confidence,
//        ST_X(place.geometry) AS lon, ST_Y(place.geometry) AS lat
// rows.map: lat: (row.lat as unknown as number | null) ?? null, lon: (row.lon as unknown as number | null) ?? null
```

### The embed that feeds the predicate

```typescript
// lib/triage-release.ts selectWorstN: one query, confidences only
// .select("id, triage_score, category, domain, website_url, address, latitude, longitude, not_scoreable_reason, prospect_sources(raw_confidence)")
// then: source_confidences: (p.prospect_sources ?? []).map((s) => s.raw_confidence)
```

### The ENG-07 comment-stripping matcher (copy of the model's method)

```typescript
// Source: lib/outreach-isolation.test.ts stripCommentLines()
// trim each line, drop empties, drop lines starting with "//" or "*"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Overture `categories.primary` | `taxonomy.primary` / `basic_category` | present in release 2026-10-21.0, no `categories` column | `detectCategoryColumn` already handles it; do not hardcode a column |
| Places API legacy field names (`formatted_address`, `user_ratings_total`, `opening_hours`) | Places API (New) camelCase (`formattedAddress`, `userRatingCount`, `regularOpeningHours`) | Places API (New) | The ENG-07 ban list must carry both spellings |

**Deprecated/outdated:** a hand-pinned Overture release (`2026-06-17.0`) broke imports on 2026-11-11 and is replaced by runtime release lookup in `lib/overture-client.ts` [VERIFIED: lib/overture-client.ts header comment]; do not re-pin.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Overture confidence distribution measured on the Noord-Holland slice (55% at 0.5) matches Joshua's imported `prospect_sources` | Pattern 7 | The seeded limit 0.5 drops more or fewer prospects than measured; mitigated by the histogram query before locking |
| A2 | `ST_X`/`ST_Y` behave the same under `@duckdb/node-api` 1.5.x as under Python duckdb 1.4.5 | Pattern 9 | Importer fails or returns nulls; caught by a live `--dry-run` before merge |
| A3 | Zone weights (5/5/3/3/2/1), `MIN_TRADE_SCORE` 8 and `DOMINANCE_RATIO` 1.5 are right for 7-page scans | Pattern 6 | Too many or too few trades read; tunable constants, fixtures guard regressions |
| A4 | All keyword and certification seed terms except those marked VERIFIED are correct and sufficient | Patterns 5 and 6 | Missed trades (money line quiet) or false trades; confirm on the real list |
| A5 | `kiyoh` and `feedbackcompany` are widget hosts worth listing | Pattern 4 | Missed review widgets; low cost |
| A6 | Reading an on-site `AggregateRating` is outside Google's restriction because it is read from the owner's own page | Pattern 4 | A legal reading with no counsel review; if wrong, drop the count and keep only `shown` and `markedUp` |
| A7 | Heat pump should outrank central heating on an exact tie | Pattern 6 | Wrong money line for hybrid installers; Phase 12 also receives `confidence: "narrow"` |
| A8 | Overture GERS ids may change between releases and create a second source row | Pattern 9 | A false `no_unique_match`; unmeasured, mitigated by logging |
| A9 | Bare `cv` would false-match job-vacancy text | Pattern 6 | Only a missed keyword if wrong; no cost |
| A10 | Roofing, bathroom and kitchen have no recognised certification scheme worth a term list | Pattern 5 | Those trades under-report certifications; only generic terms seeded |
| A11 | A competitor radius default (for example 25 km) and the three Dutch AI question templates per trade are acceptable seeds | Open Question 4 | Phase 10 tunes; needs Joshua's wording sign-off for prospect-facing text |
| A12 | `jsonld` library behaviour (remote context loading) as described | Alternatives | Only affects a rejected alternative |

## Open Questions

1. **What is the real `raw_confidence` histogram?**
   - What we know: the Overture sample shows a 0.5 spike and the tail below it is about 12% of rows.
   - What's unclear: whether Joshua's imported rows look the same.
   - Recommendation: before locking the constant run `select round(raw_confidence::numeric, 1) as band, count(*) from prospect_sources group by 1 order by 1;` in the Supabase SQL Editor, then set `MIN_MATCH_CONFIDENCE` (default recommendation 0.5).

2. **Should `operating_status = 'permanently_closed'` disqualify a business?**
   - What we know: 3.7% of sampled rows are permanently closed, the importer ignores the field, and D-9-14 names exactly three conditions.
   - What's unclear: whether a closed business should ever be pitched.
   - Recommendation: do not add it silently; surface to Joshua as a one-line addition (a fourth reason, additive).

3. **Should sources not seen in the latest import count toward "exactly one match"?**
   - What we know: `last_seen_at` exists on `prospect_sources` and updates on every re-import of a known id; `overture_release` is never written.
   - What's unclear: whether id churn between releases is real.
   - Recommendation: ship without a recency filter, log reason counts, revisit if `no_unique_match` jumps after a re-import.

4. **How much copy and how many seeds does Phase 9 write?**
   - What we know: NIC-01 says the profile holds AI questions, competitor rules and all copy; Phase 10 reads the AI questions and radius, Phase 12 reads the report copy; the plan's section 5 gives the question template "which {trade} in {city} is good?" and names "X km" without a value [VERIFIED: docs/v2-renewed-scanner-plan.md:231-245].
   - What's unclear: the radius number and the Dutch wording.
   - Recommendation: type all of it now; seed only the strings that exist today (money-line wording from plan section 7, the D-9-20 obligations, three question templates per trade) and a radius default marked for Joshua's approval; later phases add fields additively.

5. **Which retention treatment for `not_scoreable_reason`?**
   - What we know: it holds a reason code, not personal data.
   - Recommendation: keep it on anonymised rows (useful for reporting); confirm in the retention plan.

6. **Do already-queued prospects need the new gate?**
   - What we know: `selectWorstN` only gates future releases.
   - Recommendation: re-check in `dispatchOne` (cheap, one more pure call) rather than a sweep script.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | scripts, tests | yes | v24.22.1 | , |
| `node_modules` in this checkout | vitest | no (`ls node_modules` fails) | , | `npm ci` first (Wave 0) |
| Local Supabase (127.0.0.1:54321) | `*.integration.test.ts` | no (curl returned 000) | CLI 2.109.0 installed | `supabase start` and `supabase db reset` before integration tests; unit tests do not need it |
| Docker | `supabase start`, scanner image build check | yes | 29.9.2 | , |
| Network to Overture S3 | live `--dry-run` check of the coordinate projection | yes (probes ran) | release 2026-10-21.0 | skip live check, rely on static SQL test |
| `duckdb` CLI | , | no | , | not needed, the app uses `@duckdb/node-api` |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `node_modules` (run `npm ci`), local Supabase (start before integration plans).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.10 with three projects: `unit`, `integration` (file-serial), `component` (jsdom) [VERIFIED: vitest.config.ts] |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --project unit <file>` |
| Full suite command | `npx vitest run` (the `test` script) |
| Integration | files named `*.integration.test.ts`, local Supabase pinned to `http://127.0.0.1:54321` as in `lib/prospect-upsert.integration.test.ts` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ENG-06 | `scoreableVerdict` table: aggregator, null domain, 0/1/2+ sources above limit, null confidence, blank address with and without a point | unit | `npx vitest run --project unit lib/triage-eligibility.test.ts` | extend existing |
| ENG-06 | `isReleasable` is false for a not-scoreable row even when gated; true path unchanged | unit | same | extend existing |
| ENG-06 | `selectWorstN` embed returns confidences and excludes not-scoreable rows | integration | `npx vitest run --project integration lib/triage-release.integration.test.ts` | extend existing |
| ENG-06 | Draft gate and manual generate refuse a marked prospect | unit/integration | `npx vitest run lib/draft-on-scan-complete.integration.test.ts` | extend existing |
| D-9-16 | SQL contains `ST_X(place.geometry)` and `ST_Y`; `lat`/`lon` mapped | unit | `npx vitest run --project unit lib/overture-client.test.ts` | extend existing |
| D-9-16 | Re-import fills null coordinates once, never overwrites, never touches `lifecycle_state` | integration | `npx vitest run --project integration lib/prospect-upsert.integration.test.ts` | extend existing |
| folded todo | `--category=random` and `--region=random` resolve from the profile with a seeded RNG; explicit values unchanged; every region resolves via `resolveBbox` | unit | `npx vitest run --project unit scripts/import-prospects.test.ts` | extend existing |
| ENG-07 | banned tokens, endpoint allowlist, schema columns, canaries, roots exist | unit | `npx vitest run --project unit lib/google-content-guard.test.ts` | Wave 0 |
| NIC-01/02 | six values by literal number, citation present on every value, kitchen midpoint, central heating `showMoneyLine` false with a value | unit | `npx vitest run --project unit lib/niche-profile` | Wave 0 |
| NIC-03/04 | engine files free of Dutch vocabulary and country literals; categories do not overlap `EXCLUDED_CATEGORIES`; slice under 20KB and free of copy and values | unit | same | Wave 0 |
| ENG-01 | Yoast-style `@graph`, `@id` refs across blocks, top-level array, multiple blocks, invalid block, microdata, each field found/missing/unreadable | unit | `npx vitest run --project unit lib/own-site-facts.test.ts` | Wave 0 |
| ENG-02 | widget host, count from markup and text, recency from `datePublished`, markup absent | unit | same | Wave 0 |
| ENG-05 | form, tel link, quote CTA in Dutch, project term, certification term with word boundary and image alt | unit | same | Wave 0 |
| D-9-06/07/08 | compound (`dakreparatie`), plural (`zonnepanelen` vs `zonnepaneel`), hybrid tie, mention-only, nav dedupe across pages, unreadable | unit | `npx vitest run --project unit lib/trade-detection.test.ts` | Wave 0 |
| Retention | new columns are cleared by anonymise | integration | `npx vitest run --project integration lib/retention.integration.test.ts` | extend existing |
| Scanner safety | public-path request without a slice performs no own-site work; harvest failure does not fail the page | unit | `npx vitest run --project unit lib/own-site-harvest.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** the quick command for the touched file.
- **Per wave merge:** `npx vitest run --project unit`.
- **Phase gate:** `npx vitest run` green, with local Supabase up, plus `npx tsc --noEmit` and the scanner build (`npm run build` inside `scanner-service`) to prove the image still compiles, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `npm ci` at the repo root and `scanner-service/` (no `node_modules` present)
- [ ] `lib/google-content-guard.test.ts` first, importing the not-yet-written module so it fails red
- [ ] `lib/niche-profile/*.test.ts`, `lib/own-site-facts.test.ts`, `lib/own-site-harvest.test.ts`, `lib/trade-detection.test.ts`
- [ ] A `releasableRow()` factory so widening the `isReleasable` row type does not rewrite every fixture
- [ ] Trimmed zone fixtures (about 15 sites) for trade detection; do not commit saved third-party HTML
- [ ] Extend `tests/fixtures/overture.ts` `makeOverturePlace` with optional `lat`/`lon`
- [ ] Local Supabase running for the integration extensions (`supabase start`, `supabase db reset`)

## Security Domain

`security_enforcement` is enabled (absent means enabled; `.planning/config.json` has `security_enforcement: true`, `security_asvs_level: 1`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no change | the scanner's existing bearer `authMiddleware` guards `/api/*` [VERIFIED: index.ts:92 `app.use("/api", authMiddleware);`] |
| V3 Session Management | no | not touched |
| V4 Access Control | yes | new columns inherit service-role-only RLS (migration 010 enables RLS, no policies); add no policy, same convention as migrations 016 and 019 |
| V5 Input Validation | yes | the slice is validated scanner-side (caps, shape, escaped literals); all harvested page content is untrusted and bounded; JSON parse in try/catch |
| V6 Cryptography | no | none introduced |
| V8 Data Protection | yes | new coordinates and phone/address facts are added to the retention anonymise maps; D-9-R4 enforced by ENG-07 |
| V12 Files and Resources | yes | DoS caps on harvest (blocks, sizes, items, depth), never fetch a second time |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Hostile page with enormous or deeply nested JSON-LD | Denial of service | caps at harvest (20 blocks, 200k chars, depth 4 to 6), Node-side depth guard, try/catch to `unreadable` |
| ReDoS via profile or page-derived regex | Denial of service | profile terms escaped and matched as literals; no regex built from page text |
| Request-body inflation through the slice | Denial of service | slice size and shape caps, ignore on violation rather than 400 |
| Personal data retained after anonymisation | Information disclosure | add new columns to `ANONYMIZED_*` maps with a test |
| Google content written to a table | Tampering with a legal constraint | ENG-07 static tests plus runtime `toStorableGooglePlace` allowlist |
| Prompt or instruction text inside scraped pages | Spoofing | harvested text is only ever counted and matched, never passed to a model in this phase |
| Public scanner broken by a new write | Denial of service | separate best-effort update, slice-absent path identical to today |

## Sources

### Primary (HIGH confidence)
- Repo files read this session: `lib/triage-eligibility.ts`, `lib/outreach-isolation.test.ts`, `scanner-service/src/extractor.ts`, `scanner-service/src/scanner.ts`, `scanner-service/src/index.ts` (route and update), `scanner-service/src/discovery.ts`, `scanner-service/Dockerfile`, `scanner-service/tsconfig.json`, `lib/scanner-client.ts`, `types/scanner.ts`, `lib/overture-client.ts`, `lib/prospect-upsert.ts`, `scripts/import-prospects.ts`, `lib/triage-release.ts`, `lib/triage-candidates.ts`, `lib/scan-queue.ts`, `lib/retention-constants.ts`, migrations 010, 011, 016, 018, 019, `vitest.config.ts`, `09-JOB-VALUES.md`, `docs/v2-renewed-scanner-plan.md` sections 4 and 5.
- Live Overture release 2026-10-21.0 queried through DuckDB (schema, geometry type, coordinates, confidence distribution, category values, address presence, operating status).
- https://schema.org/HomeAndConstructionBusiness , https://schema.org/areaServed , https://schema.org/hasCertification
- https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places and https://developers.google.com/maps/documentation/places/web-service/policies

### Secondary (MEDIUM confidence)
- Live sample of 53 NL installer homepages (static HTML, one request each, honest one-off read) analysed in scratch for JSON-LD shapes, review widgets, quote-readiness and certification signals, and as the prototype corpus for trade scoring. Static HTML only, so JS-injected markup is under-counted.
- Web search on InstallQ, Techniek Nederland and Stichting Zonnekeur as certifying bodies.

### Tertiary (LOW confidence)
- Search for roofing, bathroom and kitchen certification schemes returned only directory listings; no authoritative scheme confirmed.
- The Maps Platform Terms page itself did not render section 3.2.3 text through the fetch tool; the policy page above was used instead, and section 3.2.3 is cited only as CONTEXT.md and STATE.md cite it.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new packages, every dependency already in the repo.
- Architecture: HIGH for seams and write path (read in code), MEDIUM for the storage choice, which is a recommendation among three viable options.
- Pitfalls: HIGH for those verified against code or live data, MEDIUM for GERS id churn and the cv, tie and rank guesses.
- Seeds and thresholds: LOW to MEDIUM, measured on one 53-site homepage-only sample.

**Research date:** 2026-11-12
**Valid until:** 2026-12-12 for code seams; the Overture release changes monthly, so re-run the confidence histogram if the importer is run against a newer release.
