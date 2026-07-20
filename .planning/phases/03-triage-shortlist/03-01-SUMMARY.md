---
phase: 03-triage-shortlist
plan: 01
subsystem: database
tags: [supabase, postgres, typescript, vitest, triage]

requires:
  - phase: 01-data-model
    provides: prospects table with triage_score jsonb + triage_checked_at columns already provisioned
provides:
  - Migration 016 adding prospects.scan_released_at (D-08 Phase 3 -> Phase 4 handoff marker) + partial index, applied locally
  - types/triage.ts — TriageSignals/TriageScore, the shared type contract every downstream triage module imports
  - lib/triage-constants.ts — single tunable constants block (ceiling, cutoff, fetch limits, weighted-band thresholds/deductions)
  - tests/fixtures/triage-html.ts + tests/fixtures/triage-responses.ts — Wave 0 deterministic fixtures for viewport regex + redirect/DNS/SSRF/truncation cases
affects: [03-02-triage-fetch-scorer, 03-03-candidates-cli, 03-04-release, 03-05-admin-ui, 03-06-production-push]

tech-stack:
  added: []
  patterns:
    - "Single tunable constants block (lib/triage-constants.ts) — no inline magic numbers in the scorer/fetch modules that come later"
    - "Additive-only migration convention (add column if not exists + partial index), mirrors migrations 010/014"

key-files:
  created:
    - supabase/migrations/016_add_scan_release_marker.sql
    - types/triage.ts
    - lib/triage-constants.ts
    - tests/fixtures/triage-html.ts
    - tests/fixtures/triage-responses.ts
  modified: []

key-decisions:
  - "TRIAGE_USER_AGENT set to a distinct honest UA string (AdashiTriage/1.0), never equal to the scanner's AdashiScanner/1.0, per D-12"
  - "Weighted-band thresholds/deductions from RESEARCH.md exported as named constants, not inline literals, so later plans (scorer) cannot silently drift from the single tunable source"
  - "Fixture files each import types/triage where they describe signal shapes (triage-html.ts gained an EXPECTED_VIEWPORT map keyed by TriageSignals['hasViewport'] to satisfy this and add test value)"

patterns-established:
  - "Fixture builder convention mirrored from tests/fixtures/overture.ts: named exports of deterministic inputs, no live network/DOM access"

requirements-completed: [TRI-08, TRI-09]

coverage:
  - id: D1
    description: "Migration 016 adds prospects.scan_released_at (nullable timestamptz) + partial index idx_prospects_scan_released_at_null, applied to local Supabase stack"
    requirement: "TRI-08"
    verification:
      - kind: other
        ref: "supabase db reset (local apply) + REST query select scan_released_at from prospects limit 0 — no 'column does not exist' error"
        status: pass
      - kind: other
        ref: "grep gates: add column if not exists, idx_prospects_scan_released_at_null present; no enable row level security / create policy present"
        status: pass
    human_judgment: false
  - id: D2
    description: "types/triage.ts exports TriageSignals/TriageScore (score: number, gated: boolean) — the D-02 storage contract"
    requirement: "TRI-09"
    verification:
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
      - kind: other
        ref: "grep gates: export interface TriageSignals / TriageScore, score: number, gated: boolean all present"
        status: pass
    human_judgment: false
  - id: D3
    description: "lib/triage-constants.ts exports the single tunable block (RELEASE_CEILING=20, DEFAULT_CUTOFF=60, MAX_HOPS, HOP_TIMEOUT_MS, MAX_BODY_BYTES, BATCH_SIZE, BATCH_DELAY_MS, TRIAGE_USER_AGENT, and every weighted-band threshold/deduction as a named export)"
    requirement: "TRI-09"
    verification:
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
      - kind: other
        ref: "grep gates: every required constant name present; grep 'AdashiScanner/1.0' returns no match"
        status: pass
    human_judgment: false
  - id: D4
    description: "tests/fixtures/triage-html.ts + tests/fixtures/triage-responses.ts cover the required viewport/redirect/SSRF/truncation cases with no DOM library imports"
    verification:
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
      - kind: other
        ref: "grep gates: 6 viewport fixtures present; http->https, MAX_HOPS loop, 500, ENOTFOUND, 169.254.169.254, oversized-body fixtures present; grep for jsdom|cheerio import returns no match"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-20
status: complete
---

# Phase 3 Plan 1: Triage Foundations Summary

