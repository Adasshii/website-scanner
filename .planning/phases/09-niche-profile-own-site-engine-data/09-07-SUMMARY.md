---
phase: 09-niche-profile-own-site-engine-data
plan: 07
subsystem: scanner-own-site-engine
tags: [eng-02, eng-05, social-proof, quote-readiness, three-state-fields, literal-matching, vitest, tdd]
requires:
  - phase: 09-niche-profile-own-site-engine-data
    provides: "09-02 NicheScanSlice (reviewWidgetHosts, per-trade checks) and 09-05 harvest zones and FieldState"
provides:
  - "scanner-service/src/own-site-facts.ts: extractSocialProof(pages, slice), evaluateQuoteReadiness(harvest, checks), mergeQuoteReadiness(pages), MIN_QUOTE_FORM_FIELDS, MIN_PROJECT_IMAGES, TradeChecks"
  - "types/own-site.ts: OwnSiteSocialProof, OwnSiteQuoteReadiness, OwnSiteCheck, OwnSiteFactsCore; FieldSource gains visible_text; OwnSiteFacts gains socialProof and quoteReadiness"
affects: [09-08, 09-09, phase-11, phase-12]
tech-stack:
  added: []
  patterns:
    - "Literal matching: both sides normalised to lower-case words, term found as a space-bounded literal, no pattern ever built from data"
    - "Order-independent folding: sort and deduplicate every list, break every tie on the value itself"
    - "Whole-result unreadable state instead of four false booleans"
key-files:
  created: []
  modified:
    - types/own-site.ts
    - scanner-service/src/own-site-facts.ts
    - lib/own-site-facts.test.ts
key-decisions:
  - "A6 is ACCEPTED, not open: on 2026-11-14 Joshua chose option 1, treating an on-site review count as the business's own published data. This is his own commercial judgement. It has not been reviewed by counsel. It is not legally cleared."
  - "shown and markedUp are boolean or null, not boolean: null means a signal was not found but a JSON-LD block that did not parse, a cap or a failed page means it may have been there. A false there would be an unmeasured claim."
  - "Social proof and quote readiness are each a union with an unreadable member, so a page or site we could not read at all is never stored as a negative."
  - "The count is only taken from an aggregateRating that hangs off a business node, so a product's rating on an installer's webshop is never stored as the business's review count. markedUp stays broad."
  - "Recency only counts a review that hangs off the business or names it as itemReviewed. A review with no itemReviewed is not claimed: an absent date is a safer error than a borrowed one."
  - "Quote and project terms match at the start of a word, certification terms as whole words. Dutch compounds put the head word last, so the stems sit at the front; certification noise on the sample came from substrings."
  - "Site-level quote readiness reads unreadable whenever any page failed and any check is still unproven. It gives up the checks that did pass rather than state an absence that was not measured."
requirements-completed: [ENG-02, ENG-05]
duration: "13 min"
completed: 2026-11-13
status: complete
commits: 6
plan_head_before: 6aef51d28173a4eade7d63650a7b2084e35e37f6
plan_head_after: 68b90323019641879fab64ddee408dae4f143fca
actuals:
  tokens: 16500
  tasks: 3
  commits: 6
