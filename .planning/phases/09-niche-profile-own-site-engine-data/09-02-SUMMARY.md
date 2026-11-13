---
phase: 09-niche-profile-own-site-engine-data
plan: 02
subsystem: niche-profile
tags: [nic-01, nic-02, nic-03, nic-04, typed-profile, citation, vitest, tdd]
requires:
  - phase: 09-niche-profile-own-site-engine-data
    provides: "09-01 guard module (lib/google-content-guard.ts) that the isolation test sits beside"
provides:
  - "INSTALLERS_PROFILE: six trades with approved job values, citations, keyword terms, site-check terms, review widget hosts, competitor rules and bilingual copy"
  - "toScannerSlice(profile): the only shape that crosses to Railway (NicheScanSlice, 2676 bytes serialised, no value, citation or copy)"
  - "getTrade (keyed on TradeId), getNicheProfile, staleJobValues (pure over an injected clock)"
  - "OVERTURE_IMPORT_CATEGORIES (8) and TARGET_REGIONS (12) for plan 09-06's random import"
  - "NIC-03 and NIC-04 enforced as failing builds, plus the 20480-byte slice budget"
affects: [09-03, 09-06, 09-09, phase-10, phase-11, phase-12]
tech-stack:
  added: []
  patterns:
    - "Citation inside a discriminated union, so a job value without one is a compile error"
    - "Two independent fields (jobValue present, showMoneyLine) instead of one proxy switch"
    - "Slice built field by field, never by spread, so a new profile field cannot leak to Railway"
    - "Fourth member of the source-assertion test family, with both-direction canaries"
key-files:
  created:
    - lib/niche-profile/types.ts
    - lib/niche-profile/index.ts
    - lib/niche-profile/installers/trades.ts
    - lib/niche-profile/installers/checks.ts
    - lib/niche-profile/installers/copy.ts
    - lib/niche-profile/installers/categories.ts
    - lib/niche-profile/profile.test.ts
    - lib/niche-profile/isolation.test.ts
    - types/niche-scan-slice.ts
  modified: []
key-decisions:
  - "NicheProfile gains reviewWidgetHosts (not in the plan's field list) so toScannerSlice reads only the profile and not a second module"
  - "Money-line template carries only {amount}, no {trade}: no trade label field exists, and the report is per trade, so Phase 12 can add labels if it wants them"
  - "Multi-word central-heating and boiler terms use match 'word' (abbreviation-led), long stems use 'substring', dak compounds use 'prefix'"
  - "Solar citation carries no pageUpdated: Milieu Centraal states a price date (January 2026), not a page last-updated date, so it lives in the note"
requirements-completed: [NIC-01, NIC-02, NIC-03, NIC-04]
duration: "7 min"
completed: 2026-11-13
status: complete
actuals:
  tokens: 13000
  tasks: 3
  commits: 5
plan_head_before: 2fa709813d3abb8412ea9d86909e5a2a1018aa39
plan_head_after: 6155057debfb67b316faaa6b39d95f4b2aa00ad2
---

# Phase 9 Plan 02: Installers niche profile Summary

One typed profile now holds all six installer trades with their approved job values and citations, and the type system, not review, makes a value without a citation, a midpoint without its note, or a trade without a money-line switch impossible to write.

## Accomplishments

