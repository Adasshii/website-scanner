# Phase 1: Prospect Data Foundation & Import - Pattern Map

**Mapped:** 2026-07-18
**Files analyzed:** 7 (4 migrations, 3 lib/script files)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/010_create_prospects.sql` | migration | CRUD (schema) | `supabase/migrations/001_create_scans_and_leads.sql` | exact |
| `supabase/migrations/011_create_prospect_sources.sql` | migration | CRUD (schema) | `supabase/migrations/001_create_scans_and_leads.sql` (leads table half) | exact |
| `supabase/migrations/012_create_outreach_messages.sql` | migration | CRUD (schema) | `supabase/migrations/001_create_scans_and_leads.sql` | exact |
| `supabase/migrations/013_add_prospect_id_to_scans.sql` | migration | CRUD (schema, ALTER) | `supabase/migrations/009_bilingual_ai_content.sql` | exact (additive ALTER pattern) |
| `scripts/import-prospects.ts` | utility (CLI script) | batch / file-I/O (bulk read) | `scanner-service` (tsx-run, non-Next.js process) — no direct file analog exists; closest is scanner-service's `src/index.ts` entrypoint style | role-match |
| `lib/domain-normalize.ts` | utility | transform | `lib/url-validation.ts` (`extractDomain`, `UrlValidationError`) | exact (explicit superset, not extension — see note) |
| `lib/prospect-upsert.ts` | service | CRUD | `lib/supabase.ts` (`createServerClient()`) + inline Supabase call sites in `app/api/scan/route.ts`-style routes | role-match |
| `types/scanner.ts` additions (`OverturePlaceRow`, prospect types) | model/types | — | `types/scanner.ts` existing interfaces (`ScanRow`, `LeadRow`, `PageResult`) | exact |

## Pattern Assignments

### `supabase/migrations/010_create_prospects.sql`, `011_...`, `012_...` (migration, CRUD)

**Analog:** `supabase/migrations/001_create_scans_and_leads.sql`

**Naming/style pattern** (whole file, lines 1-57):
```sql
-- Scans table: stores all scan results
create table if not exists scans (
  id uuid primary key default gen_random_uuid(),
  ...
);
create index if not exists idx_scans_ip_hash_created on scans (ip_hash, created_at desc);
...
alter table scans enable row level security;
```

Copy these exact conventions:
- `create table if not exists` / `create index if not exists` — always guarded, lowercase SQL keywords (001 uses lowercase; note 009 uses uppercase `ALTER TABLE` — the codebase is not 100% consistent, but 001 is the closest table-creation analog and its lowercase style should win for new `CREATE TABLE` migrations since it's the pattern being extended).
- One-line comment above each table describing its purpose.
- Indexes named `idx_<table>_<columns>`.
- `alter table <name> enable row level security;` at the end of every new table — RESEARCH.md's own migration examples already follow this; do not skip it for `prospects`, `prospect_sources`, or `outreach_messages`.
- Retention/utility functions use `create or replace function ... returns void as $$ ... $$ language plpgsql security definer;` (001 lines 43-56) — not needed for this phase's tables per RESEARCH, but match the style if a helper function is ever added.

**Numbering:** migrations 001-009 exist; new ones continue as `010`, `011`, `012`, `013` (RESEARCH.md's proposed numbering matches the existing sequential, zero-padded, `_snake_case_description.sql` convention exactly).

---

### `supabase/migrations/013_add_prospect_id_to_scans.sql` (migration, ALTER)

**Analog:** `supabase/migrations/009_bilingual_ai_content.sql`

**Additive ALTER pattern** (lines 14-16):
```sql
ALTER TABLE scans
  ADD COLUMN IF NOT EXISTS ai_content_alt jsonb,
  ADD COLUMN IF NOT EXISTS issues_alt jsonb;
