# Phase 9: Niche Profile & Own-Site Engine Data - Pattern Map

**Mapped:** 2026-11-12
**Files analyzed:** 24 (new or modified)
**Analogs found:** 22 / 24

All analog paths below were confirmed git-tracked. No gitignored mirror paths are used. D-9-13 holds: no new shared `lib/` file is scanner-readable. Anything the scanner needs lives under `types/` (copied into the image) or `scanner-service/src/`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `lib/niche-profile/types.ts` | config (type) | transform | `lib/triage-constants.ts` (typed const module) | role-match |
| `lib/niche-profile/index.ts` | config | transform | `lib/triage-constants.ts` | role-match |
| `lib/niche-profile/installers/{trades,checks,copy,categories}.ts` | config | transform | `lib/triage-constants.ts`, `lib/retention-constants.ts` | role-match |
| `lib/niche-profile/*.test.ts` | test | transform | `lib/outreach-isolation.test.ts` (source assertions) | partial |
| `lib/triage-eligibility.ts` (modify) | utility (predicate) | transform | itself, `isReleasable` | exact |
| `lib/triage-constants.ts` (modify, `MIN_MATCH_CONFIDENCE`) | config | n/a | itself, `DEFAULT_CUTOFF` block | exact |
| `lib/triage-release.ts`, `lib/triage-candidates.ts` (modify selects) | service | CRUD | themselves | exact |
| `lib/google-content-guard.ts` | utility | transform | `lib/outreach-isolation.test.ts` (`stripCommentLines`) | partial |
| `lib/google-content-guard.test.ts` | test | file-I/O | `lib/outreach-isolation.test.ts` | exact |
| `scanner-service/src/own-site-harvest.ts` | utility (harvester) | request-response | `scanner-service/src/extractor.ts` (`contactExtraction`) | exact |
| `scanner-service/src/own-site-facts.ts` | utility (pure parser) | transform | `lib/contact-extraction.ts` | exact (split), but scanner-side |
| `types/niche-scan-slice.ts` | model (type) | request-response | `ContactExtraction` in `types/scanner.ts` | role-match |
| `types/own-site.ts` | model (type) | transform | `ContactExtraction`, `PageData` in `types/scanner.ts` | role-match |
| `types/scanner.ts` (modify `PageData`) | model | transform | `contactExtraction?` optional field (line 131) | exact |
| `scanner-service/src/extractor.ts` (modify) | utility | transform | itself, lines 137-164, 262, 288-295 | exact |
| `scanner-service/src/index.ts` (modify route) | route | request-response | itself, `/api/scan/full-async` (397-427) | exact |
| `lib/scanner-client.ts` (modify `fullScanBulk`) | service | request-response | itself, lines 71-102 | exact |
| `lib/own-site-facts.test.ts`, `own-site-harvest.test.ts`, `trade-detection.test.ts` | test | transform | `lib/scanner-design-prompt.test.ts`, `lib/scanner-capacity.test.ts` | exact placement |
| `supabase/migrations/022_*.sql` | migration | CRUD | `supabase/migrations/019_add_booked_at_to_prospects.sql` | exact |
| `supabase/migrations/023_add_scans_own_site_facts.sql` | migration | CRUD | `019_add_booked_at_to_prospects.sql` | role-match |
| `lib/overture-client.ts` (modify SQL + map) | service | batch | itself, `buildPlacesSql` ~279, `rows.map` ~350 | exact |
| `lib/prospect-upsert.ts` (modify, `maybeFillCoordinates`) | service | CRUD | itself, `maybeRefreshWebsiteUrl` (160-181) | exact |
| `scripts/import-prospects.ts` (modify, random modes) | utility (CLI) | batch | itself, `parseImportArgs` | exact |
| `lib/retention-constants.ts` (modify) | config | CRUD | itself, `ANONYMIZED_PROSPECT_FIELDS` (147) | exact |
| `lib/draft-on-scan-complete.ts`, `lib/outreach-queue.ts` (add marker gate) | service | event-driven | existing `rejected` gate | exact |

## Pattern Assignments

### Niche profile module (`lib/niche-profile/**`) (config, transform)

