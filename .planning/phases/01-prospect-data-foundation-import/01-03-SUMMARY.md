---
phase: 01-prospect-data-foundation-import
plan: 03
subsystem: database
tags: [tldts, supabase, postgres, dedupe, upsert, vitest]

requires:
  - phase: 01-prospect-data-foundation-import (plan 01-01/01-02)
    provides: prospects/prospect_sources/outreach_messages migrations, OverturePlaceRow/ProspectRow/ProspectSourceRow types, makeOverturePlace fixture, vitest infra
provides:
  - "normalizeDomain() — public-suffix-aware registrable-domain reduction (tldts), never throws"
  - "upsertOverturePlace() — GERS-first-then-domain identity resolution with freeze-by-omission (D-04), website_url pending (D-05), country pending (D-13), no_website-gains-website pending (D-14)"
  - "Integration-tested local Supabase workflow (supabase/seed.sql) for this and future DB-backed test suites"
affects: [01-04 (import script), Phase 3 (admin review of *_pending fields)]

tech-stack:
  added: []
  patterns:
    - "Application-level GERS-first-then-domain branching instead of a single INSERT ... ON CONFLICT (two arbiter indexes on two tables cannot be one Postgres statement)"
    - "Freeze-by-omission: work columns are simply never present in an UPDATE payload — no DB trigger needed"
    - "local Supabase integration tests set NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY to the fixed local-dev demo values in-file, so createServerClient() targets 127.0.0.1:54321, never production"

key-files:
  created:
    - lib/domain-normalize.ts
    - lib/domain-normalize.test.ts
    - lib/prospect-upsert.ts
    - lib/prospect-upsert.integration.test.ts
    - supabase/seed.sql
  modified: []

key-decisions:
  - "D-14 required no special-case code: a no_website prospect is never lifecycle_state='new', so maybeRefreshWebsiteUrl's existing else-branch (website_url_pending) already fires correctly on a gained website — domain and lifecycle_state are never written by that function, satisfying D-14 by construction."
  - "Added supabase/seed.sql (local-dev-only, not part of migration history) granting default table privileges to anon/authenticated/service_role — this repo had no supabase/config.toml or prior local-dev history, so a bare 'supabase start' + 'db reset' left every table, including pre-existing ones like scans, with 'permission denied for table X'. Unrelated to this phase's migrations; RLS (already enabled per-table) is the real access-control layer, this only restores the base GRANTs a Supabase-provisioned project gets automatically."

patterns-established:
  - "Pattern: identity-resolution branching in application code when two independent uniqueness rules live on two different tables"
  - "Pattern: local Supabase integration test suites hardcode the fixed local CLI demo URL/service-role JWT in-file (not a real secret, never valid against a hosted project) rather than relying on .env.local (which points at production)"

requirements-completed: [IMP-03, IMP-04, IMP-05, IMP-06]

