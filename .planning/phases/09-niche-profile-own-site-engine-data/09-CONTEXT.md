# Phase 9: Niche Profile & Own-Site Engine Data - Context

**Gathered:** 2026-11-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers four things:

1. **One niche profile** (installers) that holds every parameter the engine reads: trades, cited
   job values, AI questions, competitor rules, trade-specific website checks, the Overture
   categories to import, and all copy. Country and locale are parameters of it.
2. **One scoreable predicate** (ENG-06) that decides whether a business can be scored at all, and
   that gates the expensive full scan.
3. **Three own-site extractors**: business facts as structured data (ENG-01), on-site social
   proof (ENG-02), and quote-request readiness (ENG-05).
4. **One enforcement test** (ENG-07) that fails if any field Google returns is written to a
   Supabase table.

**Requirements:** NIC-01, NIC-02, NIC-03, NIC-04, ENG-01, ENG-02, ENG-05, ENG-06, ENG-07.

**Not in this phase.** No competitor set and no competitor scan (ENG-03, ENG-04, Phase 10). No AI
visibility probe (Phase 10). No new score and no change to any scoring module (Phase 11). No new
report page, no money line rendering, no to-do list, no PDF, no live Google band (Phase 12). No
outbound change (Phase 13).

</domain>

<decisions>
## Implementation Decisions

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

### Folded Todos

- **`.planning/todos/2026-07-24-random-import-from-target-categories.md` — "Add random import mode,
  TARGET_CATEGORIES and TARGET_REGIONS sampling."** Original problem: every import needs a
  hand-picked `--category`, and Joshua does not want to choose a vertical each time; random
  sampling across all of Overture is the wrong fix, because NL data is dominated by food service,
  schools, churches and government. It folds in because the niche profile already has to hold a
  list of the Overture categories worth importing, and keeping a second list in
  `lib/triage-constants.ts` would mean a new niche touches two files, which weakens NIC-04.
  Scope folded in: the positive category list moves into the profile (D-9-11), and
  `scripts/import-prospects.ts` accepts `--category=random` sampling from it. `TARGET_REGIONS` and
  `--region=random` come with it, since region resolution itself is untouched and the existing
  bbox plus `ST_Within` check simply receives a sampled name. Explicit `--category=<value>` and
  `--region=<value>` keep working unchanged. The todo asks Joshua to confirm the seed lists before
  locking; that confirmation is still owed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The milestone's source plan

- `docs/v2-renewed-scanner-plan.md` — revision 2, adversarially reviewed 2026-11-11. Section 4 is
  the six checks and the scoreable rule. Section 4a is what each review source allows. Section 5
  is the niche profile's contents. Section 7 is the money line. Section 13 is the still-open list,
  of which item 7 (the job values) is closed by D-9-01 to D-9-04.
- `docs/v2-renewed-scanner-plan-REVIEW.md` — the two review verdicts and their findings. Finding
  S6 is why the AI probe runs five times; S8 and S9 are why the report needs `noindex` and a
  signed link. Both land in later phases, not this one.

### This phase's own artifacts

- `.planning/phases/09-niche-profile-own-site-engine-data/09-JOB-VALUES.md` — **the approved job
  values and their citations. The profile's values are copied from this file, not re-researched.**
  It also records what counts as an acceptable source for this niche, the cross-checks, and the
  three copy obligations D-9-20 names.

### Milestone planning

- `.planning/ROADMAP.md` — Phase 9 details, success criteria and notes. Also the Parallel Track
  table, which holds the three vendor overrides that are still owed.
- `.planning/REQUIREMENTS.md` — the 40 v2.0 requirements and the traceability table.
- `.planning/PROJECT.md` — Constraints, Out of Scope and Key Decisions. The Geography constraint
  (country and locale as parameters) and the blast-radius constraint both bind this phase.
- `.planning/codebase/CONCERNS.md` — the audit that recorded the duplicated scoring logic and the
  bulk-scan concurrency limits.
- `.planning/todos/2026-07-24-random-import-from-target-categories.md` — the folded todo.

### The code this phase extends

- `lib/triage-eligibility.ts` — `isReleasable`, the single release rule ENG-06 extends. Read its
  header comment before touching it.
- `lib/triage-constants.ts` — the config-module pattern D-9-09 copies, and `EXCLUDED_CATEGORIES`,
  the negative guard that must not contradict the profile's positive list.
- `lib/outreach-isolation.test.ts` — the enforcement-test shape ENG-07 copies.
- `lib/domain-normalize.ts` — `isAggregatorDomain()`, which already exists for ENG-06's
  own-domain condition.
- `lib/overture-categories.ts` and `data/overture-categories.json` — the category vocabulary and
  the cached real counts that D-9-05 is measured against.
- `scripts/import-prospects.ts` — where the folded todo's sampling and D-9-16's coordinates land.
- `scanner-service/src/extractor.ts` — where ENG-01, ENG-02 and ENG-05 extraction goes.
- `types/scanner.ts` — the `PageData` interface the new fields extend.
- `lib/scanner-client.ts` — the scan request D-9-12 adds the profile slice to.
- `scanner-service/Dockerfile` and `scanner-service/tsconfig.json` — read to understand why D-9-13
  changes neither.
- `supabase/migrations/010_create_prospects.sql` and `011_create_prospect_sources.sql` — the
  current `prospects` and `prospect_sources` shape, including `raw_confidence`.

### Prior phase context worth reading

