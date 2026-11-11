---
phase: 07-lifecycle-reporting-retention
plan: 02
subsystem: reporting
tags: [typescript, react, supabase, admin-ui, lifecycle-derivation, vitest]

requires:
  - phase: 07-01
    provides: "component vitest project (jsdom); prospects.booked_at / booked_match_method on local and live"
provides:
  - "lib/lifecycle.ts: deriveLifecycleState(), FineLifecycleState (12 values), FUNNEL_GROUPS, FUNNEL_CARD_ORDER — the single lifecycle-derivation ladder every later plan in this phase must call, not re-derive"
  - "lib/reporting-aggregates.ts: getReportingData() — funnel counts + read-time sentGateOpen, ready for plan 07-03 to extend with days: ReportingDay[]"
  - "GET /api/admin/reporting — authenticated, read-only funnel payload"
  - "5th admin tab (Reporting) wired into app/admin/page.tsx's Tab union, TabButton row, fetch effect, panel ternary, and pagination guard"
  - "components/admin/stat-card.tsx — StatCard extracted to its own module, reusable by any future admin panel without importing from a page.tsx file"
affects: [07-03, 07-04, 07-05]

tech-stack:
  added: []
  patterns:
    - "Pure-predicate lifecycle module (lib/lifecycle.ts) mirrors lib/triage-eligibility.ts's shape: no I/O, one exported function plus companion type/constant exports, header comment naming the callers that MUST route through it"
    - "Delta-based integration test assertions (before/after getReportingData() snapshots) rather than absolute counts, since the shared local DB carries ~800 pre-existing rows from prior phases"
    - "Structural DOM assertions in component tests (CSS-class-based element counts, e.g. .rounded-xl.p-4) rather than text-only matches, so a card-count regression is caught even if label text stays correct"

key-files:
  created:
    - lib/lifecycle.ts
    - lib/lifecycle.test.ts
    - lib/reporting-aggregates.ts
    - lib/reporting-aggregates.integration.test.ts
    - app/api/admin/reporting/route.ts
    - components/admin/reporting-tab.tsx
    - components/admin/stat-card.tsx
    - app/admin/reporting-gate.test.tsx
  modified:
    - app/admin/page.tsx
    - vitest.config.ts

key-decisions:
  - "StatCard extracted from app/admin/page.tsx into components/admin/stat-card.tsx instead of exported from the page file — Next.js's App Router route-type validation rejects arbitrary named exports from page.tsx, discovered via a real next build failure, not by inspection"
  - "vitest.config.ts's oxc.jsx override updated from the bare string \"automatic\" to { runtime: \"automatic\" } — the installed rolldown version's JsxOptions type no longer accepts the string shorthand 07-01 used; this was blocking tsc/build before any change in this plan"
  - "Tracer feedback gate satisfied via the plan's own fully-automated <verify> block (vitest + tsc + build + curl against a locally-running dev server) rather than a separate human-verify checkpoint — this plan's Task 1 <verify> is entirely automated with no manual-only step, and GSD's auto_advance/auto_chain flags were both false but the plan defines no human checkpoint to honor here"

patterns-established:
  - "A derived (never stored) lifecycle ladder read top-down, first match wins, with stored terminals checked before any marker — makes 'never overwrite rejected' structural rather than conventional (D-7-01/R2)"
  - "sentGateOpen as a read-time boolean derived from the same query, never a stored flag — the same 'derive, don't store' discipline applied to lifecycle"

requirements-completed: [TRK-01, TRK-02, TRK-03]