coverage:
  - id: D1
    description: "normalizeDomain() collapses www + multi-part public suffixes (.co.uk) to one registrable domain, rejects IPs/localhost, never throws on garbage input"
    requirement: "IMP-04"
    verification:
      - kind: unit
        ref: "lib/domain-normalize.test.ts (6 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "upsertOverturePlace() branches GERS-first (idempotency) then domain (collapse) then insert; work columns and country never appear in an UPDATE payload"
    requirement: "IMP-05"
    verification:
      - kind: other
        ref: "grep lib/prospect-upsert.ts for lifecycle_state/triage_score/triage_checked_at/latest_scan_id/contact_email/contact_email_type/country — none appear as UPDATE keys"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit -p tsconfig.json"
        status: pass
    human_judgment: false
  - id: D3
    description: "Two Overture rows, different gersId, same website domain -> exactly one prospects row + two prospect_sources rows (IMP-04 collapse)"
    requirement: "IMP-04"
    verification:
      - kind: integration
        ref: "lib/prospect-upsert.integration.test.ts#IMP-04: two rows, different gersId, same website domain -> 1 prospects row + 2 prospect_sources rows"
        status: pass
    human_judgment: false
  - id: D4
    description: "Running upsertOverturePlace twice on an unchanged fixture leaves prospects/prospect_sources row counts unchanged (IMP-03 idempotency)"
    requirement: "IMP-03"
    verification:
      - kind: integration
        ref: "lib/prospect-upsert.integration.test.ts#IMP-03: running upsertOverturePlace twice on an unchanged fixture leaves row counts unchanged"
        status: pass
    human_judgment: false
  - id: D5
    description: "A re-import that changes incoming name/address leaves a qualified prospect's triage_score, lifecycle_state, contact_email untouched (IMP-05 freeze-by-omission)"
    requirement: "IMP-05"
    verification:
      - kind: integration
        ref: "lib/prospect-upsert.integration.test.ts#IMP-05: re-import that changes incoming name/address leaves triage_score, lifecycle_state, contact_email untouched"
        status: pass
    human_judgment: false
  - id: D6
    description: "A qualified prospect's website_url is frozen; a differing incoming website sets website_url_pending + website_url_changed_at instead (D-05)"
    verification:
      - kind: integration
        ref: "lib/prospect-upsert.integration.test.ts#D-05: a qualified prospect's website_url is frozen; a differing incoming website sets website_url_pending"
        status: pass
    human_judgment: false
  - id: D7
    description: "A non-'new' prospect's country is frozen; a differing incoming country sets country_pending + country_changed_at instead (D-13)"
    verification:
      - kind: integration
        ref: "lib/prospect-upsert.integration.test.ts#D-13: a non-'new' prospect's country is frozen; a differing incoming country sets country_pending"
        status: pass
    human_judgment: false
  - id: D8
    description: "Rows with no website import with domain NULL and lifecycle_state='no_website'; two such rows never collapse into one prospect (IMP-07/D-06)"
    requirement: "IMP-06"
    verification:
      - kind: integration
        ref: "lib/prospect-upsert.integration.test.ts#IMP-07/D-06: rows with no website import with domain NULL and lifecycle_state='no_website'; two such rows never collapse"
        status: pass
    human_judgment: false
  - id: D9
    description: "A no_website prospect gaining a website on re-import stays no_website with null domain; the new URL is recorded as website_url_pending, never auto-applied (D-14)"
    verification:
      - kind: integration
        ref: "lib/prospect-upsert.integration.test.ts#D-14: a no_website prospect gaining a website stays no_website with null domain; the URL is recorded as pending"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-18
status: complete
---

# Phase 1 Plan 3: Identity/Dedupe Core Summary

**`normalizeDomain()` (tldts-backed) and `upsertOverturePlace()` (GERS-first-then-domain branching with freeze-by-omission), proven green against a real local Postgres covering every IMP-03/04/05/06 and D-05/D-13/D-14 behavior.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-18T21:41:00+02:00
- **Completed:** 2026-07-18T21:56:32+02:00
- **Tasks:** 3
- **Files modified:** 5 (all new)

## Accomplishments
- `normalizeDomain()` reduces any URL/hostname to its public-suffix-aware registrable domain (or `null`), covering `www.` + multi-part suffixes, IPs, localhost, and malformed input without throwing.
- `upsertOverturePlace()` implements the three-branch dedupe algorithm (known GERS source → domain collapse → brand-new insert), extended beyond the research sketch with D-13 (country frozen always) and D-14 (no_website-gains-website flagged, not auto-transitioned).
- A DB-backed integration suite (7 tests, all green) asserts every dedupe/idempotency/freeze truth from VALIDATION.md against a real local Postgres with migrations 010-013 applied — not mocks.
- Established a reusable local-Supabase integration-test workflow (`supabase start` + `supabase db reset`, `supabase/seed.sql` for grants) that future DB-backed suites in this phase (e.g. 01-04) can reuse as-is.

## Task Commits

Each task was committed atomically:

