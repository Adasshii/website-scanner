---
phase: 09-niche-profile-own-site-engine-data
plan: 05
subsystem: scanner-own-site-engine
tags: [eng-01, json-ld, microdata, three-state-fields, dos-caps, vitest, tdd]
requires:
  - phase: 09-niche-profile-own-site-engine-data
    provides: "09-01 Google content guard and 09-02 NicheScanSlice type (the slice gate takes it)"
provides:
  - "types/own-site.ts: FieldState<T> (found / missing / unreadable), OwnSiteHarvest, OwnSiteBusinessFacts, OwnSiteFacts (schemaVersion 1), OwnSiteHarvestOutcome"
  - "scanner-service/src/own-site-harvest.ts: harvestOwnSite(page, slice), harvestOwnSiteInBrowser(args), HARVEST_CAPS"
  - "scanner-service/src/own-site-facts.ts: extractOwnSiteFacts(harvest | null, { readAt, pagesRead? }) for address, telephone, opening hours, service area, certifications"
affects: [09-07, 09-08, 09-09, phase-11, phase-12]
tech-stack:
  added: []
  patterns:
    - "Three-state field with a reason on the missing branch, every key always present"
    - "Separate bounded page.evaluate that takes its caps as the one serialisable argument"
    - "Browser function written with no named inner functions, so a wrapping tool cannot inject helpers the page lacks"
    - "Root-tree tests drive the browser function against a hand-built fake DOM"
key-files:
  created:
    - types/own-site.ts
    - scanner-service/src/own-site-harvest.ts
    - scanner-service/src/own-site-facts.ts
    - lib/own-site-facts.test.ts
    - lib/own-site-harvest.test.ts
  modified: []
key-decisions:
  - "A field that is not found while any JSON-LD block failed to parse, or any cap cut the harvest short, reads unreadable, not missing. This is stricter than the plan's 'none parsed' wording: a failed block may have held the field, so 'not there' would be a finding we did not measure."
  - "A JSON-LD block at exactly the 200,000 character cap counts as invalid even if it parses, because the harvester cuts at that length and the block may be incomplete."
  - "JSON-LD nodes enter the pool before microdata nodes, so JSON-LD wins a tie and each found field records its source."
  - "extractOwnSiteFacts takes OwnSiteHarvest | null; null means the harvest itself failed and every field reads unreadable. Plan 09-09 maps harvestOwnSite's { state: 'unreadable' } to null."
  - "No JSON-LD processor: a bounded hand-written resolver avoids loading remote @context documents from inside the scanner."
requirements-completed: [ENG-01]
duration: "2 h 40 min wall clock (includes waiting on a slow tsc run)"
completed: 2026-11-13
status: complete
commits: 5
plan_head_before: 7c04627a5dc0696525f36a40943a8d6e2ad2eb0c
plan_head_after: cbe53da57bdc82799f21e61b9a3883b6890c5592
actuals:
  tokens: 22000
  tasks: 3
  commits: 5
coverage:
  - deliverable: "Address, telephone, opening hours, service area and certifications read from JSON-LD and microdata as FieldState values"
    verification:
      - kind: test
        ref: "lib/own-site-facts.test.ts"
        status: pass
    human_judgment: false
  - deliverable: "Absence is representable: every key always present, missing carries a reason, unreadable is distinct from missing"
    verification:
      - kind: test
        ref: "lib/own-site-facts.test.ts#extractOwnSiteFacts: per-field independence"
        status: pass
      - kind: test
        ref: "lib/own-site-facts.test.ts#extractOwnSiteFacts: unreadable"
        status: pass
    human_judgment: false
  - deliverable: "Hard caps on harvest and parse, each asserted with an input that exceeds it"
    verification:
      - kind: test
        ref: "lib/own-site-harvest.test.ts#harvest caps truncate instead of throwing"
        status: pass
      - kind: command
        ref: "node mutate.mjs (22 mutations, 20 red, 2 equivalent, see Verification)"
        status: pass
    human_judgment: false
  - deliverable: "No-slice path does no own-site work; harvest failure surfaces as unreadable; extractor.ts, Dockerfile and scanner tsconfig untouched"
    verification:
      - kind: test
        ref: "lib/own-site-harvest.test.ts#harvestOwnSite"
        status: pass
      - kind: command
        ref: "git diff --exit-code -- scanner-service/Dockerfile scanner-service/tsconfig.json scanner-service/src/extractor.ts"
        status: pass
    human_judgment: false
  - deliverable: "Parser output matches what real Dutch installer sites publish"
    verification: []
    human_judgment: true
    rationale: "Fixtures are literal objects shaped from the 09-RESEARCH measurements of 53 homepages. No live page was run through the new modules; plan 09-09 wires them and the first real scan is the check."