**Analog:** `lib/triage-constants.ts` (88 lines), also `lib/retention-constants.ts`, `lib/bulk-scan-constants.ts`

Conventions to copy: a header comment naming the decision IDs and saying "documented in one place", every tunable tagged `// tunable default`, named UPPER_SNAKE exports, no inline lists at call sites (D-9-R2).

```typescript
// lib/triage-constants.ts:1-4
// Single tunable constants block for browserless triage (D-03/D-04 —
// "documented in one place"). ...never hardcode a second copy of these values elsewhere.
// lib/triage-constants.ts:34-36
export const DEFAULT_CUTOFF = 60; // tunable default — score <= cutoff is eligible
export const RELEASE_CEILING = 20; // tunable default — hard per-release-invocation cap (D-06)
```

Phase-specific rules the analog does not show (from CONTEXT):
- Value optional, citation required whenever a value is present (D-9-04). A separate `showMoneyLine: boolean` per trade, not `value === undefined` (D-9-21).
- Values copied from `09-JOB-VALUES.md` (D-9-18); the kitchen citation states the midpoint (D-9-20).
- `EXCLUDED_CATEGORIES` stays in `lib/triage-constants.ts`; add a test that the profile's positive categories do not overlap it (D-9-11).
- Engine files must contain no Dutch vocabulary or country literals (NIC-03); put such strings only under `installers/`.
- `toScannerSlice()` returns only the type from `types/niche-scan-slice.ts` (no copy, no values).

### `lib/triage-eligibility.ts` (predicate, ENG-06)

**Analog:** itself. Extend, do not add a second rule (D-9-R1). Keep the header comment and update it.

```typescript
// lib/triage-eligibility.ts:5-6, 32-41
import type { TriageScore } from "@/types/triage";
import { EXCLUDED_CATEGORIES } from "@/lib/triage-constants";
export function isReleasable(
  row: { triage_score: TriageScore; category: string | null },
  cutoff: number
): boolean {
  return (
    row.triage_score.reachable &&
    !isExcludedCategory(row.category) &&
    (row.triage_score.gated || row.triage_score.score <= cutoff)
  );
}
```

Add `scoreableVerdict(row, minConfidence)` as a pure function beside it and have `isReleasable` call it. Row fields become required (compile error for forgetful callers). Callers to update: `lib/triage-release.ts:44-49` (`selectWorstN` select), `lib/triage-candidates.ts` `getShortlist` select, `app/admin/page.tsx:553`, `components/admin/shortlist-table.tsx:195`. Use `isAggregatorDomain()` from `lib/domain-normalize.ts`. The rule must not read the trade (D-9 consequence). Add a `releasableRow()` test fixture factory.

### `scripts`/`lib` coordinate capture: `lib/overture-client.ts`, `lib/prospect-upsert.ts`

**Analog:** `lib/prospect-upsert.ts` `maybeRefreshWebsiteUrl` (lines 160-181) for the guarded helper shape.

```typescript
// lib/prospect-upsert.ts:160-171
async function maybeRefreshWebsiteUrl(
  sb: SupabaseClient, prospectId: string, incomingUrl: string | null, current: ProspectIdentitySnapshot
) {
  if (!incomingUrl || incomingUrl === current.website_url) return;
  ...
    const { error } = await sb.from("prospects").update({ ... }).eq("id", prospectId);
    if (error) throw error;
```

`maybeFillCoordinates` follows this: `.update({ latitude, longitude }).eq("id", prospectId).is("latitude", null)`, `if (error) throw error;`, called at lines ~78 and ~109 beside the other `maybe*` calls, and included directly in the new-insert branch. In `lib/overture-client.ts` add `ST_X(place.geometry) AS lon, ST_Y(place.geometry) AS lat` to the SELECT at lines 279-280 and map them in `rows.map` (line ~350). `OverturePlaceRow.lat/lon` optional so `tests/fixtures/overture.ts` still compiles.

### Migrations 022, 023 (migration, CRUD)

**Analog:** `supabase/migrations/019_add_booked_at_to_prospects.sql`

