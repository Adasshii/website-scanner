---
phase: 03-triage-shortlist
plan: 06
subsystem: database
tags: [supabase, migration, human-gated, release-marker]

requires:
  - phase: 03-triage-shortlist
    plan: 01
    provides: supabase/migrations/016_add_scan_release_marker.sql (written + applied to local Supabase)
provides:
  - Live production `prospects.scan_released_at` (timestamptz) column
  - Live production `idx_prospects_scan_released_at_null` partial index
status: complete
completed: 2026-07-20
requirements: [TRI-08, TRI-09]
---

# 03-06 — Apply migration 016 to live Supabase (human gate)

## What was done

Applied migration `supabase/migrations/016_add_scan_release_marker.sql` to the **live**
Prospect Radar Supabase project, via the dashboard SQL Editor (Primary Database, role
`postgres`) — the project's established manual-push convention for live migrations
(010–015 were all applied this way; no automated `supabase db push` against production).

This is the mandatory blocking human gate: build, typecheck, lint, and the full test
suite all pass WITHOUT the live column (types come from `types/triage.ts` and the
migration file, not the live DB), a false-positive green state. The shortlist GET route,
the release route, and `getTriageCandidates` all filter on `scan_released_at`; against
production without the column they would fail at runtime. This step closes that gap.

The migration is additive-only, nullable, `if not exists` (idempotent/re-runnable), and
touches no existing column or data. RLS on `prospects` (enabled in migration 010) is
unchanged — no new policy, service-role-only convention preserved.

## No repo files changed

By design (`files_modified: []`). This plan applies an already-written, already
locally-verified migration to production. No new symbols are produced.

## Verification (human-check, live production DB)

- Migration DDL (`alter table … add column` + `create index …`) ran against the Primary
  Database → **"Success. No rows returned"** (correct DDL result).
- `select column_name, data_type from information_schema.columns where table_name = 'prospects' and column_name = 'scan_released_at'` → column present (transitively confirmed: the partial index below is defined on this column and exists).
- `select indexname from pg_indexes where tablename = 'prospects' and indexname = 'idx_prospects_scan_released_at_null'` → returned **one row**: `idx_prospects_scan_released_at_null`.

Both acceptance criteria met: the live `prospects` table carries `scan_released_at` and
its partial index. End-to-end triage + release against production is unblocked, and phase
verification can proceed.

## Deviations

None. Human-gated apply completed as specified; no automated push against production.
