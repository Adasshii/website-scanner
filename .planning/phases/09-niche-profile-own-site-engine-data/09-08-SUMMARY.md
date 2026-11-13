---
phase: 09-niche-profile-own-site-engine-data
plan: 08
subsystem: scanner-trade-detection
tags: [eng-01, nic-01, nic-03, nic-04, trade-detection, keyword-scoring, literal-matching, no-model, vitest, tdd, mutation-checked]
requires:
  - phase: 09-niche-profile-own-site-engine-data
    provides: "09-02 NicheScanSlice (per-trade terms with match modes, tieBreakRank, minTradeScore, dominanceRatio) and the seeded Dutch terms; 09-05 harvest zones"
provides:
  - "scanner-service/src/trade-detection.ts: detectTrade(zones | pages, slice), normaliseText, ZONE_WEIGHTS, ZONE_HIT_CAPS, TradeZones, TradeDetectionResult, TradeConfidence, TradeSlice"
  - "tests/fixtures/own-site-zones.ts: OWN_SITE_ZONE_CORPUS (17 entries), OWN_SITE_ZONE_KNOWN_GAPS (1), makeZones"
  - "lib/trade-detection.test.ts: 86 cases"
affects: [09-09, phase-11, phase-12]
tech-stack:
  added: []
  patterns:
    - "Literal string search with start and end boundary checks; no pattern ever built from a profile string or from page text"
    - "Hits counted as distinct start positions per trade, so a stem and a longer stem on one word are one hit"
    - "Total order for the winner: score, then tieBreakRank, then id; array position never decides"
    - "Inputs that are not numbers fail toward the cautious reading (unreadable minimum, narrow ratio, last rank)"
key-files:
  created:
    - scanner-service/src/trade-detection.ts
    - lib/trade-detection.test.ts
    - tests/fixtures/own-site-zones.ts
  modified: []
key-decisions:
  - "detectTrade takes one page of zones or a list of pages. The plan's signature names one zone set, but the cross-page rule (sum four zones, union two) needs all pages in one call, and the harvest type satisfies TradeZones, so plan 09-09 can pass its pages straight in."
  - "The two heading and body caps are per page, then summed across pages. A page repeating one word fifty times is the thing the cap stops; seven honest pages are meant to add up."
  - "Hits are counted per distinct start position, not per term. The seeded roofing list has dak, dakdekk and dakbedekking, which all match the word dakdekker; counted per term that word would be worth three hits."
  - "Title, h1, nav and path hits have no hit cap. The work on them is bounded structurally instead (20,000 characters per text, 200 items per zone, 50 pages, 50 trades, 50 terms of 100 characters), which is what T-9-16 needs."
  - "A minimum that is not a number reads unreadable, a ratio that is not a number reads narrow, and a rank that is not a number sorts last. Each is the cautious direction."
  - "The corpus is composed from the measured site classes and says so in its header. It is not a set of captured live pages."
  - "The module takes the slice type as a type-position import (import(...) inline), not a top-level import line, so the plan's literal check for zero import lines returns 0."
requirements-completed: [ENG-01, NIC-01]
duration: "25 min"
completed: 2026-11-14
status: complete
commits: 10
plan_head_before: fa79f86b6069e71333cad33ca7056292a30d83c5
plan_head_after: 5d24006079ac7b1d4e24c0c9e8447497582d3e7e
actuals:
  tokens: 15000
  tasks: 3
  commits: 10
