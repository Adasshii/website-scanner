---
phase: 07-lifecycle-reporting-retention
plan: 09
subsystem: shortlist, booking-attribution
tags: [supabase, postgrest, chunking, booking, gap-closure]

# Dependency graph
requires:
  - phase: 07-lifecycle-reporting-retention
    provides: "lib/retention.ts's chunkIds()/RETENTION_ID_CHUNK_SIZE (07-06) — the fix pattern this plan reuses via a new shared module rather than an import of the retention module itself"
provides:
  - "lib/chunk-ids.ts — the one dependency-free chunking helper this codebase has, imported by lib/retention.ts and lib/triage-candidates.ts"
  - "getShortlist() with a chunked outreach lookup, safe past the ~711-row PostgREST URL-length threshold this phase already hit once"
  - "attributeBookingToProspect() deciding ambiguity from the full post-gate candidate set instead of a 2-row query cap"
affects: [07-lifecycle-reporting-retention-plan-10]

tech-stack:
  added: []
  patterns:
    - "shared, dependency-free chunking helper (lib/chunk-ids.ts) instead of exporting a pure function from a module with side effects (lib/retention-constants.ts resolves RETENTION_MODE and can console.warn at module scope) — two call sites, one implementation, zero coupling"
    - "accumulate-then-sort before a last-write-wins pass — chunked query results are pushed into one flat array across all chunks, then globally re-sorted by created_at ascending, only then reduced into draftedIds/latestOutreachStatus, so per-chunk ordering can never silently substitute for global ordering"

key-files:
  created:
    - lib/chunk-ids.ts
    - lib/chunk-ids.test.ts
  modified:
    - lib/retention.ts
    - lib/triage-constants.ts
    - lib/triage-candidates.ts
    - lib/triage-candidates.integration.test.ts
    - lib/booking-attribution.ts
    - app/api/webhooks/fillout/route.integration.test.ts

key-decisions:
  - "chunkIds() lives in a new, dependency-free lib/chunk-ids.ts rather than being exported from lib/retention.ts — importing the retention module into the admin Shortlist read path would run RETENTION_MODE's module-scope config resolution (and its possible console.warn) on every Shortlist load for no reason"
  - "SHORTLIST_ID_CHUNK_SIZE (150) is a separate constant from RETENTION_ID_CHUNK_SIZE, both equal to 150 today but intentionally not the same symbol, so the two surfaces can be tuned apart later without an import coupling them"
  - "getShortlist()'s chunked outreach rows are accumulated into one flat array across all chunk queries, then sorted by created_at ascending globally, before draftedIds/latestOutreachStatus are built from a single pass — never incrementally inside the chunk loop, per the plan's explicit instruction not to shortcut this"
  - "attributeBookingToProspect()'s two candidate lookups (email-exact, domain-fallback) drop their .limit(2) cap entirely rather than raising it to a larger number — ambiguity is decided by the post-sent-gate set size (gatedIds.size), so a fixed cap of any size reintroduces the same class of bug at a higher threshold"
  - "The now-uncapped candidate query is accepted as unchunked (T-07-09-03, disposition: accept) — bounded in practice by the number of prospects sharing one mailbox address, a handful at this project's 10-50/week scale, well under SHORTLIST_ID_CHUNK_SIZE; the header comment states this bound honestly rather than pretending none exists"

patterns-established:
  - "A pure helper shared across an admin read path and a background job's write path gets its own dependency-free module rather than being exported from whichever module wrote it first — the cost of one extra file buys zero accidental config coupling"

requirements-completed: []  # 07-10 owns the closure call per this plan's own <output> instruction

