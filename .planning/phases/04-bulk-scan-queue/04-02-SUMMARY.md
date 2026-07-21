---
phase: 04-bulk-scan-queue
plan: 02
subsystem: api
tags: [express, playwright, gemini, capacity-guard, gdpr, lia]

requires:
  - phase: 04-bulk-scan-queue (plan 04-01)
    provides: "scanner-service/src/capacity.ts (isAtCapacity, MAX_TOTAL_FULL_SCANS, RESERVED_FOR_PUBLIC, CAPACITY_RETRY_AFTER_SECONDS), lib/bulk-scan-constants.ts, claim_next_scan_batch RPC (local db)"
provides:
  - "full-async handler refuses bulk work above the reserved-headroom ceiling with a generic 503 before registering the scan (SCAN-02, D-08)"
  - "DiscoveryOptions and ScanPageOptions accept an optional userAgent, defaulting to the unchanged public scanner identity (SCAN-05, D-09)"
  - "buildDesignAnalysisPrompt() — dependency-free, tested prompt builder carrying the CMP-17 no-profiling instruction, used by both the public and bulk scan paths"
  - "LIA-v1.md addendum recording the CMP-17 control as implemented behaviour"
affects: [04-03, 04-04, 04-06]

tech-stack:
  added: []
  patterns:
    - "Capacity guard inserted between input validation and the single res.json acceptance call site — refusal never registers activeFullScans"
    - "Optional userAgent threaded end-to-end (request body -> discoverPages/scanPage -> browser.newContext) with `options.userAgent ?? <existing literal>` fallback so public-scanner behavior is byte-identical when unset"
    - "Dependency-free src modules (capacity.ts, design-prompt.ts) so root Vitest can test scanner-service pure logic without its Playwright/Gemini dependency graph"

key-files:
  created:
    - scanner-service/src/design-prompt.ts
    - lib/scanner-design-prompt.test.ts
  modified:
    - scanner-service/src/index.ts
    - scanner-service/src/discovery.ts
    - scanner-service/src/scanner.ts
    - scanner-service/src/ai.ts
    - docs/legal/lia/LIA-v1.md

key-decisions:
  - "LIA-v1.md addendum appended rather than body rewrite, per the document's own D-11 immutability note and the lia_versions content-hash registration in migration 015; whether a new lia_versions row/hash is needed is flagged, not resolved, in this plan"
  - "prospectId is accepted and logged only on the full-async request body — the scanner service still does not read or write the prospects table (verified: zero prospects-table references in scanner-service/src/index.ts)"

patterns-established:
  - "Untrusted request-body labels (source, userAgent) narrow behavior (ceiling, crawl identity) but never widen authorisation — the existing Bearer SCANNER_API_KEY check remains sole auth"

requirements-completed: [SCAN-02, SCAN-05, CMP-17]

coverage:
  - id: D1
    description: "full-async refuses bulk work above the reserved-headroom ceiling with a 503 that leaks no internal counts, before the scan is registered in activeFullScans"
    requirement: "SCAN-02"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit -p scanner-service/tsconfig.json (compiles); grep-based acceptance criteria in 04-02-PLAN.md Task 1 (isAtCapacity precedes res.json accepted, 503 body carries no activeFullScans.size, no prospects-table reference)"
        status: pass
    human_judgment: false
  - id: D2
    description: "DiscoveryOptions and ScanPageOptions accept an optional userAgent reaching browser.newContext(), defaulting to the unchanged public-scanner identity string"
    requirement: "SCAN-05"
    verification:
      - kind: unit
        ref: "grep -c \"options.userAgent ??\" scanner-service/src/discovery.ts scanner-service/src/scanner.ts (both 1); npx tsc --noEmit -p scanner-service/tsconfig.json"
        status: pass
    human_judgment: false
  - id: D3
    description: "buildDesignAnalysisPrompt() carries a no-profiling instruction between the dimension list and the 'Also identify' sentence, unchanged dimensions/JSON instruction otherwise, used by generateDesignAnalysis()"
    requirement: "CMP-17"
    verification:
      - kind: unit
        ref: "lib/scanner-design-prompt.test.ts (4 assertions, all pass — domain interpolation, no-profiling instruction present, dimension list + JSON-only instruction unchanged, paragraph ordering)"
        status: pass
    human_judgment: false
  - id: D4
    description: "LIA-v1.md records the CMP-17 no-profiling control as an implemented control naming its own implementation file and test"
    requirement: "CMP-17"
    verification:
      - kind: unit
        ref: "grep -c CMP-17/design-prompt.ts/scanner-design-prompt.test in docs/legal/lia/LIA-v1.md (all >= 1); git diff shows additions only"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-07-21
status: complete
---

# Phase 04 Plan 02: Capacity Refusal, Crawl Identity, and CMP-17 No-Profiling Control Summary

**Bulk full-async requests are refused with a leak-free 503 above the reserved-headroom ceiling, both Playwright contexts accept an optional crawl identity, and the design-analysis prompt now carries a tested, enforced no-profiling instruction on both scan paths.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-07-21T19:42:00Z (approx, per session start)
- **Completed:** 2026-07-21
- **Tasks:** 3 completed
- **Files modified:** 6 (2 created, 5 modified — design-prompt.ts and its test are new; index.ts, discovery.ts, scanner.ts, ai.ts, LIA-v1.md modified)

