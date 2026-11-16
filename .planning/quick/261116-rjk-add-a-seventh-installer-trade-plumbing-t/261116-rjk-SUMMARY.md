---
phase: quick
plan: 261116-rjk
subsystem: niche-profile
tags: [trade-detection, installers, plumbing, job-values]
requires: []
provides:
  - plumbing as the seventh installer trade (TradeId, profile entry, site checks)
  - two regression corpus entries pinning plumber and zinc-roofer reads
affects: [trade-detection, niche-profile, own-site-zones corpus]
key-files:
  created: []
  modified:
    - .planning/phases/09-niche-profile-own-site-engine-data/09-JOB-VALUES.md
    - lib/niche-profile/types.ts
    - lib/niche-profile/installers/trades.ts
    - lib/niche-profile/installers/checks.ts
    - lib/niche-profile/profile.test.ts
    - lib/trade-detection.test.ts
    - tests/fixtures/own-site-zones.ts
decisions:
  - plumbing tieBreakRank 7, appended so no existing rank moves
  - 300 EUR published value, showMoneyLine false, citation note records the page's three conflicting figures
  - roofing keyword list untouched
status: complete
commits: 3
plan_head_before: e997531d0acb4d5fac76b819b28f55c88a2556ee
plan_head_after: caaa74be23833069aa3a99cf8111cfba800c1412
actuals:
  tasks: 3
  commits: 3
---

# Phase quick Plan 261116-rjk: Seventh installer trade, plumbing Summary

Dutch loodgieter sites now resolve to `plumbing` instead of `roofing`, using four keyword terms and an approved, cited 300 EUR value that prints no money line.

## Commits

| Task | Commit | What |
|---|---|---|
| 1 | d719843 | 09-JOB-VALUES.md: section 7, seventh table row, header status, owed list. Changed first. |
| 2 | 9fc5f9b | TradeId union, trades.ts entry, checks.ts entry, profile.test.ts to seven trades, one-line fix in trade-detection.test.ts |
| 3 | caaa74b | Two additive corpus entries |

## Real scores

| Entry | With plumbing | Without plumbing (probe) |
|---|---|---|
| plumber-gutters-and-leaks | plumbing 72, roofing 22, clear | roofing 22, clear (the bug, reproduced) |
| zinc-roofer-lead-work | roofing 20, plumbing 3, clear | roofing 20, clear |
| plumber-multi-trade | bathroom 19, plumbing 19, roofing 16, heat_pump 14; narrow; runnerUp plumbing, margin 0 | bathroom 19, roofing 16; runnerUp roofing, margin 3 |
| installer-with-vacancies | plumbing 5, below minTradeScore 8, unreadable | unreadable |

All match the planner's arithmetic exactly.

## Deviations from Plan

**1. [Rule 1 - Bug] lib/trade-detection.test.ts hardcoded a six-length score array**
- **Found during:** Task 2, running the trade-detection tests before committing.
- **Issue:** line 634 asserted `[0,0,0,0,0,0]` for the score values of an unreadable site. With seven trades the scorer returns seven zeros, so the test went red.
- **Fix:** one extra zero. Not a corpus entry and not a changed expectation about any site.
- **Files modified:** lib/trade-detection.test.ts (a fifth file in the Task 2 commit, plan listed four)
- **Commit:** 9fc5f9b

Otherwise the plan ran as written. No halt condition tripped.

## Left for Joshua

`plumber-multi-trade` ("Loodgieter Smit") is now an exact 19/19 tie between bathroom and plumbing. It stays `bathroom` only because plumbing ranks 7 and bathroom ranks 3. Its `runnerUpId` moved from roofing to plumbing and its `margin` from 3 to 0. No test asserts either. Whether that entry should read plumbing is his decision; the fixture and tieBreakRank were not touched.

## Known Stubs

None.

## Self-Check: PASSED

Commits d719843, 9fc5f9b, caaa74b exist on fix/footer-boilerplate. Both tsc projects clean, niche-profile and trade-detection tests green (151), eslint clean on the touched files, corpus diff has zero removed lines, `git diff e997531 -- scanner-service supabase/migrations` is empty.
