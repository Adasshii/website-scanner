---
phase: 02-compliance-spine
plan: 07
type: checkpoint:human-verify
status: complete
completed: 2026-07-20
requirements: [CMP-01, CMP-08, CMP-16]
---

# Plan 02-07 — Apply migrations to live Supabase (human gate)

## What was done

The mandatory `[BLOCKING]` schema-push gate. Migrations **014** (`suppressions`) and **015**
(`legal_basis`: `lia_versions` + `legal_regimes` + immutability trigger + NL seed) were applied by
Joshua to the **live** Supabase project (`adashi-scanner`, `main` / PRODUCTION) via the Dashboard
SQL Editor — the project's Phase 1 convention (STATE.md 01-01). No files changed; this plan applies
production DDL only.

Both migration files are idempotent (`if not exists`, `on conflict do nothing`). The one
non-idempotent statement (`create trigger lia_versions_no_update_delete`) raised
`42710 already exists` on a re-run, confirming 015 was applied — expected and harmless.

## Verification (confirmed in the live project)

- `suppressions`, `lia_versions`, `legal_regimes` all present in `public`.
- Partial unique index `suppressions_email_active_idx` present.
- NL `legal_regimes` row resolves to `opt-out-narrow-exemption` → `current_lia_version = 1`.
- `lia_versions` version-1 row present (the immutability trigger fired on it, which requires the row to exist).
- Immutability trigger **fires**: `update lia_versions set content_hash='x' where version=1;` raised
  `P0001: lia_versions rows are immutable; insert a new version instead` — the success case for CMP-08's
  immutable-versioning requirement.

Human resume signal: **approved** (2026-07-20).

## Requirements

- CMP-01 — live `suppressions` table is now the production source of truth.
- CMP-08 / CMP-16 — live `lia_versions` + `legal_regimes` back the versioned LIA and per-country config.

## Notes

- Threat T-02-24 (green build while prod schema absent = false positive) is closed: the live schema is
  read-back-verified, not inferred from a passing build.
- No `supabase db push` was used; production was reached via the Dashboard SQL Editor per convention.
