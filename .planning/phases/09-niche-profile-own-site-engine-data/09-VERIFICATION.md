---
phase: 09-niche-profile-own-site-engine-data
verified: 2026-11-14T17:15:00Z
status: passed
human_verification_closed: 2026-11-16
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/09-niche-profile-own-site-engine-data/09-01-PLAN.md"
  - ".planning/phases/09-niche-profile-own-site-engine-data/09-01-SUMMARY.md"
  - ".planning/phases/09-niche-profile-own-site-engine-data/09-02-PLAN.md"
  - ".planning/phases/09-niche-profile-own-site-engine-data/09-02-SUMMARY.md"
  - ".planning/phases/09-niche-profile-own-site-engine-data/09-03-PLAN.md"
  - ".planning/phases/09-niche-profile-own-site-engine-data/09-03-SUMMARY.md"
  - ".planning/phases/09-niche-profile-own-site-engine-data/09-04-PLAN.md"
  - ".planning/phases/09-niche-profile-own-site-engine-data/09-04-SUMMARY.md"
  - ".planning/phases/09-niche-profile-own-site-engine-data/09-05-PLAN.md"
  - ".planning/phases/09-niche-profile-own-site-engine-data/09-05-SUMMARY.md"
  - ".planning/phases/09-niche-profile-own-site-engine-data/09-06-PLAN.md"
  - ".planning/phases/09-niche-profile-own-site-engine-data/09-06-SUMMARY.md"
  - ".planning/phases/09-niche-profile-own-site-engine-data/09-07-PLAN.md"
  - ".planning/phases/09-niche-profile-own-site-engine-data/09-07-SUMMARY.md"
  - ".planning/phases/09-niche-profile-own-site-engine-data/09-08-PLAN.md"
  - ".planning/phases/09-niche-profile-own-site-engine-data/09-08-SUMMARY.md"
  - ".planning/phases/09-niche-profile-own-site-engine-data/09-09-PLAN.md"
  - ".planning/phases/09-niche-profile-own-site-engine-data/09-09-SUMMARY.md"
  - "app/admin/page.tsx"
  - "components/admin/shortlist-table.test.tsx"
  - "components/admin/shortlist-table.tsx"
  - "lib/bulk-scan-dispatch.integration.test.ts"
  - "lib/bulk-scan-dispatch.test.ts"
  - "lib/bulk-scan-dispatch.ts"
  - "lib/draft-on-scan-complete.integration.test.ts"
  - "lib/draft-on-scan-complete.ts"
  - "lib/google-content-guard.test.ts"
  - "lib/google-content-guard.ts"
  - "lib/niche-profile/index.ts"
  - "lib/niche-profile/installers/categories.ts"
  - "lib/niche-profile/installers/checks.ts"
  - "lib/niche-profile/installers/copy.ts"
  - "lib/niche-profile/installers/trades.ts"
  - "lib/niche-profile/isolation.test.ts"
  - "lib/niche-profile/profile.test.ts"
  - "lib/niche-profile/types.ts"
  - "lib/outreach-queue.integration.test.ts"
  - "lib/outreach-queue.ts"
  - "lib/overture-client.test.ts"
  - "lib/overture-client.ts"
  - "lib/own-site-aggregate.test.ts"
  - "lib/own-site-facts.test.ts"
  - "lib/own-site-harvest.test.ts"
  - "lib/own-site-run.test.ts"
  - "lib/own-site-wiring.test.ts"
  - "lib/prospect-upsert.integration.test.ts"
  - "lib/prospect-upsert.ts"
  - "lib/retention-constants.ts"
  - "lib/retention.integration.test.ts"
  - "lib/scanner-client.test.ts"
  - "lib/scanner-client.ts"
  - "lib/scoreability-refresh.integration.test.ts"
  - "lib/scoreability-refresh.ts"
  - "lib/trade-detection.test.ts"
  - "lib/triage-candidates.integration.test.ts"
  - "lib/triage-candidates.ts"
  - "lib/triage-constants.ts"
  - "lib/triage-eligibility.test.ts"
  - "lib/triage-eligibility.ts"
  - "lib/triage-release.integration.test.ts"
  - "lib/triage-release.ts"
  - "scanner-service/src/index.ts"
  - "scanner-service/src/own-site-facts.ts"
  - "scanner-service/src/own-site-harvest.ts"
  - "scanner-service/src/own-site-run.ts"
  - "scanner-service/src/scanner.ts"
  - "scanner-service/src/trade-detection.ts"
  - "scripts/import-prospects.test.ts"
  - "scripts/import-prospects.ts"
  - "scripts/pipeline-runner.ts"
  - "scripts/triage-prospects.test.ts"
  - "scripts/triage-prospects.ts"
  - "supabase/migrations/022_add_prospect_coordinates_and_scoreable_marker.sql"
  - "supabase/migrations/023_add_scans_own_site_facts.sql"
  - "tests/fixtures/overture.ts"
  - "tests/fixtures/own-site-zones.ts"
  - "types/niche-scan-slice.ts"
  - "types/own-site.ts"
  - "types/scanner.ts"
covered_digest: "v3:sha256:bdda2ed403049ad91955114d82c6a60eeec1ddafccd97147f8e7a14df7155a23"
behavior_unverified: 0
overrides_applied: 0
decision_coverage:
  honored: 32
  total: 32
  not_honored: []
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "A business that fails the scoreable rule can never be scored or emailed (ROADMAP success criterion 1, ENG-06): the manual draft route and the Shortlist button now compute the verdict fresh (quick task 261114-olb, commits 825af03, 911058b, eec1129)"
  gaps_remaining: []
  regressions: []