coverage:
  - id: D1
    description: "getShortlist()'s outreach lookup issues its .in(\"prospect_id\", ...) filter in bounded chunks (SHORTLIST_ID_CHUNK_SIZE=150), proven complete and correct past the chunk boundary"
    requirement: TRK-01
    verification:
      - kind: unit
        ref: "lib/chunk-ids.test.ts — 5 tests: empty input, below/at/above chunk-size boundary, concatenation-reproduces-input property"
        status: pass
      - kind: integration
        ref: "lib/triage-candidates.integration.test.ts — 2 new tests: completeness across SHORTLIST_ID_CHUNK_SIZE+5 rows with correct has_outreach_draft/stage; a single prospect's newest-of-two-rows stage resolution holds with the fixture set spanning multiple chunk queries"
        status: pass
    human_judgment: false
  - id: D2
    description: "There is one chunking implementation in this codebase, not two — lib/retention.ts and lib/triage-candidates.ts both import the same lib/chunk-ids.ts, which reads no environment variable"
    requirement: TRK-01
    verification:
      - kind: unit
        ref: "grep -v '^\\s*[/*]' lib/retention.ts | grep -c 'function chunkIds' -> 0; grep -v '^\\s*[/*]' lib/chunk-ids.ts | grep -c 'process.env' -> 0 and 'import' -> 0; grep -v '^\\s*[/*]' lib/triage-candidates.ts | grep -c 'retention' -> 0"
        status: pass
      - kind: integration
        ref: "lib/retention.integration.test.ts — 39/39 unchanged from 07-08, proving the chunkIds() move was behaviour-neutral for retention"
        status: pass
    human_judgment: false
  - id: D3
    description: "attributeBookingToProspect() decides ambiguity from the full candidate set, not a pre-gate cap — 3+ prospects sharing contact_email resolve to the correct sent-gated prospect, or to ambiguous, never to a wrong or silently missed attribution"
    requirement: TRK-04
    verification:
      - kind: integration
        ref: "app/api/webhooks/fillout/route.integration.test.ts — 4 new 3-candidate cases: 1-gated attributes correctly (both halves asserted — winner booked, other two null), 2-gated is ambiguous (all three null), 0-gated is no_sent_outreach (all three null), step-1-never-falls-through-to-step-2 with a fourth domain-only sent-gated prospect left unbooked"
        status: pass
      - kind: unit
        ref: "grep -v '^\\s*[/*]' lib/booking-attribution.ts | grep -c 'limit' -> 0; grep -c 'single\\|maybeSingle' -> 0 (still array queries, FA-TRK-04's original guard); git diff shows the sent-gate query, gatedIds, and the three outcome branches unchanged"
        status: pass
    human_judgment: false
  - id: D4
    description: "The Fillout webhook still returns 200 and still updates leads when attribution throws — D-7-09 fire-and-forget guarantee unchanged and re-proven"
    requirement: TRK-04
    verification:
      - kind: integration
        ref: "app/api/webhooks/fillout/route.integration.test.ts — the existing D-7-09 failure-injection describe (3 tests: async reject, sync throw, unmocked regression guard) passes unchanged"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full suite green, no regressions to CMP-13/14/15's retention coverage or the reporting-gate backstop"
    verification:
      - kind: automated
        ref: "npx vitest run -> 474/474 across 42 files; app/admin/reporting-gate.test.tsx -> 10/10; npx tsc --noEmit -> 0 output; npm run build -> succeeds"
        status: pass
    human_judgment: false

duration: ~45min
completed: 2026-08-02
status: complete
---

# Phase 7 Plan 09: WR-01/WR-02 Gap Closure Summary

**`getShortlist()`'s outreach lookup now chunks its `.in()` filter through a new dependency-free `lib/chunk-ids.ts`, and `attributeBookingToProspect()` decides ambiguity from the full post-gate candidate set instead of a 2-row cap — 07-REVIEW.md's WR-01 and WR-02 are both closed by this plan.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-08-02
- **Tasks:** 2 (both `type="auto" tdd="true"`)
- **Files modified:** 2 new, 6 modified

## Accomplishments

- Closed **WR-02**: `getShortlist()`'s previously-unbounded `.in("prospect_id", ids)` outreach lookup — the same query shape that overflowed PostgREST's URL length limit at 711 rows in `lib/retention.ts` (plan 07-06) — now issues that filter in `SHORTLIST_ID_CHUNK_SIZE` (150) chunks.
- Extracted `chunkIds()` out of `lib/retention.ts` into a new, dependency-free `lib/chunk-ids.ts` (moved verbatim, unit-tested), so both call sites share one implementation without the admin read path importing `lib/retention-constants.ts`'s `RETENTION_MODE` config resolution.
- Fixed the cross-chunk correctness hazard the plan flagged explicitly: chunked outreach rows are accumulated into one flat array across every chunk query, then globally re-sorted by `created_at` ascending, and only then reduced into `draftedIds`/`latestOutreachStatus` in a single last-write-wins pass — never built incrementally inside the chunk loop.
- Closed **WR-01**: both `attributeBookingToProspect()` candidate lookups (email-exact, domain-fallback) dropped their `.limit(2)` cap. Ambiguity is now decided entirely by the post-sent-gate candidate set (`gatedIds.size`), proven at 3 candidates (1-gated, 2-gated, 0-gated, and a no-fallthrough case) that the previous 2-row cap could never reach.
- Both fixes are proven by integration tests that exercise the real, previously-unreachable code paths — not by inspection.

## Task Commits

1. **Task 1: One shared chunking helper, and a chunked `getShortlist()`** — `47df1ba` (test)
2. **Task 2: Decide booking ambiguity from the full candidate set, not from a query cap** — `a0fa475` (fix)

**Plan metadata:** committed alongside this SUMMARY

## Files Created/Modified

