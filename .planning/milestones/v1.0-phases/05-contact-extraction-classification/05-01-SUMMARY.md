---
phase: 05-contact-extraction-classification
plan: 01
subsystem: database
tags: [postgres, supabase, typescript, migrations]

# Dependency graph
requires: []
provides:
  - Migration 018: prospects.commercial_contact_invited, prospects.sole_proprietorship, prospects_contact_email_type_check
  - ContactExtraction interface (types/scanner.ts)
  - PageData.contactExtraction optional field
  - ProspectRow.commercial_contact_invited, ProspectRow.sole_proprietorship fields
affects: [05-02, 05-03, 05-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Guarded do $$ ... pg_constraint existence check for idempotent CHECK-constraint addition on a pre-existing column (no prior precedent in this repo's migrations)"

key-files:
  created: [supabase/migrations/018_add_contact_classification.sql]
  modified: [types/scanner.ts]

key-decisions:
  - "CHECK constraint on contact_email_type added via a guarded do $$ block testing pg_constraint.conname, since ALTER TABLE ADD CONSTRAINT has no IF NOT EXISTS form"
  - "ContactExtraction kept as three raw fields only (mailtoHrefs, cfemailTokens, contactText) — no parsed/classified fields, keeping the browser-side extractor a thin harvester per RESEARCH.md Pattern 1"

patterns-established:
  - "Raw-material capture in PageData, parsing happens Node-side in lib/contact-extraction.ts (Wave 2) — no cfemail/regex logic crosses the browser boundary"

requirements-completed: [CON-03, CON-06, CON-07]

coverage:
  - id: D1
    description: "Migration 018 adds commercial_contact_invited, sole_proprietorship, and the contact_email_type CHECK constraint, idempotently, applied to local Supabase"
    requirement: "CON-03, CON-06, CON-07"
    verification:
      - kind: integration
        ref: "supabase db reset (full replay through 018, no error) + direct re-run of 018 via docker exec psql (no error, idempotency confirmed) + \\d prospects / pg_constraint inspection confirming column types, defaults, and constraint definitions"
        status: pass
    human_judgment: false
  - id: D2
    description: "types/scanner.ts exports ContactExtraction, PageData.contactExtraction, and ProspectRow gains commercial_contact_invited/sole_proprietorship — compiles clean"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (root and scanner-service, both exit 0)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-24
status: complete
---

# Phase 05 Plan 01: Contact Classification Storage + Types Summary

**Migration 018 adds commercial_contact_invited/sole_proprietorship columns and a contact_email_type CHECK constraint to prospects, plus a ContactExtraction type and matching ProspectRow/PageData fields in types/scanner.ts.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-24T18:38:00+02:00 (approx)
- **Completed:** 2026-07-24T18:45:20+02:00
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Idempotent migration 018 adding two new `prospects` columns with defaults/CHECKs (CON-06, CON-07) and a guarded CHECK constraint on the pre-existing `contact_email_type` column (CON-03)
- Applied to local Supabase via `supabase db reset`; idempotency independently verified by re-running the file directly against the running local Postgres container
- `ContactExtraction` interface + `PageData.contactExtraction?` field + two new `ProspectRow` fields added to `types/scanner.ts`, compiling clean in both the root and scanner-service TypeScript projects

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 018 — contact-classification columns + constraint, local apply** - `f7bfb27` (feat)
2. **Task 2: Extend shared types — ContactExtraction, PageData.contactExtraction, ProspectRow columns** - `93570d4` (feat)

**Plan metadata:** (this commit, follows)

## Files Created/Modified
- `supabase/migrations/018_add_contact_classification.sql` - New idempotent migration: `commercial_contact_invited` (boolean, not null, default false), `sole_proprietorship` (text, not null, default 'unknown', CHECK yes|no|unknown), and `prospects_contact_email_type_check` (CHECK NULL or generic|named-person, added via `do $$` + `pg_constraint` existence guard)
- `types/scanner.ts` - Added exported `ContactExtraction { mailtoHrefs, cfemailTokens, contactText }`, `PageData.contactExtraction?: ContactExtraction`, and `ProspectRow.commercial_contact_invited: boolean` / `ProspectRow.sole_proprietorship: string`

## Decisions Made
- CHECK constraint on `contact_email_type` uses a `do $$ ... end $$` block testing `pg_constraint.conname` before `ALTER TABLE ADD CONSTRAINT`, since Postgres has no `ADD CONSTRAINT IF NOT EXISTS`. This is a new pattern for this repo's migrations (017 and earlier only used `add column if not exists`); verified idempotent by re-running the file twice against the same local DB with no error.
- `ContactExtraction` deliberately holds only raw material (mailto hrefs, cfemail tokens, bounded text) — no parsing or classification fields — so the Wave 2 browser-side extractor stays a thin harvester and all cfemail-decoding/regex logic lives in the Node-side `lib/contact-extraction.ts` pure module (RESEARCH.md Pattern 1).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. `psql` is not installed locally, so idempotency verification and schema inspection were done via `docker exec supabase_db_website-scanner psql` against the local Supabase Postgres container instead — same effective verification, different invocation path.

## User Setup Required

None - no external service configuration required. Note: migration 018 is local-only per plan; production apply is a blocking checkpoint deferred to plan 05-04.

## Next Phase Readiness
- The storage contract (three CHECK/default guarantees) and the shared type surface (`ContactExtraction`, `PageData.contactExtraction`, `ProspectRow` fields) are both live on local Supabase and in `types/scanner.ts`, ready for the Wave 2 extractor and pure aggregator module to write/read against.
- No blockers.

---
*Phase: 05-contact-extraction-classification*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: supabase/migrations/018_add_contact_classification.sql
- FOUND: types/scanner.ts
- FOUND: .planning/phases/05-contact-extraction-classification/05-01-SUMMARY.md
- FOUND: f7bfb27 (Task 1 commit)
- FOUND: 93570d4 (Task 2 commit)