deferred: []
human_verification:
  - test: "Capture the information_schema check for migration 023 in production: select column_name, data_type from information_schema.columns where table_name = 'scans' and column_name = 'own_site_facts';"
    expected: "One row, own_site_facts / jsonb. Migration 022 is applied and verified; 023 is applied on verbal confirmation only and its column check was never captured."
    why_human: "Requires the production Supabase SQL Editor. The repo cannot reach production and must not try."
    confirmed: "2026-11-16 PASSED. Run by Joshua in the production Supabase SQL Editor: one row, own_site_facts / jsonb."
  - test: "After deploying the scanner and confirming 023, run one bulk scan against a real Dutch installer site, then read scans.own_site_facts for that scan id."
    expected: "schemaVersion 1, pagesRead > 0, business.address and business.telephone in state found or missing (never undefined), socialProof.state read, quoteReadiness present, and trade.tradeId naming the trade a person would name, with confidence clear or narrow."
    why_human: "Nothing is deployed yet. Every extractor is proven against fixtures and the storage column round-trips in the local database, but no real site has ever been harvested. The regression corpus states its own provenance: the fixtures are composed from measured site classes, not captures of named live sites, so the first real scans are the check."
    confirmed: "2026-11-16 PASSED on two real Atrium scans. 5d70aa45 (celsiusloodgieters.nl): schemaVersion 1, pagesRead 7, address missing, telephone missing, socialProof read, quoteReadiness evaluated, trade heat_pump at confidence clear, margin 18 over runner-up central_heating. 3970e67c (jv-installatie.nl): schemaVersion 1, pagesRead 1, same four field states, trade null at confidence unreadable. pagesRead 1 is correct there, the site is a one-pager (Joshua, 2026-11-16), and Joshua judged the item passed. The null trade is carried into item 4 as evidence, not treated as a storage failure: the engine declared nothing rather than inventing a trade."
  - test: "In the same run, confirm one public quick scan at the site root is unaffected: no [own-site] log line, scans.own_site_facts null, and the report renders as before."
    expected: "No own-site work on the public path. The public scanner's scanning and email are untouched (D-9-R6)."
    why_human: "Requires the live Railway scanner and a real public scan; the no-slice short-circuit is proven in code and in tests but not against the deployed service."
    confirmed: "2026-11-16 PASSED against the deployed service. Public quick scan of adashi.io at the site root, scan 0ac37639-d139-420f-bd31-a48b363b47a9: completed in 52s with no error, the report page renders (HTTP 200), and own_site_facts is null, confirmed by SQL in production."
  - test: "Review the six per-trade keyword lists against the first ten real scan outputs and tune."
    expected: "Trades read correctly. Two keyword gaps are already known and recorded: a repeated footer line is summed per page, so a general builder can read as a trade with clear confidence; and \"cv ketels\" (plural) does not match the seeded phrase \"cv ketel\"."
    why_human: "Judgement against real pages. Both fixes are profile edits, not engine changes, and were deliberately left untuned pending real scan output."
    confirmed: "2026-11-16 PASSED on 49 production scans (34 unique domains), judged against the keyword lists and closed by Joshua. The two known gaps were already fixed in code (quick tasks 261116-m4p and 261116-oky). The judgement found a third, larger gap and it is now fixed too: 11 of the 18 trade reads came back roofing, and most of those were Dutch loodgieter (plumber) firms, because the roofing term { term: \"dak\", match: \"prefix\" } catches dakgoot (gutter) and daklekkage (roof leak). Verified by downloading four real homepages and counting terms: willardloodgieter.nl reads dak x11 but lood x21 and lekkage x10, and scored roofing/clear. Plumbing was not one of the six trades, so plumber sites were forced into roofing, kitchen or bathroom by secondary mentions. Quick task 261116-rjk adds plumbing as a seventh trade (commits d719843, 9fc5f9b, caaa74b, 18d4ea0): job value 300 EUR approved by Joshua 2026-11-16, showMoneyLine false per D-9-21, tieBreakRank 7 appended so no existing rank renumbers, and four keywords (loodgieter, lekkage, dakgo, waterleiding). The roofing list is deliberately untouched: the plumbing terms win on their own, 72 to 22 on the plumber class. The 16 unreadable reads were judged CORRECT, not a fault: sewer, ventilation and leak-detection-only firms are genuinely not one of the trades, and the engine declared nothing rather than inventing one. Gate: tests/fixtures/own-site-zones.ts gained 30 lines and lost none, so no existing corpus expectation moved; both tsc projects are clean and the full suite is 1273 passing across 82 files."
    residual: "Not a gap, an open judgement for Joshua. With plumbing in place the existing corpus entry plumber-multi-trade (\"Loodgieter Smit\") computes to an exact 19/19 tie between bathroom and plumbing, and stays bathroom only through tieBreakRank. Its runnerUpId changes from roofing to plumbing and its margin from 3 to 0; no test asserts either field. A person reading that site would arguably say plumbing. Moving it would mean ranking plumbing above bathroom, which is a moved expectation and Joshua's call. Left unchanged."
---

# Phase 9: Niche Profile & Own-Site Engine Data — Verification Report

**Phase Goal:** One settings file defines the niche, and for any business that is scoreable at all, the engine stores what that business's own site says about itself
**Verified:** 2026-11-14T17:15:00Z
**Status:** passed (all four human-verification items closed 2026-11-16)
**Re-verification:** Yes, second pass, after gap closure. The first pass (2026-11-14T13:09:16Z) returned `gaps_found`, 4/5.
**Branch:** gsd/phase-09-niche-profile (65 commits ahead of main, 9/9 plans executed, plus quick task 261114-olb)

## Second Pass: What Changed

First pass: `gaps_found`, 4/5. One blocker: success criterion 1 / ENG-06. The manual draft route
trusted the stored `not_scoreable_reason` marker, so a prospect released and scanned before
migration 022 (marker null for good) passed the gate, and the Shortlist offered it Generate Draft.

Between the passes, quick task 261114-olb landed three commits, all read in this pass:

- `825af03` failing tests first: an integration test for the exact legacy row, three component tests for the button.
- `911058b` the fix: `lib/outreach-queue.ts` and `components/admin/shortlist-table.tsx`.
- `eec1129` the stale header comment in `lib/scoreability-refresh.ts`.

