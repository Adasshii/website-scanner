# Phase 1: Prospect Data Foundation & Import - Research

**Researched:** 2026-07-17
**Domain:** Overture Maps bulk-data ingestion (DuckDB/GeoParquet) + Postgres identity/dedupe schema design
**Confidence:** MEDIUM-HIGH — schema/upsert mechanics are HIGH (verified against Postgres docs and this codebase's own conventions); Overture ingestion mechanics are MEDIUM (official docs, but the ecosystem is mid-migration on category taxonomy as of this writing, and no local Overture query was actually run against live data this session)

## Summary

Overture Places is queried directly from its public S3 GeoParquet bucket via DuckDB's `spatial` + `httpfs` extensions — no full-planet download, no API key, no hosted endpoint needed. For a Node/TypeScript script, the official `@duckdb/node-api` package runs DuckDB in-process (no separate CLI binary required, which matters here because the DuckDB CLI is **not installed** on this machine — see Environment Availability). Filtering by country/region maps to the place row's own `addresses[1].country` / `addresses[1].region` fields (no spatial join with the `divisions` theme needed for this use case); filtering by category maps to `categories.primary` today, with a schema migration to `taxonomy.primary`/`basic_category` in flight that the importer should detect at runtime rather than hardcode.

The GERS ID is a stable-but-not-eternal UUID-shaped identifier (Overture documents real churn between releases for a small fraction of newly-added places) — good enough for idempotent per-record upserts within and across imports, but it is not a cryptographic guarantee, which is exactly why CONTEXT.md's D-01/D-02 design (domain as primary identity, GERS in a child table) is the more defensible choice than the research spec's original scalar-GERS-unique idea. `websites` on an Overture place is a **list**, not a scalar field, and is sparsely populated — the importer must pick `websites?.[0]` and treat absence as the no-website path (IMP-07), not as a data error.

The domain-vs-GERS dual-identity requirement (D-01/D-02/D-06) cannot be expressed as a single `INSERT ... ON CONFLICT` statement, because the two candidate arbiter indexes (`prospects.domain` partial-unique, `prospect_sources.overture_gers_id` unique) live on two different tables and Postgres only supports one conflict target per `INSERT`. The importer must branch in application code: look up by GERS ID first (idempotency, IMP-03), then by domain (collapse, IMP-04), then insert new. Each branch is then a plain single-table write — no CTEs or stored procedures required, consistent with this codebase's existing convention of doing branching logic in TypeScript, not in the database.

**Primary recommendation:** Use `@duckdb/node-api` (in-process, no CLI dependency) to pull a country/region/category slice into a JS array, then run `scripts/import-prospects.ts` (a plain `tsx`-executed script using the existing `createServerClient()` pattern) to branch-and-upsert each row via the GERS-then-domain lookup algorithm below. Normalize domains with `tldts.getDomain()` — do not hand-roll public-suffix logic; the codebase's existing `extractDomain()` in `lib/url-validation.ts` only strips `www.` and is not public-suffix-aware, so it is insufficient for IMP-04 as-is (do not extend it; introduce `tldts` alongside it for this dedupe-specific use).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Overture data pull (query GeoParquet by country/region/category) | Script (Node/TS, local process) | — | Bulk GeoParquet scan is the wrong shape for a Vercel function (D-09, roadmap-locked); runs outside any deployable's request path |
| Domain normalization (registrable domain) | Script (shared with future app code) | Database / Storage (enforced by partial unique index) | Normalization is app logic; the DB constraint is the backstop that makes IMP-04 structural, not just convention |
| Identity resolution (GERS-first, then domain) | Script | Database / Storage | Branching logic must run in application code (two different arbiter indexes on two tables); DB only enforces the two uniqueness rules independently |
| Re-import field freeze (D-04/D-05) | Script (decides what to write) | Database / Storage (columns simply aren't touched) | No triggers needed — the importer never issues an UPDATE for frozen columns; freezing is achieved by omission, not by a DB-side guard, matching this codebase's "no DB business logic" convention (see existing migrations: only `delete_expired_*` functions exist, and those are unconditional deletes, not conditional business rules) |
| `scans.prospect_id` / `prospects.latest_scan_id` FKs | Database / Storage | — | Pure schema; no application logic lands in this phase |
| Dry-run reachability sample (D-11) | Script | — | A lightweight HTTP check, not the full Phase 3 triage pipeline; reuses `lib/url-validation.server.ts`'s SSRF-safe fetch path since Overture-sourced URLs are untrusted third-party input |

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

- **D-01: Domain is the primary identity.** Normalised registrable domain is the unique key on `prospects`. The research spec's `overture_gers_id UNIQUE NOT NULL` scalar is explicitly overridden.
- **D-02: GERS IDs live in a child `prospect_sources` table** (one prospect, many Overture source records). Each source row carries its `overture_gers_id` (unique in that table) plus the raw Overture fields it contributed. Re-running the importer upserts sources by GERS ID (idempotent, IMP-03) and attaches same-domain sources to the existing prospect (collapse, IMP-04).
- **D-03: First-seen wins for display fields.** The first import to create a prospect sets `name`, `address`, `category`, `region`. Later same-domain sources are stored but do NOT overwrite the displayed fields. Overture confidence score is deliberately NOT used as the winner rule.
- **D-04: Overture owns source fields only; Joshua's work is frozen.** Re-import may refresh raw Overture fields and append new sources. It NEVER touches `lifecycle_state`, `triage_score`, `triage_checked_at`, `latest_scan_id`, `contact_email`, `contact_email_type`, or `outreach_messages` approval history.
- **D-05: `website_url` freezes once work starts.** While `new`, re-import may refresh `website_url` freely. Once `triaged` or beyond, `website_url` is frozen; an incoming Overture change is recorded (`website_url_changed_at` + a nullable pending-value column) for Joshua to review — never auto-applied. **Planner note carried from CONTEXT.md:** exact pending-value column name/shape is the planner's call; this research recommends `website_url_pending text`.
- **D-06: Two identity paths coexist.** Has-domain prospects key on domain; no-domain (no-website) prospects key on GERS ID with a null `domain`. Domain uniqueness must be a **partial unique index**: `UNIQUE (domain) WHERE domain IS NOT NULL`.
- **D-07: No-website prospects get `lifecycle_state = 'no_website'`** (not a separate flag column). Imported (IMP-07) but sit outside the active funnel.
- **D-08: Outreach exclusion asserted at the send gate** (outreach phase, not this one). Phase 1's job is only to establish the `no_website` state and partial-unique constraint.
- **D-09: The importer is a repeatable parameterised script** (`scripts/import-prospects.ts`), run locally/on-demand, NOT a Vercel route.
- **D-10: Required filters + `--dry-run` + `--limit N`.** Country, region, category required. `--dry-run` parses, dedupes, and reports counts without writing. `--limit N` caps the write.
- **D-11: Dry-run prints a random sample of 20–30 candidate rows** (name, domain, category, website reachable?) before the first real import.
- **D-12: Country is recorded per prospect** (IMP-06), a parameter, never hardcoded.

### Claude's Discretion

- Exact column names/types beyond those named above, the `prospect_sources` table's full shape, the domain-normalisation function, the migration file structure, and the `--dry-run` report/sample output format.
- Whether chains/franchises surfaced by domain-collapse are worth keeping as prospects is a downstream triage judgement, not a Phase 1 schema decision.

### Deferred Ideas (OUT OF SCOPE)

- Send-gate no-website guard (outreach phase) — carried as a requirement for that later phase.
- `website_url` change review UI (Phase 3+) — D-05 records the pending change; the review surface is not this phase.
- `campaigns` table — deliberately not built; `campaign_tag text` on `prospects` covers waves.
- Manual same-domain merge tooling — first-seen-wins is automatic; out of scope for v1.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IMP-01 | Import businesses from Overture filtered by country, region, category | DuckDB + `@duckdb/node-api` query pattern below; `addresses[1].country`/`.region` + `categories.primary`/`taxonomy.primary` filter mapping |
| IMP-02 | Repeatable parameterised script, not manual entry | `scripts/import-prospects.ts` CLI shape, arg validation, `--dry-run`/`--limit` design below |
| IMP-03 | Re-running does not duplicate (stable GERS identity) | GERS-first lookup in the identity-resolution algorithm; GERS stability caveat documented |
| IMP-04 | Dedupe by normalised registrable domain | `tldts.getDomain()` recommendation; partial unique index; domain-then-GERS resolution order |
| IMP-05 | Re-import never overwrites triage/lifecycle/approval work | Field-freeze-by-omission pattern; concrete branch-level SQL/TS showing which columns each path touches |
| IMP-06 | Country recorded per prospect | `country` column populated from `addresses[1].country` at creation; freeze-policy question flagged below |
| IMP-07 | No-website prospects imported and marked, excluded from outreach | `lifecycle_state = 'no_website'` path; partial unique index mechanics; GERS-only identity for these rows |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@duckdb/node-api` | 1.5.4-r.1 (verified via `npm view`, published 2026-06-17) [VERIFIED: npm registry — but see Package Legitimacy Audit, flagged SUS by the recency heuristic despite being the official DuckDB org package] | In-process DuckDB query engine for Node/TS; queries Overture GeoParquet directly from S3 | Official DuckDB Foundation package (`duckdb/duckdb-node-neo` on GitHub), Promise-native, no separate CLI binary needed — and the CLI is not installed on this machine (see Environment Availability) |
| `tldts` | 7.4.9 (verified via `npm view`, published 2026-07-16) [ASSUMED — discovered via WebSearch/training knowledge, not an official-docs source; registry existence confirmed but see provenance rule] | Registrable-domain / public-suffix-aware parsing | 59.5M weekly downloads, purpose-built for exactly this (public-suffix-list aware, handles `.co.uk` etc.); the codebase's own `extractDomain()` only strips `www.` and is not suffix-aware — insufficient for IMP-04 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | already a devDependency in `scanner-service/package.json` (^4.19.0); add to root `package.json` too, or run via `npx tsx` | Executes the TypeScript script directly, no build step | Matches the existing `scanner-service` dev-script convention (`tsx watch src/index.ts`) — reuse the same tool, don't introduce `ts-node` |
| `@supabase/supabase-js` | already a root dependency (2.99.3) | DB writes from the script, same `createServerClient()` pattern used elsewhere | Reuse the existing pattern — do not add `pg` or a second DB client just for this script |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@duckdb/node-api` (in-process) | Shell out to the `duckdb` CLI binary via `child_process` | CLI is not installed locally (`command -v duckdb` returned nothing) — would add a new local-machine setup step Joshua has to do once; the npm package installs via normal `npm install` and downloads its own native bindings, matching how this project already handles native deps (Playwright's Docker base image, `chrome-launcher`) |
| `tldts` | Hand-rolled `www.`-strip + regex | Fails on multi-part public suffixes (`.co.uk`, `.com.au`) — exactly the IMP-04 crux CONTEXT.md calls out explicitly; do not hand-roll (Don't Hand-Roll below) |
| Country/region filter via `addresses[1].country/.region` | Spatial join against the `divisions` theme (`division_area` + `ST_Intersects`) | Divisions gives more precise sub-national boundaries but requires downloading and joining a second theme and using spatial functions; addresses fields are a direct string filter on the same place row — simpler, and sufficient for "country + a named region," which is what D-10/D-12 actually ask for. Escalate to divisions only if a named region turns out to need boundary-level precision Overture's own `addresses.region` string doesn't capture |

**Installation:**
```bash
npm install @duckdb/node-api tldts
npm install --save-dev tsx  # if not already present at root
```

**Version verification:** confirmed live via `npm view <pkg> version` this session (see table above) — training-data versions for both packages would have been stale by months; always re-check at plan time.

## Package Legitimacy Audit

| Package | Registry | Age (latest publish) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@duckdb/node-api` | npm | published 2026-06-17 (~1 month before this research date) | ~985K/week | `github.com/duckdb/duckdb-node-neo` | **[SUS]** (seam heuristic: "too-new") | **Flagged — planner must add `checkpoint:human-verify` before install.** Almost certainly a false positive: it is the official DuckDB Foundation org-scoped package, actively maintained, no `postinstall` script beyond normal native-binary fetch. The "too-new" signal is measuring recency of the *latest version publish*, not the package's overall age — DuckDB ships frequent point releases. Verify the repo (`duckdb/duckdb-node-neo`) and version on npmjs.com before running `npm install` the first time. |
| `tldts` | npm | published 2026-07-16 (1 day before this research date) | ~59.5M/week | `github.com/remusao/tldts` | **[SUS]** (seam heuristic: "too-new") | **Flagged — planner must add `checkpoint:human-verify` before install.** Same false-positive pattern: an extremely well-established, hugely-downloaded package that happened to cut a patch release the day before this research ran. Confirm on npmjs.com before first install. |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `@duckdb/node-api`, `tldts` — both flagged solely by the "publish recency" heuristic, both cross-checked here against download counts (985K/wk and 59.5M/wk respectively) and official GitHub org repos, which is strong countervailing evidence. The planner should still insert a `checkpoint:human-verify` task before either `npm install` per protocol, but Joshua can likely clear both quickly by glancing at npmjs.com.

*Both packages were discovered via WebSearch, not an authoritative source, so they additionally carry `[ASSUMED]` provenance per the package-name provenance rule — registry existence and download counts corroborate but do not by themselves promote them to `[VERIFIED]`.*

## Architecture Patterns

### System Architecture Diagram

```
                          ┌─────────────────────────────┐
                          │  Overture S3 GeoParquet      │
                          │  (public, no auth)           │
                          │  theme=places/type=place     │
                          └──────────────┬───────────────┘
                                         │ read_parquet() via
                                         │ DuckDB spatial+httpfs
                                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  scripts/import-prospects.ts  (tsx, run locally/on-demand — NOT Vercel)│
│                                                                        │
│  1. Parse & validate CLI args (country, region, category REQUIRED;   │
│     --dry-run, --limit N optional)                                   │
│  2. Query Overture via @duckdb/node-api:                             │
│     WHERE addresses[1].country = <country>                           │
│       AND addresses[1].region  = <region>  (if given)                │
│       AND (categories.primary = <category> OR taxonomy.primary = …)  │
│  3. For each returned row:                                           │
│     a. domain = row.websites?.[0] ? tldts.getDomain(...) : null      │
│     b. Look up prospect_sources BY overture_gers_id  ─── IMP-03 ──┐  │
│     c. else look up prospects BY domain (if domain not null) ─IMP-04┤│
│     d. else INSERT new prospect (domain or null, per D-06/D-07)     │
│     e. UPSERT prospect_sources row (raw Overture fields)            │
│     f. Conditionally refresh website_url / write pending (D-05)     │
│        — NEVER touch triage/lifecycle/contact columns (D-04)        │
│  4. --dry-run: skip all writes; print counts + random 20–30 sample  │
│     with a lightweight reachability ping (reuses SSRF-safe fetch)   │
└───────────────────────────┬────────────────────────────────────────┘
                            │ createServerClient() (existing lib/supabase.ts)
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Supabase Postgres                                                    │
│  prospects (domain UNIQUE WHERE NOT NULL) ── 1:N ── prospect_sources │
│  scans.prospect_id (nullable FK, unrelated inbound flow untouched)   │
└──────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
scripts/
└── import-prospects.ts        # CLI entrypoint: arg parsing, dry-run report, orchestration
lib/
├── overture-client.ts          # DuckDB query construction + execution (isolated so it's testable/mockable)
├── domain-normalize.ts         # normalizeDomain(url): string | null — wraps tldts, throws DomainValidationError
└── prospect-upsert.ts          # the GERS-then-domain identity-resolution algorithm (pure-ish, takes a Supabase client)
supabase/migrations/
├── 010_create_prospects.sql
├── 011_create_prospect_sources.sql
├── 012_create_outreach_messages.sql
└── 013_add_prospect_id_to_scans.sql
```

### Structure Rationale

- **Split `overture-client.ts` / `domain-normalize.ts` / `prospect-upsert.ts` out of the CLI script itself**: each becomes independently unit-testable (see Validation Architecture) without needing DuckDB or a live Supabase connection in every test. The CLI script (`scripts/import-prospects.ts`) stays a thin orchestrator — argument parsing and wiring, nothing else.
- **Four migrations, not one**: matches the existing convention of one focused migration per concern (see `supabase/migrations/002` through `009`, each adding one thing). `prospects` and `prospect_sources` are split because they have genuinely different lifecycles and D-02 treats them as separate concerns.
- **`domain-normalize.ts` alongside, not inside, `lib/url-validation.ts`**: the existing `extractDomain()` there is used by the *scan* pipeline for a different purpose (grouping same-domain scan rate-limits/caches) and is deliberately simple. Overloading it with public-suffix logic changes its behavior for existing callers. A new, explicitly-named function avoids that blast radius — this is the one place "reuse the existing function" is the wrong lazy move, mirroring the same reasoning ARCHITECTURE.md gives for not merging `prospects` into `leads`.

### Pattern 1: GERS-first, then domain — identity resolution as application-level branching, not a single upsert

**What:** A single Overture place row can be idempotent-updated (same GERS ID seen before), collapse into an existing prospect (new GERS ID, same domain), or create a brand-new prospect. These are three different SQL operations against two different tables with two different arbiter indexes (`prospects.domain` partial-unique, `prospect_sources.overture_gers_id` unique) — Postgres's `INSERT ... ON CONFLICT` only supports one conflict target per statement, so this cannot be one upsert. Branch in TypeScript instead.

**When to use:** Any time two independent uniqueness rules on two different tables need to jointly decide "is this a duplicate," dedupe resolution belongs in application code, with each resulting branch reduced to one simple single-table write.

**Example:**
```typescript
// lib/prospect-upsert.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeDomain } from "./domain-normalize";

interface OverturePlaceRow {
  gersId: string;
  name: string | null;
  address: string | null;
  category: string | null;
  region: string | null;
  country: string;
  websiteUrl: string | null; // already reduced from websites[0]
  confidence: number | null;
}

export async function upsertOverturePlace(
  sb: SupabaseClient,
  place: OverturePlaceRow,
  campaignTag: string | null
): Promise<{ prospectId: string; created: boolean }> {
  const domain = place.websiteUrl ? normalizeDomain(place.websiteUrl) : null;

  // 1. Idempotency (IMP-03): have we imported this exact Overture record before?
  const { data: existingSource } = await sb
    .from("prospect_sources")
    .select("prospect_id")
    .eq("overture_gers_id", place.gersId)
    .maybeSingle();

  if (existingSource) {
    await sb
      .from("prospect_sources")
      .update({
        raw_name: place.name,
        raw_address: place.address,
        raw_category: place.category,
        raw_region: place.region,
        raw_country: place.country,
        raw_website_url: place.websiteUrl,
        raw_confidence: place.confidence,
        last_seen_at: new Date().toISOString(),
      })
      .eq("overture_gers_id", place.gersId);
    // D-04: no write to prospects' work columns here, ever.
    await maybeRefreshWebsiteUrl(sb, existingSource.prospect_id, place.websiteUrl);
    return { prospectId: existingSource.prospect_id, created: false };
  }

  // 2. Collapse (IMP-04): does this domain already have a prospect?
  if (domain) {
    const { data: existingProspect } = await sb
      .from("prospects")
      .select("id, lifecycle_state, website_url")
      .eq("domain", domain)
      .maybeSingle();

    if (existingProspect) {
      await sb.from("prospect_sources").insert({
        prospect_id: existingProspect.id,
        overture_gers_id: place.gersId,
        raw_name: place.name, raw_address: place.address, raw_category: place.category,
        raw_region: place.region, raw_country: place.country,
        raw_website_url: place.websiteUrl, raw_confidence: place.confidence,
      });
      // D-03: display fields NOT touched — first-seen prospect row already has them.
      await maybeRefreshWebsiteUrl(sb, existingProspect.id, place.websiteUrl, existingProspect);
      return { prospectId: existingProspect.id, created: false };
    }
  }

  // 3. Brand new prospect (has-domain OR no-website path, D-06/D-07).
  const { data: newProspect, error } = await sb
    .from("prospects")
    .insert({
      domain, // null for no-website prospects — partial unique index allows many NULLs
      name: place.name, address: place.address, category: place.category,
      region: place.region, country: place.country, website_url: place.websiteUrl,
      lifecycle_state: domain ? "new" : "no_website",
      campaign_tag: campaignTag,
    })
    .select("id")
    .single();
  if (error) throw error;

  await sb.from("prospect_sources").insert({
    prospect_id: newProspect.id, overture_gers_id: place.gersId,
    raw_name: place.name, raw_address: place.address, raw_category: place.category,
    raw_region: place.region, raw_country: place.country,
    raw_website_url: place.websiteUrl, raw_confidence: place.confidence,
  });
  return { prospectId: newProspect.id, created: true };
}

// D-05: website_url freezes once lifecycle_state leaves 'new'; later change is
// recorded as a pending value for review, never auto-applied.
async function maybeRefreshWebsiteUrl(
  sb: SupabaseClient,
  prospectId: string,
  incomingUrl: string | null,
  known?: { lifecycle_state: string; website_url: string | null }
) {
  if (!incomingUrl) return;
  const current = known ?? (await sb
    .from("prospects").select("lifecycle_state, website_url").eq("id", prospectId).single()).data;
  if (!current || incomingUrl === current.website_url) return;

  if (current.lifecycle_state === "new") {
    await sb.from("prospects")
      .update({ website_url: incomingUrl, updated_at: new Date().toISOString() })
      .eq("id", prospectId);
  } else {
    await sb.from("prospects")
      .update({ website_url_pending: incomingUrl, website_url_changed_at: new Date().toISOString() })
      .eq("id", prospectId);
  }
}
```

**Trade-offs:** Several sequential round trips per Overture row instead of one batched statement. Acceptable — this is a local, on-demand script processing a country/region/category slice (hundreds to low thousands of rows per run, not a hot path), and matches the ladder: don't reach for a stored procedure or a CTE-based mega-upsert when plain sequential branching is simpler and this codebase has no existing convention of putting business logic in the database (its only DB functions are unconditional retention deletes).

### Pattern 2: DuckDB in-process query against Overture S3 GeoParquet

**What:** Query Overture's public S3 bucket directly with predicate pushdown, no download step.
**When to use:** Any bulk read of Overture data scoped by a filter Parquet's column statistics can use to skip row groups (bbox, and to a lesser extent flat scalar columns).

**Example:**
```typescript
// lib/overture-client.ts
import { DuckDBInstance } from "@duckdb/node-api";

const OVERTURE_RELEASE = "2026-06-17.0"; // update when Overture cuts a new release

export interface OvertureQueryParams {
  country: string;   // ISO 3166-1 alpha-2, e.g. "NL"
  region?: string;    // matches addresses[1].region as Overture encodes it
  category: string;   // categories.primary (or taxonomy.primary — detect at runtime, see caveat below)
  limit?: number;
}

export async function queryOverturePlaces(params: OvertureQueryParams) {
  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();
  await conn.run("INSTALL spatial; LOAD spatial; INSTALL httpfs; LOAD httpfs;");
  await conn.run("SET s3_region='us-west-2';");

  // Detect which category field the current release actually has —
  // Overture is mid-migration from `categories.primary` to `taxonomy.primary`/`basic_category`
  // as of this research date; do not hardcode one without checking (see Open Questions).
  const categoryColumn = await detectCategoryColumn(conn);

  const path = `s3://overturemaps-us-west-2/release/${OVERTURE_RELEASE}/theme=places/type=place/*`;
  const limitClause = params.limit ? `LIMIT ${params.limit}` : "";
  const sql = `
    SELECT id AS gers_id, names.primary AS name, websites, addresses,
           ${categoryColumn} AS category, confidence
    FROM read_parquet('${path}', filename=true, hive_partitioning=1)
    WHERE addresses[1].country = '${params.country}'
      ${params.region ? `AND addresses[1].region = '${params.region}'` : ""}
      AND ${categoryColumn} = '${params.category}'
    ${limitClause}
  `;
  const reader = await conn.runAndReadAll(sql);
  return reader.getRowObjects();
}
```

**Trade-offs:** `addresses[1].country`/`.region` are struct-field predicates on a nested list column — Parquet row-group statistics may not prune as effectively on these as on flat scalar/bbox columns, so a country+category-only query could scan more of the dataset than a bbox-first query would. At this project's scale (an on-demand local script, not a hot path) this is an acceptable trade for correctness and simplicity over a bbox+division-boundary spatial join. If a real import run proves too slow in practice, add a coarse bbox pre-filter (looked up once per country, e.g. from a small hardcoded ISO2→bbox table) as a performance optimization — do not build that until the simple version is proven too slow.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Registrable domain / public-suffix parsing | A regex that strips known TLDs, or extending `extractDomain()`'s `www.`-strip | `tldts.getDomain()` | Public suffix rules are a maintained, versioned list (`.co.uk`, `.com.au`, hundreds of exceptions) — this is exactly the class of problem CONTEXT.md's D-01/IMP-04 calls out as needing to not be a naive host-string compare |
| Overture bulk data access | A custom S3 GeoParquet reader, or downloading the whole `places` theme | DuckDB `spatial`+`httpfs` extensions via `@duckdb/node-api` | Predicate pushdown on remote Parquet via HTTP range requests is exactly what DuckDB's Parquet reader + httpfs already does; reimplementing this is significant, unnecessary engineering |
| Dual-identity upsert (domain-or-GERS) as one mega-SQL statement | A CTE with `COALESCE`d conflict targets or a Postgres function encapsulating both arbiter indexes | Application-level GERS-first-then-domain branching (Pattern 1 above) | Postgres fundamentally does not support two conflict targets on two different tables in one `INSERT`; forcing this into SQL would require a stored procedure this codebase has no precedent for and doesn't need at this scale |

**Key insight:** every "don't hand-roll" item above already has a mature answer maintained by people who track edge cases (public suffix changes, Parquet format details, Postgres's own conflict-resolution semantics) that this project has no reason to re-derive.

## Runtime State Inventory

Not applicable — this is a greenfield phase (new tables, new script). No rename/refactor/migration of existing naming or state is involved. `scans.prospect_id` is a new nullable column added to an existing table, not a rename.

## Common Pitfalls

### Pitfall 1: Trusting the Overture `categories.primary` field name without checking the current release

**What goes wrong:** Overture is actively deprecating `categories` in favor of `taxonomy.primary`/`basic_category` (announced timeline: "several months" coexistence from the taxonomy-guide docs, but a separate Overture blog post described removal in the "June 2026 release" — these two official-adjacent sources disagree, and this research is being done in July 2026, right at the edge of that window). A hardcoded `categories.primary` filter could silently return zero rows (or error) against a release where the field has actually been dropped.
**Why it happens:** Cutting-edge open geodata schemas migrate on a rolling basis; docs pages lag the actual schema, and different doc pages were written at different points in the migration.
**How to avoid:** At runtime, `DESCRIBE SELECT * FROM read_parquet(<path>) LIMIT 0` (or catch the "column not found" error) to detect whether `categories` or only `taxonomy`/`basic_category` exists in the release actually being queried, and pick the filter column accordingly — don't hardcode one and assume it's still there.
**Warning signs:** The importer's dry-run returns 0 rows for a category/country combination Joshua knows has real matches — check the schema-detection branch before assuming the category itself is wrong.

### Pitfall 2: Treating `websites[0]` as guaranteed present or guaranteed correct

**What goes wrong:** `websites` is an optional list, frequently empty, and even when present may point to a directory/aggregator page rather than the business's own site (this is the exact Pitfall 3 failure class already documented in `.planning/research/PITFALLS.md` — the 98%-false-positive history). Treating "has a `websites[0]` entry" as "has a live, correct business website" repeats that mistake.
**How to avoid:** `websites?.[0]` presence only decides has-domain vs. no-website routing (IMP-07) at import time. Whether the URL is actually the business's own live site is exactly what the dry-run's lightweight reachability check (D-11) and Phase 3's real triage exist to catch — this phase's job is only correct routing and dedupe, not correctness verification.

### Pitfall 3: Fetching an Overture-sourced URL during the dry-run reachability check without SSRF protection

**What goes wrong:** The dry-run sample (D-11) fetches arbitrary third-party URLs pulled from an external dataset Overture doesn't vouch for the safety of. A malformed or malicious entry could point at `localhost`, a cloud metadata endpoint, or an internal network address — the exact class of attack `lib/url-validation.server.ts`'s `validateUrlSafe()` already exists to block for the public scan flow.
**Why it happens:** It's tempting to write a quick standalone `fetch()` for "just a reachability ping" without routing it through the existing hardened validator, since this is "just a script," not a public-facing route.
**How to avoid:** Reuse `validateUrlSafe()` (or at minimum its DNS-resolution + private-IP-block logic) before ever issuing a HEAD/GET request against an Overture-sourced `websites[0]` value, even in the dry-run sample. This is genuinely a case where "it's just a local script" does not reduce the trust boundary — the data source (Overture) is untrusted external input regardless of where the code runs.
**Warning signs:** A dry-run reachability check that imports `fetch()` directly and doesn't import anything from `lib/url-validation.server.ts`.

### Pitfall 4: GERS ID churn being mistaken for a bug in the importer

**What goes wrong:** Overture's own docs describe measurable churn — a documented case where roughly 1,546 places from one monthly release didn't carry the same GERS ID into the next release. If a prospect's underlying Overture record gets reassigned a new GERS ID between import runs, the importer will see it as a "new source" — and if the domain also happens to differ or be absent, this could produce what looks like a duplicate prospect, when it's actually Overture's own upstream instability.
**How to avoid:** Domain-based collapse (IMP-04) is the safety net here — as long as the domain is unchanged, a reassigned GERS ID still collapses into the same prospect via Pattern 1's domain-lookup branch, appending a new `prospect_sources` row rather than creating a duplicate `prospects` row. This is precisely why D-01 (domain as primary identity) is the more defensible design than a scalar GERS-unique key, which would have no recovery path for this exact scenario.
**Warning signs:** A prospect with more `prospect_sources` rows than distinct actual Overture data-collection events — expected and harmless as long as the prospect count itself isn't inflating.

### Pitfall 5: A single `INSERT ... ON CONFLICT` attempting to serve both arbiter indexes

**What goes wrong:** Writing one upsert statement targeting `ON CONFLICT (domain)` and expecting it to also handle the no-website (domain IS NULL) case via the same statement — Postgres will raise `there is no unique or exclusion constraint matching the ON CONFLICT specification` for NULL-domain rows, because the partial index's predicate (`WHERE domain IS NOT NULL`) is not satisfied by a NULL-valued conflict target and must be explicitly repeated in the `ON CONFLICT ... WHERE ...` clause — and even then, it only ever applies to the `prospects` table, never bridging to `prospect_sources`'s separate arbiter index.
**How to avoid:** Follow Pattern 1's two-table branching, not a single upsert. If a single-table upsert against `prospects.domain` is ever attempted directly, it must repeat the predicate: `ON CONFLICT (domain) WHERE domain IS NOT NULL DO UPDATE ...` (verified against Postgres docs and community reports of this exact class of bug).

## Code Examples

### Domain normalization

```typescript
// lib/domain-normalize.ts
import { getDomain } from "tldts";

export class DomainValidationError extends Error {}

/** Reduces a URL/hostname to its registrable domain (public-suffix aware). Returns null if none. */
export function normalizeDomain(input: string): string | null {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const domain = getDomain(withScheme);
  return domain ? domain.toLowerCase() : null;
}
```
```
normalizeDomain("https://WWW.Example.co.UK/path") // "example.co.uk"
normalizeDomain("example.com")                    // "example.com" (no scheme required)
normalizeDomain("http://192.168.1.1")             // null (IP, not a registrable domain)
```

### Migration: `prospects` + `prospect_sources` (following the existing `supabase/migrations/` style)

```sql
-- 010_create_prospects.sql
CREATE TABLE IF NOT EXISTS prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text,                              -- normalised registrable domain; NULL = no-website prospect
  name text,
  address text,
  category text,
  region text,
  country text NOT NULL,                    -- IMP-06: parameter, never hardcoded
  website_url text,
  website_url_pending text,                 -- D-05: proposed change while frozen, never auto-applied
  website_url_changed_at timestamptz,
  campaign_tag text,
  lifecycle_state text NOT NULL DEFAULT 'new'
    CHECK (lifecycle_state IN (
      'new', 'no_website', 'triaged', 'qualified', 'scan_queued', 'scanned',
      'drafted', 'approved', 'contacted', 'replied', 'booked', 'rejected', 'suppressed'
    )),
  triage_score jsonb,
  triage_checked_at timestamptz,
  latest_scan_id uuid,                       -- FK added once scans table reference is safe to add; see below
  contact_email text,
  contact_email_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- D-06: partial unique index — the whole answer to "domain identity OR no-website identity coexisting"
CREATE UNIQUE INDEX IF NOT EXISTS prospects_domain_unique_idx
  ON prospects (domain) WHERE domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_lifecycle_state ON prospects (lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_prospects_country ON prospects (country);

ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
```

```sql
-- 011_create_prospect_sources.sql
CREATE TABLE IF NOT EXISTS prospect_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  overture_gers_id text NOT NULL UNIQUE,   -- IMP-03: the idempotency key for re-imports
  overture_release text,                    -- traceability: which Overture release produced this row
  raw_name text,
  raw_address text,
  raw_category text,
  raw_region text,
  raw_country text,
  raw_website_url text,
  raw_confidence numeric,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_sources_prospect_id ON prospect_sources (prospect_id);

ALTER TABLE prospect_sources ENABLE ROW LEVEL SECURITY;
```

```sql
-- 012_create_outreach_messages.sql (foundation only — logic lands in Phase 6)
CREATE TABLE IF NOT EXISTS outreach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  scan_id uuid,                             -- FK added once scans table exists in this context; nullable
  draft_subject text,
  draft_body text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'edited', 'approved', 'rejected', 'sent')),
  approved_by text,
  approved_at timestamptz,
  sent_at timestamptz,
  resend_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outreach_messages_prospect_id ON outreach_messages (prospect_id);

ALTER TABLE outreach_messages ENABLE ROW LEVEL SECURITY;
```

```sql
-- 013_add_prospect_id_to_scans.sql
ALTER TABLE scans ADD COLUMN IF NOT EXISTS prospect_id uuid REFERENCES prospects(id);
CREATE INDEX IF NOT EXISTS idx_scans_prospect_id ON scans (prospect_id) WHERE prospect_id IS NOT NULL;

ALTER TABLE prospects
  ADD CONSTRAINT prospects_latest_scan_id_fkey
  FOREIGN KEY (latest_scan_id) REFERENCES scans(id);
```

*(Migration ordering note: `latest_scan_id`'s FK constraint is added in the last migration, after `scans` is confirmed to exist and after `prospects` exists — avoids a forward-reference ordering problem within a single migration file.)*

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Overture `categories.primary` as the category filter | `taxonomy.primary` / `basic_category` (new hierarchical taxonomy) | Rolling migration through 2025–2026, both fields coexisting "for several months" per Overture's taxonomy guide | The importer should runtime-detect which field the queried release actually has (Pitfall 1) rather than hardcode |
| Legacy `duckdb` npm bindings (`duckdb` package) | `@duckdb/node-api` ("Node Neo" client) | Legacy package deprecated in favor of Neo; legacy package will not ship for DuckDB 1.5.x (~early 2026) | Use `@duckdb/node-api`, not the older `duckdb` package, even though `npm view duckdb version` still resolves (1.4.4) — it is the deprecated line |

**Deprecated/outdated:** the plain `duckdb` npm package (pre-Neo) — still installable, but on the deprecated line as of the 1.5.x DuckDB series.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `tldts` is the right package name for public-suffix domain parsing (discovered via WebSearch/training knowledge, registry existence and Context7 docs confirmed, but not cross-checked against an official "recommended library" source) | Standard Stack, Code Examples | Low — 59.5M weekly downloads and an active GitHub org are strong corroborating signals even without a single canonical "official recommendation" source; a wrong package name would simply fail to install |
| A2 | `@duckdb/node-api` is the current officially-recommended Node.js client for DuckDB (discovered via WebSearch, corroborated by the official `duckdb.org` docs domain and the `duckdb` GitHub org repo) | Standard Stack, Architecture Patterns | Low-Medium — if DuckDB's Node client story shifts again, the query-construction code in `overture-client.ts` may need updating, but the underlying SQL/DuckDB approach stays valid regardless of which client wraps it |
| A3 | `addresses[1].country`/`.region` reliably filters Overture places by country/region without a spatial join, at acceptable query performance | Architecture Patterns (Pattern 2) | Medium — if this proves too slow or the `region` string doesn't match Joshua's expected admin-area names cleanly against real data, the planner needs a Wave 0 spike task to validate against a real dry-run before committing to this as the only filter path (bbox fallback documented as the escalation) |
| A4 | Overture's `categories.primary` field is still present (not yet fully removed) in the release current at plan/build time | Common Pitfalls (Pitfall 1) | Medium — directly blocks IMP-01 if wrong and not runtime-detected; mitigated by the recommended runtime schema-detection approach rather than a hardcoded assumption |
| A5 | `websites` is genuinely a list (not scalar) in the current schema, and `websites?.[0]` is an acceptable way to pick "the" website | Summary, Common Pitfalls (Pitfall 2) | Low — confirmed directly from the official schema reference page (`docs.overturemaps.org/schema/reference/places/place/`), a primary source, so this is CITED rather than ASSUMED; listed here only because a place could in principle have multiple websites needing a different pick strategy than "always index 0" |

## Open Questions

1. **Should `country` freeze after prospect creation, the same way `website_url` does (D-05), or always refresh on re-import?**
   - What we know: D-03 explicitly lists `name`, `address`, `category`, `region` as first-seen-wins/frozen. D-12 says country is "recorded per prospect," but CONTEXT.md doesn't say whether it's in the frozen group or refreshes like a plain Overture source field.
   - What's unclear: `country` feeds downstream legal-regime lookups (CMP-16, per-country config) — if it silently changed after a prospect had already been triaged/contacted under one country's rules, that's the same danger class D-05 exists to prevent for `website_url`.
   - Recommendation: treat `country` as frozen at creation, identically to the other first-seen-wins fields, for consistency and because a country change after work has started carries real legal-basis risk. Flag this explicitly for the planner to lock as a decision (not left as silent behavior).

2. **What happens when a no-website prospect's underlying Overture record later gains a website (business builds a site between import runs)?**
   - What we know: D-06/D-07 key no-website prospects on GERS ID with `domain IS NULL`. Pattern 1's GERS-first lookup will find the existing `prospect_sources` row and update its raw fields — but the current design (Pattern 1's "known source" branch) does not promote the parent `prospects.domain` from NULL to a real value, since D-05's freeze logic only handles an *existing* `website_url`, not a domain transitioning from absent to present.
   - What's unclear: whether this transition should (a) promote the existing no-website prospect in place (changing its identity path from GERS-only to domain-based, and lifecycle_state from `no_website` to `new`), or (b) leave it as-is until a human notices, or (c) something else. CONTEXT.md's decisions don't address this transition explicitly — it's a genuine gap, not an oversight in this research.
   - Recommendation: the planner should make an explicit decision here rather than let Pattern 1's code silently do nothing. The simplest option consistent with D-05's spirit ("never auto-apply, always let Joshua review") is: detect the transition (known GERS source whose stored `raw_website_url` was previously null and is now non-null) and write it to `website_url_pending` + `website_url_changed_at` for review, without changing `domain` or `lifecycle_state` automatically — treating "gained a website" as structurally the same class of event as "changed website" for review purposes.

3. **Exact Overture release pinning strategy** — hardcode a release string (as sketched in Code Examples) that Joshua updates by hand occasionally, or query for "latest available release" programmatically?
   - What we know: Overture cuts a new monthly release; the S3 path includes the release date/version segment explicitly.
   - What's unclear: whether Overture publishes a stable "latest" alias path, or whether release discovery requires listing the bucket.
   - Recommendation: start with a hardcoded constant (documented, easy to bump) — simplest thing that works; only add release auto-discovery if manually bumping a constant proves to be a recurring friction point.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| DuckDB CLI binary | Alternative Overture-query approach (not the recommended path) | ✗ (not found via `command -v duckdb`) | — | Use `@duckdb/node-api` in-process instead — no separate binary install needed, avoids this gap entirely |
| Node.js | Running `scripts/import-prospects.ts` via `tsx` | ✓ | v24.14.0 (locally; project's stated minimum is 18+) | — |
| `tsx` | Executing the TS script without a build step | ✓ (present in `scanner-service/package.json`; add to root or invoke via `npx tsx`) | ^4.19.0 | — |
| Supabase CLI | Optional local Postgres for integration-testing the migrations/upsert logic | ✓ (`/opt/homebrew/bin/supabase`) | not version-checked this session | If unavailable in CI, integration tests fall back to a dedicated Supabase test project/schema instead of a local stack |
| Docker | Required by `supabase start` for a local Postgres stack | Not explicitly checked this session; already a stated dev requirement for `scanner-service` per STACK.md | — | Same fallback as above |

**Missing dependencies with no fallback:** none — the one missing piece (DuckDB CLI) has a strictly better fallback (`@duckdb/node-api`) that this research recommends as primary anyway.

**Missing dependencies with fallback:** DuckDB CLI (fallback: `@duckdb/node-api`, already the primary recommendation, so this isn't really a gap in practice).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None currently configured — no `*.test.*`/`*.spec.*` files, no `jest.config`/`vitest.config`, no `test` script in either `package.json` (verified by direct search this session) |
| Config file | none — see Wave 0 |
| Quick run command | `npx vitest run lib/domain-normalize.test.ts lib/prospect-upsert.test.ts` (once installed) |
| Full suite command | `npx vitest run` |

**Recommendation:** install `vitest` (fast, ESM-native, no Babel config needed for a Next.js/TS project, zero existing test tooling to migrate away from) as a root devDependency. This is a genuinely new capability for the repo, not a reuse of something existing — flagged explicitly as a Wave 0 gap below, not silently assumed.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IMP-04 | `normalizeDomain()` collapses `www.example.co.uk` and `example.co.uk` to the same value; rejects IPs/localhost | unit | `npx vitest run lib/domain-normalize.test.ts` | ❌ Wave 0 |
| IMP-04 | Two synthetic Overture rows with different `gersId` but the same `websiteUrl` domain produce exactly one `prospects` row and two `prospect_sources` rows | integration (local Supabase or test schema) | `npx vitest run lib/prospect-upsert.integration.test.ts` | ❌ Wave 0 |
| IMP-03 | Running `upsertOverturePlace()` twice with an unchanged fixture row leaves `prospects` and `prospect_sources` row counts unchanged (no duplicate insert) | integration | same file as above | ❌ Wave 0 |
| IMP-05 | A prospect with `lifecycle_state='qualified'` and a set `triage_score` is untouched (`triage_score`, `lifecycle_state`, `contact_email` all identical before/after) by a re-import that changes the incoming `name`/`address` | integration | same file as above | ❌ Wave 0 |
| IMP-05 / D-05 | A `qualified` prospect's `website_url` does not change when the incoming Overture row's website differs; `website_url_pending` and `website_url_changed_at` are set instead | integration | same file as above | ❌ Wave 0 |
| IMP-07 / D-06 | A row with no `websites` entry imports with `domain IS NULL`, `lifecycle_state='no_website'`; two such rows (different GERS IDs, both no-website) create two separate `prospects` rows (no false collapse) | integration | same file as above | ❌ Wave 0 |
| IMP-02 / D-10 | CLI rejects a run missing `--country`/`--region`/`--category` before touching the DB; `--dry-run` performs zero writes; `--limit N` caps write count | integration (invoke the CLI's argument-parsing/orchestration function directly, not necessarily a full subprocess spawn) | `npx vitest run scripts/import-prospects.test.ts` | ❌ Wave 0 |
| — | `scans.prospect_id` nullable FK: insert with NULL succeeds (existing inbound flow), insert with a valid prospect id succeeds, invalid FK fails | integration (migration-level smoke test) | manual or a one-off script run once against a test schema | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** unit tests for `domain-normalize.ts` (fast, no DB) — run on every commit touching normalization logic.
- **Per wave merge:** full integration suite against a local Supabase stack (`supabase start`) or a dedicated test schema — validates the actual partial-unique-index and upsert-branching behavior, which unit tests with mocks cannot meaningfully verify (this phase is fundamentally about real DB constraint behavior).
- **Phase gate:** full suite green, plus the manual D-11 sample-audit (20–30 rows, human-eyeballed) before the first real (non-dry-run) import against production Supabase.

### Wave 0 Gaps

- [ ] Install `vitest` as a root devDependency; add a `test` script to root `package.json` (currently absent entirely).
- [ ] `lib/domain-normalize.test.ts` — unit tests for `normalizeDomain()` edge cases (www, multi-part suffixes, no-scheme input, IPs, localhost).
- [ ] `lib/prospect-upsert.integration.test.ts` — the core dedupe/idempotency/freeze test suite; requires either `supabase start` (local Docker-based Postgres, CLI already installed) or a dedicated Supabase test project with the new migrations applied.
- [ ] `scripts/import-prospects.test.ts` — CLI arg-validation and `--dry-run`/`--limit` behavior tests.
- [ ] A minimal fixture generator for synthetic Overture place rows (shape matching `OverturePlaceRow`), so tests don't depend on live Overture/DuckDB access.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | This phase adds no new HTTP-facing routes or user-facing auth surface; the script runs locally with the existing `SUPABASE_SERVICE_ROLE_KEY` |
| V3 Session Management | No | No session surface introduced |
| V4 Access Control | No | No new API route; the importer is explicitly NOT a Vercel route (D-09) |
| V5 Input Validation | Yes | CLI argument validation (country/region/category required and sane before any DB write, per D-10); domain/URL parsing must not crash on malformed Overture data; **the dry-run reachability check must route through `lib/url-validation.server.ts`'s `validateUrlSafe()`** before fetching any Overture-sourced URL (Pitfall 3) |
| V6 Cryptography | No | Nothing new to encrypt/sign in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| SSRF via an untrusted third-party URL (Overture `websites[0]`) fetched during the D-11 reachability check | Tampering / Information Disclosure | Reuse the existing `validateUrlSafe()` (DNS resolution + private-IP-range blocking) already built for the public scan flow — do not write a second, unguarded `fetch()` for "just a quick reachability ping" |
| Malformed Overture data (missing fields, unexpected types) crashing the importer mid-run and leaving a partial batch | Denial of Service (self-inflicted) | Wrap per-row processing in a try/catch that logs and skips the bad row rather than aborting the whole import — matches this codebase's existing "fail gracefully, never crash the process" convention from the scanner pipeline |
| `SUPABASE_SERVICE_ROLE_KEY` used by a local script rather than a deployed environment | Elevated privilege exposure if the script or its logs leak the key | Load from `.env`/`.env.local` via the same `dotenv` pattern already used in `scanner-service`; never hardcode or log the key; this is an existing project convention, not a new control |

## Sources

### Primary (HIGH confidence)
- [What is GERS? | Overture Documentation](https://docs.overturemaps.org/gers/) — GERS ID stability description
- [Place | Overture Documentation](https://docs.overturemaps.org/schema/reference/places/place/) — exact schema field names/types for `id`, `names`, `categories`, `taxonomy`, `websites`, `socials`, `phones`, `addresses`, `confidence`
- [Postgres documentation and community-verified `ON CONFLICT` + partial-index behavior](https://www.postgresql.org/docs/current/sql-insert.html) — arbiter index / partial-index-predicate repetition requirement
- `@duckdb/node-api` npm registry entry — version 1.5.4-r.1, verified via `npm view` this session
- `tldts` npm registry entry — version 7.4.9, verified via `npm view` this session; Context7 (`/remusao/tldts`) for `getDomain()` API confirmation
- This codebase: `.claude/CLAUDE.md`, `supabase/migrations/001`–`009`, `lib/supabase.ts`, `lib/url-validation.ts`, `lib/url-validation.server.ts` — existing conventions this research builds on directly

### Secondary (MEDIUM confidence)
- [DuckDB | Overture Documentation](https://docs.overturemaps.org/getting-data/duckdb/) — exact DuckDB SQL example (spatial+httpfs load, S3 path pattern, bbox filter syntax)
- [Places Taxonomy | Overture Documentation](https://docs.overturemaps.org/guides/places/taxonomy/) — `categories` → `taxonomy`/`basic_category` migration status and timeline (self-described as approximate, "several months")
- [Divisions Guide | Overture Documentation](https://docs.overturemaps.org/guides/divisions/) — division_area / spatial-join alternative, and confirmation that `addresses` fields can filter by country/region without a spatial join
- [Why Can't PostgreSQL's ON CONFLICT Find My Partial Unique Index? | Medium](https://betakuang.medium.com/why-postgresqls-on-conflict-cannot-find-my-partial-unique-index-552327b85e1) — cross-check on the partial-index-predicate-repetition requirement

### Tertiary (LOW confidence)
- General WebSearch results on DuckDB/Overture community usage (Simon Willison's TIL, dev.to posts, GitHub discussions) — directionally consistent with the primary Overture docs, used only to corroborate, not as the sole source for any claim above

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM — package names/versions verified live against npm registry this session, but discovered via WebSearch/training knowledge rather than an authoritative "official recommended library" listing (both `@duckdb/node-api` and `tldts` are flagged `[SUS]`/`checkpoint:human-verify` in the Package Legitimacy Audit purely on a recency heuristic, not on any real red flag found)
- Architecture (identity resolution, migration shape): HIGH — grounded directly in Postgres's own documented `ON CONFLICT`/partial-index semantics and this codebase's existing migration/client conventions, not external speculation
- Overture ingestion mechanics (query shape, category taxonomy state): MEDIUM — official docs, but the ecosystem is mid-migration on the category field as of this exact research date, and no live query was actually executed against Overture data this session (recommend a Wave 0 spike to run one real dry-run against actual data before locking the exact SQL)
- Pitfalls: HIGH — five of the five documented pitfalls trace to either a primary Overture doc, a Postgres-documented behavior, or this project's own existing security utility (`validateUrlSafe`), not speculation

**Research date:** 2026-07-17
**Valid until:** 30 days for the Postgres/schema-design guidance (stable); 7–14 days for the Overture category-taxonomy state specifically, given the documented mid-migration status — re-verify the category field name against the live release before the importer ships if planning is delayed