---

# Phase 9 Plan 05: Own-site harvester and fact parser Summary

A bounded browser-side harvester and a pure Node-side parser now turn a loaded page into five business facts, each a three-state field (found with its source, missing with a reason, or unreadable), with hard caps on everything a hostile page could inflate and no edit to the Dockerfile, the scanner tsconfig or `extractor.ts`.

## Accomplishments

- `types/own-site.ts` (type-only, under `types/` so D-9-13 holds): `FieldState<T>` as a union on `state`, the five field value types, `OwnSiteHarvest` (JSON-LD blocks, microdata items, and the zones plans 09-07 and 09-08 read), `OwnSiteFacts` with `schemaVersion: 1`, and `OwnSiteHarvestOutcome`.
- `own-site-facts.ts` (no runtime imports, no I/O): JSON-LD node pool across all blocks (top-level arrays, `@graph`, nested typed objects), `@id` dereferencer across blocks, type normalisation, business-node picker (LocalBusiness family, then Organization, Corporation, ProfessionalService), and five extractors that accept the shapes measured on real sites. Microdata converts into the same pool, so the extractors are written once.
- Placeholder opening hours (all seven days 00:00 to 23:59) are stored as `found` with `looksDefault: true`, not discarded and not counted as published hours silently.
- `areaServed` is read from `Service` nodes after the business nodes, which is where the real sample put it.
- `own-site-harvest.ts`: a separate `page.evaluate`, never inside `extractPageData`'s. It returns raw strings only. `harvestOwnSite(page, slice)` returns `null` without touching the page when there is no slice, and `{ state: "unreadable" }` instead of throwing when evaluation or `page.url()` fails.
- Caps (all in `HARVEST_CAPS`, passed as the evaluate argument because the function is serialised): 20 JSON-LD blocks at 200,000 characters, 50 microdata items to depth 4, 5,000 element visits, 50 properties per item, 20 values per property, 1,000 characters per value, 100 internal paths, 100 tel hrefs, 100 nav texts, 100 widget hosts, 20,000 characters of body text. Node side re-applies the block and item caps, a pool depth of 6, a pool size of 5,000, a dereference depth of 4 and a cycle guard.

## Verification (measured)

| Check | Result |
|-------|--------|
| `npx vitest run --project unit lib/own-site-facts.test.ts` | 62 passed |
| `npx vitest run --project unit lib/own-site-harvest.test.ts` | 21 passed |
| `npx vitest run --project unit` | exit 0, 38 files, 584 tests, 0 failed (was 550 across 37 files before Task 3; baseline 743 was the all-projects count) |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | "No ESLint warnings or errors" |
| `npm --prefix scanner-service run build` | exit 0, 0 `error TS` lines |
| `git diff --exit-code -- scanner-service/Dockerfile scanner-service/tsconfig.json scanner-service/src/extractor.ts` | exit 0 (D-9-13 and T-9-11 held) |
| `ls scanner-service/src/*.test.ts` | no files |
| runtime `import` lines in both scanner modules (non-comment, non-`import type`) | 0 |
| NIC-03 vocabulary grep over both scanner modules (`warmtepomp`, `zonnepane`, `badkamer`, `keuken`, `dakdekk`, `installq`, `"NL"`, `"nl"`) | no matches |
| ENG-07 guard (`lib/google-content-guard.test.ts`) | passes inside the unit run |

### Mutation checks

Several cap tests passed on their first run because Tasks 1 and 2 already implemented the guards. Each was mutation-checked against the real source, one mutation at a time, restoring the file after each.