Success criteria 2 to 5 were re-checked for regression only (the quick task touched none of their
files; `git show --stat` on the three commits lists exactly `lib/outreach-queue.ts`,
`lib/outreach-queue.integration.test.ts`, `components/admin/shortlist-table.tsx`,
`components/admin/shortlist-table.test.tsx`, `lib/scoreability-refresh.ts`). The first pass's
evidence for 2 to 5 stands unchanged. The coordinator's full-suite, tsc, lint and build runs were
taken as given and not repeated.

## Goal Achievement

The phase goal is achieved. One profile folder defines the niche, and the engine reads every
niche parameter from a request-carried slice rather than from the profile. For a scoreable
business the scan harvests the business facts, the on-site social proof, the quote-request
readiness and the detected trade, folds them into one versioned object and writes it to one
jsonb column in a second, separately caught update. The one hole the first pass found, on the
manual draft route, is closed. What remains is human verification against production and a
real scan, none of which the repo can do.

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A business that fails the scoreable rule is dropped before any scan cost is spent and can never be scored or emailed: one Overture match above a confidence limit, a website on its own domain, an address or a work-area centre, plus D-9-22's fourth condition (ENG-06) | ✓ VERIFIED (was ⚠️ PARTIAL) | All four conditions sit in a fixed documented order inside `scoreableVerdict` (`lib/triage-eligibility.ts:97-131`), reached only through `scoreableFailureReason` (line 143, the single production caller, confirmed by grep: declaration at :97, one call at :134). `isReleasable` gates on it (line 168). **Dispatch** (`lib/bulk-scan-dispatch.ts:90-118`) computes it fresh before any network call and fails closed. **Manual route** (`lib/outreach-queue.ts:366-408`) now widens its one read to `website_url, address, latitude, longitude, prospect_sources(...)`, keeps the stored-marker refusal at :392, then refuses on a fresh `scoreableFailureReason` at :405, with a null embed read as `[]` (zero matches, so `no_unique_match`, so refused). An unreadable row already returns an error at :375. **UI** (`components/admin/shortlist-table.tsx:264-268`) `canGenerateDraft` now also requires `scoreableFailureReason(row) === null`, the same function the server uses. **Automatic route** (`lib/draft-on-scan-complete.ts:118`) still gates on the stored marker only, which stays safe: it runs only after a scan completes, and every scan is dispatched through the fresh check, so a legacy null-marker prospect cannot be re-scanned. Unchanged from the first pass's reasoning. |
| 2 | Joshua can read back from Supabase what the site publishes as machine-readable data and what its own site shows of its reviews, including the fields that are missing (ENG-01, ENG-02) | ✓ VERIFIED | `supabase/migrations/023` adds `scans.own_site_facts jsonb`. `types/own-site.ts:34-37` makes every business field a three-state `FieldState<T>` (`found` / `missing` / `unreadable`), and `OwnSiteBusinessFacts` (line 152) names all five ENG-01 fields as required keys, so absence is representable in plain SQL. `scanner-service/src/own-site-facts.ts:1278-1317` folds the per-page harvests into one object with `schemaVersion: 1`, `pagesRead`, merged business fields, social proof, quote readiness and the trade. Behavioural evidence: `lib/retention.integration.test.ts:665` writes a facts object carrying `+31 20 123 4567` into a real local Postgres `scans` row, reads it back, then anonymises it — ran green here (see Behavioural Spot-Checks). |
| 3 | The same stored result says whether a customer can actually request a quote: a form, a tap-to-call number, project photos, certifications, using the checks the profile names for that trade (ENG-05, NIC-01) | ✓ VERIFIED | `scanner-service/src/own-site-facts.ts:1056-1140` implements the four checks (`checkQuoteForm`, `checkTapToCall`, `checkProjectPhotos`, `checkCertifications`), each returning `{ passed, evidence }`; thresholds are named constants (`MIN_QUOTE_FORM_FIELDS = 2` line 993, `MIN_PROJECT_IMAGES = 3` line 995). The per-trade terms come from the slice (`checksFor`, line 1224; `TradeChecks = NicheScanSlice["trades"][number]["checks"]`, line 990), never from a list in the scanner. `evaluateQuoteReadiness(null, …)` yields `unreadable`, never a silent `false`. |
| 4 | Changing country, locale, trade, competitor radius or copy is a change to the profile file and nothing else, and every default job value carries a citation (NIC-02, NIC-03, NIC-04) | ✓ VERIFIED | All five parameters are fields of `NicheProfile` (`lib/niche-profile/types.ts:117-136`): `country`, `locales`/`defaultLocale`, `trades`, `competitor.radiusKm` (25 km, D-9-23), `copy`. The citation is enforced by the type, not by review: `jobValue` is optional but `JobValue.citation` is required, and `derivation: "midpoint-of-range"` forces `range` plus a non-optional `citation.note` — the kitchen value's midpoint note exists for exactly that reason. `showMoneyLine` is a field independent of `jobValue`, so central heating carries €2.100 and prints no line (D-9-21). `lib/niche-profile/isolation.test.ts` turns NIC-03 and NIC-04 into a failing build over six engine files; ran green. Caveat recorded as a Warning: the niche-*selection* seam is unwired. |
| 5 | A test fails if any field Google returns is written to a Supabase table (ENG-07) | ✓ VERIFIED | `lib/google-content-guard.test.ts` scans five source roots (`lib`, `app`, `scanner-service/src`, `scripts`, `types`) plus every migration and `supabase/schema.sql`, asserting each root exists and yields more than zero files before any token assertion runs. Six both-direction canaries prove each detector fires on synthetic input and spares comments, `place_id` and the generic names Overture owns. `toStorableGooglePlace` is built field by field from `GOOGLE_STORABLE_FIELDS`, so a new Google field cannot pass through. `ALLOWED_GOOGLE_CLIENT_FILES` is asserted empty: no Google call exists yet, which is the point of shipping the guard before Phase 12. Ran green (14 tests). |

**Score:** 5/5 truths verified (0 present, behaviour-unverified)

### Required Artifacts

Verified with `gsd-tools query verify.artifacts` against each plan's `must_haves.artifacts`, then read
for substance and traced for wiring and data flow.