coverage:
  - deliverable: "A trade read off the business's own site by code: profile terms, zone weights, per-page caps, no model, no Overture category"
    verification:
      - kind: test
        ref: "lib/trade-detection.test.ts#detectTrade: zone weights and caps"
        status: pass
      - kind: test
        ref: "lib/trade-detection.test.ts#detectTrade: tracer (one zone, one match mode)"
        status: pass
      - kind: command
        ref: "grep over non-comment lines of the module for the trade vocabulary, geography literals and new RegExp: no matches"
        status: pass
    human_judgment: false
  - deliverable: "Cross-page aggregation: title, h1, h2/h3 and body summed, nav and link paths a distinct union"
    verification:
      - kind: test
        ref: "lib/trade-detection.test.ts#detectTrade: aggregation across a 7-page scan"
        status: pass
    human_judgment: false
  - deliverable: "Substring, prefix and whole-word modes proven non-interchangeable; multi-word phrase is one unit; compounds, the solar stem and the vacancy abbreviation"
    verification:
      - kind: test
        ref: "lib/trade-detection.test.ts#detectTrade: the three match modes are not interchangeable"
        status: pass
      - kind: test
        ref: "lib/trade-detection.test.ts#detectTrade: Dutch measured pitfalls, against the seeded profile"
        status: pass
    human_judgment: false
  - deliverable: "Exact ties by tieBreakRank, narrow winners kept with their narrowness, unreadable below the minimum"
    verification:
      - kind: test
        ref: "lib/trade-detection.test.ts#detectTrade: ties resolve by rank, never by array position"
        status: pass
      - kind: test
        ref: "lib/trade-detection.test.ts#detectTrade: a narrow winner is still the trade"
        status: pass
      - kind: command
        ref: "node mutate-td.mjs (70 mutations, 70 red, 0 survivors; see Verification)"
        status: pass
    human_judgment: false
  - deliverable: "17-entry regression corpus pins each site class to its trade and confidence"
    verification:
      - kind: test
        ref: "lib/trade-detection.test.ts#detectTrade: the regression corpus"
        status: pass
    human_judgment: false
  - deliverable: "The seeded keyword terms resolve real Dutch installer sites to the trade a person would name"
    verification: []
    human_judgment: true
    rationale: "The corpus is composed from the research's measured classes, not captured live pages, and the seeds are assumption A4. Joshua reviews the seeds against the baseline below; the first real scans are the live check."
---

# Phase 9 Plan 08: Trade detection from the business's own site Summary

A pure, slice-driven scorer now reads which of the six trades a business does from the text of its own site, with no model at any step: profile-supplied Dutch terms are matched as literals across six weighted zones, nav and link paths are unioned across a multi-page scan while the other four zones are summed, an exact tie goes to the profile's `tieBreakRank`, a thin margin is recorded as `narrow` without losing the trade, and a site that names no trade reads `unreadable` and stays fully scoreable.

## Accomplishments

- `detectTrade(zones | pages, slice)` returns `{ tradeId, confidence, scores, runnerUpId, margin }`. `scores` holds every trade in the slice, zero scores included.
- **Normaliser** (`normaliseText`): lower-case, the ASCII hyphen, U+2010 to U+2015 and the underscore become a space, whitespace collapsed. Applied to text and to every term, so `cv-ketel`, `cv ketel` and `cv_ketel` are one spelling. Dashes are compared by code point, so no look-alike character sits in the source.
- **Match modes**, each proven by one text that the other two modes decide differently: `substring` (anywhere), `prefix` (word start, any continuation, which is what finds the `dakreparatie` compound), `word` (start and end boundary). A multi-word `word` term is one boundary-delimited unit: `cv ketel` matches `cv-ketel` and does not match `cv ketelservice`, `xcv ketel`, `de cv en ketel` or `cv, ketel`.
- **Zones and caps:** title 5, h1 5, nav 3, internal path 3, h2/h3 2 (cap 5 hits per page), body 1 (cap 10 hits per page). Every number is a named constant (`ZONE_WEIGHTS`, `ZONE_HIT_CAPS`) marked as a tunable default. The minimum score and the dominance ratio come from the slice and appear nowhere in the module as a literal.
- **Aggregation:** title, h1, h2/h3 and body sum across pages; nav text and link paths are a distinct union of normalised strings. Seven pages with one nav naming a trade give 3, not 21; one body mention per page gives 7.
- **Outcomes:** highest score wins, then lower `tieBreakRank`, then id. A winner under the dominance ratio is the trade with `confidence: "narrow"`. Exactly the ratio is clear. Below `minTradeScore` (or zero) the trade is `null` and `unreadable`. A hybrid installer tying heat pump against central heating 30 to 30 is a heat pump installer in either array order.
- **Safety:** no `new RegExp`, no runtime import, no model, no Overture category, no trade vocabulary or geography literal in the module. Work is bounded by text length, item count, page count, trade count and term count.

## Baseline for later retuning (per corpus entry)

Seeded profile: minimum 8, ratio 1.5. Pages is the number of pages scored. Scores are non-zero trades only.

