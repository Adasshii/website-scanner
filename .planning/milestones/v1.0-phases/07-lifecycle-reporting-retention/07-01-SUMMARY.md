---
phase: 07-lifecycle-reporting-retention
plan: 01
subsystem: testing
tags: [vitest, jsdom, testing-library, react, postgres, migration, supabase]

requires: []
provides:
  - "component vitest project (jsdom) proven with a real render+assert test"
  - "prospects.booked_at and prospects.booked_match_method on both local and live databases"
affects: [07-02, 07-03, 07-05]

tech-stack:
  added: [jsdom, "@testing-library/react", "@testing-library/dom"]
  patterns:
    - "vitest projects: unit (node) / integration (node, serial) / component (jsdom) — split by *.test.tsx vs *.test.ts vs *.integration.test.ts globs"
    - "oxc jsx override (test-only) needed because tsconfig.json's jsx: preserve otherwise leaves .tsx unparsed for the rolldown/oxc-based Vite transform"
    - "guarded do $$ / pg_constraint block for idempotent CHECK constraints (Postgres has no ADD CONSTRAINT IF NOT EXISTS)"

key-files:
  created:
    - components/admin/signal-chips.test.tsx
    - supabase/migrations/019_add_booked_at_to_prospects.sql
  modified:
    - package.json
    - vitest.config.ts

key-decisions:
  - "Three dev-only test dependencies added under an explicit human npm-legitimacy gate, since 07-RESEARCH.md's zero-new-package claim was stale"
  - "Local migration applied via `supabase migration up`, not `supabase db reset`, to preserve 407 existing prospect rows used as integration-test data"

patterns-established:
  - "Component tests import cleanup from @testing-library/react and call it in an explicit afterEach — the component vitest project runs with globals: false, so RTL's automatic cleanup never registers"

requirements-completed: [TRK-03, TRK-04]

coverage:
  - id: D1
    description: "component vitest project renders a real React component (SignalChips) and asserts on DOM text output; unit project provably excludes *.test.tsx"
    requirement: "TRK-03"
    verification:
      - kind: unit
        ref: "npx vitest run --project component (components/admin/signal-chips.test.tsx) — 2 tests"
        status: pass
      - kind: unit
        ref: "npx vitest run --project unit — 0 .test.tsx files collected"
        status: pass
      - kind: unit
        ref: "npx vitest run (all three projects) — 33 files, 350 tests"
        status: pass
    human_judgment: false
  - id: D2
    description: "prospects.booked_at and prospects.booked_match_method exist on both local and live Postgres, with a CHECK constraint restricting booked_match_method to email|domain, and the migration is idempotent"
    requirement: "TRK-04"
    verification:
      - kind: manual_procedural
        ref: "Supabase Dashboard SQL Editor (live) — information_schema.columns returned 2 rows (booked_at timestamptz, booked_match_method text); pg_constraint returned prospects_booked_match_method_check"
        status: pass
      - kind: manual_procedural
        ref: "local 127.0.0.1:54322 via `supabase migration up` — both columns present with correct types, constraint present, idempotent re-apply produced only NOTICE already-exists lines, rolled-back transaction confirmed 'phone' rejected and 'domain' accepted"
        status: pass
    human_judgment: true
    rationale: "Live DDL is applied by hand through the Supabase Dashboard by this project's standing convention (STATE.md:109, STATE.md:144) — no CLI push path exists to automate or re-verify this from the executor."

duration: ~40min (checkpoint-gated across two human gates)
completed: 2026-08-01
status: complete
---

# Phase 07 Plan 01: Test Infrastructure + Migration 019 Summary

**Third `component` vitest project (jsdom + Testing Library) proven with a real `SignalChips` render test, plus `prospects.booked_at`/`booked_match_method` (D-7-07) applied and verified on both local and live Postgres**

## Performance

- **Duration:** ~40 min (two blocking human gates: package-legitimacy approval, live-migration application)
- **Completed:** 2026-08-01
- **Tasks:** 4 (1 checkpoint:human-verify, 2 auto, 1 checkpoint:human-action)
- **Files modified:** 4 code files (`package.json`, `package-lock.json`, `vitest.config.ts`, `components/admin/signal-chips.test.tsx`) + 1 new migration file

