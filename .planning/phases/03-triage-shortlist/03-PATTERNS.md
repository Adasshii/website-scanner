# Phase 3: Triage & Shortlist - Pattern Map

**Mapped:** 2026-07-20
**Files analyzed:** 9 (new) + 1 (migration)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/triage-prospects.ts` | CLI script (route/controller-equivalent) | batch, request-response-style summary | `scripts/import-prospects.ts` | exact |
| `lib/triage-fetch.ts` | service (network) | streaming (redirect-follow + capped body read) | `scanner-service/src/scanner.ts` (`checkInternalLinks`, `checkSiteFiles`) | exact (cross-service, same loop shape) |
| `lib/triage-scorer.ts` | service (pure transform) | transform | `lib/scoring.ts` (`scorePage`/`aggregateScores`) | role-match, NOT to be reused/coupled (see Shared Patterns) |
| `lib/triage-candidates.ts` | service (query) | CRUD (read) | `lib/prospect-upsert.ts` query patterns + `app/api/admin/stats/route.ts` Supabase query style | role-match |
| `lib/triage-release.ts` | service (query + mutation) | CRUD (select then update) | `app/api/admin/stats/route.ts` (Supabase query style) + migration 010/014 partial-index convention | role-match |
| `supabase/migrations/016_add_scan_release_marker.sql` | migration | schema | `supabase/migrations/014_create_suppressions.sql`, `010_create_prospects.sql` | exact |
| `app/api/admin/release-prospects/route.ts` | route (API) | request-response | `app/api/admin/stats/route.ts`, `app/api/admin/delete/route.ts` (bulk-action shape) | exact |
| `app/admin/prospects/shortlist` (page/tab) | component (admin UI) | request-response + client re-filter | `app/admin/page.tsx` (StatCard/TabButton/table pattern) | exact |
| `tests/fixtures/triage-html.ts`, `tests/fixtures/triage-responses.ts` | test fixture | — | `tests/fixtures/overture.ts` | exact |
| `scripts/triage-prospects.test.ts` | test | — | `scripts/import-prospects.test.ts` | exact |

## Pattern Assignments

### `scripts/triage-prospects.ts` (CLI script, batch)

**Analog:** `scripts/import-prospects.ts` (full file, 331 lines — copy the shape wholesale)

**Imports pattern** (lines 18-25):
```typescript
import { parseArgs } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { queryOverturePlaces, type OvertureQueryParams } from "@/lib/overture-client";
import { upsertOverturePlace } from "@/lib/prospect-upsert";
import { createServerClient } from "@/lib/supabase";
import { validateUrlSafe } from "@/lib/url-validation.server";
import { isAggregatorDomain, normalizeDomain } from "@/lib/domain-normalize";
```
For triage: swap in `fetchTriageSignals` from `lib/triage-fetch.ts`, `computeTriageScore` from `lib/triage-scorer.ts`, `getTriageCandidates` from `lib/triage-candidates.ts`.

**Args parsing + custom error class** (lines 31-95): copy `ImportArgsError` shape verbatim as `TriageArgsError`; same `parseArgs` + required-field-missing pattern; same `--limit` positive-number validation (lines 72-81) reused directly for `--limit`/`--cutoff`.

**Dependency-injection seam** (lines 99-139): copy the `ImportDeps` interface + `defaultDeps` object pattern exactly — this is what `scripts/triage-prospects.test.ts` will need to stub `fetchTriageSignals`, `validateUrlSafe`, `createServerClient`.

**Per-row try/catch, never abort whole run** (lines 253-266):
```typescript
for (const row of rows) {
  try {
    const result = await deps.upsertOverturePlace(sb, row, args.campaignTag);
    if (result.created) created++;
    else collapsed++;
  } catch (err) {
    skipped++;
    console.error(`[import-prospects] skipped row gersId=${row.gersId}: ${(err as Error).message}`);
  }
}
```
Triage's per-prospect loop follows this exactly (fetch+score+update per prospect, log-and-skip on error — Pitfall 3 in RESEARCH.md, never `.upsert()`, always `.update().eq("id", ...)`).

**Local env loading + CLI entrypoint** (lines 299-331): copy verbatim (`process.loadEnvFile`, `require.main === module` guard, `ImportArgsError` → `process.exit(1)`).

**Printed summary line** (lines 222-225, 268-270): mirror format for triage's required "42 triaged, 13 clear the cutoff, 0 unreachable" (CONTEXT.md D-10).

---

### `lib/triage-fetch.ts` (service, redirect-chain fetch)

**Analog:** `scanner-service/src/scanner.ts` — `checkInternalLinks()` (lines 46-112) and `checkSiteFiles()` (lines 14-43)

**Manual-redirect-follow loop** (lines 73-109, the core pattern to adapt):
```typescript
for (let i = 0; i < toCheck.length; i += 5) {
  const batch = toCheck.slice(i, i + 5);
  await Promise.all(batch.map(async (href) => {
    let current = href;
    let hops = 0;
    let status = 0;
    try {
      for (let r = 0; r < 8; r++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
          const res = await fetch(current, {
            method: "HEAD",
            redirect: "manual",
            signal: controller.signal,
            headers: { "User-Agent": "AdashiScanner/1.0" },
          });
          clearTimeout(timer);
          status = res.status;
          if (status >= 300 && status < 400) {
            const loc = res.headers.get("location");
            if (!loc) break;
            current = new URL(loc, current).toString();
            hops++;
          } else {
            break;
          }
        } catch { clearTimeout(timer); break; }
      }
      ...
    } catch { /* skip */ }
  }));
}
```
Triage adapts this exact shape but: (a) uses `GET` not `HEAD` so it can read the body, (b) re-runs `validateUrlSafe()` on each `Location` hop before following (RESEARCH.md Pitfall 2 — the one addition beyond this existing code), (c) adds `await sleep(BATCH_DELAY_MS)` between batches (this existing loop has zero inter-batch delay — RESEARCH.md Pattern 7 flags this gap explicitly), (d) caps at `MAX_HOPS = 8` (same constant already used here) and `HOP_TIMEOUT_MS = 5000` (same as this file's `timer`).

**robots.txt fetch pattern** (lines 14-27, reuse the 5s-timeout/AbortController shape):
```typescript
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 5000);
const res = await fetch(`${origin}/robots.txt`, { signal: controller.signal });
clearTimeout(timer);
hasRobotsTxt = res.status === 200;
```
Triage's `isHomepageDisallowed()` reuses this exact fetch shape; only the post-fetch logic differs (parse for `Disallow: /` under matching UA/wildcard group instead of just existence-checking).

**User-Agent convention** (line 88): `"User-Agent": "AdashiScanner/1.0"` — triage must use a *different*, honest, identifiable UA per D-12 (e.g. `"AdashiTriage/1.0 (+contact URL)"`), not spoof a browser, not reuse the scanner's UA verbatim (different tool, different honesty requirement).

**SSRF gate call site** — from `lib/url-validation.server.ts` (full file read, 93 lines):
```typescript
export async function validateUrlSafe(input: string): Promise<string> {
  const url = validateUrlFormat(input);
  const parsed = new URL(url);
  if (BLOCKED_HOSTNAMES.includes(parsed.hostname.toLowerCase())) {
    throw new UrlValidationError("This hostname is not allowed.");
  }
  // DNS resolve + private-IP block (ipv4/ipv6) ...
  return url;
}
```
Call once on the starting URL, then again on every redirect `Location` before following (per-hop, per RESEARCH.md Pitfall 2). Throws `UrlValidationError` — catch and route to `gated: true, gateReason: "unreachable"` (mirrors `import-prospects.ts`'s `checkReachability()` catch-and-classify pattern, lines 145-171).

---

### `lib/triage-scorer.ts` (pure transform — DO NOT couple to `lib/scoring.ts`)

**Analog (for structure/direction convention only, NOT for reuse):** `lib/scoring.ts` (77 lines)
- Confirms the existing 0-100, direction convention and the "pure function operating on a typed input, returns a typed breakdown" shape used by `scorePage`/`aggregateScores`/`buildSummary`.
- **Explicitly do not import or call anything from `lib/scoring.ts`** — it operates on `PageResult[]` from a full Playwright scan; triage has no `PageResult`. This is the exact coupling trap CONTEXT.md and RESEARCH.md both flag. `triage-scorer.ts` is a new, separate, small pure function taking the `TriageSignals` object from `triage-fetch.ts`.
- Gate-then-weighted-band design and the deduction table are fully specified in RESEARCH.md §"Proposed default weighted-score bands" — implement directly from there, no additional analog needed.

---

### `lib/triage-candidates.ts` / `lib/triage-release.ts` (query + release)

**Analog:** `app/api/admin/stats/route.ts` (Supabase query conventions) + migration 010/014 index conventions

**Auth/service-client pattern** (from `lib/supabase.ts`, full file, 24 lines):
```typescript
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase environment variables");
  return createClient(url, key, { auth: { persistSession: false } });
}
```
Used identically by both the script and the release API route (service-role, never exposed to browser).

**Query shape** (`app/api/admin/stats/route.ts`, lines 1-20 auth guard + lines 33-42 count-query batching):
```typescript
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  ...
}
```
`app/api/admin/release-prospects/route.ts` copies this exact auth-guard block verbatim (V4 Access Control, RESEARCH.md — same `x-admin-secret` gate as every other `app/api/admin/*` route, no weaker path).

**Two-step SELECT-then-UPDATE release query** — fully specified in RESEARCH.md §"Cutoff & ceiling query"; recommended default is the JS-side filter/sort/slice variant (avoids the jsonb `->>'` text-comparison footgun) rather than the SQL `.or()`/`.order()` variant. No existing analog needed beyond the `createServerClient()` + `.update().in("id", ids)` shape already used elsewhere in the codebase (e.g. import script's per-row `.update()`-style calls).

**Migration convention** — `supabase/migrations/014_create_suppressions.sql` (full file, 35 lines) is the closest analog for a partial index + RLS-enable-no-policy:
```sql
create unique index if not exists suppressions_email_active_idx on suppressions (email) where lifted_at is null;
alter table suppressions enable row level security;
```
Migration 016 mirrors this exactly:
```sql
alter table prospects add column if not exists scan_released_at timestamptz;
create index if not exists idx_prospects_scan_released_at_null
  on prospects (scan_released_at) where scan_released_at is null;
```
(RLS already enabled on `prospects` in migration 010 — no re-enable needed.)

---

### `app/api/admin/release-prospects/route.ts`

**Analog:** `app/api/admin/stats/route.ts` (auth guard + try/catch + client-creation error handling, lines 1-20) and the bulk-action shape in `app/admin/page.tsx`'s `ScansTable`/`LeadsTable` delete handlers (lines 369-388, 582-601 — POST with `x-admin-secret` header, JSON body, bulk operation over an id array).

```typescript
const res = await fetch("/api/admin/delete", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-admin-secret": secret },
  body: JSON.stringify({ ids: [...] }),
});
```
Release route follows the same request/response contract shape (POST, `x-admin-secret`, JSON body with `cutoff`); response returns `{ released: number, ids: string[] }`.

---

### `app/admin/prospects/shortlist` (or new tab on `app/admin/page.tsx`)

**Analog:** `app/admin/page.tsx` (766 lines — read fully for structure)

**Client component shape + tab state** (lines 3, 47-61):
```typescript
import { useState, useEffect, useCallback } from "react";
type Tab = "scans" | "leads";
const [tab, setTab] = useState<Tab>("scans");
```
Shortlist adds a `"shortlist"` tab value (or a dedicated page under `app/admin/prospects/shortlist/`) alongside `"scans" | "leads"`.

**Secret-gated fetch** (lines 73-99):
```typescript
const res = await fetch(`/api/admin/stats?tab=${t}&page=${p}`, {
  headers: { "x-admin-secret": secret },
});
```
Shortlist's data fetch reuses this exact `sessionStorage`-backed secret pattern (line 65: `sessionStorage.getItem("admin_secret")`).

**StatCard component** (lines 291-313):
```typescript
function StatCard({ label, value, sub, highlight }: {...}) {
  return (
    <div className={`rounded-xl p-4 ${highlight ? "bg-adashi-blue/5 border border-adashi-blue/20" : "bg-white shadow-sm"}`}>
      <div className={`text-2xl font-bold ${highlight ? "text-adashi-blue" : "text-adashi-gulf"}`}>{value}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
```
Reuse verbatim for shortlist summary stats ("N triaged", "N eligible at current cutoff", "N released this run").

**TabButton component** (lines 317-338): reuse verbatim for the shortlist tab if added inline to `app/admin/page.tsx` rather than a separate route.

**Cutoff slider is new UI** — no existing analog (first slider control in the admin surface); implement as a controlled `<input type="range">` with client-side re-filter over already-fetched rows (D-07: pure query, no re-fetch per slide), following the `useState`/`useCallback` idioms already used throughout this file.

## Shared Patterns

### Auth gate (all new admin API routes)
**Source:** `app/api/admin/stats/route.ts` lines 6-9
**Apply to:** `app/api/admin/release-prospects/route.ts`
```typescript
const secret = request.headers.get("x-admin-secret");
if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

### Service-role Supabase client
**Source:** `lib/supabase.ts` `createServerClient()`
**Apply to:** `scripts/triage-prospects.ts`, `lib/triage-release.ts`, `app/api/admin/release-prospects/route.ts` — never the browser client.

### SSRF-safe fetch guard, called per-hop
**Source:** `lib/url-validation.server.ts` `validateUrlSafe()`
**Apply to:** `lib/triage-fetch.ts` — starting URL AND every redirect `Location` header (RESEARCH.md Pitfall 2 fix beyond the literal D-12 wording).

### CLI script shape: args + DI seam + per-row try/catch + printed summary
**Source:** `scripts/import-prospects.ts` (whole file)
**Apply to:** `scripts/triage-prospects.ts` — this is the primary analog for the entire phase's operator surface.

### Update, never upsert, on existing rows with a NOT NULL column elsewhere in the table
**Source:** RESEARCH.md Pitfall 3, informed by migration 010's `country text not null`
**Apply to:** every triage write — `.update({ triage_score, triage_checked_at }).eq("id", id)`, never `.upsert()`.

### Partial-index + RLS-enable-no-policy migration convention
**Source:** `supabase/migrations/010_create_prospects.sql`, `014_create_suppressions.sql`
**Apply to:** `supabase/migrations/016_add_scan_release_marker.sql`.

## No Analog Found

None — every new file has at least a role-match analog in this codebase.

## Metadata

**Analog search scope:** `scripts/`, `lib/`, `app/admin/`, `app/api/admin/`, `scanner-service/src/`, `supabase/migrations/`, `tests/fixtures/`
**Files scanned:** `scripts/import-prospects.ts`, `scripts/import-prospects.test.ts`, `lib/url-validation.server.ts`, `lib/url-validation.ts`, `lib/domain-normalize.ts`, `lib/supabase.ts`, `lib/scoring.ts`, `app/admin/page.tsx`, `app/api/admin/stats/route.ts`, `scanner-service/src/scanner.ts`, `supabase/migrations/010_create_prospects.sql`, `014_create_suppressions.sql`, `015_create_legal_basis.sql`, `tests/fixtures/overture.ts`
**Pattern extraction date:** 2026-07-20