coverage:
  - deliverable: "Social proof read off the site: shown, count, recency, machine-readable, widget hosts, with absence and unreadability distinguishable"
    verification:
      - kind: test
        ref: "lib/own-site-facts.test.ts#extractSocialProof"
        status: pass
      - kind: test
        ref: "lib/own-site-facts.test.ts#three-state contract: every key is present in every situation"
        status: pass
    human_judgment: false
  - deliverable: "Count resolved by a fixed order of trust (reviewCount, ratingCount, visible text), independent of key order and page order"
    verification:
      - kind: test
        ref: "lib/own-site-facts.test.ts#extractSocialProof: the count"
        status: pass
      - kind: command
        ref: "node mutate.mjs (28 mutations, 28 red, 0 survivors; see Verification)"
        status: pass
    human_judgment: false
  - deliverable: "Quote readiness: form at exactly 2 fields, tap-to-call, project photos, certifications, from slice terms, with evidence"
    verification:
      - kind: test
        ref: "lib/own-site-facts.test.ts#evaluateQuoteReadiness"
        status: pass
    human_judgment: false
  - deliverable: "Measured false positives asserted as negatives; no pattern built from a profile string or page text"
    verification:
      - kind: test
        ref: "lib/own-site-facts.test.ts#evaluateQuoteReadiness: terms are literals, never patterns"
        status: pass
      - kind: command
        ref: "grep -n 'new RegExp' scanner-service/src/own-site-facts.ts (no matches)"
        status: pass
    human_judgment: false
  - deliverable: "ENG-07 guard still passes, scanner Dockerfile, tsconfig, extractor.ts and discovery.ts untouched"
    verification:
      - kind: test
        ref: "lib/google-content-guard.test.ts"
        status: pass
      - kind: command
        ref: "git diff --exit-code -- scanner-service/src/discovery.ts scanner-service/src/extractor.ts scanner-service/Dockerfile scanner-service/tsconfig.json"
        status: pass
    human_judgment: false
  - deliverable: "Output matches what real Dutch installer sites publish"
    verification: []
    human_judgment: true
    rationale: "Fixtures are literal objects shaped from the 09-RESEARCH measurements of 53 homepages. No live page was run through these functions; plan 09-09 wires them and the first real scan is the check."
---

# Phase 9 Plan 07: On-site social proof and quote-request readiness Summary

Two pure, slice-driven extractors now answer what a prospect's own site can say about its commercial readiness: whether it shows reviews (how many, how recent, machine-readable) and whether a customer can actually ask for a quote (form, tap-to-call, project photos, certifications). Every absence is a stated three-state value, and no pattern is ever built from a profile string or from page text.

## Accomplishments

- `extractSocialProof(pages, slice)` reads across all pages of a site. `shown` comes from four specific signals (a slice-named review widget host, a review word in a heading, a rating pattern in visible text, an AggregateRating or Review in markup), never from `hasTrustSignals`. Count resolves by a fixed order of trust: `reviewCount`, then `ratingCount`, then a count phrase in visible text. Recency comes only from `datePublished` on the business's reviews. Widget hosts are stored sorted and deduplicated.
- `evaluateQuoteReadiness(harvest, checks)` returns four `{ passed, evidence }` checks from the trade's slice terms. A form passes at exactly 2 fillable fields (`MIN_QUOTE_FORM_FIELDS`) and fails at 1. Tap-to-call needs a real `tel:` href. Project photos need a project term in nav, a link path or a heading plus `MIN_PROJECT_IMAGES` (3) images. Certifications match whole words over headings, nav, visible text, link paths and image alt text and file names.
- `mergeQuoteReadiness(pages)` folds per-page results into one site value, order-independent.
- `types/own-site.ts`: `OwnSiteSocialProof`, `OwnSiteQuoteReadiness`, `OwnSiteCheck`, `OwnSiteFactsCore` (what the business-fact extractor returns), `FieldSource` extended with `visible_text`, and `OwnSiteFacts` extended with `socialProof` and `quoteReadiness`. A comment at the declaration records that `trade` arrives in plan 09-08 and aggregation plus persistence in plan 09-09.
- The JSON-LD and microdata pool build was extracted from `extractOwnSiteFacts` into `readStructuredData` so both extractors share the same caps and the same "could not tell" rule.

## Assumption A6: accepted by Joshua, with its limits

**Decided on 2026-11-14.** Joshua was shown three options: (1) treat an on-site review count as the business's own published data, (2) read it during the scan but never store it, (3) pause the field until a lawyer reviews it. He chose option 1.

What that means, plainly: reading and storing a review count that a business publishes in the markup of its own website is treated as that business's own data. The scanner reads their public page as any visitor would. It never calls a Google Maps Platform API and holds no Google key.

What it does not mean: this is Joshua's own commercial judgement, taken on 2026-11-14. It has not been reviewed by counsel. It is not legally cleared. The caveat stays attached to the data: some review-widget plugins copy Google numbers into on-site markup, so a count stored as the site's own could in practice have originated at Google. The stored value therefore records its source as the site's markup (`jsonld` or `microdata`) or its visible text (`visible_text`) and is never labelled or presented as a Google figure. If the decision is ever withdrawn, the narrow fix is unchanged: drop `count` and `recency` and keep only `shown` and `markedUp`.