**Migration 016 (scan_released_at release marker), the shared TriageSignals/TriageScore type contract, the single tunable triage-constants block, and Wave 0 deterministic HTML/redirect-response fixtures — the fixed interface every later Phase 3 plan builds against.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-20T11:49:00Z
- **Completed:** 2026-07-20T11:56:29Z
- **Tasks:** 3
- **Files modified:** 5 (all new)

## Accomplishments
- Migration 016 adds the one nullable `scan_released_at` column + partial index to `prospects` (D-08 — the single Phase 3 → Phase 4 state change), applied to the local Supabase stack via `supabase db reset`; production push deliberately deferred to Plan 06 (human-gated)
- `types/triage.ts` defines `TriageSignals`/`TriageScore` — the D-02 storage contract (score + every raw signal) every downstream triage module (fetch, scorer, candidates, release, CLI, admin UI) imports rather than redefining
- `lib/triage-constants.ts` centralizes every tunable default from RESEARCH.md (fetch caps, batch spacing, cutoff/ceiling, weighted-band thresholds/deductions) as named exports, so the scorer and fetch modules in later plans have zero inline magic numbers
- Wave 0 fixtures (`tests/fixtures/triage-html.ts`, `tests/fixtures/triage-responses.ts`) give every TRI-02..06 and per-hop-SSRF test a deterministic input: 6 viewport-regex HTML variants and 6 fetch-response scenarios (clean 200, http→https upgrade, >MAX_HOPS redirect loop, 500 final status, ENOTFOUND DNS failure, metadata-IP SSRF redirect, oversized body)

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 016 — scan_released_at release marker + partial index** - `a737434` (feat)
2. **Task 2: Shared triage types + tunable constants block** - `50110e2` (feat)
3. **Task 3: Wave 0 deterministic fixtures — HTML variants + redirect-response sequences** - `64881d3` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `supabase/migrations/016_add_scan_release_marker.sql` - Additive-only column + partial index on `prospects`, the D-08 Phase 3/4 handoff marker
- `types/triage.ts` - `TriageSignals`/`TriageScore` interfaces, the shared type contract
- `lib/triage-constants.ts` - Single tunable block: UA string, fetch/batch bounds, cutoff/ceiling, weighted-band thresholds/deductions
- `tests/fixtures/triage-html.ts` - 6 canned HTML strings for the TRI-04 viewport regex, plus an `EXPECTED_VIEWPORT` verdict map
- `tests/fixtures/triage-responses.ts` - Fake fetch-response sequences for the `lib/triage-fetch.ts` DI seam (later plan)

## Decisions Made
- `TRIAGE_USER_AGENT` set to `"AdashiTriage/1.0 (+https://adashi.io/triage)"` — distinct from the full scanner's own UA string, per D-12's honest-identifiable-UA requirement
- Weighted-band thresholds/deductions exported as named constants (`VIEWPORT_MISSING_DEDUCTION`, `REDIRECT_HOPS_HIGH_THRESHOLD`, etc.) matching RESEARCH.md's proposed default table exactly, so the scorer plan has no inline literals to invent
- Fixture files both import `types/triage` where they describe signal shapes — `triage-html.ts` added an `EXPECTED_VIEWPORT` map (keyed by fixture name, typed `Pick<TriageSignals, "hasViewport">`) to satisfy this cleanly and give later scorer tests a ready expected-value table, not just a bare compile-time import

## Deviations from Plan

None — plan executed exactly as written. One adjustment during self-verification: an early draft comment in `lib/triage-constants.ts` mentioned the literal string `"AdashiScanner/1.0"` for context, which tripped the acceptance criterion's exact-match grep gate even though the actual constant value was correct. Reworded the comment (no behavior change) so the grep gate reads cleanly — not logged as a numbered deviation since no code/logic changed, only a comment.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Migration 016 was applied to the local Supabase stack only; production push is the explicit, human-gated Plan 06.

## Next Phase Readiness
- `types/triage.ts` and `lib/triage-constants.ts` are ready for Plan 02 (`lib/triage-fetch.ts` + `lib/triage-scorer.ts`) to import directly — no redefinition needed.
- Wave 0 fixtures are ready for Plan 02/03's unit tests (viewport regex, redirect-chain, reachability, scorer determinism/monotonicity).
- Migration 016 is local-only; Plan 06 still owns the production push and is unaffected by this plan's local-only scope.
- No blockers.

---
*Phase: 03-triage-shortlist*
*Completed: 2026-07-20*

## Self-Check: PASSED

All 5 created files found on disk; all 3 task commits (`a737434`, `50110e2`, `64881d3`) found in git log; `npx tsc --noEmit` clean; `npm run test` 99/99 passing.
