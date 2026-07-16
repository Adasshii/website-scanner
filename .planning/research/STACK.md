# Stack Research

**Domain:** B2B prospecting additions on top of an existing Next.js + Railway/Playwright scanner (Overture ingestion, cheap triage, bulk queueing, email extraction)
**Researched:** 2026-07-17
**Confidence:** HIGH (Overture/DuckDB, triage libraries, email extraction) / MEDIUM (queueing — no independent load test of Vercel Cron under real Railway concurrency)

**Hard constraint respected throughout:** no service beyond Vercel, Railway, Supabase, Resend, Gemini. Every recommendation below either runs as an npm dependency inside the existing Next.js app / scanner-service, or as a one-off script executed from a developer machine (or manually invoked, e.g. via `tsx`) — never a new always-on process, container, or SaaS.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@duckdb/node-api` | 1.5.4-r.1 (Node bindings for DuckDB 1.5.x) | Query Overture Maps GeoParquet on S3 and write matched rows straight into Supabase Postgres | DuckDB reads GeoParquet over HTTP(S) via the `httpfs`/`spatial` extensions with predicate pushdown, so you never download the full ~75M-row `places` theme — only the rows that match your `WHERE` clause. Its `postgres` extension (`ATTACH ... (TYPE postgres)`) writes query results directly into a Postgres table with plain `INSERT INTO postgres_db.table SELECT ...` SQL, which turns Supabase into the destination with zero new infra — no Python, no ETL service. `@duckdb/node-api` is the actively maintained successor to the deprecated `duckdb` npm package (that one stops shipping after the 1.4.x line), so this is the only forward-compatible Node binding as of mid-2026. |
| Overture Maps `places` theme (GeoParquet, release `2026-06-17.0` or later) | data, not code | Source of business names, categories, websites, addresses for the target country | Free, global, no API key, no rate limit, no per-record cost — it's an AWS Open Data Sponsorship Program dataset, so S3 egress is sponsored (not requester-pays). This is what makes Overture viable under the near-zero-cost constraint that ruled out Google Places (Enterprise-tier `websiteUri` pricing, 30-day caching limits — see PROJECT.md). |
| Postgres `SELECT ... FOR UPDATE SKIP LOCKED` on a `prospects` table, driven by Vercel Cron | — (uses existing Postgres 14+/15+ in Supabase, no extension) | Bounded work queue for bulk scan dispatch | Zero new infrastructure, zero new dependency. `FOR UPDATE SKIP LOCKED` is the standard Postgres pattern for a multi-consumer queue without double-processing; a Vercel Cron route (the project already runs three) claims a small batch, marks rows `scanning`, and fires them at the Railway scanner service respecting a concurrency cap. At 10–50 prospects/week this is comfortably sufficient — see "What NOT to Use" for why pg-boss/pgmq are the wrong size for this scale. |
| `p-limit` | 7.3.0 (pure ESM) | Cap concurrent full-scan dispatches per cron invocation so Railway's Playwright browser pool isn't overrun | One line of code (`pLimit(N)`) enforces the exact constraint the codebase audit flagged as missing ("browser concurrency will not survive bulk scanning as built"). No custom semaphore code needed. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node's built-in `fetch` (undici, global since Node 18) | — (already the runtime, no install) | HTTP triage: reachability, status code, headers, HTML body | This is already a hard requirement (`Node.js 18+` in STACK.md) so it costs nothing to add. Use `redirect: 'manual'` in a small loop (cap at ~5 hops) to build the actual redirect chain — native `fetch`/`response.redirected` only exposes a boolean, not the chain, so this needs ~10 lines of hand-rolled logic, not a library. |
| Regex/string checks on the raw HTML text | — (no dependency) | Cheap triage signals: `<meta name="viewport"`, `<meta name="generator"`, `<title>` length, `<!doctype html>` presence, response byte size | For a boolean triage score, you do not need a DOM. Presence/absence of a handful of tags is reliably regex-matchable on well-formed HTML, and triage is explicitly meant to be crude and cheap. Skip a parsing library entirely here — see "What NOT to Use." |
| `node-html-parser` | 9.0.0 | Fallback parser only if regex triage proves fragile (malformed HTML, attributes split across lines, need real attribute-value extraction) | Not installed by default. Reach for it only if false positives/negatives in the regex approach show up in practice — it's ~10x lighter than Cheerio/jsdom and enough for head-only meta-tag queries. Do not reach for Cheerio or jsdom for this; see below. |
| Regex email pattern + a small hard-coded generic-prefix list (`info`, `contact`, `sales`, `hello`, `support`, `office`, `admin`, `verkoop`) | — (no dependency) | Classify an extracted address as generic vs. personal | This is a lookup against a short, stable list, not a hard problem — a library adds nothing a 10-line function doesn't already do. |
| A small Cloudflare email-obfuscation decoder (hand-rolled, ~15 lines) | — (no dependency, or vendor `cf-email-decode`'s ~20-line algorithm inline) | Decode `data-cfemail` attributes on sites using Cloudflare's Scrape Shield | The encoding is a single-byte XOR cipher with the key as the first byte — trivially small to inline rather than pull in a package. Only worth adding if triage/extraction actually encounters `/cdn-cgi/l/email-protection` links in practice; don't pre-build it speculatively. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `tsx` (already a scanner-service dependency, 4.19.0) | Run the Overture ingestion script (`scripts/ingest-overture.ts`) without a build step | Reuse what's already installed rather than adding `ts-node` or a build target for a script that runs occasionally, not in production request paths. |
| DuckDB CLI (optional, for one-off exploration) | Ad-hoc querying of the Overture schema/data while building the ingestion query | Not a dependency of the app — a local install (`brew install duckdb` or the standalone binary) used only at the terminal while developing the ingestion script. Never ships. |

## Installation

```bash
# Overture ingestion (run from repo root or a scripts/ package, not scanner-service)
npm install @duckdb/node-api