1. **Task 1: normalizeDomain() + unit tests** - `c80a531` (test)
2. **Task 2: upsertOverturePlace() — GERS-first-then-domain branching with freeze-by-omission** - `62e34ba` (feat)
3. **Task 3: Integration suite — dedupe, idempotency, and freeze against a real DB** - `e7b3f52` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/domain-normalize.ts` - `normalizeDomain()` + `DomainValidationError`, wraps `tldts.getDomain()`
- `lib/domain-normalize.test.ts` - 6 unit cases (www/multi-suffix collapse, no-scheme, IP, localhost, garbage input)
- `lib/prospect-upsert.ts` - `upsertOverturePlace()` three-branch identity resolution + `maybeRefreshWebsiteUrl`/`maybeFlagCountry` helpers
- `lib/prospect-upsert.integration.test.ts` - 7 integration tests against a real local Postgres, one per VALIDATION.md map row
- `supabase/seed.sql` - local-dev-only grants (see Deviations)

## Decisions Made
- D-14 (no_website gaining a website) required no special-case branch: since `no_website` prospects are never `lifecycle_state='new'`, the existing D-05 `maybeRefreshWebsiteUrl` else-branch already writes `website_url_pending` and never touches `domain`/`lifecycle_state` — the plan's extension requirement is satisfied by the D-05 logic's own structure, not new code.
- D-13's `maybeFlagCountry` is intentionally simpler/stricter than `maybeRefreshWebsiteUrl`: no `'new'`-state exception at all — a differing country is always flagged, never applied, regardless of lifecycle_state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Local Supabase stack unavailable; Docker daemon was not running**
- **Found during:** Task 3 (integration suite requires a real DB, explicitly not production)
- **Issue:** `.env.local` only holds the production Supabase URL/key; there was no `supabase/config.toml` or prior local-dev history in this repo, and the Docker daemon was stopped, so `supabase start` could not run.
- **Fix:** Started Docker Desktop, waited for the daemon (`docker info`), then ran `supabase start` followed by `supabase db reset` to apply migrations 001-013 fresh to a local Postgres. The integration test file sets `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` to the fixed local-CLI demo values in-file (documented in the file's header comment) so `createServerClient()` targets `127.0.0.1:54321`, never production.
- **Files modified:** none (environment-only; no repo files changed for this part)
- **Verification:** `supabase status`-equivalent confirmed via successful `db reset` log showing all 13 migrations applied.
- **Committed in:** n/a (environment setup, not a code change)

**2. [Rule 3 - Blocking] Fresh local Postgres denied all table access, including pre-existing tables**
- **Found during:** Task 3, first integration test run
- **Issue:** Every query returned `permission denied for table X` (Postgres error 42501) — reproduced even against the pre-existing `scans` table, confirming this was a local-environment gap (missing default-privilege grants a Supabase-provisioned project normally gets automatically), not a bug in the new migrations or `upsertOverturePlace()`.
- **Fix:** Added `supabase/seed.sql` (local-dev-only; not part of the migration history `supabase db push` applies to remote) granting standard `SELECT/INSERT/UPDATE/DELETE` privileges on `public` schema tables/sequences/routines to `anon`, `authenticated`, `service_role`, plus `ALTER DEFAULT PRIVILEGES` for future tables. Re-ran `supabase db reset` to apply it.
- **Files modified:** `supabase/seed.sql`
- **Verification:** All 7 integration tests pass after the reset; RLS (already enabled per-table since migrations 010/011) remains the real row-level access-control layer — this only restores the base table-level GRANTs.
- **Committed in:** `e7b3f52` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking, both environment/test-infra only)
**Impact on plan:** No production migration or application code was touched by either fix. `supabase/seed.sql` is additive local-dev tooling that benefits every future DB-backed test suite in this phase (01-04's CLI integration tests, in particular).

## Issues Encountered
None beyond the two deviations above.

## User Setup Required
None - no external service configuration required. (Local Supabase stack setup is documented as a reusable dev workflow, not a manual one-off; running `supabase start && supabase db reset` before `npx vitest run lib/prospect-upsert.integration.test.ts` is sufficient for any future run of this suite.)

## Next Phase Readiness
- `normalizeDomain()` and `upsertOverturePlace()` are ready for `scripts/import-prospects.ts` (plan 01-04) to call directly.
- The local Supabase integration-test workflow (`supabase start` + `supabase db reset` + `supabase/seed.sql`) is now proven and reusable for 01-04's own integration/CLI tests.
- No blockers. `website_url_pending`/`country_pending` review UI remains explicitly deferred to Phase 3+ per CONTEXT.md.

---
*Phase: 01-prospect-data-foundation-import*
*Completed: 2026-07-18*

## Self-Check: PASSED

All 5 created files verified present on disk; all 4 commit hashes (`c80a531`, `62e34ba`, `e7b3f52`, `1de9ba9`) verified present in `git log --oneline --all`.