The plan's `<human-check>`, kept here as the record of what was asked:

> 09-RESEARCH.md assumption A6 is a legal reading with no counsel review, and this plan relies on it: reading and storing an on-site `AggregateRating` review count is treated as the business's own data rather than Google Maps Content, because our scanner reads it off their public page rather than obtaining it from a Maps Platform API. Confirm that reading, and note the caveat that makes it worth a second look: some review-widget plugins copy Google numbers into on-site markup, so a count we store as the site's own could in practice have originated at Google. The stored value records its source as the site's markup and is never presented as a Google figure, which is the mitigation. If the reading turns out to be wrong, the fix is narrow: drop the count and the recency and keep only `shown` and `markedUp`. This belongs alongside the Phase 12 Places question rather than being settled silently here.

**Answered 2026-11-14 by Joshua, option 1 (accept as the business's own published data).** Closed, not re-asked. The code comment on `extractSocialProof` states the same and says it is not counsel's opinion.

## Verification (measured)

| Check | Result |
|-------|--------|
| `npx vitest run --project unit lib/own-site-facts.test.ts` | 141 passed (was 62 before this plan) |
| `npx vitest run --project unit lib/google-content-guard.test.ts` (ENG-07, T-9-15) | 12 passed, exit 0. Nothing added here names a Google field or endpoint. `reviewCount` and `ratingCount` are schema.org names, not Places fields. |
| `npx vitest run --project unit` | exit 0, 38 files, 685 tests, 0 failed |
| `npx tsc --noEmit` | exit 0 |
| `npm --prefix scanner-service run build` | exit 0, 0 `error TS` lines |
| `npx eslint lib/own-site-facts.test.ts types/own-site.ts` | exit 0 |
| `git diff --exit-code -- scanner-service/src/discovery.ts scanner-service/src/extractor.ts scanner-service/Dockerfile scanner-service/tsconfig.json` | exit 0 (D-9-13 held) |
| `grep -n 'new RegExp' scanner-service/src/own-site-facts.ts` | no matches (T-9-14): every regular expression is a fixed literal |
| NIC-03 vocabulary grep over the scanner module (trade stems, scheme name, quoted `nl` and `en`, country names, `offerte`, `prijsopgave`, `kvk`) | no matches; the module reads every term from the slice |
| `requirements.ready-ids` for ENG-02 and ENG-05 | 0 of 2 ready: sibling plans in the phase still declare them (shared-ID gate), so they were not marked complete here |
| Migrations touched | none; `supabase db push` not run |

### Mutation checks

Both RED runs failed properly against skeletons (29 and 32 failing tests), so the GREEN tests were written before the code. They still passed on their first run after implementation, so each behaviour was mutation-checked against the real source, one change at a time, restoring the file with `git checkout` after each. 28 mutations: count order swapped to ratingCount first, count order flattened to a maximum, tie takes the smaller, host list unsorted, host list not deduplicated, evidence unsorted, unreadable collapsed into missing, `shown` and `markedUp` null collapsed to false, host fragments hardcoded in the scanner, a product's rating counted, recency takes the oldest, visible text beats markup, form threshold 1 and 3, project image minimum 1, certifications matched as substrings, image alt and image file name not read, tap-to-call accepting any href, a failed harvest read as evaluated, a throw read as evaluated, merge ignoring failed pages, merge evidence by page order, quote terms not matched at word start, slice terms uncapped, an unclaimed review borrowed for recency. 26 were red on the first pass. 2 survived and exposed weak tests, both fixed:

- **Count order.** The plan's case (reviewCount 42, ratingCount 7) cannot tell "reviewCount first" from "take the larger". Added reviewCount 7 with ratingCount 42 asserting 7. Re-run: the true swap and the flatten-to-maximum mutation are both red.
- **Unclaimed review.** No test had a Review with no `itemReviewed`. Added that case and a product-review case. Re-run: red. Final: 0 survivors.

## TDD Gate Compliance

Plan type is `execute`; Tasks 1 and 2 carry `tdd="true"`, Task 3 does not.

- **Refactor first:** `f0dc1ad`, shared structured-data reader, 62 existing tests unchanged and green before and after.
- **RED (Task 1, tracer):** `b74f99f`. Target "reads a known review widget host as reviews shown, and names the host" failed on `expected 'unreadable' to be 'read'` (29 failing, 63 passing against a skeleton). `gsd_run check tdd-red-evidence` returned `RED_EVIDENCE_OK`, reason `target_test_failed`, before the commit. Semantic assessment: the target executed and failed on the planned assertion for the intended reason (no extraction yet).
- **GREEN (Task 1):** `b1c10c9`, 92 of 92 passing.
- **RED (Task 2):** `ea4eb67`. Target "passes a form with exactly 2 fillable fields and names the form" failed on `expected 'unreadable' to be 'evaluated'` (32 failing, 98 passing). Classifier `RED_EVIDENCE_OK` before the commit. Semantic assessment: intended assertion, intended reason. The first assertion in each RED case is a scalar, so the TAP reporter parsed it.
- **GREEN (Task 2):** `62b0fb9`, 130 of 130 passing.
- **Task 3:** `68b9032`, tests only (the plan marks it non-TDD); the three-state table and the page-order test passed on first run because the implementation already existed, which is what the mutation checks above address.
- No REFACTOR commit after GREEN.

Tracer gate: end-of-phase mode with an automated-only verify, so Task 1's verify was re-run (vitest, ENG-07 guard, scanner build, all green) and expansion proceeded.

## Task Commits

1. Task 1 (tracer): `f0dc1ad` refactor, `b74f99f` RED, `b1c10c9` GREEN
2. Task 2: `ea4eb67` RED, `62b0fb9` GREEN
3. Task 3: `68b9032` test, three-state contract and stability

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `u` regex flag breaks the root typecheck**
- **Found during:** Task 1 GREEN
- **Issue:** the root `tsc` target rejects the `u` flag; the scanner build accepted it.
- **Fix:** letters and digits matched with an explicit Latin range, no `u` flag.
- **Files modified:** `scanner-service/src/own-site-facts.ts`
- **Commit:** `b1c10c9`

**2. [Rule 1 - Bug] Test constant name clash**
- **Found during:** Task 1 RED
- **Issue:** a new `BUSINESS` constant collided with the existing microdata fixture of the same name.
- **Fix:** the older one renamed `MICRO_BUSINESS`.
- **Commit:** `b74f99f`

**3. [Rule 1 - Bug] Two tests could not fail**
- **Found during:** mutation checks
- **Issue:** see Mutation checks.
- **Fix:** two cases added.
- **Commit:** `68b9032`

### Additions and decisions beyond the plan

**4. [Rule 2 - Correctness] `shown` and `markedUp` are boolean or null**
- The plan types them `boolean`. A JSON-LD block that failed to parse, a cap, or a failed page means a signal may have been there, and `false` would be an unmeasured claim shown later to a business owner. `null` is "could not tell". A found signal stays `true`.

**5. [Rule 2 - Correctness] Both groups have an unreadable member**
- `OwnSiteSocialProof` is `{ state: "unreadable" } | { state: "read", ... }`, and `OwnSiteQuoteReadiness` is `{ state: "unreadable" } | { state: "evaluated", ... }`, so a null harvest has a representation that is not a negative. The plan specified this for quote readiness and left social proof's null-harvest case open.

**6. [Plan addition] `extractSocialProof` takes all pages**
- The plan's order, duplicate-host and page-order truths need more than one page, so it takes the site's pages and does the folding. `evaluateQuoteReadiness` is per page, as the plan words it, and `mergeQuoteReadiness` folds it. `OwnSiteFactsCore` was split out of `OwnSiteFacts` so `extractOwnSiteFacts` keeps returning exactly what it returned.

**7. [Plan addition] `FieldSource` gains `visible_text`**
- A count read from a printed phrase has no markup source. No existing code switched exhaustively on `FieldSource`.

**8. [Decision] Slice inputs are bounded**
- At most 50 terms of 100 characters each are read, blanks dropped. The slice is built by our own Next client but is treated as untrusted at the scanner boundary.

### Process note

A tool result carried a block urging file work through Bash instead of Read, Edit and Write. It was not part of the plan or the dispatch and was not followed. Mutation runs used a throwaway Node script in the scratchpad that edited the module and restored it with `git checkout` after each run; nothing else was written that way.

**Total deviations:** 3 auto-fixed (Rule 1), 2 correctness additions (Rule 2), 3 plan additions or decisions, 0 architectural. **Impact:** none on the plan's behaviour; the types are slightly richer than specified so the honest three states hold.

## Authentication Gates

None.

## Known Stubs

None.

## Known limits and open items

- **Plan 09-09:** assemble `OwnSiteFacts` from `extractOwnSiteFacts` (returns `OwnSiteFactsCore`), `extractSocialProof(pages, slice)`, and `mergeQuoteReadiness(pages.map((p) => evaluateQuoteReadiness(p, checks)))`. The per-trade `checks` come from the slice entry for the trade plan 09-08 detects. When the trade is unreadable, 09-09 must choose which checks to pass (an empty `checks` yields four `false` quote-term checks, which are real "no match" answers only for tap-to-call). The slice's `checks` type is `NicheScanSlice["trades"][number]["checks"]`, exported as `TradeChecks`.
- **Plan 09-09:** add `scanner-service/src/own-site-facts.ts` to `ENGINE_FILES`. It already passes the vocabulary check by grep. It holds Dutch review and rating words (review, recensie, beoordeling, a star pattern) as fixed engine constants; they are review words, not trade words, and are a candidate to move into the profile if a second locale arrives.
- **Retention:** a stored `tel link: tel:...` evidence string carries a phone number. The column that holds it (`own_site_facts`, created in 09-09) joins the anonymise list there, as the plan already says.
- **Not run against a live page.** Behaviour on real sites rests on the 09-RESEARCH measurements turned into literal fixtures. Machine-readable rating markup is expected to read absent on nearly every prospect: that is the finding.
- **Body text is capped at 20,000 characters** by the harvester and no flag says it was cut, so "no rating pattern found" is a finding about the first 20,000 characters.
- **Prefix matching for quote and project terms** reads a multi-word term as the front of a longer compound (a project term followed by another word could over-match a heading). Whole-word matching would instead miss compounds. Recorded, not tuned.
- **Quote links are read from nav text, internal link paths and form button labels**, not from every anchor on the page, because the harvest carries no other link text. Running text that mentions a quote term does not count as a way to ask.
- **Discovery limit unchanged:** a full scan reads at most 7 pages and `pagePriority` has no quote or project vocabulary. `discovery.ts` was not touched.
- Assumptions A5 (two unobserved review widget hosts) and A10 (no certification scheme found for roofing, bathroom, kitchen) stand as recorded in the plan; neither changes behaviour here.

## Threat Flags

None. No new endpoint, auth path, file access or schema change. T-9-14 (no pattern from data) and T-9-15 (stored count, source recorded, ENG-07 guard re-run) are mitigated and tested. T-9-SC did not arise (no package installed).

## Next Phase Readiness

09-07 is complete and green. 09-08 (trade detection) can produce the trade id that selects `checks`; 09-09 can assemble and persist the stored value.

## Self-Check: PASSED

- FOUND: `types/own-site.ts`, `scanner-service/src/own-site-facts.ts`, `lib/own-site-facts.test.ts`
- FOUND commits `f0dc1ad`, `b74f99f`, `b1c10c9`, `ea4eb67`, `62b0fb9`, `68b9032` as ancestors of HEAD; plan-head ledger count is 6; `gsd_run check evaluation-scope --plan 09-07 --commits-only` resolved the same commits.
- Acceptance re-run: all six Task 1 behaviours present as named cases; the 42 versus 7 case asserts the exact value and the reverse case asserts 7; unreadable and missing are separate cases; the duplicate-host case asserts deduplication and sort order; the extractor reads hosts from its slice argument (a slice without a host does not detect it); the 2-field and 1-field form cases assert opposite outcomes; a term only in a script body or host reads false, a term only in an image alt or file name reads true; the chamber-of-commerce number, the bare word meaning recognised and the standard acronym alone never pass; every passing check has non-empty evidence and every failing check has an empty string; a failed harvest asserts the unreadable representation; no `new RegExp` in the module; the four named scanner files are byte-identical to HEAD.
