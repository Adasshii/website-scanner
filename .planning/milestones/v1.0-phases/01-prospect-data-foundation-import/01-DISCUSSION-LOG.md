# Phase 1: Prospect Data Foundation & Import - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-17
**Phase:** 1-prospect-data-foundation-import
**Areas discussed:** Domain dedupe collisions, Re-import field ownership, No-website prospects, Import volume + trust gate

---

## Domain dedupe collisions

### Identity design (IMP-03 + IMP-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Domain is the identity | Domain unique key; GERS IDs move to `prospect_sources` child table; first import wins. Only design where IMP-03 + IMP-04 both hold structurally. | ✓ |
| GERS is identity, domain is a soft flag | Keep `overture_gers_id UNIQUE NOT NULL`; same-domain rows stay separate with a shared `domain_group_id` for manual merge. IMP-04 satisfied by convention only. | |
| You decide | | |

**User's choice:** Domain is the identity.

### Winner rule for collapsed records

| Option | Description | Selected |
|--------|-------------|----------|
| First-seen wins, keep the rest | First import sets display fields; later same-domain sources stored but don't overwrite. Deterministic; never rewrites a reviewed prospect. | ✓ |
| Highest Overture confidence wins | Highest-confidence record populates display fields. Overture confidence already misled the project (98% read); can rewrite reviewed prospects. | |
| You decide | | |

**User's choice:** First-seen wins, keep the rest.

**Notes:** This resolved a tension found while reading the research — the specced `overture_gers_id UNIQUE NOT NULL` scalar structurally can't hold two GERS IDs collapsing to one prospect. Domain-as-identity + `prospect_sources` child table is the override.

---

## Re-import field ownership

### Field ownership split (IMP-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Overture owns source fields only | Re-import refreshes name/address/category/region + appends sources; never touches lifecycle_state, triage, scan, contact, approval. IMP-05 by construction. | ✓ |
| Insert-only: existing rows never change | `ON CONFLICT DO NOTHING`; existing prospects never update. Total safety but source data goes stale forever. | |
| You decide | | |

**User's choice:** Overture owns source fields only.

### `website_url` change mid-lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Freeze URL once work starts, flag the change | URL refreshes while `new`; frozen once triaged+; later Overture change recorded for review, not auto-applied. | ✓ |
| Always take the newest URL | Overture's latest URL always wins; scan/email can reference a URL the row no longer shows; mismatch invisible. | |
| You decide | | |

**User's choice:** Freeze URL once work starts, flag the change.

---

## No-website prospects

### Identity + marking (IMP-07)

| Option | Description | Selected |
|--------|-------------|----------|
| GERS-keyed, null domain, marked by state | No-domain prospects key on GERS ID; partial unique index on domain WHERE NOT NULL; marked `lifecycle_state='no_website'`. | ✓ |
| GERS-keyed, null domain, boolean flag | Same identity split, marked with `has_website boolean`. Duplicates what lifecycle_state says; two fields to keep in sync. | |
| You decide | | |

**User's choice:** GERS-keyed, null domain, marked by state.

### Exclusion enforcement point

| Option | Description | Selected |
|--------|-------------|----------|
| Enforced at the send gate | Hard guard at the send path (the one place email goes out); asserted alongside suppression check. | ✓ |
| Enforced by lifecycle state only | Dispatcher/queries filter out `no_website`; exclusion lives in every WHERE clause, one forgotten filter leaks them. | |
| You decide | | |

**User's choice:** Enforced at the send gate.

**Notes:** Flagged as a cross-phase requirement — the send gate is built in the outreach phase; Phase 1 only lands the `no_website` state and partial-unique constraint.

---

## Import volume + trust gate

### Script safety controls (IMP-01, IMP-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Dry-run + limit + required filters | Required country/region/category; `--dry-run` reports counts without writing; `--limit N` caps write. | ✓ |
| Limit only | `--limit N` + filters, no dry-run preview. | |
| You decide | | |

**User's choice:** Went with the recommendation (dry-run + limit + required filters). User noted they'd lost track of the full build and would review at the end.

### Manual sample audit (Pitfall 3)

| Option | Description | Selected |
|--------|-------------|----------|
| Dry-run sample output + admin review | Dry-run exports a random 20–30 candidate sample for manual eyeball before first real import; post-import review in admin list. | ✓ |
| Just import, audit in admin UI later | Skip pre-import sample; rely on triage/admin downstream. Defers the exact check that failed last time. | |
| You decide | | |

**User's choice:** Went with the recommendation (dry-run sample + admin review).

---

## Claude's Discretion

- Exact column names/types beyond those explicitly named, the full `prospect_sources` shape, the domain-normalisation (public-suffix/registrable-domain) implementation, migration file structure, and the dry-run report/sample format.
- Whether domain-collapsed chains/franchises are worth keeping — a downstream triage judgement, not a Phase 1 schema decision.

## Deferred Ideas

- Send-gate no-website guard → outreach phase (carry as a requirement).
- `website_url` change-review UI → Phase 3+ admin prospect UI.
- `campaigns` table → not built; `campaign_tag` column covers waves.
- Manual same-domain merge tooling → out of scope for v1.
