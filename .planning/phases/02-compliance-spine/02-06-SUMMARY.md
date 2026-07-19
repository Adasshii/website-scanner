---
phase: 02-compliance-spine
plan: 06
subsystem: compliance
tags: [supabase, cli, tsx, node-util-parseargs, suppression, legal-basis]

# Dependency graph
requires:
  - phase: 02-compliance-spine (02-01)
    provides: lib/suppression.ts (liftSuppression, isSuppressed)
  - phase: 02-compliance-spine (02-02)
    provides: legal_regimes + lia_versions tables (migration 015)
provides:
  - scripts/suppression-override.ts — the only path that can re-enable contact for a suppressed address (CMP-06)
  - scripts/legal-basis.ts — domain-or-email -> country -> legal regime -> current LIA version + suppression status (CMP-08, CMP-16)
affects: [phase-3-admin-ui, send-phase-legal-basis-stamping]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CLI DI-seam shape mirrored from scripts/import-prospects.ts: usage string, strict parseArgs, fail-closed *ArgsError, exported parse*Args/run*/runCli, defaultDeps + injectable Deps interface"
    - "legal-basis.ts exposes lookupProspect/lookupLegalRegime/lookupLiaVersion as injectable functions (not raw Supabase chain mocks) so tests stub behavior directly, same DI ergonomics as upsertOverturePlace"

key-files:
  created:
    - scripts/suppression-override.ts
    - scripts/suppression-override.test.ts
    - scripts/legal-basis.ts
    - scripts/legal-basis.test.ts
  modified: []

key-decisions:
  - "suppression-override.ts only calls liftSuppression (update lifted_at/lifted_by_reason) — no .delete() anywhere in the file, enforced by a grep gate in acceptance criteria"
  - "legal-basis.ts resolves the country's regime exclusively via a legal_regimes query — no hardcoded country branch, enforced by a grep gate"
  - "legal-basis.ts domain-vs-email lookup order: domain match first (mirrors prospects' domain-as-identity model), falls back to contact_email match so no-website prospects still resolve"
  - "Suppression-status check for a domain-only lookup passes the domain string itself to isSuppressed() — its existing OR clause (email.eq OR domain.eq) already matches on domain, so no second suppression-lookup code path was needed"

requirements-completed: [CMP-06, CMP-08, CMP-16]

coverage:
  - id: D1
    description: "scripts/suppression-override.ts requires explicit --email + --reason, lifts (never deletes) the active suppression row, and prints what it did"
    requirement: "CMP-06"
    verification:
      - kind: unit
        ref: "scripts/suppression-override.test.ts#parseOverrideArgs / runCli / runOverride"
        status: pass
    human_judgment: false
  - id: D2
    description: "scripts/legal-basis.ts resolves a domain-or-email to country, legal regime, current LIA version, and suppression status in one output, with the regime always read from legal_regimes (no hardcoded country logic)"
    requirement: "CMP-08"
    verification:
      - kind: unit
        ref: "scripts/legal-basis.test.ts#runLegalBasis — NL fixture resolution"
        status: pass
    human_judgment: false
  - id: D3
    description: "legal_regimes config drives the regime for any country (CMP-16) — proven with a second (DE) fixture, not just NL"
    requirement: "CMP-16"
    verification:
      - kind: unit
        ref: "scripts/legal-basis.test.ts#looks up the regime for whatever country is resolved — never a hardcoded NL branch"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-07-20
status: complete
---

# Phase 02 Plan 06: Suppression Override + Legal-Basis CLI Summary

**Two operator CLI scripts (suppression-override.ts, legal-basis.ts) mirroring the import-prospects.ts DI-seam shape: a logged, lift-only suppression override and a domain-or-email legal-basis lookup that resolves country + regime + current LIA version + suppression status from config, never hardcoded logic.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-20T00:34:00+02:00
- **Completed:** 2026-07-20T00:36:32+02:00
- **Tasks:** 2
- **Files modified:** 4 (all new)