# Bulk queue dispatch
npm install p-limit

# No install needed for: native fetch, regex-based triage, regex-based email extraction
# (all covered by the Node 18+ runtime already required)

# Only if regex triage proves insufficient in practice:
npm install node-html-parser
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| DuckDB (`@duckdb/node-api`) reading S3 directly | `overturemaps` Python CLI | Only if the team is already Python-fluent and file-based (GeoJSON/Parquet) output is acceptable — it cannot write to Postgres directly, so you'd still need a second step to load the file. Introduces a second language runtime into a TypeScript-only repo for no capability DuckDB lacks. |
| Filtering Overture `places` by `addresses[].country = 'NL'` plus a coarse bounding-box pre-filter | Spatial join against the Overture `divisions` theme (`ST_INTERSECTS` with the country polygon) | Use the divisions join only if a country's `addresses[].country` coverage turns out to be sparse/unreliable for a given market — it's more accurate for oddly-shaped borders but adds a second theme fetch and a spatial join. Start with the address field; it's already an ISO country code on the schema and is far simpler to parameterize (`WHERE addresses.country = $1`). |
| Postgres `SELECT ... FOR UPDATE SKIP LOCKED` pumped by Vercel Cron | `pg-boss` | Reasonable once volume moves well past this project's stated 10–50/week and multiple concurrent producers/consumers are actually needed. Not now — see "What NOT to Use." |
| Postgres `SELECT ... FOR UPDATE SKIP LOCKED` pumped by Vercel Cron | Supabase `pgmq` + `pg_cron` + Edge Functions | Valid, well-documented Supabase pattern, but it introduces Edge Functions as a new compute surface the codebase doesn't currently use, plus a new extension and a second queue abstraction layered on top of Postgres tables the app already reads/writes directly. Overkill for this scale; reconsider only if job volume or fan-out complexity grows an order of magnitude. |
| Regex-only triage | `node-html-parser` / Cheerio from day one | Once triage needs real structural queries (e.g., "does the nav contain N links," not just "does a viewport meta tag exist"), add `node-html-parser`. Don't reach for Cheerio — it wraps `parse5` for spec-correct parsing you don't need for a handful of meta-tag checks, and it's meaningfully heavier than `node-html-parser` for no benefit here. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| Google Places API for bulk ingestion | Already ruled out in PROJECT.md: `websiteUri` field-masking pushes pricing into the ~$35/1K Enterprise SKU tier, and 30-day coordinate-caching terms conflict with holding a durable prospect list. Fatal under the near-zero-cost constraint. | Overture Maps `places` theme (free, no caching restriction, ISO country field built in). |
| `pg-boss` for this queue | It's designed around a persistent worker process that calls `boss.work()`/keeps a connection open to poll and run maintenance jobs. Vercel serverless functions are short-lived and stateless (300s default timeout on Hobby/Pro, up to 800s on Enterprise) — there is no long-running process to host the worker without standing up a new always-on service, which is explicitly out of bounds here. Running `boss.start()` fresh on every cron tick to fake statelessness defeats the point of the library and adds schema-migration overhead on every invocation for a 10–50/week workload. | Plain `SELECT ... FOR UPDATE SKIP LOCKED` against a `prospects` table, invoked by a Vercel Cron route — the same pattern the codebase's own architecture doc already endorses ("No job queue... simpler for small scale"). |
| Supabase `pgmq` + Edge Functions | Adds a genuinely new compute surface (Edge Functions, a separate Deno runtime with its own deploy/observability model) that the existing system doesn't touch anywhere today, plus a second queue abstraction on top of tables you could just query. Justified at real multi-worker, multi-queue fan-out scale — not at 10–50/week with one consumer (the Railway scanner service). | Vercel Cron + plain Postgres, as above. |
| Full DOM libraries (jsdom, Playwright) for the triage pass | This is explicitly the thing triage exists to avoid. jsdom parses and executes enough of the page to be meaningfully slower and heavier than needed for boolean signal checks (~500ms average per jsdom parse vs. ~300ms for Cheerio in published benchmarks, and both are unnecessary compared to a regex scan of raw HTML text); Playwright is the exact cost triage is meant to filter out before it's incurred. | Native `fetch` + regex/string checks on the raw response body. |
| Cheerio for triage-level parsing | Cheerio wraps `parse5` for browser-grade parsing correctness — real value when you're doing complex CSS-selector traversal, but pure overhead for "does this tag exist." Meaningfully heavier than `node-html-parser` for identical coverage of this use case. | Regex first; `node-html-parser` only if regex proves insufficient. |
| A third-party email-scraping npm package (e.g. generic "email-extractor" packages) | These are typically unmaintained, bundle their own (often outdated) obfuscation-decoding heuristics, and duplicate what's already available in the Playwright page context: `page.$$eval('a[href^="mailto:"]', ...)` for mailto links, plus a body-text regex pass, run inside the *existing* crawl — no new dependency, no new network round trip. | Do the extraction inline in `scanner-service` during the page load that's already happening; a single regex + the Cloudflare XOR decoder above covers the realistic cases. |
| `overturemaps` Python CLI as the ingestion mechanism | Introduces Python into an otherwise all-TypeScript repo, and its only output is files (GeoJSON/GeoParquet/etc.) — you'd still need a second step to load into Supabase. | `@duckdb/node-api`, which reads S3 and writes Postgres in one script, one language. |