| Plan | Artifacts | Status | Details |
|------|-----------|--------|---------|
| 09-01 | 2/2 | ✓ VERIFIED | `lib/google-content-guard.ts` (242 lines, five exports used by the test), `lib/google-content-guard.test.ts` |
| 09-02 | 8/8 | ✓ VERIFIED | Profile folder: `types.ts`, `index.ts`, `installers/{trades,checks,copy,categories}.ts`, `types/niche-scan-slice.ts`, `isolation.test.ts`. Bilingual copy is real NL and EN prose, not a placeholder. |
| 09-03 | 4/4 | ✓ VERIFIED | Migration 022 (additive, idempotent, `add column if not exists` plus guarded `pg_constraint` checks), `lib/overture-client.ts`, `lib/prospect-upsert.ts`, `lib/retention-constants.ts` |
| 09-04 | 5/5 | ✓ VERIFIED | `lib/triage-eligibility.ts` holds `ScoreableRow` with all six fields required (a caller that forgets one is a compile error), `lib/triage-constants.ts:54` `MIN_MATCH_CONFIDENCE = 0.5`, release and candidate read paths, 59-case eligibility suite |
| 09-05 | 5/5 | ✓ VERIFIED | `types/own-site.ts`, `scanner-service/src/own-site-{harvest,facts}.ts`, two root-tree test files. `scanner-service/src/extractor.ts` is absent from the phase diff — the existing `page.evaluate` really was left untouched. |
| 09-06 | 4/4 | ✓ VERIFIED | `lib/scoreability-refresh.ts` (persists the verdict verbatim, evaluates no condition, logs per-reason counts), its integration test, importer random modes, dispatch gate |
| 09-07 | 3/3 | ✓ VERIFIED | Social proof and quote readiness in `own-site-facts.ts` (1317 lines total), three-state contract, sorted deduplicated widget hosts |
| 09-08 | 3/3 | ✓ VERIFIED | `scanner-service/src/trade-detection.ts` (282 lines), `lib/trade-detection.test.ts`, 17-site corpus + 1 declared known-gap fixture |
| 09-09 | 6/6 | ✓ VERIFIED | Migration 023, `lib/scanner-client.ts`, `scanner-service/src/{index,scanner,own-site-facts}.ts`, `lib/retention-constants.ts`. `scanner-service/src/own-site-run.ts` was added beyond the listed set as the testable seam. |

No artifact was MISSING, STUB or ORPHANED among those the plans declare.

### Key Link Verification

Verified with `gsd-tools query verify.key-links`: **24/24 links WIRED** across the nine plans. The
load-bearing chain, traced by hand:

| From | To | Via | Status |
|------|----|-----|--------|
| `lib/bulk-scan-dispatch.ts:169` | `lib/niche-profile/index.ts` | `nicheSlice: toScannerSlice(INSTALLERS_PROFILE)` — the only production caller that puts the profile on the wire | ✓ WIRED |
| `lib/scanner-client.ts:100` | `scanner-service/src/index.ts:400` | `fullScanBulk` posts `nicheSlice`; the route destructures it as `unknown` | ✓ WIRED |
| `scanner-service/src/index.ts:427-429` | `own-site-run.ts:84` | `validateNicheSlice` rebuilds the slice field by field under five caps; a violation logs and yields `null`, never an error status | ✓ WIRED |
| `scanner-service/src/scanner.ts:326` | `own-site-harvest.ts` | `collectOwnSiteHarvest(page, options.nicheSlice, harvestOwnSite)` after `extractPageData`, before the external checks; a throw costs the harvest, never the page | ✓ WIRED |
| `scanner-service/src/index.ts:672-679` | `supabase/migrations/023` | second, separately caught `.update({ own_site_facts })` after the unchanged completed update, awaited before the callback fetch | ✓ WIRED |
| `lib/triage-release.ts:70` / `app/admin/page.tsx:556` | `lib/triage-eligibility.ts` | both the server release path and the admin eligible count call `isReleasable`, so ENG-06 reaches both from one rule | ✓ WIRED |
| `lib/retention-constants.ts:166-167, 243` | migrations 022 and 023 | `latitude`, `longitude` in `ANONYMIZED_PROSPECT_FIELDS`; `own_site_facts` in `ANONYMIZED_SCAN_FIELDS` (D-9-25) | ✓ WIRED |
| `lib/scoreability-refresh.ts` | `scripts/{import-prospects,triage-prospects,pipeline-runner}.ts` | refresh runs at the end of every non-dry import and triage run | ✓ WIRED |

**D-9-13 confirmed by reading the build, not the claim:** `scanner-service/Dockerfile:6` already does
`COPY types/ ./types/` and `scanner-service/tsconfig.json:21` already includes `../types/**/*`, so
`types/own-site.ts` and `types/niche-scan-slice.ts` ride into the image with no edit to either file.
Both files are unchanged since 1516ebe. No new shared `lib/` file is scanner-readable.

### Data-Flow Trace (Level 4)

| Artifact | Data value | Source | Produces real data | Status |
|----------|-----------|--------|--------------------|--------|
| `components/admin/shortlist-table.tsx:286` | NOT SCOREABLE pill + reason title | `lib/triage-candidates.ts:95` selects `not_scoreable_reason` from `prospects` | Yes — DB column written by the refresh from `scoreableFailureReason` | ✓ FLOWING |
| `app/admin/page.tsx:556` | eligible count | `isReleasable(r, cutoff)` over rows carrying `latitude`, `longitude`, `address`, `prospect_sources(raw_confidence, raw_operating_status)` | Yes — same predicate the server release path uses | ✓ FLOWING |
| `scans.own_site_facts` | business facts, social proof, quote readiness, trade | `aggregateOwnSite` over per-page harvests from the live page the scan already loaded | Yes in code and in the local database; never yet produced from a real site (nothing deployed) | ✓ FLOWING (code), human item for the first real scan |
| `prospects.latitude` / `.longitude` | the Overture point | `lib/overture-client.ts` projects lon/lat; `lib/prospect-upsert.ts:141,220` writes them, `maybeFillCoordinates` fills a null once and never overwrites | Yes | ✓ FLOWING |
| `profile.copy`, `profile.competitor.radiusKm`, `trade.jobValue`, `trade.aiQuestions` | report copy, radius, money figure, AI questions | Held in the profile; **no production consumer on this branch** | By design — Phase 10 consumes the radius and writes the questions, Phase 12 renders the copy and the money line | ⚠️ HELD, NOT CONSUMED (see Warnings) |