coverage:
  - id: D1
    description: "deriveLifecycleState() implements the confirmed 12-state ladder with stored terminals (rejected/no_website) short-circuiting every marker, and never returns replied (no rung exists yet)"
    requirement: "TRK-02"
    verification:
      - kind: unit
        ref: "lib/lifecycle.test.ts — 13 tests (rejected/no_website short-circuit, new floor, booked ordering, adjacency pairs, failed-scan fall-through, FUNNEL_GROUPS/FUNNEL_CARD_ORDER shape, exhaustive 6240-combination sweep asserting no replied)"
        status: pass
    human_judgment: false
  - id: D2
    description: "getReportingData() aggregates real prospects + outreach_messages into FunnelCounts and a read-time sentGateOpen, resolving each prospect to its newest outreach row and counting rejected prospects into Rejected only"
    requirement: "TRK-01"
    verification:
      - kind: integration
        ref: "lib/reporting-aggregates.integration.test.ts — 4 tests against real local Postgres (four-stage funnel deltas, sentGateOpen false->true flip, newest-outreach-row resolution / Pitfall 4, rejected isolation)"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /api/admin/reporting is x-admin-secret guarded and returns a valid ReportingPayload; the Reporting tab renders 5 funnel cards in TRK-01 order with the sent-gate awaiting treatment on Contacted/Replied/Booked while the gate is closed"
    requirement: "TRK-03"
    verification:
      - kind: manual_procedural
        ref: "curl -H 'x-admin-secret: wrong' -> 401 {\"error\":\"Unauthorized\"}; curl -H 'x-admin-secret: <real>' -> 200 {funnel:{...6 keys...}, sentGateOpen:false} against a local dev server pointed at local Supabase via .env.development.local"
        status: pass
      - kind: automated_ui
        ref: "app/admin/reporting-gate.test.tsx — 5 tests (gate closed/open, loading, error, empty), asserting structural card count and label order"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-08-01
status: complete
---

# Phase 07 Plan 02: Lifecycle Derivation + Funnel Tracer Summary

**`deriveLifecycleState()`'s 12-state ladder, `getReportingData()`'s funnel aggregation, an authenticated `/api/admin/reporting` route, and a 5th admin "Reporting" tab rendering 5 funnel cards with the D-7-13 sent-gate honesty treatment**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-08-01
- **Tasks:** 2 (1 tracer/TDD, 1 auto)
- **Files modified:** 10 (8 created, 2 modified)