```sql
-- 019:8-9
alter table prospects add column if not exists booked_at timestamptz;
-- 019:15-23 guarded constraint (no ADD CONSTRAINT IF NOT EXISTS in Postgres)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'prospects_booked_match_method_check') then
    alter table prospects add constraint prospects_booked_match_method_check
      check (booked_match_method in ('email', 'domain'));
  end if;
end $$;
-- 019:28-29: RLS already enabled; no new policy (service-role-only)
```

022: `latitude`/`longitude` double precision, `not_scoreable_reason` text with CHECK limited to `no_own_domain | no_unique_match | no_location`, `scoreable_checked_at` timestamptz. 023: jsonb on `scans` for own-site facts. Header comment style: decision ID, "additive, reads and writes no existing row". Applied by Joshua through the SQL Editor, never `db push`. Column names must pass the ENG-07 schema assertion.

### `lib/retention-constants.ts` (config)

**Analog:** itself. `ANONYMIZED_PROSPECT_FIELDS` (line 147) lists `name, domain, website_url, contact_email, website_url_pending, address` as null. Add `latitude: null, longitude: null` (a business point is personal data for sole traders). Check `ANONYMIZED_SCAN_FIELDS` (line 207) and decide whether the new scans jsonb of own-site facts (address, phone) needs clearing. Update the "Kept:" comment above it. Mirror in `lib/retention.ts` if it hard-codes columns.

### `scanner-service/src/own-site-harvest.ts` + `own-site-facts.ts` + `extractor.ts` edits (harvester/parser split)

**Analog:** `scanner-service/src/extractor.ts` (harvester, `contactExtraction` at line 262, JSON-LD loop at 137-164, trust signals at 288-295) and `lib/contact-extraction.ts` (pure parser, header lines 1-12).

```typescript
// extractor.ts:262
const contactExtraction = { mailtoHrefs, cfemailTokens, contactText };
// extractor.ts:288-295 (existing trust detector, extend rather than duplicate)
let hasTrustSignals = !!doc.querySelector(trustSelector);
...
hasTrustSignals = schemaTypes.some((t) => /^(Review|AggregateRating|Rating)$/i.test(t));
```

```typescript
// lib/contact-extraction.ts:1-12 header style: pure, no Supabase, no I/O, unit-testable over literal fixtures
```

Divergence from the analog: the parser cannot live in `lib/` because of D-9-13, so `own-site-facts.ts` lives in `scanner-service/src/`, dependency-free, and is imported by root-tree tests. Browser side harvests bounded raw material only; parsing is Node-side. No second fetch (D-5-R1). A harvest failure must not fail the page. With no `nicheSlice` in the request, no own-site work runs. New fields on `PageData` optional (`types/scanner.ts:131` shows `contactExtraction?: ContactExtraction;`). Represent absence with `FieldState<T>` (found / missing / unreadable).

### `types/niche-scan-slice.ts`, `types/own-site.ts` (model)

**Analog:** `ContactExtraction` interface, `types/scanner.ts:134-142`: doc-commented interface, one-line field comments. Type-only files. `types/` is copied into the image (`Dockerfile:6`) and included by tsconfig, so no Dockerfile or tsconfig edit. Slice shape is given in RESEARCH.md Pattern 10.

### `lib/scanner-client.ts` + `scanner-service/src/index.ts` (request contract)

**Analog:** themselves.

```typescript
// lib/scanner-client.ts:71-88
async fullScanBulk(url: string, opts: { scanId: string; prospectId: string; userAgent: string; maxPages?: number }) {
  ... body: JSON.stringify({ url, scanId: opts.scanId, maxPages: ..., source: "bulk", userAgent: opts.userAgent, prospectId: opts.prospectId }),
  signal: AbortSignal.timeout(30_000),
```
```typescript
// scanner-service/src/index.ts:397-409
app.post("/api/scan/full-async", async (req, res) => {
  const { url, scanId, maxPages = 7, locale = "en", source, userAgent, prospectId } = req.body as { ... prospectId?: string; };
  if (!url || !scanId) { res.status(400).json({ error: "url and scanId are required" }); return; }
```

