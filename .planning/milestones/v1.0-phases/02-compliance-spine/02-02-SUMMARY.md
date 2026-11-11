---
phase: 02-compliance-spine
plan: 02
subsystem: database
tags: [supabase, postgres, compliance, gdpr, legal, vitest]

# Dependency graph
requires:
  - phase: 02-compliance-spine (plan 01)
    provides: migration numbering convention (015 next), RLS-enable-no-policy + CHECK-constrained-enum migration style, local-Supabase integration test setup pattern
provides:
  - lia_versions table (migration 015) — immutable, DB-trigger-enforced LIA version registry (CMP-08)
  - legal_regimes table (migration 015) — per-country legal-basis config, seeded with NL (CMP-16)
  - docs/legal/lia/LIA-v1.md — immutable DRAFT LIA skeleton artifact (D-11)
  - integration suite proving immutability (UPDATE + DELETE both raise) and NL resolution (opt-out-narrow-exemption, LIA v1)
affects: [02-06 (legal-basis CLI lookup script reads legal_regimes + lia_versions), 02-07 (prod migration push)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BEFORE UPDATE OR DELETE trigger for DB-level immutability (new pattern for this repo) — a plpgsql function that unconditionally raises, attached via CREATE TRIGGER, enforces 'insert a new version, never mutate' at the database layer rather than relying on app-level discipline"
    - "Content-hash pointer from a DB row to an immutable repo file — lia_versions.content_hash stores the sha256 of docs/legal/lia/LIA-v1.md, letting the app verify the on-disk artifact wasn't altered since the version was registered"

key-files:
  created:
    - supabase/migrations/015_create_legal_basis.sql
    - supabase/migrations/015_create_legal_basis.integration.test.ts
    - docs/legal/lia/LIA-v1.md
  modified: []

key-decisions:
  - "spam_law_regime is CHECK-constrained to three enum values (opt-out-narrow-exemption / opt-out-broad-corporate-exemption / opt-in-required) per RESEARCH.md Open Question 2 recommendation, matching the codebase's existing CHECK-enum convention (prospects.lifecycle_state, email_events.status)"
  - "legal_regimes.current_lia_version is a hard FK to lia_versions(version), not a loose text/int column — a country config row cannot point at a nonexistent LIA version"
  - "content_hash seeded from a real sha256 of the committed LIA-v1.md content, computed via shasum -a 256 at authoring time, not a placeholder string"
  - "notes_url for the NL seed row points at .planning/research/LEGAL.md (the in-repo legal research) rather than an external URL, since no public authority page was specified in the plan"

patterns-established:
  - "Pattern 1: DB-level immutability trigger (BEFORE UPDATE OR DELETE, raises unconditionally) for any table whose rows must never change after creation, e.g. audit-trail-adjacent config"

requirements-completed: [CMP-08, CMP-16]

coverage:
  - id: D1
    description: "docs/legal/lia/LIA-v1.md exists as a structured DRAFT skeleton covering purpose/necessity/balancing tests, Article 14 notice approach, data minimisation, and country scope"
    requirement: "CMP-08"
    verification:
      - kind: unit
        ref: "source assertion — test -f docs/legal/lia/LIA-v1.md && grep -qi 'legitimate interest' && grep -qi 'article 14'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Migration 015 creates lia_versions + legal_regimes, a BEFORE UPDATE OR DELETE trigger on lia_versions, an FK from legal_regimes.current_lia_version to lia_versions(version), seeds LIA v1 + NL regime, and enables RLS with no policy on both tables"
    requirement: "CMP-08, CMP-16"
    verification:
      - kind: unit
        ref: "source assertion — grep for trigger clause, FK clause, 'NL' seed, and absence of CREATE POLICY"
        status: pass
      - kind: integration
        ref: "supabase db reset — migration 015 applied cleanly on first attempt against local Supabase"
        status: pass
    human_judgment: false
  - id: D3
    description: "Attempting UPDATE or DELETE on an existing lia_versions row raises a database error (immutability enforced at the DB level, not just app convention)"
    requirement: "CMP-08"
    verification:
      - kind: integration
        ref: "supabase/migrations/015_create_legal_basis.integration.test.ts#immutable: UPDATE on an existing lia_versions row raises a DB error / #immutable: DELETE on an existing lia_versions row raises a DB error"
        status: pass
    human_judgment: false
  - id: D4
    description: "The seeded NL legal_regimes row resolves to spam_law_regime='opt-out-narrow-exemption' and current_lia_version=1, with lia_versions.version=1 carrying a non-empty content_hash"
    requirement: "CMP-16"
    verification:
      - kind: integration
        ref: "supabase/migrations/015_create_legal_basis.integration.test.ts#CMP-08/16: the seeded NL row resolves to opt-out-narrow-exemption and LIA version 1"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-07-20
status: complete
---

# Phase 2 Plan 2: Legal Basis Spine Summary

**Immutable, DB-trigger-enforced LIA version registry plus per-country legal-regime config (`legal_regimes`), seeded with NL, resolving CMP-08/CMP-16 at the schema level with zero hardcoded country logic**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-20T00:05:00+02:00 (approx, first commit 00:06:51)
- **Completed:** 2026-07-20T00:08:37+02:00
- **Tasks:** 3/3 completed
- **Files modified:** 3 (all new)

## Accomplishments
- Shipped `docs/legal/lia/LIA-v1.md`, a structured DRAFT LIA skeleton (purpose/necessity/balancing tests, Article 14 notice approach, data minimisation, country scope) covering the legitimate-interest posture derived from `.planning/research/LEGAL.md`, clearly marked as pending counsel review — the mechanism ships now, content review runs on the parallel track (D-11).
- Shipped migration 015 (`lia_versions` + `legal_regimes`), with a `BEFORE UPDATE OR DELETE` trigger that raises on any attempted mutation of a `lia_versions` row — new pattern for this repo, enforcing immutability at the database layer rather than app-level convention.
- Seeded `lia_versions` (version 1, content_hash = sha256 of `LIA-v1.md`) and `legal_regimes` (NL, `opt-out-narrow-exemption`, pointing at LIA v1) so the resolution path works end to end from the first migration apply.
- Proved the immutability guarantee and the NL resolution path with a 4-test integration suite against real local Postgres — both UPDATE and DELETE on `lia_versions` raise, and the NL row resolves correctly.

## Task Commits

Each task was committed atomically:

1. **Task 1: docs/legal/lia/LIA-v1.md — immutable LIA skeleton artifact** - `5275e98` (docs)
2. **Task 2: Migration 015 — lia_versions + legal_regimes + immutability trigger + NL seed** - `7676223` (feat)
3. **Task 3: 015 integration test — immutability raises + NL resolution** - `8ebf8a4` (test)

**Plan metadata:** (this commit) `docs: complete legal-basis spine plan`

## Files Created/Modified
- `docs/legal/lia/LIA-v1.md` - Immutable DRAFT LIA skeleton (purpose/necessity/balancing tests, Article 14 notice, data minimisation, country scope), sha256 `40e38eb1...4ea9`
- `supabase/migrations/015_create_legal_basis.sql` - `lia_versions` + `legal_regimes` tables, immutability trigger, NL seed, RLS-enable-no-policy
- `supabase/migrations/015_create_legal_basis.integration.test.ts` - 4-test suite: 2 immutability (UPDATE/DELETE both raise), 1 NL resolution, 1 new-country-as-config insert

## Decisions Made
- Used a hard FK (`legal_regimes.current_lia_version references lia_versions(version)`) rather than a loose integer, so a misconfigured country row referencing a nonexistent LIA version is impossible at the DB level, not just a convention.
- Computed the real sha256 of the committed `LIA-v1.md` (`shasum -a 256`) for the seed `content_hash`, rather than a placeholder, so the hash-verification purpose the column exists for is actually functional from day one.
- Pointed the NL seed's `notes_url` at the in-repo `.planning/research/LEGAL.md` rather than fabricating an external authority URL, since the plan didn't specify one and the research doc is the actual source of the NL determination.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `supabase db reset` applied migration 015 cleanly on the first attempt (no transient-restart retry needed). No `psql` binary available locally for ad-hoc inspection; verification relied entirely on the vitest integration suite against the running local stack, which is the plan's own specified verification method.

## User Setup Required

None - no external service configuration required. Migration was applied to LOCAL Supabase only; no `supabase db push` was run (production push is the separate human-gated plan 02-07, per this plan's hard guardrail).

## Next Phase Readiness
- `legal_regimes` + `lia_versions` are live locally and ready for Plan 06's `scripts/legal-basis.ts` CLI lookup script to read from — no rework needed, the resolution logic (country → regime → LIA version) already works as proven by the integration test.
- No blockers. `npx tsc --noEmit` is clean and the full repo test suite (61 tests, 7 files) passes.
- Migration 015 still needs to reach production via the gated Plan 02-07 push before any live legal-basis lookup can run against prod data — expected, not a blocker for this plan.

---
*Phase: 02-compliance-spine*
*Completed: 2026-07-20*

## Self-Check: PASSED

All created files and commit hashes verified to exist:
- `docs/legal/lia/LIA-v1.md` — FOUND
- `supabase/migrations/015_create_legal_basis.sql` — FOUND
- `supabase/migrations/015_create_legal_basis.integration.test.ts` — FOUND
- `.planning/phases/02-compliance-spine/02-02-SUMMARY.md` — FOUND
- `5275e98`, `7676223`, `8ebf8a4` — all FOUND in git log