## Accomplishments
- Stood up the `component` vitest project (`environment: "jsdom"`, `include: ["**/*.test.tsx"]`) as the third leg alongside `unit` and `integration`, with the matching exclude added to `unit` so no `.test.tsx` file is ever collected under `environment: "node"`
- Wrote `components/admin/signal-chips.test.tsx` as a real, kept component test — not a throwaway smoke file — asserting the `No HTTPS` and `Unreachable` chip labels render from a `TriageScore` fixture
- Authored `supabase/migrations/019_add_booked_at_to_prospects.sql`: additive `booked_at`/`booked_match_method` columns, a guarded `do $$ / pg_constraint` CHECK constraint (`email`/`domain` only), and a partial index — zero references to `lifecycle_state`, per D-7-01
- Migration applied and verified on both databases: live via the Supabase Dashboard SQL Editor (this project's standing convention), local via `supabase migration up` to preserve existing prospect data

## Task Commits

1. **Task 1: Package legitimacy gate** — no commit (human-verify checkpoint; approved by Joshua after reviewing all three npmjs.com pages)
2. **Task 2: Add the `component` vitest project and prove it renders** - `53703a6` (feat)
3. **Task 3: Write migration 019** - `77685a3` (feat)
4. **Task 4: Apply migration 019 to local and live databases** — no code commit (human-action checkpoint; applied by Joshua/coordinator, not by the executor)

**Plan metadata:** committed alongside this SUMMARY

## Files Created/Modified
- `package.json` / `package-lock.json` — added `jsdom`, `@testing-library/react`, `@testing-library/dom` as devDependencies (dev-only, never shipped)
- `vitest.config.ts` — added `COMPONENT_GLOB`, the third `component` project entry, the matching exclude on `unit`, and a test-only `oxc.jsx: "automatic"` override
- `components/admin/signal-chips.test.tsx` (new) — the held-out render-output test the 07-UI-SPEC backstop rows require
- `supabase/migrations/019_add_booked_at_to_prospects.sql` (new) — D-7-07's additive columns, now applied to both databases

## Decisions Made
- Three dev-only test dependencies (`jsdom`, `@testing-library/react`, `@testing-library/dom`) were added under an explicit human npm-legitimacy approval gate rather than treated as pre-cleared, since `07-RESEARCH.md`'s "zero new npm packages" audit was stale by the time `07-PATTERNS.md` Q5 confirmed the UI-SPEC's two backstop rows required DOM test tooling this repo did not have.
- The local migration was applied via `supabase migration up` rather than `supabase db reset`, to preserve 407 existing prospect rows as integration-test data. Local Supabase currently requires `npx supabase start --ignore-health-check` to start on this machine (Docker health-check contention under low free memory) — later plans in this phase depend on the local stack being up, so this is worth carrying forward rather than rediscovering per-plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Overrode oxc's JSX transform for the component vitest project**
- **Found during:** Task 2 (component vitest project setup)
- **Issue:** `tsconfig.json` sets `"jsx": "preserve"` (Next.js does its own JSX transform at build time). This project's Vite (8.1.5, rolldown/oxc-based) reads that same tsconfig and also left `.tsx` untransformed, crashing the "component" project's parser on the very first test file (`RolldownError: Unexpected JSX expression`). An initial attempt to fix via `esbuild: { jsx: "automatic" }` silently no-oped ("Both esbuild and oxc options were set. oxc options will be used").
- **Fix:** Set `oxc: { jsx: "automatic" }` at the root of `vitest.config.ts` instead. Test-only — `next build` never reads this file, so the production JSX transform is unaffected.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npx vitest run --project component` — 1 file, 2 tests passed
- **Committed in:** `53703a6` (Task 2 commit)

**2. [Rule 2 - Missing Critical, stale plan assumption] Package-legitimacy claim in 07-RESEARCH.md corrected**
- **Found during:** Task 1 (package legitimacy gate)
- **Issue:** `07-RESEARCH.md` § Package Legitimacy Audit stated this phase installs zero new npm packages. `07-PATTERNS.md` Q5 established the UI-SPEC's two mandatory backstop component-test rows require DOM test tooling not installed anywhere in the repo, contradicting that audit.
- **Fix:** Treated all three packages (`jsdom`, `@testing-library/react`, `@testing-library/dom`) as `[ASSUMED]` per the plan's own fallback policy — ran a registry-metadata check (repository URL, maintainers, publish date) as a research aid, then held the blocking-human checkpoint for Joshua's explicit npmjs.com review before installing. Never auto-approved.
- **Files modified:** `package.json`, `package-lock.json`
- **Verification:** All three repository URLs matched exactly what the plan's `<how-to-verify>` expected; Joshua approved after independent review.
- **Committed in:** `53703a6` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing-critical/stale-assumption correction)
**Impact on plan:** Both were necessary to complete Task 2 as specified; no scope creep. The stale RESEARCH claim is now superseded by this SUMMARY as the source of truth for this phase's dependency footprint.

## Issues Encountered
- Local Supabase failed to restart cleanly during migration application: Docker couldn't kill the DB container during a `supabase db reset` attempt, and two subsequent `supabase start` runs rolled back on `LegacyHealthCheckTimeoutError` (contention from low host memory, not a broken service). Resolved with `npx supabase start --ignore-health-check`; `supabase_db` and `supabase_rest` came up healthy. Joshua/the coordinator applied and verified the migration locally via `supabase migration up` — not run by this executor.
- Joshua's first live-migration attempt pasted the file *path* into the SQL Editor instead of its contents, failing with `42601 syntax error at or near "supabase"`. Nothing executed on that attempt (no partial state); the successful run was a clean first application of the actual DDL.

## User Setup Required
None further — the one external-service step this plan required (Task 4, applying migration 019 to the live database through the Supabase Dashboard SQL Editor) is complete and verified.

## Next Phase Readiness
- `deriveLifecycleState()` (plan 07-02) can now read `prospects.booked_at` against a live column that actually exists — the false-positive verification gap this plan existed to close (`npm run build`/`tsc` passing while `/api/admin/reporting` 500s in production) is closed.
- The `component` vitest project is available for any later plan in this phase needing a render-output test (07-UI-SPEC's backstop rows).
- Local Supabase needs `npx supabase start --ignore-health-check` on this machine until host memory pressure is resolved — worth a one-line heads-up to whichever plan next needs the local stack up.

---
*Phase: 07-lifecycle-reporting-retention*
*Completed: 2026-08-01*

## Self-Check: PASSED

All created files and commit hashes verified present on disk / in git log.
