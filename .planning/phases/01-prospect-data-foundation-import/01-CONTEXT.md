# Phase 1: Prospect Data Foundation & Import - Context

**Gathered:** 2026-07-17
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers a durable `prospects` list, populated from Overture Maps by
country/region/category through a repeatable import script, that survives re-import
without losing any work Joshua has already done on a prospect. It lands the data-model
foundation (`prospects`, `outreach_messages`, `scans.prospect_id`) the rest of the
milestone builds on.

**In scope:** the `prospects` table and its identity/dedupe design, the
`scripts/import-prospects.ts` importer with its safety controls, domain dedupe,
re-import field ownership, and the no-website prospect representation. The migrations
for `outreach_messages` and `scans.prospect_id` (nullable) also land here as
foundation, even though the columns are exercised by later phases.

**Out of scope (belongs to later phases):** the triage stage (Phase 3), the admin
prospect list UI (Phase 3), the scan dispatcher (Phase 4), draft generation and the
send gate (outreach phase), and the `suppressions` table's send-time enforcement.
This phase builds the DB shape and the states those phases rely on; it does not build
their behavior.

</domain>

<decisions>
## Implementation Decisions

### Identity & dedupe (IMP-03, IMP-04)
- **D-01: Domain is the primary identity.** Normalised registrable domain is the unique
  key on `prospects`. This is the only design where GERS idempotency (IMP-03) and
  domain collapse (IMP-04) both hold structurally. The research spec's
  `overture_gers_id UNIQUE NOT NULL` scalar is explicitly overridden — a scalar unique
  GERS column cannot represent two Overture records collapsing to one prospect.
- **D-02: GERS IDs live in a child `prospect_sources` table** (one prospect, many
  Overture source records). Each source row carries its `overture_gers_id`
  (unique in that table), plus the raw Overture fields it contributed. Re-running the
  importer upserts sources by GERS ID (idempotent per IMP-03) and attaches same-domain
  sources to the existing prospect (collapse per IMP-04).
- **D-03: First-seen wins for display fields.** The first import to create a prospect
  sets the displayed `name`, `address`, `category`, `region`. Later same-domain sources
  are stored but do NOT overwrite the displayed fields. Deterministic, and never
  silently rewrites a prospect Joshua has already reviewed. Overture confidence score is
  deliberately NOT used as the winner rule — it already misled this project once (the
  98% Amsterdam read).

### Re-import field ownership (IMP-05)
- **D-04: Overture owns source fields only; Joshua's work is frozen.** Re-import may
  refresh raw Overture fields (`name`, `address`, `category`, `region`, and append new
  sources). It NEVER touches the work columns: `lifecycle_state`, `triage_score`,
  `triage_checked_at`, `latest_scan_id`, `contact_email`, `contact_email_type`, and any
  approval history in `outreach_messages`. This satisfies IMP-05 by construction, not by
  convention.
- **D-05: `website_url` freezes once work starts, and later changes are flagged, not
  applied.** While a prospect is still `new`, re-import may refresh `website_url` freely.
  Once it moves to `triaged` or beyond, `website_url` is frozen; an incoming Overture
  change is recorded (a `website_url_changed_at` timestamp plus the proposed new value in
  a nullable column, e.g. `website_url_pending`) for Joshua to review — never
  auto-applied. Prevents a scan report or drafted email pointing at one URL while the row
  silently shows another. **Planner note:** decide the exact pending-value column
  name/shape; the requirement is that no triaged-or-beyond prospect silently changes the
  URL its work was based on.

### No-website prospects (IMP-07)
- **D-06: Two identity paths coexist.** Has-domain prospects key on domain; no-domain
  (no-website) prospects key on their GERS ID with a null `domain`. This requires the
  domain uniqueness to be a **partial unique index**: `UNIQUE (domain) WHERE domain IS
  NOT NULL`. No-website prospects therefore need a stable single-GERS identity — their
  `prospect_sources` entry's GERS ID is the natural key when `domain IS NULL`.
- **D-07: No-website prospects are marked by a dedicated `lifecycle_state = 'no_website'`**
  (a flag column was rejected as duplicating what the state already tells us). They are
  imported (IMP-07) but sit outside the active funnel.
- **D-08: Outreach exclusion is asserted at the send gate.** The single hard guard lives
  at the send path (built in the outreach phase, not here): a prospect with no
  contactable website/URL can never produce a valid sent message. This is defense at the
  one place an email could actually go out, rather than relying on every downstream query
  remembering a WHERE filter. **Cross-phase requirement** — see Deferred Ideas; Phase 1's
  job is only to establish the `no_website` state and partial-unique constraint that make
  this guard's precondition real.

### Import script & trust gate (IMP-01, IMP-02)
- **D-09: The importer is a repeatable parameterised script** (`scripts/import-prospects.ts`),
  run locally/on-demand, NOT a Vercel route (GeoParquet scans are the wrong shape for a
  300s function — locked at roadmap level).
- **D-10: Required filters + `--dry-run` + `--limit N`.** Country, region, and category
  are required (no accidental "import everything"). `--dry-run` parses, dedupes, and
  reports counts without writing. `--limit N` caps the write. Directly answers the
  ~2,147-actionable-vs-10–50/week volume gap.