- `lib/chunk-ids.ts` (new) — the one exported `chunkIds()` function this codebase has now, moved verbatim from `lib/retention.ts`. Imports nothing, reads no environment variable.
- `lib/chunk-ids.test.ts` (new) — 5 unit tests covering the empty/below/at/above chunk-size boundary and the concatenation-reproduces-input property.
- `lib/retention.ts` — local `chunkIds()` definition removed, now imports the shared one. No other change; behaviour-neutral (`lib/retention.integration.test.ts` stayed at 39/39).
- `lib/triage-constants.ts` — added `SHORTLIST_ID_CHUNK_SIZE = 150`, a separate tunable from `RETENTION_ID_CHUNK_SIZE`.
- `lib/triage-candidates.ts` — `getShortlist()`'s single unbounded `outreachRows` query replaced with a loop over `chunkIds(...)`, accumulating into one array, sorted by `created_at` ascending before the `draftedIds`/`latestOutreachStatus` reduction.
- `lib/triage-candidates.integration.test.ts` — new `seedManyTriagedProspects()` bulk-insert fixture helper; 2 new tests crossing `SHORTLIST_ID_CHUNK_SIZE`.
- `lib/booking-attribution.ts` — both candidate queries' `.limit(2)` removed; header comment rewritten to describe the unbounded queries, the post-gate ambiguity decision, and the accepted (unchunked, honestly bounded) candidate-set size.
- `app/api/webhooks/fillout/route.integration.test.ts` — 4 new 3-candidate cases (1-gated, 2-gated, 0-gated, no-fallthrough-to-domain-step).

## Decisions Made

- `chunkIds()` hosted in its own dependency-free module rather than exported from `lib/retention.ts` — see `key-decisions` in frontmatter for the full reasoning (avoids coupling the admin Shortlist load to `RETENTION_MODE`'s module-scope resolution).
- `SHORTLIST_ID_CHUNK_SIZE` kept as a distinct constant from `RETENTION_ID_CHUNK_SIZE`, both `150` today, so the two surfaces can diverge later without an import coupling them.
- The accumulate-then-globally-sort shape for `getShortlist()`'s chunked outreach rows, implemented exactly as the plan's `<action>` specified — not shortcut with an incremental per-chunk build, even though under this specific chunking-by-prospect-id partition a single prospect's rows can never actually straddle two chunks (each prospect id belongs to exactly one chunk by construction). The sort is defensive, cheap, and matches both the plan's explicit instruction and the threat register's T-07-09-05 mitigation; it is correct regardless of how the chunking strategy might change later.
- `attributeBookingToProspect()`'s two candidate queries dropped their cap entirely (not raised to a higher fixed number) — any fixed cap reintroduces WR-01's class of bug at a different threshold; the real bound (post-gate set size) already lives in the existing `gatedIds.size` logic, untouched by this plan.
- The now-unbounded candidate query's own DoS exposure (T-07-09-03) is accepted, not mitigated with chunking, and the header comment states the honest bound (a handful of rows sharing one mailbox address, well under `SHORTLIST_ID_CHUNK_SIZE`) so the next reader finds the reasoning rather than a bare removal.

## Deviations from Plan

None — plan executed exactly as written for both tasks. The `<assumptions>` note about `prospects.domain`'s partial unique index limiting the domain step to at most one row (making that half of the cap removal inert today) held; both `.limit(2)` calls were still removed per the plan's explicit instruction, for symmetry and to remove the argument the next reader would otherwise have to re-derive.

## Issues Encountered

None. Local Supabase was already running against `127.0.0.1:54321` with migrations 001-019 applied; both integration test files' module-scope env-var overrides were confirmed present before running them, per each task's `<precondition>`. No `test-reporting-agg-*` duplicate-key errors occurred during any full-suite run.

## User Setup Required

None. No migration, no new environment variable, no manual step. Both fixes are pure application-code changes.

## Next Phase Readiness

- **07-REVIEW.md's WR-01 and WR-02 are both closed** by this plan, proven by tests that fail against the unfixed code (a 2-row-cap regression or an unchunked query would fail the new integration cases) rather than by inspection.
- **WR-03** (`prospect_sources` anonymise gap) was already closed by plan 07-08 (FA-CMP-13-SOURCES, `B-delete-source-rows`) — unaffected by this plan.
- CMP-13/CMP-14 remain **not** marked complete in this plan's frontmatter, per this plan's own `<output>` instruction — plan 07-10 owns that call. The remaining open item is unchanged: the production deploy + live cron confirmation + authenticated dry-run read + SQL cross-check that 07-07's Task 3 never performed.
- No new artifacts, decisions, or open questions block plan 07-10 from proceeding.

---
*Phase: 07-lifecycle-reporting-retention*
*Completed: 2026-08-02*

## Self-Check: PASSED

All created files and commit hashes verified present on disk / in git log.