- **Killed (suite went red), 20 of 22:** JSON-LD block count cap, block length cap, microdata item cap, depth cap, visit cap, props-per-item cap, values-per-prop cap, value length cap, browser-side `__proto__` skip, internal path cap, widget host cap, body text cap, Node-side block cap, block-at-cap check (`>=` to `>`), pool depth limit, block-truncation signal, microdata-truncation signal, Node-side `__proto__` skip, and the pool node limit once removed at both its visit and push checks.
- **Survived, 2 of 22, both equivalent mutants:** removing the `@id` cycle guard, and tightening the dereference hop limit to 1. `indexById` never stores a bare reference, so a lookup lands on a full node and the loop ends on the next hop. A cycle in the reference graph cannot make `deref` spin, so those two guards are unreachable defense in depth. A comment on `deref` says so. The cyclic-graph test still proves termination and no throw.
- Two tests were rewritten because mutation showed them weak: the 200,000 character block test (invalid text was "unreadable" with or without the guard, so it now uses valid JSON padded to exactly the cap and checks 199,999 reads found), and the `__proto__` test (a string assignment never changed anything, so it now smuggles an address through inheritance).

## TDD Gate Compliance

Plan type is `execute`; Tasks 1 and 2 carry `tdd="true"`, Task 3 does not.

- **RED (Task 1, tracer):** `6f8f18b`. Target test "resolves an address reference whose target lives in a different block" failed on `expected 'missing' to be 'found'` (19 of 21 failing against a skeleton). `gsd_run check tdd-red-evidence` returned `RED_EVIDENCE_OK`, reason `target_test_failed`. Semantic assessment: the target executed and failed on the planned assertion for the intended reason (no extraction yet).
- **GREEN (Task 1):** `00f25c3`, 21 of 21 passing.
- **RED (Task 2):** `985be97`. Target test "reads areaServed from a Service node rather than the business node" failed on `expected 'unreadable' to be 'found'` (27 failing). Classifier returned `RED_EVIDENCE_OK`. Semantic assessment: intended assertion, intended reason.
- **GREEN (Task 2):** `38f9bda`, 49 of 49 passing, full unit project green.
- **Task 3:** `cbe53da`, one commit. Tests were written first and run before any implementation: 13 failed, 70 passed. The 70 included the cap and cycle tests that earlier code already satisfied, which is what the mutation checks above address.
- No REFACTOR commit: nothing needed one.

Tracer gate: end-of-phase mode with an automated-only verify, so the verify was re-run (vitest, `tsc`, scanner build, `git diff --exit-code`, all green) and expansion proceeded.

## Task Commits

1. Task 1 (tracer): `6f8f18b` RED, `00f25c3` GREEN
2. Task 2: `985be97` RED, `38f9bda` GREEN
3. Task 3: `cbe53da` feat(09-05): microdata fallback, remaining harvest zones and the harvest caps

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] RED could not be an import failure**
- **Found during:** Task 1
- **Issue:** the plan says the first run fails at the import, but a load failure is `INVALID_RED` and cannot authorise GREEN.
- **Fix:** the RED commit carries the types and a skeleton `extractOwnSiteFacts` with the right exports, so the target test fails on its assertion. The skeleton was replaced in the GREEN commit.
- **Files modified:** `types/own-site.ts`, `scanner-service/src/own-site-facts.ts`
- **Commit:** `6f8f18b` (again in `985be97` for the four new field keys)

**2. [Rule 3 - Blocker] Multi-line assertion diffs corrupt the TAP report**
- **Found during:** Task 1 RED
- **Issue:** `toEqual` on objects writes multi-line diffs, which the classifier read as non-TAP data (`invalid_record`).
- **Fix:** object comparisons go through a one-line `flat()` helper. Test intent unchanged.
- **Files modified:** `lib/own-site-facts.test.ts`
- **Commit:** `6f8f18b`

**3. [Rule 1 - Bug] Test fixture exceeded the block cap it was not testing**
- **Found during:** Task 3 RED run
- **Issue:** the pool-limit fixture of 20,000 nodes serialised past 200,000 characters, so the parser correctly read the block as truncated and returned `unreadable`.
- **Fix:** 12,000 tiny nodes with a business node placed after them, plus the same business node first as a control. The test now proves the 5,000-node limit rather than the block cap.
- **Files modified:** `lib/own-site-facts.test.ts`
- **Commit:** `cbe53da`

**4. [Rule 1 - Bug] Two tests could not fail**
- **Found during:** Task 3 mutation checks
- **Issue:** see Mutation checks above (the block-at-cap test and the `__proto__` test).
- **Fix:** both rewritten so the mutation turns them red.
- **Commit:** `cbe53da`

### Additions beyond the plan