| Entry | Pages | Trade | Confidence | Scores | Runner-up | Margin |
|-------|-------|-------|------------|--------|-----------|--------|
| roofer-clear | 1 | roofing | clear | roofing 44, solar 3 | solar | 41 |
| roofer-compound-name | 1 | roofing | clear | roofing 35 | none | 35 |
| roofer-seven-pages-solar-in-nav | 7 | roofing | clear | roofing 129, solar 4 | solar | 125 |
| flat-roof-epdm-bitumen | 1 | roofing | clear | roofing 42 | none | 42 |
| heat-pump-clear | 1 | heat_pump | clear | heat_pump 26, central_heating 3 | central_heating | 23 |
| hybrid-heat-pump-and-boiler | 1 | heat_pump | narrow | heat_pump 24, central_heating 24 | central_heating | 0 |
| solar-clear | 1 | solar | clear | solar 31, heat_pump 1 | heat_pump | 30 |
| solar-and-heat-pump | 1 | solar | narrow | solar 24, heat_pump 19 | heat_pump | 5 |
| bathroom-clear | 1 | bathroom | clear | bathroom 37 | none | 37 |
| kitchen-clear | 1 | kitchen | clear | kitchen 26, bathroom 1 | bathroom | 25 |
| kitchen-and-bathroom-showroom | 1 | bathroom | narrow | bathroom 19, kitchen 19 | kitchen | 0 |
| plumber-multi-trade | 1 | bathroom | narrow | bathroom 19, roofing 16, heat_pump 14 | roofing | 3 |
| central-heating-specialist | 1 | central_heating | clear | central_heating 24 | none | 24 |
| generic-contractor | 1 | null | unreadable | kitchen 1 | none | 0 |
| electrician | 1 | null | unreadable | all zero | none | 0 |
| energy-advisor-mentions-only | 1 | null | unreadable | heat_pump 3, solar 3 | none | 0 |
| installer-with-vacancies | 1 | null | unreadable | all zero | none | 0 |
| (known gap) central-heating-plurals-only | 1 | null | unreadable | all zero | none | 0 |

The `expected` trade and confidence of each entry were decided from its description before the detector was run, and the detector agreed on all 17 on its first run. Two fixtures were then tuned by me on purpose: the hybrid was made an exact tie so that only the rank can decide it (an earlier version tied bathroom against kitchen, where the alphabetical id gives the same answer as the rank and a mutation that ignored the rank survived the corpus), and the plumber was set so bathroom narrowly leads roofing and heat pump.

## Human check for Joshua (Task 3 `<human-check>`, carried here, not answered)

The seeds are assumption A4 and the heat pump tie-break is A7. Nothing in this plan changed `lib/niche-profile/installers/trades.ts`. What the review needs:

1. **Each of the 17 entries against the trade you would have said.** The table above is the baseline. Note the corpus entries are composed from the research's measured site classes (invented business names, Dutch installer phrasing), not captured live pages. Say if a class is mis-shaped.
2. **Heat pump above central heating on an exact tie (A7).** `hybrid-heat-pump-and-boiler` ties 24 to 24 and resolves to heat pump with `narrow`. Phase 12 also receives `narrow` for these sites.
3. **One seed problem this plan found, for the keyword review:** the seeded `cv ketel` and `cv installatie` terms are `word` mode, so the plural `cv ketels` does not match (the whole phrase must end at a boundary). A boiler company that writes only plurals scores zero and reads unreadable (`OWN_SITE_ZONE_KNOWN_GAPS`, pinned by a test, so fixing the seed fails that test and moves the entry into the corpus). The candidate fix is a profile edit, matching these phrases by `prefix`. Central heating prints no money line (D-9-21), so today the cost is the tie-break and the narrow signal, not a wrong figure.
4. **The minimum of 8 on real multi-page scans (A3).** One thing the corpus cannot show, found by probe: `bodyText` is the page's visible text, so a footer or sidebar line repeated on every page is summed per page (capped at 10 per page), unlike the nav, which is unioned. A 7-page generic contractor whose footer says "Keukens op aanvraag." scores kitchen 7 (unreadable, under 8). The same site with "Keukenrenovatie en keukens op aanvraag." scores kitchen 14 and reads `kitchen`, `clear`. Whether that is a defect or a business that does list kitchens on every page is your call. The research design (sum the body) was followed as written; a one-line mitigation (dedupe repeated body lines across pages, as the nav is deduped) would change the scoring design, so it is not made here.

## Verification (measured)