```

Copy: `ADD COLUMN IF NOT EXISTS` (idempotent, safe to re-run), a comment block above explaining *why* the column is nullable/additive and what legacy rows do without it — 009's comment (lines 1-12) is the exact tone/structure to mirror for `scans.prospect_id` ("nullable FK, existing inbound-flow scans leave it null").

---

### `lib/domain-normalize.ts` (utility, transform)

**Analog:** `lib/url-validation.ts`

**Error class + function pattern** (lines 1-6, 56-59):
```typescript
export class UrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlValidationError";
  }
}

/**
 * Extract the domain (hostname without www.) from a URL string.
 */
export function extractDomain(url: string): string {
  const parsed = new URL(url);
  return parsed.hostname.replace(/^www\./, "");
}
```

Copy: custom `Error` subclass with `name` set in constructor (→ `DomainValidationError` per RESEARCH.md), JSDoc comment above the exported function, plain function (not a class) with an explicit return type, throw-on-invalid-input style used elsewhere in `validateUrlFormat` (lines 12-51 of the same file).

**Important relationship to flag for the planner:** `extractDomain()` here is **only a `www.`-strip**, not public-suffix-aware (confirmed by reading the source above — `parsed.hostname.replace(/^www\./, "")`). RESEARCH.md is correct that `lib/domain-normalize.ts` must be a **new, separate function** (`normalizeDomain()` wrapping `tldts.getDomain()`), not an extension of `extractDomain()` — `extractDomain()` is used by the existing scan pipeline for a different purpose (rate-limit/cache grouping) and changing its behavior would have blast radius on that caller. Same file, same error-class style, different function, different purpose — do not merge them.

---

### `lib/prospect-upsert.ts` (service, CRUD)

**Analog:** `lib/supabase.ts` for client access; no existing multi-branch upsert service file in the codebase to copy control-flow from (RESEARCH.md's own `upsertOverturePlace` code example is the primary source for the branching logic itself).

**Imports / client-access pattern** (`lib/supabase.ts`, lines 1-16):
```typescript
import { createClient } from "@supabase/supabase-js";

// Server-side client with service role key (full access, bypasses RLS)
// Use this in API routes only — never expose to the browser
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
```

Copy: `prospect-upsert.ts` takes a `SupabaseClient` returned by `createServerClient()` as a parameter (matches this codebase's convention of instantiating the client at the call site — `app/api/*/route.ts` handlers — and passing it in, not re-instantiating per-module). Throw on missing env vars, never silently default.

**Error handling convention** (from `.claude/CLAUDE.md` Architecture → Error Handling, and mirrored in RESEARCH.md's own code example, lines 273-274 of RESEARCH.md): Supabase write calls check `{ data, error }` and `if (error) throw error;` rather than swallowing — follow this exactly in every branch of `upsertOverturePlace()`.

---

### `scripts/import-prospects.ts` (utility, CLI/batch)

**Analog:** `scanner-service` package's `tsx`-run dev pattern (`scanner-service/package.json` line 6: `"dev": "tsx watch src/index.ts"`) — this is a standalone Node process run via `tsx`, outside the Next.js request path, same execution model the importer needs (confirmed: `tsx` is already a devDependency there at `^4.19.0`, per `scanner-service/package.json` line 28).

**Pattern to copy:** the importer is invoked the same way scanner-service scripts are (`npx tsx scripts/import-prospects.ts --country=NL ...`), not wired into any `app/api/*/route.ts` — reinforces D-09. No existing CLI-arg-parsing file exists in this repo to copy from directly; use Node's built-in `util.parseArgs` (stdlib, no new dependency) for `--country`, `--region`, `--category`, `--dry-run`, `--limit`.

**Error handling:** per-row try/catch that logs and continues (matches the project's stated scanner-service convention "fail gracefully, never crash the process" — `.claude/CLAUDE.md` Anti-Patterns / Error Handling sections), rather than aborting the whole batch on one bad Overture row.

**SSRF safety for the dry-run reachability check:** import `validateUrlSafe` from `lib/url-validation.server.ts` (line 50: `export async function validateUrlSafe(input: string): Promise<string>`). This file also re-exports `UrlValidationError` and `extractDomain` from `lib/url-validation.ts` (line 4: `export { UrlValidationError, extractDomain } from "./url-validation";`) — do not write a second unguarded `fetch()`.

---

### `types/scanner.ts` additions (`OverturePlaceRow`, prospect row types)

**Analog:** existing interfaces in the same file — `ScanRow` (line 264), `LeadRow` (line 329), and the general style seen in `PageResult`/`PageData` (lines 53-80).

**Convention to copy:**
```typescript
export interface PageResult {
  url: string;
  statusCode: number;
  loadTimeMs: number;
  /** Raw extracted data from the page */
  data: PageData;
  issues: Issue[];
  scores: ScanScores;
}
```
- PascalCase interface names, camelCase fields, inline `/** ... */` doc comments on non-obvious fields, optional fields marked with `?` and a trailing comment explaining why they're optional (see `ScanScores.security?`, line 37: `// optional — absent on scans before Phase 2`).
- Add `OverturePlaceRow` and any `ProspectRow`/`ProspectSourceRow` types to this same shared file (`types/scanner.ts`) since it's already the shared-types location per `.claude/CLAUDE.md` ("Types in `types/` (shared with scanner-service via `@shared/*`)"), not a new `types/prospect.ts` file, unless the planner decides the file is getting too large — no existing precedent for splitting `types/scanner.ts`, so default to appending.

