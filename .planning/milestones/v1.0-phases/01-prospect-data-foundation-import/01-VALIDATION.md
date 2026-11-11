---
phase: 1
slug: prospect-data-foundation-import
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-18
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 01-RESEARCH.md §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None currently configured (no `*.test.*`/`*.spec.*`, no jest/vitest config, no `test` script in either package.json — verified). Recommend installing **vitest** as a root devDependency in Wave 0. |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx vitest run lib/domain-normalize.test.ts` (unit, no DB) |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10–30s unit; integration slower (needs local Supabase / test schema) |

---

## Sampling Rate

- **After every task commit:** Run the unit tests for `domain-normalize.ts` (fast, no DB).
- **After every plan wave:** Run the full integration suite against a local Supabase stack (`supabase start`) or a dedicated test schema — validates the real partial-unique-index and upsert-branching behavior that mocks cannot.
- **Before phase gate / `/gsd-verify-work`:** Full suite green, PLUS the manual D-11 sample audit (20–30 rows, human-eyeballed) before the first real (non-dry-run) import against production Supabase.
- **Max feedback latency:** ~30s (unit); integration on wave merge.

---

## Per-Task Verification Map

> Task IDs are assigned by the planner; this maps requirements → observable truths → test commands. The planner and gsd-nyquist-auditor reconcile task IDs against this map.

| Requirement | Observable truth to verify | Test Type | Automated Command | File Exists |
|-------------|----------------------------|-----------|-------------------|-------------|
| IMP-04 | `normalizeDomain()` collapses `www.example.co.uk` and `example.co.uk` to one value; rejects IPs/localhost | unit | `npx vitest run lib/domain-normalize.test.ts` | ❌ W0 |
| IMP-04 | Two Overture rows, different GERS IDs, same website domain → exactly one `prospects` row + two `prospect_sources` rows | integration | `npx vitest run lib/prospect-upsert.integration.test.ts` | ❌ W0 |
| IMP-03 | `upsertOverturePlace()` run twice on an unchanged fixture → row counts unchanged (idempotent) | integration | same file | ❌ W0 |
| IMP-05 | A `qualified` prospect with a set `triage_score` is untouched (triage_score, lifecycle_state, contact_email identical) by a re-import that changes incoming name/address | integration | same file | ❌ W0 |
| IMP-05 / D-05 | A `qualified` prospect's `website_url` does not change when incoming website differs; `website_url_pending` + `website_url_changed_at` set instead | integration | same file | ❌ W0 |
| D-13 | A `qualified` (or any non-`new`) prospect's `country` does not change on re-import; a differing incoming country is flagged, not applied | integration | same file | ❌ W0 |
| IMP-07 / D-06 | A row with no website imports with `domain IS NULL`, `lifecycle_state='no_website'`; two such rows (different GERS IDs) create two separate `prospects` rows (no false collapse) | integration | same file | ❌ W0 |
| D-14 | A `no_website` prospect gaining a website on re-import stays `no_website` with null domain; new URL recorded as pending, not auto-applied | integration | same file | ❌ W0 |
| IMP-02 / D-10 | CLI rejects a run missing `--country`/`--region`/`--category` before touching the DB; `--dry-run` performs zero writes; `--limit N` caps write count | integration | `npx vitest run scripts/import-prospects.test.ts` | ❌ W0 |
| IMP-06 | Each imported prospect has a non-null `country` recorded | integration | prospect-upsert suite | ❌ W0 |
| — | `scans.prospect_id` nullable FK: NULL insert succeeds (inbound flow), valid prospect id succeeds, invalid FK fails | integration (migration smoke) | one-off against test schema | ❌ W0 |

*Status legend: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Install `vitest` as a root devDependency; add a `test` script to root `package.json` (currently absent).
- [ ] `lib/domain-normalize.test.ts` — unit tests for `normalizeDomain()` edge cases (www, multi-part suffixes, no-scheme input, IPs, localhost).
- [ ] `lib/prospect-upsert.integration.test.ts` — the core dedupe / idempotency / freeze suite; needs `supabase start` (local Docker Postgres) or a dedicated Supabase test project with the new migrations applied.
- [ ] `scripts/import-prospects.test.ts` — CLI arg-validation and `--dry-run` / `--limit` behavior.
- [ ] A fixture generator for synthetic Overture place rows (shape matching `OverturePlaceRow`), so tests don't depend on live Overture/DuckDB access.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sample-audit of import quality (closed businesses, parked/directory pages, mis-tagged categories) | Pitfall 3 / D-11 | Data-quality judgement Overture's confidence score can't make (the 98% Amsterdam false-positive precedent) | Run importer with `--dry-run`; eyeball the 20–30 row sample (name, domain, category, reachable?) before the first real import |
| Overture category-field detection (`categories.primary` vs `taxonomy.primary`, taxonomy mid-migration) | IMP-01 | Live Overture schema state must be observed at build time | Confirm which field the current Overture release populates before trusting the category filter (research-flagged Wave 0 spike risk) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (vitest install + 3 test files + fixture generator)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (unit)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