- **D-11: Dry-run prints a random sample of 20–30 candidate rows** (name, domain,
  category, website reachable?) for a manual eyeball BEFORE the first real import — the
  Pitfall 3 sample audit is a step Joshua actually performs, not a doc note. After a real
  import, prospects land as `new` and are reviewed in the admin list (Phase 3) before
  anything proceeds.
- **D-12: Country is recorded per prospect** (IMP-06), a parameter and never hardcoded,
  so downstream legal rules apply per country. NL is the first target, not the only one.

### Claude's Discretion
- Exact column names/types beyond those named above, the `prospect_sources` table's full
  shape, the domain-normalisation function (registrable domain via public-suffix logic),
  the migration file structure, and the `--dry-run` report/sample output format are the
  planner's/researcher's call, consistent with the codebase's existing conventions.
- Whether chains/franchises surfaced by domain-collapse are worth keeping as prospects is
  a downstream triage judgement, not a Phase 1 schema decision — they collapse to one
  prospect regardless.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Data model & identity
- `.planning/research/ARCHITECTURE.md` §Data Model — the `prospects` / `outreach_messages`
  / `suppressions` table sketches. **NOTE:** this phase OVERRIDES its
  `overture_gers_id UNIQUE NOT NULL` scalar identity with domain-as-identity + a
  `prospect_sources` child table (D-01, D-02). Read the rest of the data model as-is.
- `.planning/research/ARCHITECTURE.md` §Pattern 2 (Stable identity via upstream ID) —
  the GERS-ID idempotency rationale, still valid at the source-row level.

### Data quality risk (drives the trust gate)
- `.planning/research/PITFALLS.md` §Pitfall 3 (Overture Maps data quality) — the
  proven 98% false-positive history, dedup-by-domain-here mandate, and the manual
  sample-audit requirement that D-11 implements.

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — IMP-01 … IMP-07 (lines 16–22).
- `.planning/ROADMAP.md` §Phase 1 — success criteria and the "importer is a script,
  not a Vercel route" note.
- `.planning/PROJECT.md` — the leads-vs-prospects legal distinction and single-tenant /
  country-as-parameter constraints.

### Codebase integration
- `.claude/CLAUDE.md` (project) — stack, conventions, naming, and the Supabase migration
  location (`supabase/migrations/`).
- `.planning/codebase/STACK.md`, `.planning/codebase/ARCHITECTURE.md` — existing
  `scans` / `leads` schema the new tables sit alongside.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `supabase/migrations/` — 9 existing migrations (Mar–Jun 2026); new tables follow the
  same migration convention and schema style.
- `lib/supabase.ts` / `createServerClient()` — the server-side DB access pattern the
  import script and later routes use.
- Existing `scans` and `leads` tables — the new `scans.prospect_id` FK attaches here;
  `prospects` sits deliberately alongside `leads`, not merged into it.

### Established Patterns
- Server-only utilities use the `.server.ts` suffix; scripts live outside the Next.js
  request path (importer is a standalone `tsx`-run script, matching `scanner-service`'s
  `tsx` dev usage).
- Custom error types thrown for validation failures (e.g. `UrlValidationError`) — the
  domain-normalisation/URL handling should follow the same pattern.

### Integration Points
- `scans.prospect_id uuid FK (nullable)` — inbound-flow scans leave it null; the Phase 4
  dispatcher sets it. Landed as a migration here.
- `prospects.latest_scan_id uuid FK → scans.id (nullable)` — "current scan for this
  prospect"; the reciprocal of `scans.prospect_id`.

</code_context>

<specifics>
## Specific Ideas

- Domain normalisation must reduce to the **registrable domain** (public-suffix aware) so
  `www.example.co.uk` and `example.co.uk` collapse to one identity — this is the crux of
  IMP-04 and must not be a naive host-string compare.
- The `--dry-run` sample is explicitly for catching the Pitfall-3 failure class (closed
  businesses, parked/directory pages, mis-tagged categories) before scale — reachability
  is a useful signal to show in the sample even though full triage is Phase 3.

</specifics>

<deferred>
## Deferred Ideas

- **Send-gate no-website guard (outreach phase):** the hard assertion in D-08 is
  implemented where sends happen, not in Phase 1. Carry this as a requirement for the
  outreach phase so it isn't lost: "a prospect with no contactable URL cannot produce a
  sent message; assert at the send path."
- **`website_url` change review UI (Phase 3+):** D-05 records a pending URL change; the
  surface where Joshua reviews and accepts/rejects it belongs with the admin prospect UI,
  not the importer.
- **`campaigns` table:** deliberately not built. `campaign_tag text` on `prospects`
  covers waves; a full campaigns table is speculative at 10–50/week (research decision,
  reaffirmed).
- **Manual same-domain merge tooling:** first-seen-wins is automatic; any future
  "re-pick the winning source" admin action is out of scope for v1.

</deferred>

---

*Phase: 1-prospect-data-foundation-import*
*Context gathered: 2026-07-17*