Add optional `nicheSlice?: NicheScanSlice` to opts, body and destructuring. Treat as untrusted (comment at index.ts:415-419 is the precedent): validate caps, on violation ignore the slice and log, never 400. Log prefix style `[full-scan-async]`.

### ENG-07: `lib/google-content-guard.test.ts` (+ `.ts`) (test, file-I/O)

**Analog:** `lib/outreach-isolation.test.ts` (exact). Copy the structure: header comment explaining what breaks if loosened, `node:fs` only, "unit" vitest project, guarded roots asserted to exist first, `stripCommentLines`, per-token `expect(offendingLine, message).toBeUndefined()`.

```typescript
// outreach-isolation.test.ts:20-22
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
// :8-11
const LINE_COMMENT_MARKER = "//";
const BLOCK_COMMENT_CONTINUATION_MARKER = "*";
// :20-27
function stripCommentLines(source: string): string[] {
  return source.split("\n").map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith(LINE_COMMENT_MARKER) && !line.startsWith(BLOCK_COMMENT_CONTINUATION_MARKER));
}
// :29-31, 34-38
function readOutreachFile(relativePath: string): string { return readFileSync(path.join(process.cwd(), relativePath), "utf-8"); }
it("every file ... exists on disk", () => { for (...) expect(existsSync(path.join(process.cwd(), relativePath)), `missing: ${relativePath}`).toBe(true); });
```

Add what the model lacks: canary cases that assert the detector flags synthetic violations, a schema assertion over `supabase/migrations/*.sql`, and the fail-first order from RESEARCH Pattern 8. Write the test before `google-content-guard.ts` exists.

### Enforcement of "never drafted" (draft gates)

**Analog:** the `lifecycle_state === "rejected"` check in `lib/outreach-queue.ts:379` and gate 6 in `lib/draft-on-scan-complete.ts`. Add a `not_scoreable_reason` check beside each.

### `scripts/import-prospects.ts` (CLI, batch)

**Analog:** itself, `parseImportArgs`. `--category`/`--region` stay required; `random` resolves to a concrete value from the profile before return, using an injectable RNG for tests. Every profile region must resolve through `resolveBbox` (test it).

## Shared Patterns

### Decision-ID header comments
**Source:** `lib/triage-eligibility.ts:1-4`, `supabase/migrations/019:1-7`. Every new or changed file names its D-9-xx decisions and why it exists.

### Tracked-test placement
**Source:** `lib/scanner-design-prompt.test.ts` header, `lib/scanner-capacity.test.ts`. Tests for scanner-side modules live in the root vitest tree, never in `scanner-service/src` (its `tsc` build would break on `vitest`).

### Optional-field rule for persisted shapes
**Source:** `types/scanner.ts:131`. Every new `PageData` field is optional so legacy `scans.pages` rows still parse.

### Single-rule enforcement
**Source:** `lib/triage-eligibility.ts` header. One predicate, required row fields, no divergent copies.

### Supabase writes
**Source:** `lib/prospect-upsert.ts:160-181`: `const { error } = await sb.from(...)...; if (error) throw error;`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `lib/niche-profile/installers/copy.ts` bilingual profile copy | config | transform | Copy lives in next-intl (`messages/*.json`) today; D-9-10 introduces a second system. Use RESEARCH Open Question 4. |
| JSON-LD value parsing (`@graph`, `@id` dereference) in `own-site-facts.ts` | utility | transform | `extractor.ts` records `@type` names only; use RESEARCH Pattern 2 and the code example near line 722. |
| `lib/google-content-guard.ts` banned-field detector | utility | transform | Closest is `stripCommentLines`; the rest is new (RESEARCH Pattern 8). |

## Metadata

**Analog search scope:** `lib/`, `types/`, `scanner-service/src/`, `scripts/`, `supabase/migrations/`
**Files read:** CONTEXT.md in full; RESEARCH.md structure plus Patterns 7, 9, 10 and Wave 0 gaps; the analogs above.
**Pattern extraction date:** 2026-11-12
**Not read:** line ranges of `scripts/import-prospects.ts`, `lib/triage-release.ts` and `lib/bulk-scan-constants.ts`; line numbers for those come from RESEARCH.md citations and should be confirmed by the executor.