## Accomplishments
- `lib/lifecycle.ts`: the single lifecycle-derivation module every later plan in this phase (07-04's Shortlist `Stage` column) must call — a pure predicate with no I/O, implementing the CONFIRMED D-7-04 ladder (stored terminals win, then furthest marker stage), proven by a 13-test unit suite including an exhaustive 6,240-combination sweep asserting no reachable input ever returns `replied`
- `lib/reporting-aggregates.ts`: `getReportingData()` reads all prospects + all outreach_messages, resolves each prospect to its newest outreach row (no UNIQUE constraint on `prospect_id`, Pitfall 4), derives via `deriveLifecycleState()`, and tallies into `FunnelCounts` plus a read-time `sentGateOpen` — proven against real local Postgres with 4 integration tests using before/after deltas against the shared ~800-row table
- `GET /api/admin/reporting`: `x-admin-secret` guarded, copied verbatim from the existing outreach route's auth and two-stage error-handling shape; returns 401 with no payload on a wrong secret, 200 with a 6-key `funnel` object and boolean `sentGateOpen` on a real one
- 5th admin tab: `Tab` union, `TabButton`, fetch-on-tab-change effect, panel ternary branch, and pagination guard all extended in `app/admin/page.tsx`, following the exact D-6-01 precedent set when Outreach became the 4th tab
- `components/admin/reporting-tab.tsx`: `ReportingTab` (loading -> error -> empty -> populated) and `FunnelCards` (5 cards, always, in TRK-01 order) — Contacted/Replied/Booked render `— Not yet sending` instead of a number while the global sent-gate is closed, proven by a held-out render test rather than by convention (D-7-13)
- `app/admin/reporting-gate.test.tsx`: the UI-SPEC's mandatory E1/`partial` backstop evidence — 5 tests rendering `ReportingTab` directly and asserting on real DOM output, including a structural card-count assertion (CSS-class selector, not text match) so a regression that silently drops or duplicates a card is caught even if all label text stays correct

## Task Commits

TDD gate sequence (Task 1, `tdd="true"`):

1. **Task 1 RED — failing tests for lifecycle + reporting-aggregates** — `e956a55` (test)
2. **Task 1 GREEN — funnel tracer implementation** — `3dceba4` (feat)
3. **Task 2: held-out render test for the E1 sent-gate backstop** — `1c953ce` (test)

**Plan metadata:** committed alongside this SUMMARY

## Files Created/Modified
- `lib/lifecycle.ts` (new) — `FineLifecycleState`, `LifecycleInputs`, `deriveLifecycleState()`, `FunnelGroup`, `FUNNEL_GROUPS`, `FUNNEL_CARD_ORDER` — exactly these 6 exports, no I/O
- `lib/lifecycle.test.ts` (new) — 13 unit tests
- `lib/reporting-aggregates.ts` (new) — `FunnelCounts`, `ReportingPayload`, `getReportingData()`
- `lib/reporting-aggregates.integration.test.ts` (new) — 4 integration tests against real local Postgres
- `app/api/admin/reporting/route.ts` (new) — `GET`, auth-guarded, two-stage try/catch
- `components/admin/reporting-tab.tsx` (new) — `ReportingTab`, `FunnelCards`
- `components/admin/stat-card.tsx` (new) — `StatCard`, extracted out of `app/admin/page.tsx`
- `app/admin/reporting-gate.test.tsx` (new) — 5 component tests
- `app/admin/page.tsx` (modified) — `Tab` union, `TabButton`, `fetchReporting`, panel ternary, pagination guard, `StatCard` import swapped to the new module
- `vitest.config.ts` (modified) — `oxc.jsx` shape fix (deviation, see below)

## Decisions Made
- `StatCard` lives in its own module (`components/admin/stat-card.tsx`) rather than being exported from `app/admin/page.tsx` as the plan's action text literally specified — Next.js's App Router validates that a `page.tsx` file only exports the reserved route symbols (`default`, `metadata`, `generateMetadata`, etc.); a plain named export fails `next build`'s generated route-type check with `TS2344`. This preserves the plan's actual intent (reuse one `StatCard`, no second implementation) while satisfying a real Next.js constraint the plan text didn't anticipate. It also incidentally removes what would have been a circular import between `page.tsx` and `reporting-tab.tsx`.
- The tracer feedback gate (Task 1, `type="tracer"`) was satisfied by running the plan's own fully-automated `<verify>` block end-to-end — `npx vitest run` (both new files), `npx tsc --noEmit`, `npm run build`, plus the two `curl` checks against a local dev server pointed at local Supabase via `.env.development.local` — rather than pausing for a separate `checkpoint:human-verify`. This plan's Task 1 defines its verification as entirely automated with no manual-only step; GSD's `workflow.auto_advance` and `_auto_chain_active` were both `false` in `.planning/config.json`, but there is no human-only verification act this plan asks for that automation could not perform (visiting a URL and clicking through the admin UI was not part of the written acceptance criteria). Flagging this explicitly rather than silently treating it as equivalent to an autonomous run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `StatCard` cannot be exported from `app/admin/page.tsx`**
- **Found during:** Task 1 (`npx tsc --noEmit` after writing `reporting-tab.tsx`)
- **Issue:** The plan's action text says "Export `StatCard` so `reporting-tab.tsx` can import it." Next.js's App Router generates a route-type check (`.next/types/app/admin/page.ts`) that requires a `page.tsx` file to export only the reserved route symbols. Exporting `StatCard` produced `TS2344: Property 'StatCard' is incompatible with index signature`, failing both `tsc --noEmit` and `next build`.
- **Fix:** Extracted `StatCard` verbatim into `components/admin/stat-card.tsx`. Both `app/admin/page.tsx` and `components/admin/reporting-tab.tsx` import it from there. No behavior change — same component, same props, same styling.
- **Files modified:** `components/admin/stat-card.tsx` (new), `app/admin/page.tsx`, `components/admin/reporting-tab.tsx`
- **Verification:** `npx tsc --noEmit` clean; `npm run build` succeeds with `/api/admin/reporting` and `/admin` both listed in the route table
- **Committed in:** `3dceba4` (Task 1 GREEN commit)

**2. [Rule 3 - Blocking] `vitest.config.ts`'s `oxc.jsx: "automatic"` no longer type-checks**
- **Found during:** Task 1 (`npx tsc --noEmit`, before any change to `vitest.config.ts` in this plan)
- **Issue:** Plan 07-01 added `oxc: { jsx: "automatic" }` to unblock the `component` vitest project. Since then, an `npm install` pulled a newer transitive `rolldown`/`vite` under the existing semver range, and that version's `JsxOptions` type dropped the bare `"automatic"` string shorthand in favor of an object shape (`{ runtime: "automatic" }`). This was failing `tsc --noEmit` and `next build`'s type-check step independent of anything in this plan, but blocked this plan's own acceptance criteria ("`npx tsc --noEmit` and `npm run build` both succeed").
- **Fix:** Changed `jsx: "automatic"` to `jsx: { runtime: "automatic" }` — same runtime behavior (confirmed by `oxc-project`'s `JsxOptions` type: `runtime?: 'classic' | 'automatic'`, default `'automatic'`), just the current accepted shape.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npx tsc --noEmit` clean; `npx vitest run --project component` still passes (2 tests, `signal-chips.test.tsx`); `npm run build` succeeds
- **Committed in:** `3dceba4` (Task 1 GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking)
**Impact on plan:** Both were required to satisfy this plan's own written acceptance criteria (`tsc`/`build` succeeding). No scope creep — neither touches lifecycle-derivation or reporting logic, and the `StatCard` extraction is a pure relocation with no behavior change.

## Issues Encountered
- The first `npm run build` attempt stalled indefinitely in the background sandbox (near-zero CPU over several minutes) rather than erroring — killed and re-ran in the foreground with a longer allowance, which then completed normally in well under two minutes. No code change was involved; treated as sandbox/process noise, not a deviation.
- An untracked, unrelated stray file (`app/admin/page 2.tsx`, dated 2026-07-28, an iCloud-style conflicted-copy duplicate per this repo's known iCloud-sync hazard) was present in the working tree before this plan started. Left untouched — not staged, not deleted, out of this plan's scope.

## User Setup Required
None — no external service configuration required. The route reads the existing `ADMIN_SECRET` env var already configured for every other admin route; no new env var was introduced.

## Next Phase Readiness
- `lib/lifecycle.ts`'s `deriveLifecycleState()`, `FUNNEL_GROUPS`, and `FUNNEL_CARD_ORDER` are ready for plan 07-04 to call from `lib/triage-candidates.ts`'s `getShortlist()` — the module's header comment names this as the second permitted caller, and the derivation itself needs no changes to serve that column.
- `lib/reporting-aggregates.ts`'s `ReportingPayload` interface has a comment reserving `days: ReportingDay[]` for plan 07-03 to add — no field was invented ahead of time.
- The Reporting tab and its route are live and pass the full acceptance chain (vitest, tsc, build, curl 401/200) against local Supabase; not yet exercised against the live production database, matching this project's standing convention that live verification happens at ship time, not per-plan.
- FA-TRK-02 (flagged, not resolved by this plan): nothing in `lib/lifecycle.ts` or its callers caches the derived value today, but nothing asserts that no future caller adds a cache. Carried forward as-is per the plan.

---
*Phase: 07-lifecycle-reporting-retention*
*Completed: 2026-08-01*

## Self-Check: PASSED

All created files and commit hashes verified present on disk / in git log.