- `.planning/milestones/v1.0-phases/04.1-prospect-quality-category-exclusion-gate-split-batch-size/04.1-CONTEXT.md`
  — D-4.1-01 to D-4.1-04, the releasability decisions D-9-R1, D-9-R2 and D-9-17 carry forward.
- `.planning/milestones/v1.0-phases/05-contact-extraction-classification/05-CONTEXT.md` — D-5-R1,
  no second fetch. The new extractors run inside the existing scan; re-fetching the site is an
  explicit anti-pattern.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets

- **`isReleasable` (`lib/triage-eligibility.ts`)** is a pure predicate over a row plus a cutoff,
  already called by the release path and the admin count. ENG-06's three conditions extend it.
- **`isAggregatorDomain()` (`lib/domain-normalize.ts`)** already exists, so ENG-06's "a website on
  its own domain, not an aggregator listing" has a function to call rather than a list to write.
- **`prospect_sources.raw_confidence`** is already populated by the importer from Overture's
  `confidence` column, so D-9-15 reads a field that exists.
- **`extractPageData()` (`scanner-service/src/extractor.ts`, 378 lines)** already finds JSON-LD
  blocks, records the schema.org `@type` names (`PageData.schemaTypes`), counts blocks that fail to
  parse (`schemaInvalidCount`), detects microdata, counts form fields (`formFieldCount`), detects
  `tel:` and `mailto:` links (`hasContactInfo`), and detects testimonials, reviews, client logos
  and Review or Rating schema (`hasTrustSignals`).
- **`lib/triage-constants.ts`, `lib/retention-constants.ts` and `lib/bulk-scan-constants.ts`** are
  three working examples of the typed config module D-9-09 chose.

### Established patterns

- **The extractor records that structured data exists, not what it says.** `schemaTypes` holds
  `@type` names only. ENG-01 needs the values (address, phone, opening hours, service area,
  certifications), so it is new value-parsing on top of a detector that already runs. Nothing is
  starting from zero, and nothing is already done.
- **The browser context stays a thin harvester; parsing happens Node-side.** `ContactExtraction`
  is raw material (`mailtoHrefs`, `cfemailTokens`, `contactText`) harvested in the page and parsed
  by `lib/contact-extraction.ts`. ENG-01, ENG-02 and ENG-05 should follow the same split.
- **New optional fields on `PageData` keep legacy scans valid.** `schemaTypes`, `coreWebVitals` and
  `contactExtraction` are all optional for exactly this reason: scans persisted in `scans.pages`
  before the field existed must still parse. Any new field follows that rule.
- **Migrations are additive and idempotent, applied by hand through the Supabase SQL Editor.**
  Migration 019 adding `booked_at` is the shape to copy.
- **Enforcement by test, not by comment.** `lib/outreach-isolation.test.ts` (Phase 8) and the
  suppression-table allowlist test (D-7-19, Phase 7) are both prose claims turned into failing
  builds. ENG-07 is the third of that family.

### Integration points

- **`lib/triage-release.ts` and the admin eligible count** both call `isReleasable`, so D-9-14
  reaches both at once. That is the point of the single predicate.
- **`scripts/import-prospects.ts`** gains the sampled category and region modes and the coordinate
  capture (D-9-11, D-9-16).
- **The scan request path** (`lib/scanner-client.ts` into the scanner-service route) carries the
  profile slice (D-9-12). The scan response path carries the extracted facts and the detected
  trade back.
- **`messages/en.json` and `messages/nl.json`** stay as they are for the public scanner. D-9-10
  only moves report copy for the new niche profile.

### Constraints the architecture imposes

- **The scanner is a separate deployable.** Anything the scanner needs either travels in the
  request or is copied into the image, and D-9-13 rules out the second route.
- **Two concurrent browser slots, one daily drain** (`scanner-service/src/capacity.ts`,
  `vercel.json`). This phase adds work inside an existing scan rather than adding scans, so it
  does not multiply volume. Phase 10 does, and must size itself against this.

</code_context>

<specifics>
## Specific Ideas

- **The heat pump number at about 12,000 euros was a placeholder and is now verified.** Researched
  2026-11-12 and approved the same day: Milieu Centraal gives € 12.000 for an 8 kW all-electric
  air-to-water heat pump, label A+++, including VAT and installation, before the € 3.025 ISDE
  subsidy. The placeholder was right. Joshua's words on why it mattered, recorded in the plan and
  the roadmap: wrong by 2x in front of someone who installs heat pumps loses the report in one
  sentence. The roadmap's "Open question for `/gsd-discuss-phase`" on job values is closed by
  D-9-18 and `09-JOB-VALUES.md`; the roadmap prose itself still shows it open.
- **Joshua asked which profile form suited this job rather than choosing one.** D-9-09 is Claude's
  recommendation with its reasons written out, so it can be reversed on an argument rather than on
  a feeling.
- **The money line's wording from plan section 7, for Phase 12 to build against:** "One extra heat
  pump job is worth about 12,000 euros", with the owner able to change the number, and "Three
  installers near you show their reviews on their own site. You do not."

</specifics>

<deferred>
## Deferred Ideas

None. The discussion stayed inside the phase boundary.

Three decisions were offered and Joshua chose to leave them to Claude rather than defer them. They
are recorded under Claude's Discretion above, not here: the storage shape for extracted facts, the
shape of the ENG-07 guard, and whether on-site `AggregateRating` counts are read.

Two items named in the roadmap belong to later phases and are not touched here: the score weights
(Phase 11's open question) and the Places session-hold rule (Phase 12's open question).

</deferred>

---

*Phase: 9-Niche Profile & Own-Site Engine Data*
*Context gathered: 2026-11-12*