### Behavioural Spot-Checks

The full suite, `tsc --noEmit`, both builds and lint were run by the coordinator after the fix (67 files, 1122
tests, all green; all clean). Not re-run, because the full suite reports a false failure on a busy machine. The first six rows are first-pass re-runs of the checks that carry the
enforcement claims plus one named integration test for the storage column; the last three are second-pass checks of the fix.

| Behaviour | Command | Result | Status |
|-----------|---------|--------|--------|
| ENG-07 guard and NIC-03/NIC-04 isolation hold | `npx vitest run --project unit lib/google-content-guard.test.ts lib/niche-profile/isolation.test.ts` | 2 files, 24 tests passed (529ms) | ✓ PASS |
| The own-site wiring, slice validation and client contract hold | `npx vitest run --project unit lib/own-site-wiring.test.ts lib/own-site-run.test.ts lib/scanner-client.test.ts` | 3 files, 52 tests passed (214ms) | ✓ PASS |
| `scans.own_site_facts` exists in a real Postgres, round-trips a phone number and is cleared by anonymise | `npx vitest run --project integration lib/retention.integration.test.ts -t "D-9-25: anonymise clears own_site_facts on the same scan row where scores survive"` | 1 passed, 40 skipped — the test executed against 127.0.0.1:54321, it did not skip | ✓ PASS |
| ENG-06 refuses at dispatch against real rows, including a released prospect with no stored marker | `npx vitest run --project integration lib/bulk-scan-dispatch.integration.test.ts` | 5 passed (884ms) | ✓ PASS |
| No model and no network in the trade detection path | `grep -niE "anthropic\|openai\|gemini\|generative\|fetch\(" scanner-service/src/{trade-detection,own-site-harvest,own-site-facts}.ts` | Three hits, all `schema.org` URL normalisation in string replaces; no client, no fetch | ✓ PASS |
| No Dutch trade vocabulary outside the profile | `grep -rniE "warmtepomp\|zonnepane\|badkamer\|keuken\|dakdekk\|centrale verwarming\|installq"` over `lib app scripts components scanner-service types`, excluding the profile folder, tests and fixtures | No output | ✓ PASS |
| Manual route refuses the legacy row (released, scanned, marker null, no qualifying source) and a marked row, and the happy path still drafts | `npx vitest run --project integration lib/outreach-queue.integration.test.ts` | 1 file, 18 passed (1.29s), against the local Postgres. A `-t "ENG-06"` run showed both refusal tests executed (green), not skipped. | ✓ PASS |
| The Generate draft button appears for a scoreable row and not for an unmarked or marked not-scoreable row | `npx vitest run components/admin/shortlist-table.test.tsx` (component project) | 1 file, 17 passed | ✓ PASS |
| The single-decision-site invariant | `grep -rn "scoreableVerdict(" lib app components scripts \| grep -v "\.test\."` | 2 lines: declaration `lib/triage-eligibility.ts:97`, call `:134` | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` exists in this repo and no plan declares one. Not applicable.

### Decision Coverage

```
gsd_run query check.decision-coverage-verify <phaseDir> <contextPath>
{ "skipped": false, "blocking": false, "total": 32, "honored": 32, "not_honored": [] }
```

All 32 trackable CONTEXT.md decisions are honoured by shipped artifacts. Non-blocking gate; recorded
for drift tracking.

### Test Quality Audit

| Check | Result | Verdict |
|-------|--------|---------|
| Disabled tests (`it.skip`, `describe.skip`, `it.todo`, `xit`, `.only`) across all 20 phase test files | None | ✓ |
| Circular fixtures (a test or fixture that writes expected values by running the system under test) | No `writeFileSync` / `fs.write` in any phase test file or fixture | ✓ |
| Expected-value provenance, `tests/fixtures/own-site-zones.ts` | **VALID, with its limit declared in the file.** The header states the 17 entries are composed from the site classes the 53-homepage research run measured, using real Dutch installer phrasing, that no named live site is captured, that business names are invented, and that `expected` is "what a person reading the site would say it is, decided from the description in `note` and not copied from the detector's output". It also carries an `OwnSiteZoneKnownGap` type so a case the detector gets wrong today stays visible instead of being deleted. | ✓ (not circular; regression-grade, not ground-truth — hence the human item) |
| Assertion strength on the enforcement requirements | Value- and behaviour-level: both-direction canaries on each ENG-07 detector, positional source assertions on the ordering invariants, a real-Postgres round-trip for the storage column | ✓ |

**Disabled tests on requirements:** 0. **Circular patterns:** 0. **Insufficient assertions:** 0.

### Requirements Coverage

| Requirement | Source plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| NIC-01 | 09-02, 09-07 | Profile holds trades, job values, AI questions, competitor rules, trade-specific website checks and all copy | ✓ SATISFIED | `NicheProfile` (`lib/niche-profile/types.ts:117`) and `TradeProfile` (line 101) name every one: `trades[].jobValue`, `trades[].aiQuestions`, `competitor`, `trades[].siteChecks`, `copy`, plus `overtureCategories`, `regions`, `reviewWidgetHosts`, `scoring`. `aiQuestions` is typed and empty per D-9-24, which is the locked decision, not a stub. |
| NIC-02 | 09-02 | Each default job value carries a citation | ✓ SATISFIED | `JobValue.citation` is required when a value is present; the midpoint derivation forces both `range` and a non-optional `citation.note`. All six amounts match `09-JOB-VALUES.md` (12000, 3200, 7500, 11000, 5700, 2100) and are asserted against a literal table rather than against the profile. Heat pump is the pre-subsidy €12.000 (D-9-19). |
| NIC-03 | 09-02, 09-09 | Country and locale are parameters, never hardcoded | ✓ SATISFIED | `country` and `locales` are profile fields; `lib/niche-profile/isolation.test.ts` fails the build if any of six engine files carries a quoted `nl`/`en` or a country name on a non-comment line. `--region=random` is guarded against a `--country` that is not the profile's own (`scripts/import-prospects.ts:114`). |
| NIC-04 | 09-02, 09-06, 09-09 | Adding a niche is a new profile plus a landing page, with no change to the engine | ✓ SATISFIED (with a Warning) | No engine file imports the profile, asserted over the six named files, and the three scanner modules plus `own-site-run.ts` joined that list in 09-09. The engine reads every term and threshold from the request slice. Warning: the niche-selection seam is unwired — see Warnings. |
| ENG-01 | 09-05, 09-09 | Scan reads business facts from the prospect's own site as structured data | ✓ SATISFIED | All five fields read from JSON-LD with a microdata fallback, `@id` dereferencing, node-priority conflict resolution (first wins, never averaged), empty-or-whitespace reading as `missing`, and `unreadable` never collapsed into `missing`. Bounded by caps on block count, size, item count, depth and text length. |
| ENG-02 | 09-07 | Scan detects on-site social proof: shown, how many, how recent, machine-readable | ✓ SATISFIED | `extractSocialProof` returns `shown`, `evidence`, `markedUp`, `count: FieldState<number>`, `recency: FieldState<string>` and sorted deduplicated `widgetHosts`. `reviewCount` is trusted before `ratingCount`, then visible text, by a fixed order rather than by averaging. On-site `AggregateRating` is read as the site's own data with its source recorded (D-9-R4 confirmed, not assumed). |
| ENG-05 | 09-07 | Scan checks whether a customer can request a quote: form, tap-to-call, project photos, certifications | ✓ SATISFIED | Four `{ passed, evidence }` checks over integer counts only; stated thresholds; certification matching over visible text plus image `alt` and `src` with word boundaries; profile terms escaped and matched as literals (no regex built from profile or page text). |
| ENG-06 | 09-04, 09-06, 261114-olb | One predicate decides whether a business is scoreable; a failure is skipped and never emailed | ✓ SATISFIED (was ⚠️ PARTIAL) | The predicate, the fixed condition order, the four reasons, the CHECK constraint, the fresh dispatch verdict, the fresh manual-route verdict and the matching button condition all exist and work. `scoreableVerdict` still has exactly one production caller. See success criterion 1. |
| ENG-07 | 09-01 | Nothing Google returns is written to the database, enforced in code | ✓ SATISFIED | See success criterion 5. |

**Orphaned requirements:** none. REQUIREMENTS.md maps exactly NIC-01..04, ENG-01, ENG-02, ENG-05,
ENG-06, ENG-07 to Phase 9, and every one is claimed by a plan.

### Anti-Patterns Found

Scanned all 61 non-planning files in the phase diff.

| Severity | File | Line | Finding |
|----------|------|------|---------|
| — | all | — | **No debt markers.** Zero `TBD`, `FIXME`, `XXX`, `TODO`, `HACK` or `PLACEHOLDER` in any file this phase touched. The debt-marker gate passes cleanly. |
| — | all | — | No "not yet implemented", "coming soon" or placeholder prose. No empty-handler or console-log-only implementation. |
| ✓ Resolved | `components/admin/shortlist-table.tsx` | 264-268 | First-pass Warning. `canGenerateDraft` now requires `scoreableFailureReason(row) === null`; the row already carries `website_url`, `address`, `latitude`, `longitude` and the `sources` mapping from `getShortlist`, so no extra query. Covered by three component tests. |
| ⚠️ Warning | `lib/niche-profile/index.ts` | 34-41 | `getNicheProfile(id)` and the `PROFILES` registry have **zero production callers**; `lib/bulk-scan-dispatch.ts:20` and `scripts/import-prospects.ts:23` both import `INSTALLERS_PROFILE` directly. Adding a second niche therefore needs a change at those two composition roots as well as a widening of `NicheProfile["id"]`. NIC-04's "no change to the engine" holds for the engine proper (the isolation test proves it), and SC4's five named parameters are profile-only, but the *niche-selection* seam the registry was built for is not wired to anything. Not a blocker: this phase ships one niche by design (D-9-09 names one consumer surface), and the two call sites are one line each. |
| ⚠️ Warning | `lib/niche-profile/index.ts`, `installers/copy.ts`, `installers/trades.ts` | — | `staleJobValues`, `getTrade`, `INSTALLERS_COPY`, `competitor.radiusKm` and `trades[].jobValue` are exercised only by tests. Held, not consumed. This is the roadmap's own sequencing (radius → Phase 10, copy and money line → Phase 12, AI questions → Phase 10) and matches D-9-23, D-9-24 and D-9-10, so it is not a stub. Recorded because Level-3 wiring is genuinely absent and a reader of the score should know it. |
| ✓ Resolved | `lib/scoreability-refresh.ts` | 10-17 | First-pass Info. The header now says both the dispatch route and the manual draft route compute the verdict fresh. The `.is("scan_released_at", null)` filter at line 66 is intact, as D-9-17 requires. |
| ℹ️ Info | `lib/niche-profile/types.ts` | 92-99 | `ProfileCopy` has no `tips` field, though D-9-10 names "the tips" alongside the section copy and the Adashi-fixes lines. `adashiFixes` carries the per-section remediation copy, and the to-do list is explicitly Phase 12's. Reading `adashiFixes` as "the tips" is reasonable; flagged only so Phase 12 does not discover a missing field late. |
| ℹ️ Info | `supabase/schema.sql` | — | Not updated with the new columns. Pre-existing: the file is dated March 2026 and does not carry migration 019's `booked_at` either. Migrations are the source of truth in this project. `gsd-tools verify.schema-drift 09` reports `block: false, drift_detected: false`. Not a Phase 9 regression. |

### Known Gaps Recorded (not verification failures)

Carried in from the coordinator's own review, confirmed present and honestly documented in the
codebase:

1. **Nothing is deployed.** Migration 022 is applied and verified in production. Migration 023 is
   applied on verbal confirmation only; its `information_schema` column check was never captured.
   Both are human items above.
2. **`lib/atrium-scan.ts` on the unmerged `feat/atrium-routes` branch** calls `fullScanBulk` with no
   `nicheSlice`, so atrium-triggered scans would store no own-site facts. Confirmed absent from this
   branch (`ls lib/atrium-scan.ts` → no such file), so it is a merge-time task, not a Phase 9 defect.
   Migration numbering already accounts for that branch owning 021 (both 022 and 023 say so in their
   headers).
3. **A repeated footer line is summed once per page**, so a general builder can read as a trade with
   `clear` confidence. Recorded in `09-08-SUMMARY.md:146` with the measured example and the reason the
   one-line mitigation was not made. Deliberately left untuned pending real scan output.
4. **"cv ketels" (plural) does not match** the seeded phrase. Kept visible in the corpus as the single
   `OwnSiteZoneKnownGap` entry (`tests/fixtures/own-site-zones.ts:328-340`), with the note that the fix
   is a profile edit, not an engine change.

### Advisory (New Scope, Unevidenced)

None. The only re-verification blocker was a carried-forward gap from pass one, now closed; no new-scope blocker was raised.

### Human Verification Required

**All four are confirmed as of 2026-11-16.** Items 1 to 3 closed first; item 4 closed last, on 49
production scans, and its closure added a seventh trade. The first three confirmations were
captured during the Gemini to Claude Sonnet 5.5 provider swap (quick task 261116-m9s), which is
unrelated to this phase: the scans below predate it or exercise paths it does not touch.

#### 1. Capture the migration 023 column check in production

**PASSED 2026-11-16.** Run by Joshua in the production Supabase SQL Editor. One row returned:
`own_site_facts` / `jsonb`. Migration 023 no longer rests on verbal confirmation.

**Test:** In the production Supabase SQL Editor, run
`select column_name, data_type from information_schema.columns where table_name = 'scans' and column_name = 'own_site_facts';`
**Expected:** One row, `own_site_facts` / `jsonb`.
**Why human:** Production access only, and the repo must not reach production. Migration 022 is
applied and verified; 023 rests on verbal confirmation with no captured check.

#### 2. First real own-site harvest

**PASSED 2026-11-16**, on two real Atrium scans, judged by Joshua.

| | 3970e67c jv-installatie.nl | 5d70aa45 celsiusloodgieters.nl |
|---|---|---|
| schemaVersion | 1 | 1 |
| pagesRead | 1 | 7 |
| business.address | missing | missing |
| business.telephone | missing | missing |
| socialProof.state | read | read |
| quoteReadiness.state | evaluated | evaluated |
| trade.tradeId | null | heat_pump |
| trade.confidence | unreadable | clear |
| trade.margin | 0 | 18 |
| trade.runnerUpId | null | central_heating |

`pagesRead: 1` on jv-installatie.nl is correct, not a shortfall: the site is a one-pager
(Joshua, 2026-11-16). Its null trade at confidence `unreadable` is recorded as evidence for item 4
rather than as a failure here: the engine declared nothing instead of inventing a trade, which is
the behaviour the honest-states design asks for. Both sites publishing neither address nor telephone
in machine-readable form is noted for the same item.

**Test:** After deploying the scanner and confirming 023, run one bulk scan against a real Dutch
installer site, then read `scans.own_site_facts` for that scan id.
**Expected:** `schemaVersion: 1`, `pagesRead > 0`, `business.address` and `business.telephone` each in
state `found` or `missing` (never undefined), `socialProof.state: "read"`, `quoteReadiness` present,
and `trade.tradeId` naming the trade a person would name with confidence `clear` or `narrow`.
**Why human:** Nothing is deployed. Every extractor is proven against fixtures and the storage column
round-trips in the local database, but no real site has ever been harvested, and the corpus states its
own provenance: the fixtures are composed from measured site classes, not captures of named live sites.

#### 3. The public scanner is untouched

**PASSED 2026-11-16** against the deployed Railway service. A public quick scan of `adashi.io` at the
site root, scan `0ac37639-d139-420f-bd31-a48b363b47a9`, completed in 52 seconds with no error, the
report page renders (HTTP 200), and `select own_site_facts is null` for that scan returns `true` in
production.

**Test:** In the same session, run one public quick scan at the site root.
**Expected:** No `[own-site]` log line, `scans.own_site_facts` null, report renders as before.
**Why human:** Needs the live Railway service. The no-slice short-circuit is proven in code
(`collectOwnSiteHarvest` returns before calling the harvester; `storeOwnSiteFacts` returns `"skipped"`
before touching either dependency; only the async route passes a slice to `scanPage`) and in tests,
but not against the deployed service.

#### 4. Keyword review against the first real outputs

**Test:** Review the six per-trade keyword lists against the first ten real scan outputs and tune.
**Expected:** Trades read correctly; the two known keyword gaps resolved or accepted.
**Why human:** Judgement against real pages. Both fixes are profile edits, not engine changes.

**PROGRESS 2026-11-16: both known gaps are now closed in code, so only the judgement half of
this item is left.**

1. The `cv ketels` plural gap was closed by quick task 261116-m4p, which moved the
   `cv ketel` and `cv installatie` terms to prefix matching, measured rather than assumed.
2. The repeated-footer gap was closed by quick task 261116-oky (commits c4292d5, 4f16d87).
   `prepareSite` already collected nav text and link paths as a distinct union across pages;
   body lines and h2/h3 items were still summed per page, so a site-wide footer scored once per
   page. A normalised non-empty line present on EVERY page is now counted once, at its own zone
   weight, exactly as the nav already was. Strictly every page, never a ratio, so genuine signal
   that merely repeats is never suppressed, and a one-page scan takes the unchanged branch.
   Proven by a new corpus entry, `general-builder-trade-word-in-footer`: a 4-page
   Aannemersbedrijf whose footer names dakwerken, dakreparatie and daklekkage resolved to
   roofing at confidence `clear` with score 12 before the fix, and resolves to no trade at
   `unreadable` after. No existing corpus entry moved: the fixtures diff is purely additive.

**PASSED 2026-11-16. Closed by Joshua on 49 production scans, 34 unique domains.**

The judgement pass found a third gap, larger than the two above, and it is now fixed.

Of the 18 reads that named a trade, 11 came back `roofing`. Most of those were Dutch
`loodgieter` (plumber) firms. The cause is the roofing term `{ term: "dak", match: "prefix" }`,
which catches `dakgoot` (gutter) and `daklekkage` (roof leak), both everyday plumber work.
Confirmed by downloading four real homepages and counting terms: `willardloodgieter.nl` reads
`dak` x11 but also `lood` x21 and `lekkage` x10, and scored roofing at `clear`.
`loodgieterriwa.nl` read `kitchen` at `clear` on `keuken` x9. Plumbing was not one of the six
trades, so plumber sites had nowhere correct to land.

Quick task 261116-rjk adds `plumbing` as a seventh trade (commits `d719843`, `9fc5f9b`,
`caaa74b`, `18d4ea0`). Job value 300 EUR, approved by Joshua on 2026-11-16 from the Homedeal
leak-detection page, with the page's three conflicting figures recorded in the citation note.
`showMoneyLine: false` per D-9-21, because 300 does not support the one-extra-job claim.
`tieBreakRank: 7`, appended so none of the six renumber. Four keywords: `loodgieter`,
`lekkage`, `dakgo`, `waterleiding`. The bare metal stem `lood` is deliberately excluded, because
`uitendaal-harmelen.nl` reads `lood` x6 and is a genuine zinc roofer.

**The roofing list is untouched.** The plumbing terms win on their own, 72 to 22 on the plumber
class, so no roofing change was needed and none was made.

**The 16 unreadable reads were judged correct, not a fault.** Sewer (`hroriooltechniek.nl`),
ventilation (`ventilatie-muis.nl`) and leak-detection-only (`fnlekdetectie.nl`) firms are
genuinely not one of the trades. The engine declared nothing rather than inventing one, which is
the required behaviour.

Gate: `tests/fixtures/own-site-zones.ts` gained 30 lines and lost none, so no existing corpus
expectation moved. Two entries were added: `plumber-gutters-and-leaks` reads `plumbing` and
`zinc-roofer-lead-work` still reads `roofing`. Both tsc projects are clean and the full suite is
1273 passing across 82 files, run on an idle machine.

**One open judgement, not a gap.** With plumbing in place, the existing entry
`plumber-multi-trade` ("Loodgieter Smit") computes to an exact 19/19 tie between `bathroom` and
`plumbing`, and stays `bathroom` only through `tieBreakRank`. Its `runnerUpId` moves from roofing
to plumbing and its `margin` from 3 to 0; no test asserts either field. A person reading that site
would arguably say plumbing. Changing it would mean ranking plumbing above bathroom, which moves a
corpus expectation, so it is Joshua's call and was left alone.


### Gaps Summary

None. The one gap from the first pass is closed.

**Why the closure holds, not just that it exists.**

- *Fails closed.* The manual route cannot proceed on a null marker any more: it recomputes the verdict from the prospect's own columns and `prospect_sources`. A missing embed becomes an empty source list, which is zero qualifying matches, which is `no_unique_match`, which is refused. An unreadable row returns an error at the first read. The stored-marker check is kept above it, so a marked prospect is refused on both counts.
- *Test proves the legacy case.* The integration test seeds the exact row the first pass described (`scan_released_at` set, completed scan linked as `latest_scan_id`, `not_scoreable_reason` null, no source) and asserts `ok: false` and zero `outreach_messages` rows. Before the fix the route would have created a draft for it, so the assertion is meaningful. It asserts the outcome and the empty table, not the error string, which is the stronger form.
- *Not over-tightened.* `seedProspect` now produces a scoreable row by default (own website, street address, one source at 0.9). Every pre-existing happy-path test in that file runs on it and still drafts: 18 of 18 pass, including "creates a first row for a named-person prospect the automatic path skipped". In the UI, the "offers the button for a scoreable row with a completed scan and a contact email" test passes, so a legitimate prospect still gets Generate Draft.
- *No second decision site.* `scoreableFailureReason` stays the only caller of `scoreableVerdict`, so the rule and `MIN_MATCH_CONFIDENCE` still live in one place.

**Residual observation, not a blocker, not new.** The automatic draft path still reads the stored marker only. It is reachable only after a scan completes, and every scan is dispatched through the fresh verdict, so a legacy null-marker prospect cannot be re-scanned into it. If that ever changed (a second scan-dispatch route), that gate would need the same treatment. Whether any legacy row exists in production is still one query Joshua can run:
`select count(*) from prospects where scan_released_at is not null and latest_scan_id is not null and not_scoreable_reason is null;`
It no longer matters for safety, only for curiosity.

**What still stands unchanged from the first pass** (none blocks): the unwired niche registry (`getNicheProfile` and `PROFILES` have no production caller; two composition roots import `INSTALLERS_PROFILE` directly); the held-not-consumed fields (`copy`, `competitor.radiusKm`, `trades[].jobValue`, `aiQuestions`, for Phases 10 and 12); the `ProfileCopy` `tips` field absent against D-9-10; the stale `supabase/schema.sql`; `lib/atrium-scan.ts` on the unmerged branch. Three items on that
list are now closed: migration 023's column check is captured (human item 1), the footer-line false
positive is fixed (quick task 261116-oky), and the "cv ketels" plural gap is fixed (quick task
261116-m4p). "Nothing deployed" still stands and is restated below.
Status is `passed`: all four human items are confirmed as of 2026-11-16.

**Not deployed.** The seventh trade exists in the code and in the tests only. Commits `d719843`
through `18d4ea0` sit on the local branch `fix/footer-boilerplate`, unpushed. No real scan reads
`plumbing` until that lands and Vercel redeploys.

---

_Verified: 2026-11-14T17:15:00Z (second pass; first pass 2026-11-14T13:09:16Z)_
_Verifier: Claude (gsd-verifier)_