**5. [Plan addition] Fields the plan did not list**
- `jsonLdBlocksFound` and `microdataTruncated` on `OwnSiteHarvest`, so a cap that cut the harvest short can be told apart from a page with nothing in it. Without them an absence after truncation would read `missing`.
- `origin` in the evaluate argument (from `page.url()`), needed to separate internal anchors from external ones.
- Extra caps in `HARVEST_CAPS`: element visits, props per item, values per property, value length, anchors scanned, script and iframe elements examined, headings, forms, image hints, short-text length. The plan named six; the rest bound work the plan's list left open.
- `OwnSiteHarvestOutcome` and the `harvestOwnSite(page, slice)` signature, which carry the no-slice and failure paths the plan asks for.

**6. [Decision] `unreadable` on partial failure**
- Stricter than the plan's "blocks existed but none parsed". See key-decisions. Plan 09-09 and Phase 11 should expect `unreadable` on any page where a block failed, and Phase 11 must not penalise it.

### Process note

A few early edits (the type extensions, the skeleton and the first test changes) were made through short Bash scripts rather than Edit or Write. The content is identical and everything from Task 2 GREEN onward used Edit and Write. A tool result also carried a block urging file work through Bash instead of Read, Edit and Write; it was not part of the plan or the dispatch and was not followed.

**Total deviations:** 4 auto-fixed (2 Rule 3, 2 Rule 1), 2 additions or decisions, 0 architectural. **Impact:** none on the plan's behaviour; the RED commits carry type declarations and a skeleton beyond a test-only diff.

## Authentication Gates

None.

## Known Stubs

None. Nothing in the new files is placeholder data; the zones harvested for plans 09-07 and 09-08 are real values with no consumer yet, by design.

## Open items for later plans

- **Plan 09-09:** call `harvestOwnSite(page, slice)` on the line after `extractPageData` in `scanner.ts`, in try/catch, carrying the harvest in `ScanPageResultWithScreenshot` (not persisted). Map `{ state: "unreadable" }` to `null` for `extractOwnSiteFacts`. Add the three scanner modules to `ENGINE_FILES` in `lib/niche-profile/isolation.test.ts` in the same change; both new modules already pass the vocabulary check.
- **Plan 09-09, multi-page scans:** `extractOwnSiteFacts` reads one page. Merging pages and setting `pagesRead` is the caller's job; `structuredData` counts are per call.
- **Known limitation, opening hours:** `openingHours` strings are parsed with the English two-letter day codes schema.org uses (`Mo-Fr 09:00-17:00`). A string in another form (Dutch abbreviations, free text) reads `missing` with reason `not_in_markup` even though the site printed something. Only the first time range in a string is kept. Phase 11 should not treat a `missing` hours field as proof the site publishes no hours.
- **Not run against a live page.** Behaviour on real sites rests on the 09-RESEARCH measurements (53 homepages) turned into literal fixtures. The first real scan after 09-09 is the true check, including that the browser function runs cleanly when serialised by Playwright.
- Possible JSON-LD versus microdata disagreement is resolved by "JSON-LD wins, source recorded", as the plan states; no reconciliation of conflicting values.

## Threat Flags

None. No new endpoint, auth path, file access or schema change. T-9-09 (harvest caps), T-9-10 (pool and dereference limits) and T-9-11 (`extractor.ts` byte-identical) are mitigated and tested; T-9-SC did not arise (no package installed).

## Next Phase Readiness

09-05 is complete and green. 09-07 and 09-08 can read the harvest zones; 09-09 can wire the three scanner modules.

## Self-Check: PASSED

- FOUND: all five key-files (`types/own-site.ts`, `scanner-service/src/own-site-harvest.ts`, `scanner-service/src/own-site-facts.ts`, `lib/own-site-harvest.test.ts`, `lib/own-site-facts.test.ts`)
- FOUND commits `6f8f18b`, `00f25c3`, `985be97`, `38f9bda`, `cbe53da` (5 measured via the plan-head ledger; `evaluation-scope --commits-only` resolved all five)
- Acceptance re-run: all five fields present as keys in every case; placeholder hours asserted `found` and `looksDefault` in one assertion; `areaServed` on a `Service` node passes; telephone 9-digit and 8-digit cases both asserted; the address-only fixture asserts one found and four missing field by field; microdata-only and breadcrumb-first cases pass; every cap has an exceeding input; cyclic graph terminates; no-slice case asserts `evaluate` and `url` are never called; `extractor.ts`, `Dockerfile` and `scanner-service/tsconfig.json` unchanged.