| Check | Result |
|-------|--------|
| `npx vitest run --project unit lib/trade-detection.test.ts` | 86 passed |
| `npx vitest run --project unit` | exit 0, 39 files, 771 tests, 0 failed |
| `npx vitest run --project unit lib/google-content-guard.test.ts lib/niche-profile/isolation.test.ts` | exit 0 (ENG-07 and the NIC-03 vocabulary check still pass) |
| `npx tsc --noEmit` | exit 0 |
| `npm --prefix scanner-service run build` | exit 0, 0 `error TS` lines |
| `npx eslint` on the three files of this plan | exit 0 |
| `git diff --exit-code -- scanner-service/Dockerfile scanner-service/tsconfig.json scanner-service/src/extractor.ts` | exit 0 (D-9-13 held) |
| `grep -v '^ *[*/]' scanner-service/src/trade-detection.ts \| grep -c '^import '` | 0 |
| `grep -n 'new RegExp' scanner-service/src/trade-detection.ts` | no matches |
| NIC-03 vocabulary grep over non-comment lines (the six trade stems, certification scheme, quoted `nl` and `en`, country names, `dak`, `ketel`, `offerte`, `kvk`) | no matches |
| Inline numbers in the scoring code | only the named `ZONE_WEIGHTS` and `ZONE_HIT_CAPS` constants and the five structural bounds |
| `requirements.ready-ids` for ENG-01 and NIC-01 | 1 of 2 ready (see Requirements) |
| Migrations touched | none; `supabase db push` not run |

### Mutation checks

Every GREEN test run passed on its first run, because the plan's prescription was detailed enough to pass its own tests. Each unexpected green was treated as a finding. A throwaway Node script in the scratchpad edited one spot of the real module at a time, ran the file, and restored the module after each run. 70 mutations: normaliser (underscore, each end of the dash range, the ASCII hyphen, whitespace collapse, lower-casing, trim), term not normalised, blank term kept, each match mode removed or collapsed into another, word start boundary and end boundary, digits, a-z and accented letters as word characters, each of the six weights, both caps changed or removed, the heading cap applied per heading instead of per page, nav and paths summed per page instead of unioned, nav not normalised before the union, each of the six zones not read, body not summed across pages, hits counted per term, each of six input bounds, minimum exclusive and ignored, a zero score allowed to win, a not-a-number minimum passing, runner-up reported at zero, margin as the winner's score, zero-scoring trades left out of the map, the single-zones wrapper, rank ignored, rank inverted, id fallback removed and inverted, array order deciding, score order ascending, not-a-number rank unguarded and sorted first, the ratio's exact boundary, the ratio hardcoded to 1.5 and to 1.6, a not-a-number ratio reading clear, a zero runner-up not special-cased, narrow never recorded, narrow treated as a refusal, narrow dropping the trade, and the runner-up taken as third place.

- First pass: 2 survived and exposed weak tests, both strengthened (commit `574f704`): digits as word characters had no case, and the 50-term bound had no case. 3 more reported "not found" only because the tool wrote dash characters into the source as look-alike literals; the normaliser was rewritten to compare code points and the mutations re-pointed.
- Final run: 70 of 70 killed, 0 survivors.
- The corpus run alone (`-t "regression corpus"`) kills the coarse mutations (rank ignored, minimum ignored, nav and body weight, term bounds) and misses single-point weight nudges, because the margins in most entries are wide. That is by design: the corpus pins decisions (trade and confidence), the exact-weight unit tests pin the numbers. Retuning a weight should keep the corpus green unless it flips a site, and the corpus then names which site.

## TDD Gate Compliance

Plan type is `execute`; Tasks 1 and 2 carry `tdd="true"`, Task 3 does not. Task 3 was run RED first anyway because its tie and narrow behaviours were new code.