## Shared Patterns

### Supabase server client access
**Source:** `lib/supabase.ts` lines 5-16 (`createServerClient()`)
**Apply to:** `scripts/import-prospects.ts`, `lib/prospect-upsert.ts`
Never instantiate `createClient()` directly elsewhere; always go through `createServerClient()`.

### Custom error classes
**Source:** `lib/url-validation.ts` lines 1-6 (`UrlValidationError`)
**Apply to:** `lib/domain-normalize.ts` (`DomainValidationError`)
Same shape: `extends Error`, sets `this.name` in constructor.

### SSRF-safe URL fetching
**Source:** `lib/url-validation.server.ts` line 50 (`validateUrlSafe`)
**Apply to:** the `--dry-run` reachability check in `scripts/import-prospects.ts` — this is the one place a "just a script" instinct is wrong per RESEARCH.md Pitfall 3; Overture data is untrusted external input regardless of execution context.

### Migration style (lowercase SQL, `if not exists`, RLS on every new table)
**Source:** `supabase/migrations/001_create_scans_and_leads.sql` (whole file)
**Apply to:** migrations `010`–`013`.

### Error handling: check-and-throw, never swallow
**Source:** project convention (`.claude/CLAUDE.md` Error Handling section: "Catches and re-throws validation errors"; RESEARCH.md's own `prospect-upsert.ts` example, `if (error) throw error;`)
**Apply to:** every Supabase write in `lib/prospect-upsert.ts` and every Overture-row-processing iteration in `scripts/import-prospects.ts` (per-row try/catch, log-and-skip, never abort the batch).

## No Analog Found

None outright — all 7 files have at least a role-match or exact analog in the existing codebase. `scripts/import-prospects.ts` has no exact CLI-script analog (the codebase has no prior standalone CLI importer); its closest real precedent is scanner-service's `tsx`-run execution model plus RESEARCH.md's own worked code example for internal branching logic.

## Metadata

**Analog search scope:** `supabase/migrations/`, `lib/`, `types/`, `scanner-service/package.json`
**Files scanned:** 001-009 migrations, `lib/supabase.ts`, `lib/url-validation.ts`, `lib/url-validation.server.ts`, `types/scanner.ts`, `scanner-service/package.json`
**Pattern extraction date:** 2026-07-18