## Stack Patterns by Variant

**If Overture's `addresses[].country` field turns out sparse or unreliable for a given target country (observed during the NL pilot, not assumed upfront):**
- Fall back to a spatial filter against the Overture `divisions` theme (fetch the country polygon by ISO code, `ST_INTERSECTS` against `places.geometry`).
- Because the divisions theme is part of the same free S3 dataset — no new cost, just a second read plus a spatial join, worth the extra complexity only if the simple field filter is empirically wrong.

**If Overture's `emails` field is present and non-empty for a matched place:**
- Prefer it over crawling the site for an email at all — it's already structured data with no scan cost.
- Because it is documented as sparse for `places` (Overture itself notes low field-fill rates across contact fields), treat it as a bonus signal, not the primary extraction path. The primary path stays "extract from the site during the Playwright scan," per PROJECT.md's own reasoning (the segment being targeted is exactly the one where the site is being loaded anyway).

**If bulk volume grows well past 10–50/week (a future milestone, not this one):**
- Revisit `pg-boss` or Supabase `pgmq`/Edge Functions at that point — both are legitimate at higher scale or when multiple independent consumers exist.
- Because the "no new infra, near-zero cost, YAGNI" framing driving this milestone's recommendations is explicitly scale-dependent; don't build for that scale now.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `@duckdb/node-api@1.5.4-r.1` | Node.js 18+ (already the project's runtime floor) | Uses native bindings via `@duckdb/node-bindings`; no Python required, no separate binary to manage in CI beyond the npm install itself. |
| `@duckdb/node-api` postgres extension (`ATTACH ... (TYPE postgres)`) | Any standard Postgres connection string, including Supabase's pooled/direct connection strings | Uses libpq-style connection strings; use Supabase's direct (non-pgbouncer-transaction-mode) connection for the ingestion script since it runs a bounded, non-request-path batch write, not a pooled high-frequency query. |
| `p-limit@7.3.0` | ESM-only | The project's `package.json` and Next.js 14 already support ESM imports; if the ingestion script or a queue-dispatch route is CommonJS-only for some reason, use dynamic `import()` rather than downgrading to an older CJS-compatible `p-limit` version. |
| Overture release `2026-06-17.0` (or later) GeoParquet | DuckDB `spatial` + `httpfs` extensions (auto-loaded on first use in current DuckDB versions) | Pin the release string in the ingestion script rather than always reading "latest" from the STAC catalog, so re-imports are reproducible and diffable — resolve the newest release explicitly and record it, don't silently roll forward on every run. |

## Sources

- `docs.overturemaps.org/getting-data/` — S3/DuckDB/CLI/STAC access paths, GeoParquet format (WebFetch, HIGH confidence, official docs)
- `docs.overturemaps.org/guides/places/` and `docs.overturemaps.org/schema/reference/places/place/` — places theme schema, field types (`websites`/`socials`/`emails`/`phones` are `list<...>`, `addresses[].country` is an ISO code), current release `2026-06-17.0` (WebFetch, HIGH confidence, official docs)
- `docs.overturemaps.org/getting-data/duckdb/` — exact DuckDB SQL for querying `places` from S3 with `spatial`/`httpfs` (WebFetch, HIGH confidence, official docs)
- `duckdb.org` / `github.com/duckdb/duckdb-postgres` (via search aggregation) — `ATTACH ... (TYPE postgres)` read/write semantics, confirms `INSERT INTO postgres_db.table` writes directly to the attached Postgres database (WebSearch, MEDIUM-HIGH confidence, cross-referenced against DuckDB's own repo and docs)
- `npmjs.com/package/@duckdb/node-api` — current version 1.5.4-r.1, deprecation notice on the legacy `duckdb` package (WebSearch, MEDIUM confidence, npm listing)
- `registry.opendata.aws/overture/` and `aws.amazon.com/opendata/open-data-sponsorship-program/` — confirms Overture's AWS-hosted GeoParquet is sponsored (no requester-pays, no egress cost) (WebSearch, MEDIUM-HIGH confidence, official AWS program pages)
- `github.com/timgit/pg-boss` discussion #403 and `pg-boss` docs (via search aggregation) — confirms pg-boss's architecture assumes a persistent worker, awkward fit for Vercel's stateless/timeout-bound functions (WebSearch, MEDIUM confidence)
- `supabase.com/blog/processing-large-jobs-with-edge-functions`, `supabase.com/docs/guides/cron` — `pgmq` + `pg_cron` + Edge Functions pattern, used here to justify why it's the wrong size for this project's scale rather than to recommend it (WebSearch, MEDIUM confidence)
- `npmjs.com/package/p-limit` (7.3.0), `npmjs.com/package/node-html-parser` (9.0.0) — current versions (WebSearch, MEDIUM confidence, npm listings)
- Cloudflare email-obfuscation mechanics (single-byte XOR, `data-cfemail` attribute format) — cross-referenced across `developers.cloudflare.com/waf/tools/scrape-shield/`, `blog.jse.li/posts/cloudflare-scrape-shield/`, and a public gist implementation (WebSearch, MEDIUM confidence, technique is well-documented and reproducible, not vendor-authoritative)
- Existing codebase: `.planning/codebase/STACK.md` and `.planning/codebase/ARCHITECTURE.md` — Node.js 18+ floor, existing `tsx`/npm conventions, "no job queue... simpler for small scale" architectural note used to justify the SKIP LOCKED recommendation over a queue library

---
*Stack research for: Prospect Radar — Overture ingestion, triage, bulk queueing, email extraction*
*Researched: 2026-07-17*