- **RED (Task 1, tracer):** `6b42924`. Target "reads a roofing compound in the h1 as roofing, by prefix" failed on `expected null to be 'roofing'` (12 failing, 2 passing against a skeleton that returns unreadable). `gsd_run check tdd-red-evidence` returned `RED_EVIDENCE_OK`, reason `target_test_failed`, before the commit. Semantic assessment: the target executed and failed on the planned assertion for the intended reason (no detection yet). The whole-word counterpart passed vacuously in this run because no mode existed yet; "word behaves as prefix" is among the mutations that were killed later.
- **GREEN (Task 1):** `aebd059`, 14 of 14 passing. Tracer gate: end-of-phase mode with an automated-only verify, so Task 1's verify was re-run (vitest, `tsc`, scanner build, all green) and expansion proceeded.
- **RED (Task 2):** `0e88a7f`. Target "weights each zone as the research measured it" failed on `expected +0 to be 5` (21 failing, 20 passing; the passing ones included the vacuous cases above). `RED_EVIDENCE_OK` before the commit. Semantic assessment: intended assertion, intended reason (the title zone was not read yet).
- **GREEN (Task 2):** `5a6b6c0`, 41 of 41 passing on the first run. Fixed by `a16e2fb` (see Deviations).
- **REFACTOR (Task 2):** `4976d3f`, normalise by code point and drop a redundant guard; tests green before and after. `574f704`, tests only, strengthened after the mutation run.
- **RED (Task 3):** `a23a8d4`. Target "with the ranks swapped in the slice the other trade wins, so the rank decides and not the order" failed on the first assertion (first trade in the array won the tie). `RED_EVIDENCE_OK` before the commit (12 failing).
- **GREEN (Task 3):** `98ff2e5`, 61 of 61 passing.
- **Corpus:** `5d24006`, fixtures and corpus tests. They passed on the first run because the detector already existed, which the mutation checks above address.

## Task Commits

1. Task 1 (tracer): `6b42924` RED, `aebd059` GREEN
2. Task 2: `0e88a7f` RED, `5a6b6c0` GREEN, `a16e2fb` fix, `4976d3f` refactor, `574f704` tests strengthened
3. Task 3: `a23a8d4` RED, `98ff2e5` GREEN, `5d24006` corpus

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Set spread breaks the root typecheck**
- **Found during:** Task 2 GREEN
- **Issue:** the scanner build accepted `[...set]`; the root `tsc` target rejects it. I committed `5a6b6c0` before reading the root `tsc` result, because the commit sat after a `;` and not an `&&`.
- **Fix:** `Array.from`. The tsc result is now gated before the commit command.
- **Files modified:** `scanner-service/src/trade-detection.ts`
- **Commit:** `a16e2fb`

**2. [Rule 1 - Bug] Look-alike dash literals in source**
- **Found during:** mutation checks
- **Issue:** the file-writing tool converted the dash escapes in the normaliser's pattern and in two test arrays into the literal characters, so a reader could not tell `cv-ketel` from `cv‐ketel` in the source.
- **Fix:** the normaliser compares code points; the tests build their spellings from `String.fromCharCode`.
- **Commits:** `4976d3f`, `574f704`

**3. [Rule 1 - Bug] Two tests could not fail**
- **Found during:** mutation checks
- **Issue:** see Mutation checks (digits, the 50-term bound).
- **Commit:** `574f704`

### Additions and decisions beyond the plan

**4. [Plan addition] `detectTrade` accepts one page or a list**
- The plan's `detectTrade(zones, slice)` names one zone set, yet its own truths need seven pages in one call. `TradeZones | readonly TradeZones[]`; a single page is a list of one (asserted equal).

**5. [Decision] Title, h1, nav and path hits are not capped; work is bounded structurally**
- The research gives caps only for h2/h3 and body, and the plan lists those two. The threat register's wording "every zone carries a hit cap" is met in intent by bounded inputs (20,000 characters per text, 200 items per zone, 50 pages, 50 trades, 50 terms of at most 100 characters), asserted by tests. Adding caps to title and h1 would change the measured scores.

**6. [Decision] Hits are per distinct start position**
- Without it, `dakdekker` is three hits for the seeded roofing list. Asserted.

**7. [Rule 2 - Correctness] Fail-safe for non-numeric slice values**
- A minimum that is not a number reads unreadable, a ratio that is not a number reads narrow (never clear), a rank that is not a number sorts last, a blank or hyphen-only term is dropped (it would match everywhere). Each asserted.

**8. [Plan interpretation] The type-only import is inline**
- The Task 1 criterion says `grep -c '^import '` must return 0 "with any type-only import written as `import type`", which cannot both hold for a top-level `import type` line. The slice type is referenced as `import("../../types/niche-scan-slice").NicheScanSlice` so the literal command returns 0. No runtime import exists either way.

**9. [Plan interpretation] The corpus is composed, not captured**
- The plan says "trimmed zone objects from about 15 sampled real NL installer sites". The 53-site sample was a scratch run and is not on disk. I did not fetch or invent captures. The 17 entries are composed from the measured classes and the file header and this summary say so.