- `lib/niche-profile/types.ts`: `TradeId`, `ProfileLocale`, `Citation`, `JobValue` (a union on `derivation`; the midpoint member makes `citation.note` non-optional), `TradeProfile` (`showMoneyLine` required and independent of `jobValue`), `NicheProfile`. Type-only.
- `lib/niche-profile/installers/trades.ts`: the six values copied from 09-JOB-VALUES.md (12000, 3200, 7500, 11000, 5700, 2100), each with source, https URL, read date 2026-11-12 and `recheckAfter` 2027-11-12. Kitchen is `midpoint-of-range` over [7000, 15000] with the required wording in its note. Central heating carries 2100 and `showMoneyLine: false`. Solar carries the 8-panel `copyObligation`. Heat pump is rank 1, central heating rank 6. The heat pump value is the pre-subsidy 12000, and the post-subsidy figure appears nowhere under `lib/niche-profile/`.
- Keyword terms carry the measured corrections: `zonnepane` stem, `dak` by prefix, and no bare two-letter boiler abbreviation for central heating.
- `installers/checks.ts`: per-trade quote, project and certification terms (energy trades get `installq` and `techniek nederland` plus their schemes; roofing, bathroom and kitchen get only the three generic terms; the chamber-of-commerce, bare "recognised" and ISO terms are absent) and the five review widget hosts.
- `installers/categories.ts`: the eight Overture categories and all twelve provinces (no `fryslan` alias), the 25 km radius and 3-competitor cap, and the empty AI-question slot for Phase 10.
- `installers/copy.ts`: bilingual money-line template, four "Adashi fixes this" lines (business facts, social proof, website on a phone, quote request) and the social-proof line. Only copy that exists in the source plan.
- `lib/niche-profile/index.ts`: `INSTALLERS_PROFILE`, `getNicheProfile`, `getTrade` (by id, never index), `toScannerSlice` (field by field, never a spread), `staleJobValues(profile, now)`.
- `types/niche-scan-slice.ts`: `NicheScanSlice`, declarations only, under `types/` so no Dockerfile or tsconfig edit was needed.
- `profile.test.ts` (35 cases): amounts asserted against a literal table written in the test; central heating asserted as value present AND money line off in one assertion; both `@ts-expect-error` cases compile only because the types reject the bad literals; regions each resolve through `resolveBbox`; categories clear `EXCLUDED_CATEGORIES`; `staleJobValues` run with three injected dates and no bare `new Date()` anywhere.
- `isolation.test.ts` (12 cases): existence assertion first, vocabulary and geography literals over non-comment lines of `lib/triage-eligibility.ts` and `lib/google-content-guard.ts`, NIC-04 import detector (alias, relative, require, dynamic and multi-line imports) with canaries in both directions, and the slice under 20480 bytes.

## Verification (measured)

| Check | Result |
|-------|--------|
| `npx vitest run --project unit lib/niche-profile/profile.test.ts` | 35 passed |
| `npx vitest run --project unit lib/niche-profile/isolation.test.ts` | 12 passed |
| `npx vitest run --project unit` | exit 0, 36 files, 450 tests, 0 failed (was 629 across all projects at the 09-01 baseline; this run is the unit project only) |
| `npx tsc --noEmit` | exit 0, no `error TS` lines |
| `npm run lint` | "No ESLint warnings or errors" |
| `npm --prefix scanner-service run build` | 0 `error TS` lines |
| `git diff --exit-code scanner-service/Dockerfile scanner-service/tsconfig.json` | clean (D-9-13 held) |

Human-check (closed 2026-11-13, not re-asked): verified by test and by reading, `OVERTURE_IMPORT_CATEGORIES` has the eight entries, `TARGET_REGIONS` has the twelve, and `fryslan` appears only inside a comment explaining its absence.

## TDD Gate Compliance

Plan type is `execute` with `tdd="true"` on Tasks 1 and 2; Task 3 is a test-only task.

- **RED (Task 1):** `e6e3581`. Target test "carries the pre-subsidy invoice total as a published value" failed on `expected undefined to be 12000` (4 of 8 cases failing against a skeleton). `gsd_run check tdd-red-evidence` returned `RED_EVIDENCE_OK`, reason `target_test_failed`. Semantic assessment: the target executed and failed on the planned assertion for the intended reason (the profile had no trades yet).
- **GREEN (Task 1):** `f02405c`, 8 of 8 passing, tsc clean.
- **RED (Task 2):** `4fbad70`. Target test "holds every TradeId exactly once, asserted exhaustively" failed on `expected [ 'heat_pump' ] to have a length of 6 but got 1` (23 of 35 failing). Classifier returned `RED_EVIDENCE_OK`. Semantic assessment: intended assertion, intended reason.
- **GREEN (Task 2):** `e1d790d`, 35 of 35 passing, full unit project green, lint clean.
- **Task 3:** `6155057`, a test-only task, no RED/GREEN split by design.
- No REFACTOR commit: nothing needed one.

## Task Commits

1. Task 1 (tracer): `e6e3581` RED, `f02405c` GREEN
2. Task 2: `4fbad70` RED, `e1d790d` GREEN
3. Task 3: `6155057` test(09-02): enforce NIC-03 and NIC-04 and the slice budget as failing builds

Tracer gate: end-of-phase mode with an automated-only verify, so the verify was re-run (vitest and tsc, both green) and expansion proceeded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] RED could not be a load failure**
- **Found during:** Task 1
- **Issue:** The plan says the first run "fails at the import". The first run did (`Cannot find module './index'`), but a load failure is `INVALID_RED` under the tdd.md contract and cannot authorise GREEN.
- **Fix:** committed `types.ts`, `types/niche-scan-slice.ts` and a skeleton `index.ts` (right exports, empty values) with the RED test, so the target test fails on its planned assertion. The skeleton was replaced in the GREEN commit.
- **Files modified:** `lib/niche-profile/types.ts`, `types/niche-scan-slice.ts`, `lib/niche-profile/index.ts`
- **Commit:** `e6e3581`

