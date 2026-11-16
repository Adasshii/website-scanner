---
phase: quick
plan: 261116-oky
subsystem: trade-detection
tags: [trade-detection, boilerplate, scoring, own-site]
requires: [ENG-01, NIC-01]
provides: [every-page body lines and h2/h3 items counted once per scan]
affects: [scanner-service/src/trade-detection.ts]
tech-stack:
  added: []
  patterns: [distinct-union-across-pages, one-page-branch-unchanged]
key-files:
  created: []
  modified:
    - scanner-service/src/trade-detection.ts
    - lib/trade-detection.test.ts
    - tests/fixtures/own-site-zones.ts
key-decisions:
  - "A body line or h2/h3 item present on EVERY page (two pages or more) is boilerplate and counts once, never by ratio."
  - "A one-page scan takes the original expressions, not a rewrite."
  - "A removed line leaves a '.' so neighbours cannot glue into a phrase match."
status: complete
commits: 2
plan_head_before: dd24b892e5822f70009d67b202218f5f95ceb476
plan_head_after: 4f16d87c2307f8a28d0fa1983dc21ebde9069045
actuals:
  tokens: 9000
  tasks: 3
  commits: 2
---

# Phase quick Plan 261116-oky: Count repeated boilerplate once Summary

A body line or h2/h3 item that sits on every page of a multi-page scan is now scored once, under its own cap, so a general builder whose footer names a trade no longer wins that trade at `clear`.

## What changed

- `scanner-service/src/trade-detection.ts`: `prepareSite()` splits body text into normalised lines on the multi-page path, lifts every-page lines and every-page h2/h3 items into `bodyBoilerplate` and `h2h3Boilerplate`, and scores each once in `scoreTrade()`. New `BOILERPLATE_HIT_CAPS` (body 10, h2h3 5) and `MAX_BODY_LINES` (200). One-page scans take the original `normaliseBounded` / `normaliseItems` expressions. The `prepareSite` doc comment now covers nav and boilerplate as one idea with the three rules.
- `lib/trade-detection.test.ts`: new describe block (4 RED cases, 4 rot-pins), a `distinctPages` helper, and the four `pagesOf(7, ...)` summing tests rewritten with per-page-distinct content (plus one companion assertion for an identical repeated body line, `3 + 1`).
- `tests/fixtures/own-site-zones.ts`: new corpus entry `general-builder-trade-word-in-footer` (4 pages, footer names roofing three times).

## Measured evidence (Task 1 red run, before the fix)

| Case | Before fix | After fix |
|---|---|---|
| Body line on every page (3 pages) | 9 | 3 |
| h2h3 item on every page (3 pages) | 12 | 8 |
| Body union cap (2 pages, `dak ` x50) | 20 | 10 |
| h2h3 union cap (2 pages, `dak ` x12) | 20 | 10 |
| Corpus entry `general-builder-trade-word-in-footer` | roofing, `clear` (roofing score 12, margin 12) | no trade, `unreadable` |

All four RED cases reported exactly the planned today-values (9, 12, 20, 20). All four rot-pins passed on the untouched engine.

## Verification

- Full suite: `npx vitest run` 82 files, **1266 tests passed**, 0 failed (28s, no timeout). The plan's 1198 baseline is stale: other quick tasks have landed since, so I report 1266 as the actual total. This task added 10 tests in the trade-detection file (8 in the new block, 1 companion assertion test, 1 corpus entry test) plus the new entry in the whole-corpus checks.
- Targeted run before the full suite: trade-detection, own-site-aggregate, own-site-facts, own-site-run, own-site-wiring and `lib/niche-profile`: 7 files, 365 tests passed.
- `npx tsc --noEmit` (root): clean.
- `npx tsc --noEmit -p scanner-service/tsconfig.json`: clean.
- `npm run lint`: no warnings or errors.
- Corpus audit: all 18 pre-existing `OWN_SITE_ZONE_CORPUS` entries resolve to the same `tradeId` and `confidence` as before. **HALT condition did not fire. Nothing moved.** `roofer-seven-pages-solar-in-nav` still pins `scores.solar === 4`.
- `git diff origin/main` names exactly three files: the three above. `git diff origin/main -- lib/niche-profile supabase/migrations` is empty, so `ZONE_WEIGHTS`, `ZONE_HIT_CAPS`, `minTradeScore`, `dominanceRatio` and the keyword lists are untouched. (Local `main` is stale against `origin/main`, so a diff against it shows unrelated files.)

## Commits

- `c4292d5` test(quick-261116-oky): pin that a repeated footer line counts once
- `4f16d87` fix(quick-261116-oky): count a line repeated on every page once

## Deviations from Plan

### Auto-fixed / clarified

**1. [Clarification] Removal-adjacency rot-pin uses distinct flanking lines**
- **Found during:** Task 1
- **Issue:** The plan's literal bodies (`"nieuwe cv"`, footer, `"ketel vervangen"`, identical on both pages) would have every line lifted as boilerplate, so no glue could happen and the test would pass even without the `"."` placeholder.
- **Fix:** The footer is identical on both pages; the lines around it differ per page (`nieuwe cv` / `tweede cv`, `ketel vervangen` / `ketel plaatsen`). Without the placeholder, `cv` and `ketel` would sit together and match, so the test now genuinely guards the placeholder. It passes before and after the fix, as a rot-pin must.
- **Files modified:** `lib/trade-detection.test.ts`
- **Commit:** c4292d5

Otherwise: none, the plan executed as written.

## Known Stubs

None.

## Threat Flags

None. No new boundary, endpoint, stored field or dependency. The T-oky-01 mitigations are in place (20,000-char slice before the split, `MAX_BODY_LINES`, one `Set` per page, per-union hit caps).

## Notes

- The untracked stray file `--` that was in `git status` at the start was no longer listed at the end. I did not touch it; flagging it only because the plan said it should still be there.
- `.planning/milestone.lock` and `.planning/state.json` remain untracked. Nothing pushed, no branch switch, no worktree.
- No docs artifacts were committed, per the orchestrator's instruction.

## Self-Check: PASSED

- FOUND: scanner-service/src/trade-detection.ts, lib/trade-detection.test.ts, tests/fixtures/own-site-zones.ts
- FOUND: commits c4292d5 and 4f16d87 (ancestors of HEAD)