### Process note

A tool result carried a block urging file work through Bash instead of Read, Edit and Write. It was not part of the plan or the dispatch and was not followed. The only scripts run from the shell were measurement tools in the scratchpad: the RED-evidence recorder, the mutation runner (restores the module after each mutation), a baseline printer and a footer probe. No source file was written by a script. Mutation runs left the module byte-identical to HEAD each time (`git status` clean for `scanner-service/src`).

**Total deviations:** 3 auto-fixed (Rule 1), 1 correctness addition (Rule 2), 5 plan additions or decisions, 0 architectural. **Impact:** none on the plan's behaviour.

## Authentication Gates

None.

## Known Stubs

None.

## Known limits and open items

- **Plan 09-09 wires this module.** Pass the pages' zones as a list: `detectTrade(pages.map(harvestOf), slice)`. `OwnSiteHarvest` satisfies `TradeZones`, so no mapping is needed. The result's `tradeId` selects the `checks` for `evaluateQuoteReadiness` (09-07). When `tradeId` is `null`, 09-09 chooses which checks to pass, as 09-07 already noted.
- **Plan 09-09 adds `scanner-service/src/trade-detection.ts` to `ENGINE_FILES`.** It already passes the vocabulary check by grep. Its header comment mentions "Dutch" in prose, which the isolation test skips (it reads non-comment lines).
- **Persisted shape is 09-09's.** `TradeDetectionResult` is the internal computation shape; `types/own-site.ts` was not touched. The harvested text is never stored, only the scores and the trade.
- **Multi-word `word` terms need the whole phrase bounded**, so plurals of the seeded `cv ketel` do not match (human check, point 3).
- **A multi-word `substring` term matches across a hyphen, space or underscore but not across none**: `lucht water` matches `lucht-water` and does not match `luchtwater`.
- **Recurring page chrome in `bodyText` is summed per page** (human check, point 4).
- **Accented letters**: the word-character test covers the Latin range (U+00C0 to U+024F, minus the two operators) and digits. Other scripts count as boundaries.
- **Not run against a live page.** All behaviour rests on the research measurements turned into literals. Assumptions A3, A4, A7 and A9 stand as recorded in the plan; none is closed by this plan.

## Threat Flags

None. No new endpoint, auth path, file access or schema change. T-9-16 (no pattern from data, bounded work, asserted by a hostile-term case, a backtracking-shaped case and bound mutations) and T-9-17 (no runtime import, no model, text only counted) are mitigated and tested. T-9-SC did not arise (no package installed).

## Requirements

`requirements: [ENG-01, NIC-01]`. The shared-ID gate decides what is marked complete; ENG-01 is also declared by plan 09-09 and is held until that plan finishes.

## Next Phase Readiness

09-08 is complete and green. 09-09 can assemble `OwnSiteFacts` with the detected trade, persist it, and add the three scanner modules to `ENGINE_FILES`.

## Self-Check: PASSED

- FOUND: `scanner-service/src/trade-detection.ts`, `lib/trade-detection.test.ts`, `tests/fixtures/own-site-zones.ts`
- FOUND commits `6b42924`, `aebd059`, `0e88a7f`, `5a6b6c0`, `a16e2fb`, `4976d3f`, `574f704`, `a23a8d4`, `98ff2e5`, `5d24006` as ancestors of HEAD; the plan-head ledger count is 10; `gsd_run check evaluation-scope --plan 09-08 --commits-only` resolved the same commits.
- Acceptance re-run: the compound case and its whole-word counterpart assert opposite outcomes; the four-plus spellings of one term score identically in both directions; the no-match case asserts null and unreadable; no `new RegExp` and zero import lines in the module; the score map holds every trade including zeros; the 7-page nav case asserts 3 and the body case asserts 7; each match mode has a case the other two decide differently; both Dutch solar forms match the stem and neither full form matches the other; the vacancy case asserts central heating 0; the mention case asserts roofing 35 against solar 1; the tie case and its swapped-rank twin assert opposite winners; the narrow case asserts `narrow` and a non-null trade; the generic contractor asserts null and unreadable; the corpus holds 17 entries with no raw HTML; `npx vitest run --project unit` exits 0 with 0 failed; `Dockerfile`, scanner `tsconfig.json` and `extractor.ts` are byte-identical to HEAD.