**2. [Rule 1 - Bug] `@ts-expect-error` placed on the wrong line**
- **Found during:** Task 1 GREEN, `tsc`
- **Issue:** tsc reports a missing-property error on the variable name, not on the property line, so the second directive was unused (and one explanatory comment contained the directive text, which tsc read as a directive).
- **Fix:** moved the directive to sit directly above the `const` declaration and reworded the comment.
- **Files modified:** `lib/niche-profile/profile.test.ts`
- **Commit:** `f02405c`

**3. [Rule 3 - Blocker] Multi-line assertion diffs corrupt the TAP report**
- **Found during:** Task 2 RED
- **Issue:** vitest's TAP reporter wrote multi-line `toEqual` diffs that the classifier read as non-TAP data, giving `invalid_record`.
- **Fix:** array-set comparisons use a one-line `asSortedLine` helper and the central-heating check is a single boolean assertion, so every failure message is one line. Test intent is unchanged.
- **Files modified:** `lib/niche-profile/profile.test.ts`
- **Commit:** `4fbad70`

### Additions beyond the plan

**4. [Plan addition] `reviewWidgetHosts` on `NicheProfile`**
- The plan's field list for `NicheProfile` omits it, yet `toScannerSlice(profile)` must return it and `REVIEW_WIDGET_HOSTS` lives in `checks.ts`. Adding the field keeps the slice a pure function of the profile. Commits `f02405c`, `e1d790d`.

**5. [Plan addition] `EMPTY_AI_QUESTIONS` and `getNicheProfile`/`stripComments` exports**
- `EMPTY_AI_QUESTIONS` in `categories.ts` is the "AI question template slot" the plan asks for there; trades import it. `isolation.test.ts` exports its detectors beside the constants so the canaries and the failure messages share one implementation.

**Total deviations:** 3 auto-fixed (2 Rule 3, 1 Rule 1), 2 additions, 0 architectural. **Impact:** none on behaviour; the RED commit carries type declarations and a skeleton beyond a test-only diff.

## Authentication Gates

None.

## Known Stubs

None. `aiQuestions` is empty on every trade on purpose (D-9-24: nothing in Phase 9 fires a question; Phase 10 writes them). Every keyword, check-term and widget-host list is a documented seed to be confirmed against the real list, the same way `EXCLUDED_CATEGORIES` was, not a stub.

## Open items for later phases

- Phase 12: the solar `copyObligation` and the kitchen midpoint note must reach the report; central heating must print no money line. The money-line template has `{amount}` only, so a trade label, if wanted, is Phase 12's to add.
- Plan 09-09: add `scanner-service/src/own-site-harvest.ts`, `own-site-facts.ts` and `trade-detection.ts` to `ENGINE_FILES` in the same change that wires them. The header of `isolation.test.ts` records this.
- The `match: "word"` mode for multi-word terms (`cv ketel`, `hr ketel`) is defined by the trade-detection code in 09-09, which must treat a word-mode phrase as one boundary-delimited unit.
- NIC-02 ordering ("no code path selects a job value by position") is a backstop truth about every consumer; Phases 11 and 12 must keep every lookup keyed on `TradeId`.
- Re-check date: `staleJobValues` is ready, but nothing surfaces it yet (a later admin surface).

## Threat Flags

None. No new endpoint, auth path, file access or schema change. T-9-03 (slice leaks value, citation or copy) and T-9-04 (a number edited without its citation) are both mitigated and tested.

## Next Phase Readiness

Wave 2 profile is in place and green. 09-03 (migration 021) is independent of it; 09-06 reads `OVERTURE_IMPORT_CATEGORIES` and `TARGET_REGIONS`; 09-09 reads `toScannerSlice`.

## Self-Check: PASSED

- FOUND: all nine key-files created (`lib/niche-profile/{types,index,profile.test,isolation.test}.ts`, `lib/niche-profile/installers/{trades,checks,copy,categories}.ts`, `types/niche-scan-slice.ts`)
- FOUND commits `e6e3581`, `f02405c`, `4fbad70`, `e1d790d`, `6155057` (5 measured via the plan-head ledger)
- Acceptance re-run: six amounts match the literal table; central heating value present and `showMoneyLine` false; both `@ts-expect-error` cases compile; no `8975` under `lib/niche-profile/`; no bare `new Date()` in the tests; every `citation.url` is https and every `readOn` is 2026-11-12; slice under 20480 bytes; Dockerfile and scanner tsconfig untouched.