## Accomplishments
- `scripts/suppression-override.ts` — the only escape hatch that can re-enable a suppressed address (CMP-06): requires explicit `--email` + `--reason`, calls `liftSuppression` to set `lifted_at`/`lifted_by_reason` on the active row, never deletes, no bulk/wildcard mode, prints exactly what it did
- `scripts/legal-basis.ts` — resolves `--email`/`--domain` to prospect country, `legal_regimes` row (spam_law_regime, notes_url, current_lia_version), the matching `lia_versions` row, and suppression status via `isSuppressed`, all in one consolidated console output (CMP-08, D-10)
- Regime resolution reads exclusively from `legal_regimes` — verified with both an NL and a DE fixture in tests, and a source-grep acceptance gate rejects any hardcoded `country === 'NL'`-style branch (CMP-16)
- `npx tsc --noEmit` clean; full `npx vitest run` green (13 test files, 99 tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: scripts/suppression-override.ts (logged lift, no delete, no bulk) + DI-seam test** - `bc178ae` (feat)
2. **Task 2: scripts/legal-basis.ts (country -> regime -> LIA version + suppression status) + DI-seam test** - `2930a70` (feat)

**Plan metadata:** (this commit) - `docs(02-06): complete plan`

## Files Created/Modified
- `scripts/suppression-override.ts` - CLI: `--email` + `--reason` required, calls `liftSuppression`, never deletes, prints outcome
- `scripts/suppression-override.test.ts` - DI-seam tests: missing-flag fail-closed, single liftSuppression call, no-op reporting, console output
- `scripts/legal-basis.ts` - CLI: `--email`/`--domain`, resolves prospect -> `legal_regimes` -> `lia_versions` + `isSuppressed`, one consolidated output
- `scripts/legal-basis.test.ts` - DI-seam tests: NL fixture resolution, DE fixture (proves no hardcoded branch), suppression status, domain-only lookup, missing-prospect fallback

## Decisions Made
- `legal-basis.ts`'s `LegalBasisDeps` exposes `lookupProspect`/`lookupLegalRegime`/`lookupLiaVersion` as injectable functions rather than requiring tests to mock raw Supabase query-builder chains — mirrors the existing `upsertOverturePlace`/`queryOverturePlaces` DI convention in `scripts/import-prospects.ts` and keeps the test file DB-free without inventing a new stubbing pattern.
- Domain lookup takes priority over email lookup in `defaultLookupProspect` (matches `prospects.domain`-as-identity, migration 010), falling back to an exact `contact_email` match so a no-website prospect (`domain IS NULL`) can still resolve via `--email`.
- When only `--domain` is given, the domain string itself is passed to `isSuppressed()` for the suppression-status line — `isSuppressed`'s existing `.or(email.eq...,domain.eq...)` clause already matches on domain, so no second suppression-lookup path was written.

## Deviations from Plan

None - plan executed exactly as written. Both scripts, both test files, and both source-grep acceptance gates (no `.delete(` in suppression-override.ts; no hardcoded NL branch in legal-basis.ts) match the plan's acceptance criteria verbatim.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Both scripts use the existing `createServerClient()` service-role client and existing env vars.

## Next Phase Readiness
- CMP-06, CMP-08, CMP-16 are satisfied at the operator (CLI) surface for this phase.
- Phase 3 can promote `legal-basis.ts`'s resolution logic (`lookupProspect`/`lookupLegalRegime`/`lookupLiaVersion`) directly into an API route without rework — the DI-seam functions are already separated from the CLI/console-printing shell.
- Plan 02-07 (human-gated remote migration push) is the only remaining item in this phase.

---
*Phase: 02-compliance-spine*
*Completed: 2026-07-20*

## Self-Check: PASSED

All created files verified present on disk (scripts/suppression-override.ts, scripts/suppression-override.test.ts, scripts/legal-basis.ts, scripts/legal-basis.test.ts, this SUMMARY.md). All task commits (bc178ae, 2930a70) and this doc commit (145000d) verified present in `git log`.
