---
phase: 03-triage-shortlist
plan: 02
subsystem: triage-compute
tags: [fetch, ssrf, scoring, vitest, triage]

requires:
  - phase: 03-triage-shortlist
    plan: 01
    provides: types/triage.ts (TriageSignals/TriageScore), lib/triage-constants.ts (tunable block), tests/fixtures/triage-html.ts + triage-responses.ts
provides:
  - lib/triage-fetch.ts — fetchTriageSignals(startUrl, deps), the one-GET-per-prospect network pass producing TRI-02..05 signals, per-hop SSRF-revalidated
  - lib/triage-scorer.ts — computeTriageScore(signals), the pure gate-then-weighted TRI-06 score
affects: [03-03-candidates-cli, 03-04-release, 03-05-admin-ui]

tech-stack:
  added: []
  patterns:
    - "DI seam (TriageDeps.fetchImpl, defaulting to global fetch) so all fetch-loop tests run with zero real network calls"
    - "Per-hop SSRF re-validation: validateUrlSafe() called on the starting URL AND every redirect Location, closing a gap scanner.ts's own loop has"
    - "Pure scorer decoupled from lib/scoring.ts — separate module, separate input type (TriageSignals, not PageResult[])"

key-files:
  created:
    - lib/triage-fetch.ts
    - lib/triage-fetch.test.ts
    - lib/triage-scorer.ts
    - lib/triage-scorer.test.ts
  modified: []

key-decisions:
  - "robots.txt-blocked homepage skip is recorded as reachable:true + robotsBlocked:true, distinct from the unreachable gate — Joshua can tell 'we chose not to fetch this one' apart from 'the fetch failed' (D-02's stated goal), and it does not gate the prospect"
  - "parseRobotsForRoot only blocks on a literal Disallow: / (path exactly \"/\"); an empty Disallow: value or any other path is irrelevant to the single homepage check, per RFC 9309 semantics"
  - "TTFB (responseMs) is measured cumulatively from before the first hop's fetch to the final hop's header resolution, matching RESEARCH.md's reference pseudocode — not reset per hop"

patterns-established:
  - "TriageResponseLike — a minimal structural Response type (status/ok/headers.get/body.getReader/text) so tests inject plain objects without a real fetch Response or jsdom"

requirements-completed: [TRI-01, TRI-02, TRI-03, TRI-04, TRI-05, TRI-06]

coverage:
  - id: D1
    description: "fetchTriageSignals() produces reachable/https/finalStatus/redirectChain/hasViewport/bytes/truncated/responseMs/robotsBlocked from one GET-with-manual-redirect-follow pass, no browser in the path"
    requirement: "TRI-01, TRI-02, TRI-03, TRI-04, TRI-05"
    verification:
      - kind: other
        ref: "npx vitest run lib/triage-fetch.test.ts"
        status: pass
      - kind: other
        ref: "grep -rEn \"require\\(['\\\"](playwright|lighthouse|@google/generative-ai|jsdom|cheerio)|from ['\\\"](playwright|lighthouse|@google/generative-ai|jsdom|cheerio)\" lib/triage-fetch.ts — no matches"
        status: pass
    human_judgment: false
  - id: D2
    description: "validateUrlSafe() is re-run on every redirect Location before it is followed; a metadata-IP hop is refused, never fetched"
    requirement: "TRI-03"
    verification:
      - kind: other
        ref: "lib/triage-fetch.test.ts > re-validates every redirect hop and refuses a Location pointing at a metadata IP"
        status: pass
    human_judgment: false
  - id: D3
    description: "A 500 final status is reachable:true (Pitfall 4); an oversized body sets truncated:true without throwing"
    requirement: "TRI-02, TRI-05"
    verification:
      - kind: other
        ref: "lib/triage-fetch.test.ts > a 500 final status is reachable, not unreachable (Pitfall 4) / caps an oversized body and sets truncated true without throwing"
        status: pass
    human_judgment: false
  - id: D4
    description: "computeTriageScore is a pure, deterministic, monotonic (bytes/responseMs/redirectChain), gate-dominant score; never imports lib/scoring.ts"
    requirement: "TRI-06"
    verification:
      - kind: other
        ref: "npx vitest run lib/triage-scorer.test.ts"
        status: pass
      - kind: other
        ref: "grep -rEn \"from ['\\\"]@/lib/scoring\" lib/triage-scorer.ts — no matches; grep -c 'gated' lib/triage-scorer.ts > 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full project verification: tsc clean, full test suite green"
    verification:
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
      - kind: other
        ref: "npm run test — 15 files, 145 tests"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-07-20
status: complete
---

# Phase 3 Plan 2: Triage Fetch & Scorer Summary

**The phase's actual net-new logic: `lib/triage-fetch.ts` (one manual-redirect-follow GET per prospect, per-hop SSRF-revalidated, producing all five TRI-02..05 network signals plus a robots.txt homepage check) and `lib/triage-scorer.ts` (a pure gate-then-weighted TRI-06 score, decoupled from `lib/scoring.ts`).**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-20T13:58:00Z
- **Completed:** 2026-07-20T14:06:35Z
- **Tasks:** 2
- **Files modified:** 4 (all new)