## Accomplishments
- `full-async` handler now calls `isAtCapacity(activeFullScans.size, source)` (imported from plan 04-01's `capacity.ts`) between request validation and scan registration, refusing bulk work with a generic `503 { error, retryAfterSeconds }` that leaks no internal counts, logged internally with scanId/source/prospectId
- `DiscoveryOptions` and `ScanPageOptions` both gained an optional `userAgent`, threaded from the request body through `discoverPages()`/`scanPage()` into `browser.newContext()`, falling back to the byte-identical existing public-scanner UA string when unset
- Extracted the inline Gemini design-analysis prompt into a dependency-free `scanner-service/src/design-prompt.ts` exporting `buildDesignAnalysisPrompt(domain)`, with a CMP-17 no-profiling instruction inserted between the dimension list and the "Also identify" sentence; `ai.ts`'s `generateDesignAnalysis()` now calls it instead of holding an inline literal
- `lib/scanner-design-prompt.test.ts` added (4 passing assertions) following the RED → GREEN TDD gate: test committed first against a missing module (confirmed failing import), then the module and `ai.ts` wiring landed together as the GREEN commit
- `docs/legal/lia/LIA-v1.md` gained a dated addendum recording CMP-17 as an implemented control, naming `design-prompt.ts` and its test as proof, and flagging (not resolving) whether the appended bytes require a new `lia_versions` hash/version

## Task Commits

Each task was committed atomically:

1. **Task 1: full-async capacity refusal and user-agent passthrough** - `db9795a` (feat)
2. **Task 2: CMP-17 no-profiling control in the design-analysis prompt** - `bb8aaf2` (test, RED) → `8ab5066` (feat, GREEN)
3. **Task 3: Record the CMP-17 control in LIA-v1.md** - `2fef226` (docs)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP, per orchestrator — this plan does not update STATE.md/ROADMAP.md itself)

_Note: Task 2 is TDD (`tdd="true"`); no REFACTOR commit was needed — the extraction was clean on the first GREEN pass._

## Files Created/Modified
- `scanner-service/src/index.ts` - full-async handler: capacity guard, widened request body (`source`, `userAgent`, `prospectId`), userAgent passthrough to discoverPages/scanPage
- `scanner-service/src/discovery.ts` - `DiscoveryOptions.userAgent`, `browser.newContext({ userAgent: options.userAgent ?? <existing literal> })`
- `scanner-service/src/scanner.ts` - `ScanPageOptions.userAgent`, same fallback pattern in `b.newContext(...)`
- `scanner-service/src/design-prompt.ts` (new) - dependency-free `buildDesignAnalysisPrompt(domain)`, carries the CMP-17 instruction, shared-path comment naming CMP-17/D-13
- `scanner-service/src/ai.ts` - imports and calls `buildDesignAnalysisPrompt(domain)` in `generateDesignAnalysis()` in place of the inline template literal
- `lib/scanner-design-prompt.test.ts` (new) - 4 assertions covering domain interpolation, no-profiling instruction, unchanged dimensions/JSON instruction, and paragraph ordering
- `docs/legal/lia/LIA-v1.md` - appended addendum recording the CMP-17 control, its implementation file, and its test

## Decisions Made
- LIA-v1.md was extended via an appended addendum, not a body rewrite, because the document's own header states it is "never edited once committed (D-11)" and migration 015 registers a sha256 `content_hash` for the v1 file in `lia_versions`. No code currently reads or verifies that hash (confirmed via `grep -rn "content_hash\|lia_versions" app lib scanner-service` — no matches), so nothing broke, but the addendum does change the file's bytes. This is flagged below for a follow-on decision, not resolved here, per the plan's explicit instruction not to touch the `lia_versions` table in this plan.
- `prospectId` is destructured and logged in the capacity-refusal log line only; it is not otherwise used, matching the plan's "accepted and logged only" instruction and keeping the scanner service ignorant of the `prospects` table.

## Deviations from Plan

None - plan executed exactly as written. The one open item (LIA versioning) is explicitly called out as a flag in the plan's own action text, not a deviation from it.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**For plan 04-03 (scan-queue and bulk-scan-dispatch libraries):**
- The `full-async` request body now accepts `source?: "bulk"`, `userAgent?: string`, `prospectId?: string`. 04-03's dispatch library should send `source: "bulk"`, the constant `BULK_USER_AGENT` from `lib/bulk-scan-constants.ts` (04-01), and the claimed prospect's id as `prospectId` when calling the scanner service's `full-async` endpoint.
- A `503 { error: "At capacity", retryAfterSeconds }` response is the expected/designed refusal shape when the bulk ceiling (`MAX_TOTAL_FULL_SCANS - RESERVED_FOR_PUBLIC` = 2 by current constants) is reached. 04-03's dispatch/requeue logic should treat a 503 here as "leave this prospect queued, retry later" rather than a hard failure — `retryAfterSeconds` (currently 30) is the advertised backoff.
- The scanner service does **not** write to `prospects` — status write-back (scan_status, scan_attempts, etc.) stays entirely on the Next.js side, reconciled via the existing `/internal/scan-complete` webhook or equivalent, as already anticipated by 04-01's migration 017.
- `buildDesignAnalysisPrompt()` is now the single source of the design-analysis prompt for **both** public and bulk scans — no action needed from 04-03, but worth knowing bulk scans get the same no-profiling behavior for free.
- Full verification run for this plan: `npx vitest run` → 175/175 tests pass across 20 files; `npx tsc --noEmit -p scanner-service/tsconfig.json` and `npm --prefix scanner-service run build` both succeed.

## Self-Check: PASSED

- FOUND: scanner-service/src/design-prompt.ts
- FOUND: lib/scanner-design-prompt.test.ts
- FOUND: commit db9795a (Task 1)
- FOUND: commit bb8aaf2 (Task 2 RED)
- FOUND: commit 8ab5066 (Task 2 GREEN)
- FOUND: commit 2fef226 (Task 3)

---
*Phase: 04-bulk-scan-queue*
*Completed: 2026-07-21*