## Accomplishments
- `lib/triage-fetch.ts` adapts the proven manual-redirect-follow loop from `scanner-service/src/scanner.ts`'s `checkInternalLinks()`, switching `HEAD`→`GET` so the body is readable, and adds the one security behavior beyond that existing code: `validateUrlSafe()` is re-run on **every** redirect `Location` before it is followed, not just the starting URL — closing the per-hop SSRF gap RESEARCH.md flags (T-03-SSRF)
- `readBodyCapped()` caps the body read at `MAX_BODY_BYTES` (5MB) with stream cancellation — a tripped cap is a `truncated: true` signal, never a thrown error
- `isHomepageDisallowed()` / `parseRobotsForRoot()` implement the radically-simplified single-homepage-path robots.txt check (RESEARCH.md Pattern 5): only a well-formed `Disallow: /` under the matching UA-or-wildcard group, with no overriding `Allow: /`, skips the homepage GET; everything else fails open
- `lib/triage-scorer.ts`'s `computeTriageScore()` is a pure function over `TriageSignals`: `gated = !reachable || !https` stored as an explicit boolean (never folded into the numeric score — Pitfall 1), deductions applied only from the named constants in `lib/triage-constants.ts`, clamped to `[0, 100]`
- 46 new unit tests (25 fetch + 21 scorer) covering reachability, redirect/HTTPS, viewport (all 6 Wave 0 HTML fixtures), weight/TTFB, per-hop SSRF refusal, robots.txt fail-open/block, determinism, monotonicity (bytes/responseMs/redirectChain), gate-always-tops, and exact boundary values for every weighted band
- Full project suite (145 tests, 15 files) and `npx tsc --noEmit` both clean after both tasks

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/triage-fetch.ts — redirect-chain GET, per-hop SSRF guard, robots.txt, viewport, weight, TTFB** - `f13b0db` (feat)
2. **Task 2: lib/triage-scorer.ts — pure gate-then-weighted score** - `3df2c4e` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/triage-fetch.ts` - `fetchTriageSignals()`, `readBodyCapped()`, `isHomepageDisallowed()`, `parseRobotsForRoot()`, `VIEWPORT_RE`, `TriageDeps`/`TriageFetchImpl`/`TriageResponseLike` types
- `lib/triage-fetch.test.ts` - 25 tests: reachability, redirect/HTTPS, viewport (table-driven over all 6 fixtures), weight/TTFB, per-hop SSRF, robots.txt
- `lib/triage-scorer.ts` - `computeTriageScore()`, the pure gate-then-weighted score
- `lib/triage-scorer.test.ts` - 21 tests: determinism, gate dominance, monotonicity, exact boundary values per weighted band, clamping

## Decisions Made
- Robots.txt-blocked homepage skip records `reachable: true, robotsBlocked: true` (not a gate) — distinct signal from a genuine fetch failure, matching D-02's "show why it ranks badly, not a misleading verdict" intent; left to Claude's discretion since RESEARCH didn't pin down the exact field values for this case
- `parseRobotsForRoot` treats an empty `Disallow:` value as non-blocking (RFC 9309: empty value = nothing disallowed) — only a literal `Disallow: /` blocks the homepage, with `Allow: /` at equal specificity winning ties
- TTFB (`responseMs`) is cumulative from before the first hop's fetch to the final (non-redirect) hop's header resolution, exactly matching RESEARCH.md's reference pseudocode rather than resetting the clock per hop
- Test fixtures' fake `fetchImpl` differentiates robots.txt requests (`url.endsWith("/robots.txt")`) from the homepage-loop sequence, so the shared `TriageDeps.fetchImpl` seam serves both call sites without a second DI parameter

## Deviations from Plan

None - plan executed exactly as written. `lib/triage-fetch.test.ts`'s initial SSRF-hop assertion (`fetchImpl` called exactly once) was corrected during test-writing once it was clear the robots.txt check itself also uses `fetchImpl` (2 calls total: robots.txt + the one hop before refusal) — reworded the assertion to check the metadata-IP URL was never among the fetched URLs instead of asserting a raw call count. Not logged as a numbered deviation: it was a self-caught test-authoring correction before the suite ever ran green, not a fix to already-committed code.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required; both modules are pure/DI-seamed and fully covered by unit tests with no live network or database access.

## Next Phase Readiness
- `lib/triage-fetch.ts` and `lib/triage-scorer.ts` are ready for Plan 03 (`lib/triage-candidates.ts` + `scripts/triage-prospects.ts`) to import directly — `fetchTriageSignals()` → `computeTriageScore()` is the exact two-step pipeline the CLI orchestrator wires together per prospect.
- No blockers.

---
*Phase: 03-triage-shortlist*
*Completed: 2026-07-20*

## Self-Check: PASSED

All 4 created files found on disk; both task commits (`f13b0db`, `3df2c4e`) found in git log; `npx tsc --noEmit` clean; `npm run test` 145/145 passing (15 files); TRI-01 grep gate and `@/lib/scoring` import grep gate both return no matches as required.
