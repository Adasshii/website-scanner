# Phase 4: Bulk Scan Queue - Pattern Map

**Mapped:** 2026-07-21
**Files analyzed:** 13 (new/modified)
**Analogs found:** 12 / 13 (1 flagged no-analog: the plpgsql RPC function)

All file paths and line numbers below were verified directly against the repo, not propagated blind from RESEARCH.md.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/017_*.sql` (columns) | migration | CRUD (DDL) | `supabase/migrations/016_add_scan_release_marker.sql` | exact |
| `supabase/migrations/017_*.sql` (`claim_next_scan_batch` fn) | migration | event-driven (atomic claim) | none in-repo (first plpgsql/RPC function) | **no analog** |
| `lib/scan-claim.ts` (calls `.rpc()`, marks attempts) | service | CRUD | `lib/triage-release.ts` | role-match (closest state-transition-on-prospects service) |
| `lib/bulk-scan-dispatch.ts` (robots pre-flight + dispatch loop) | service | request-response / batch | `lib/triage-fetch.ts` (robots part) + drain skeleton in RESEARCH.md | role-match |
| `lib/bulk-scan-constants.ts` | config | — | `lib/triage-constants.ts` | exact |
| `lib/scanner-client.ts` (extend: `fullScanBulk()`) | service | request-response | itself, `fullScan()`/`request()` methods (lines 49-53, 67-86) | exact (extend in place) |
| `app/api/cron/drain-scan-queue/route.ts` | route (cron) | batch / event-driven | `app/api/cron/follow-up/route.ts` | exact |
| `app/api/admin/run-batch/route.ts` | route (admin) | request-response | `app/api/admin/release-prospects/route.ts` | exact |
| `app/api/admin/requeue-scan/route.ts` (D-05 manual re-queue) | route (admin) | request-response | `app/api/admin/release-prospects/route.ts` | exact |
| `app/admin/page.tsx` (extend Shortlist tab data fetch) | component (page) | request-response | itself, existing Shortlist tab + `app/api/admin/shortlist/route.ts` | exact |
| `components/admin/shortlist-table.tsx` (extend: status column, re-queue action, report link) | component | request-response | itself | exact |
| `components/admin/run-batch-button.tsx` (new, mirrors Release) | component | request-response | `components/admin/release-button.tsx` | exact |
| `scanner-service/src/index.ts` (`full-async` handler capacity guard) | controller (Express route) | request-response | itself, lines 390-420 | exact |
| `scanner-service/src/discovery.ts` (UA param) | service | file-I/O (Playwright) | itself, lines 1-31 | exact |
| `scanner-service/src/scanner.ts` (UA param) | service | file-I/O (Playwright) | itself, lines 218-230 | exact |
| `scanner-service/src/ai.ts` (`generateDesignAnalysis()` prompt) | service | request-response (Gemini call) | itself, lines 821-887 | exact |
| Test files (Wave 0 gaps, see RESEARCH.md §Validation Architecture) | test | — | `lib/triage-release.integration.test.ts`, `lib/triage-fetch.test.ts` | role-match |

## Pattern Assignments

### `supabase/migrations/017_*.sql`

**Analog for the column-add half:** `supabase/migrations/016_add_scan_release_marker.sql` (verified, full file, 19 lines)

```sql
alter table prospects add column if not exists scan_released_at timestamptz;

create index if not exists idx_prospects_scan_released_at_null
  on prospects (scan_released_at) where scan_released_at is null;

-- RLS already enabled on prospects (migration 010) — not re-enabled here,
-- and no new policy added (service-role-only convention, migration 014).
```

Copy this convention exactly for 017: `add column if not exists`, a partial index for the "not yet processed" filter, a comment noting RLS/service-role is inherited not re-declared. **Reuse `prospects.latest_scan_id`** (added in `013_add_prospect_id_to_scans.sql`, FK to `scans(id)`, currently unused) as D-01's "reference to the produced scan" — do not add a third column for this.

```sql
-- 013_add_prospect_id_to_scans.sql (verified, full file)
ALTER TABLE scans ADD COLUMN IF NOT EXISTS prospect_id uuid REFERENCES prospects(id);
CREATE INDEX IF NOT EXISTS idx_scans_prospect_id ON scans (prospect_id) WHERE prospect_id IS NOT NULL;
ALTER TABLE prospects
  ADD CONSTRAINT prospects_latest_scan_id_fkey
  FOREIGN KEY (latest_scan_id) REFERENCES scans(id);
```

**No analog for the `claim_next_scan_batch()` plpgsql function** — verified via grep: zero `.rpc(` calls and zero `create or replace function` statements anywhere in `supabase/migrations/`, `lib/`, or `app/`. This is the project's first RPC. Since there's no in-repo authoring convention to copy, follow the closest *authoring convention* instead (comment style + additive/re-runnable philosophy from 013/016) and use RESEARCH.md's Pattern 1 SQL verbatim as the reference implementation:

```sql
create or replace function claim_next_scan_batch(batch_size int)
returns setof prospects
language plpgsql
as $$
begin
  return query
  update prospects
  set scan_status = 'scanning'
  where id in (
    select id from prospects
    where scan_released_at is not null
      and (scan_status is null or scan_status = 'queued')
      and scan_attempts = 0
    order by scan_released_at asc
    for update skip locked
    limit batch_size
  )
  returning *;
end;
$$;
```

---

### `lib/scan-claim.ts` (new)

**Analog:** `lib/triage-release.ts` (verified, full file, 91 lines)

**Imports pattern:**
```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_CUTOFF, RELEASE_CEILING } from "@/lib/triage-constants";
```
→ for scan-claim.ts: `import { BATCH_SIZE } from "@/lib/bulk-scan-constants";`

**Core pattern — never `.upsert()`, always `.update().eq()`/`.in()`:**
```typescript
// lib/triage-release.ts lines 79-87
const { error } = await sb
  .from("prospects")
  .update({ scan_released_at: new Date().toISOString() })
  .in("id", ids);
if (error) throw error;
```
For `lib/scan-claim.ts`, the equivalent write is the `.rpc()` call itself (the UPDATE lives inside the Postgres function, not in application code) — this is the one place in the phase where the "always `.update().eq()`" rule is satisfied *inside* SQL rather than via the JS client, because SKIP LOCKED cannot be expressed through PostgREST.

**Function shape to mirror** (JSDoc-style comment above an exported async function, explicit param defaults from the constants file, explicit return type):
```typescript
// mirrors triage-release.ts's releaseWorstN() shape
export async function claimNextScanBatch(
  sb: SupabaseClient,
  batchSize: number = BATCH_SIZE
): Promise<ClaimedProspect[]> {
  const { data, error } = await sb.rpc("claim_next_scan_batch", { batch_size: batchSize });
  if (error) throw error;
  return (data ?? []) as ClaimedProspect[];
}
```

---

### `lib/bulk-scan-dispatch.ts` (new)

**Analog:** `lib/triage-fetch.ts` (robots.txt functions, verified lines 92-176) — reuse directly, do not fork.

**Reusable exports (import, don't duplicate):**
```typescript
// lib/triage-fetch.ts — exported, safe to import directly (confirms RESEARCH.md's Assumption A3)
export function parseRobotsForRoot(text: string, uaToken: string): boolean { ... }   // line 137
export async function isHomepageDisallowed(
  origin: string,
  uaToken: string,
  fetchImpl: TriageFetchImpl = defaultFetchImpl,
): Promise<boolean> { ... }   // line 156
```
Both are already exported top-level functions in `lib/triage-fetch.ts` — import them directly:
```typescript
import { isHomepageDisallowed } from "@/lib/triage-fetch";
import { BULK_USER_AGENT } from "@/lib/bulk-scan-constants";
```
No extraction into a new `lib/robots-check.ts` is needed (RESEARCH.md's Assumption A3 resolves true — confirmed by reading the file).

**Failure/skip pattern to copy** — `fetchTriageSignals()`'s early-return-with-reason shape (`lib/triage-fetch.ts` lines 184-208):
```typescript
const origin = new URL(current).origin;
const robotsBlocked = await isHomepageDisallowed(origin, TRIAGE_USER_AGENT, fetchImpl);
if (robotsBlocked) {
  return emptySignals({ reachable: true, https: ..., robotsBlocked: true });
}
```
For bulk-scan-dispatch, the equivalent is: robots-disallowed → `update({ scan_status: "failed", scan_attempts: 1 })`, `continue` — never call scanner-service for that prospect (D-10).

---

### `lib/bulk-scan-constants.ts` (new)

**Analog:** `lib/triage-constants.ts` (verified, full file, 47 lines) — copy the header-comment + grouped-const-block style exactly.

```typescript
// lib/triage-constants.ts lines 1-9 — the style to mirror
// Single tunable constants block for browserless triage (D-03/D-04 —
// "documented in one place"). Every threshold/deduction here is a Claude's-
// discretion default (CONTEXT.md); tune against the real ~30% pass-rate
// target, never hardcode a second copy of these values elsewhere.

// ── Fetch identity & manners (D-12) ────────────────────────────────
export const TRIAGE_USER_AGENT = "AdashiTriage/1.0 (+https://adashi.io/triage)";
```
For `lib/bulk-scan-constants.ts`: same header-comment convention, one const block per concern (`BULK_USER_AGENT` naming Adashi + a contact URL per D-09, `RESERVED_FOR_PUBLIC`, `MAX_TOTAL_FULL_SCANS` or equivalent, `BATCH_SIZE`, `DISPATCH_CONCURRENCY`/tick cadence) — all Claude's-Discretion tunables per CONTEXT.md, each commented with its decision ID.

---

### `lib/scanner-client.ts` (extend in place)

**Analog:** itself — the existing `fullScan()` method and shared `request()` helper (verified, full file, 88 lines).

```typescript
// lines 48-53 — the method shape to mirror for fullScanBulk()
/** Run a full scan (multi-page) */
async fullScan(url: string, maxPages = 10, locale?: string): Promise<ScannerResponse> {
  const body: Record<string, unknown> = { url, maxPages };
  if (locale) body.locale = locale;
  return this.request("/api/scan/full", body);
}
```
```typescript
// lines 67-86 — shared private request() helper; fullScanBulk() should call
// full-async directly (fire-and-forget, needs the 503 status specifically,
// so it can't reuse this.request() unmodified — request() throws on !res.ok
// but a 503 capacity-refusal is an expected, not-thrown outcome). Add a
// small dedicated fetch in fullScanBulk() that checks res.status === 503
// before falling through to the same error-throwing behavior as request().
```
Note the class currently has **no** `full-async` caller at all (only `quickScan`/`fullScan` hit `/api/scan/quick` and `/api/scan/full`) — `fullScanBulk()` is a genuinely new method, not an edit to an existing one, but it must follow the same constructor/`baseUrl`/`apiKey`/`AbortSignal.timeout` conventions as the two methods above.

---

### `app/api/cron/drain-scan-queue/route.ts` (new)

**Analog:** `app/api/cron/follow-up/route.ts` (verified, full file, 96 lines)

**Auth pattern (copy verbatim, only the header name is fixed convention):**
```typescript
// lines 19-24
const authHeader = request.headers.get("authorization");
const cronSecret = process.env.CRON_SECRET;
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

**Runtime/duration config (copy verbatim):**
```typescript
export const runtime = "nodejs";
export const maxDuration = 60;
```

**Batch-limit comment convention to copy** (`follow-up/route.ts` line ~75):
```typescript
// Limit to 20 per run to avoid timeouts
const batch = toSend.slice(0, 20);
```
→ drain-scan-queue mirrors this with its own `BATCH_SIZE` constant from `lib/bulk-scan-constants.ts`, not a second inline literal.

**Error handling / response shape (copy):**
```typescript
// lines 91-96
} catch (error) {
  console.error("[cron/follow-up] Error:", error);
  return NextResponse.json({ error: "Follow-up cron failed" }, { status: 500 });
}
```
Adapt the log prefix to `[cron/drain-scan-queue]`.

---

### `app/api/admin/run-batch/route.ts` (new) and `app/api/admin/requeue-scan/route.ts` (new)

**Analog:** `app/api/admin/release-prospects/route.ts` (verified, full file, 46 lines)

**Auth pattern (copy verbatim — the `x-admin-secret` gate, not `CRON_SECRET`):**
```typescript
// lines 12-15
const secret = request.headers.get("x-admin-secret");
if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

**Input validation pattern (copy the clamp-before-DB-call shape):**
```typescript
// lines 26-34 — cutoff validated before any DB call; V5 Input Validation
let cutoff = DEFAULT_CUTOFF;
if (body.cutoff !== undefined) {
  const parsed = Number(body.cutoff);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return NextResponse.json({ error: "cutoff must be a finite number between 0 and 100" }, { status: 400 });
  }
  cutoff = parsed;
}
```
→ `run-batch/route.ts` applies the same clamp pattern to any batch-size param (never trust it from the request body beyond a sane server-side max, per RESEARCH.md's V5 note); the ceiling itself stays a constant, never client-overridable, exactly like `RELEASE_CEILING` here:
```typescript
// line 39-40 — the "server owns the ceiling" pattern
const released = await releaseWorstN(supabase, { cutoff, ceiling: RELEASE_CEILING });
```

**Error handling (copy verbatim shape):**
```typescript
// lines 42-45
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("Admin release-prospects error:", msg);
  return NextResponse.json({ error: "Failed to release prospects", detail: msg }, { status: 500 });
}
```

---

### `components/admin/run-batch-button.tsx` (new)

**Analog:** `components/admin/release-button.tsx` (verified, full file, 67 lines) — this is D-07's explicit named analog ("mirrors Phase 3's Release button").

**Confirm-before-spend pattern (copy exactly, adapt copy text):**
```typescript
// lines 22-31
async function handleClick() {
  const released = Math.min(eligibleCount, RELEASE_CEILING);
  const confirmed = window.confirm(
    `Release ${released} prospect${released !== 1 ? "s" : ""} to the scan queue? This will spend real scan budget (ceiling: ${RELEASE_CEILING}/run).`
  );
  if (!confirmed) return;
  ...
}
```

**Fetch + optimistic-disable pattern (copy exactly):**
```typescript
// lines 33-49
setReleasing(true);
try {
  const res = await fetch("/api/admin/release-prospects", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-secret": secret },
    body: JSON.stringify({ cutoff }),
  });
  if (res.ok) { onReleased(); } else { alert("Failed to release prospects."); }
} catch {
  alert("Failed to release prospects.");
} finally {
  setReleasing(false);
}
```

**Styling convention (copy exactly — non-destructive accent color, per the file's own comment):**
```typescript
// line 14, 57 — "Accent blue, never destructive-red — spending scan budget
// is the intended action of this screen, not a hazard."
className="bg-adashi-blue hover:bg-adashi-science text-white font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
```

---

### `components/admin/shortlist-table.tsx` (extend) and `app/admin/page.tsx` (extend)

**Analog:** the file itself (verified, full file, 132 lines) + `app/api/admin/shortlist/route.ts` (verified, full file, 34 lines).

**Table-row/status-badge convention already present for the `released` state (D-02 extends this exact idea to `scan_status`):**
```typescript
// lines 84-90, 121-123
const released = !!row.scan_released_at;
...
className={`border-b border-gray-50 hover:bg-gray-50/50 ${
  score.gated ? "border-l-4 border-red-400 bg-red-50/30" : ""
} ${released ? "opacity-60" : ""}`}
...
<td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
  {released ? `Released ${relativeDate(row.scan_released_at as string)}` : ""}
</td>
```
→ add a `scan_status` column following the same badge-token style as the existing `GATED` pill:
```typescript
// lines 92-97 — the pill pattern to copy for queued/scanning/done/failed
{score.gated && (
  <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full border bg-red-100 text-red-700 border-red-200">
    GATED
  </span>
)}
```

**Data-fetch route pattern (`app/api/admin/shortlist/route.ts`, full file):**
```typescript
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  ...
  const rows = await getShortlist(supabase);
  const sorted = [...rows].sort((a, b) => { /* gated first, then worst score first */ });
  return NextResponse.json({ rows: sorted });
}
```
Extend `getShortlist()` (in `lib/triage-candidates.ts`) to also select `scan_status`, `scan_attempts`, `latest_scan_id` — do not create a parallel query.

**Relative-time helper already in file — reuse, don't reintroduce a date library:**
```typescript
// lines 12-20 — ponytail-marked stdlib choice, already established
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function relativeDate(dateStr: string): string { ... }
```

**Re-queue action (D-05):** no existing analog for a destructive/reset button in this file; closest UI precedent is the Release button's confirm-then-POST shape (above) — a `requeue-scan/route.ts` POST triggered from a small inline button per row, gated the same `x-admin-secret` way, not a new pattern.

---

### `scanner-service/src/index.ts` — `full-async` handler (extend in place)

**Analog:** itself, verified lines 388-430 (current handler, no capacity check today):

```typescript
// verified current code, lines 390-403
app.post("/api/scan/full-async", async (req, res) => {
  const { url, scanId, maxPages = 7, locale = "en" } = req.body as {
    url: string;
    scanId: string;
    maxPages?: number;
    locale?: string;
  };

  if (!url || !scanId) {
    res.status(400).json({ error: "url and scanId are required" });
    return;
  }

  // Return immediately — scan runs in background
  res.json({ accepted: true, scanId });
  ...
  activeFullScans.set(scanId, supabase);
```
Insert the capacity guard between the `if (!url || !scanId)` block and the unconditional `res.json({accepted:true, scanId})` line — confirmed this is currently the only place `res.json` fires for this route, so the guard is a single insertion point, not a scattered change. Extend the destructured body with `source?: "bulk"` and `userAgent?: string` (both currently absent from the type). RESEARCH.md's Pattern 2 SQL/TS is the concrete shape to use for the guard itself (503 + `retryAfterSeconds`, never register in `activeFullScans` on refusal).

---

### `scanner-service/src/discovery.ts` and `scanner-service/src/scanner.ts` (extend in place)

**Analog:** themselves — both hardcode the identical UA string today (verified):

```typescript
// discovery.ts lines 3-6, 23-27 (DiscoveryOptions + browser.newContext call)
export interface DiscoveryOptions {
  startUrl: string;
  maxPages: number;
  timeoutMs?: number;
}
...
const context = await browser.newContext({
  userAgent:
    "AdashiScanner/1.0 (+https://scan.adashi.io) — accessibility & SEO checker",
  viewport: { width: 1280, height: 720 },
  ignoreHTTPSErrors: true,
});
```
```typescript
// scanner.ts lines 219-231 (ScanPageOptions + browser.newContext call)
export async function scanPage(options: ScanPageOptions): Promise<ScanPageResultWithScreenshot> {
  const { url, timeoutMs = 30_000 } = options;
  ...
  const context = await b.newContext({
    userAgent:
      "AdashiScanner/1.0 (+https://scan.adashi.io) — accessibility & SEO checker",
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  });
```
Add `userAgent?: string` to both option interfaces and default to the existing literal exactly as RESEARCH.md's Pattern 3 shows — a one-line optional-param threading, not a forked function.

---

### `scanner-service/src/ai.ts` — `generateDesignAnalysis()` prompt (extend in place)

**Analog:** itself, verified lines 821-887 (the shared Gemini-vision prompt, both public scanner and Phase 4 bulk scans call this same function per D-11).

```typescript
// verified current prompt text, lines 858-871
`You are a professional web designer reviewing a website screenshot for a business owner. Rate each dimension 0-100 and identify the most important visual issues.

Website: ${domain}

Score each dimension (0=very poor, 100=excellent):
- visualHierarchy: ...
...
Also identify up to 4 specific visual issues that hurt conversions or credibility (plain English, one sentence each, for a non-technical business owner).

Respond with JSON only:
{ ... }`
```
Insert the CMP-17 no-profiling instruction as a new paragraph inside this template literal, between the dimension list and the "Also identify..." sentence, per RESEARCH.md Pattern 5's exact wording. This is a shared-code change — flag explicitly in the plan and verification step (Pitfall 5) since it also changes the public scanner's output, which is intentional and desirable, not a scope leak.

## Shared Patterns

### Admin auth gate (`x-admin-secret`)
**Source:** `app/api/admin/release-prospects/route.ts` lines 12-15 (also identical in `app/api/admin/shortlist/route.ts` lines 8-10)
**Apply to:** `app/api/admin/run-batch/route.ts`, `app/api/admin/requeue-scan/route.ts`
```typescript
const secret = request.headers.get("x-admin-secret");
if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

### Cron auth gate (`CRON_SECRET` bearer)
**Source:** `app/api/cron/follow-up/route.ts` lines 19-24
**Apply to:** `app/api/cron/drain-scan-queue/route.ts`
```typescript
const authHeader = request.headers.get("authorization");
if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

### Never `.upsert()` on `prospects`
**Source:** `lib/triage-release.ts` lines 79-82 comment + code (Pitfall 3, `country` is `NOT NULL` with no default)
**Apply to:** `lib/scan-claim.ts`, `lib/bulk-scan-dispatch.ts`, both new admin routes — always `.update().eq()` / `.update().in()`.

### Error-handling response shape for admin/API routes
**Source:** `app/api/admin/release-prospects/route.ts` lines 42-45
**Apply to:** all new `app/api/**/route.ts` files
```typescript
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("<Route name> error:", msg);
  return NextResponse.json({ error: "<Human message>", detail: msg }, { status: 500 });
}
```

### Single tunable-constants block
**Source:** `lib/triage-constants.ts` (full file)
**Apply to:** `lib/bulk-scan-constants.ts` — one file, grouped by concern, each const commented with its owning decision ID (D-08, D-09, etc.), never a second inline literal for the same value elsewhere.

## No Analog Found

| File/Element | Role | Data Flow | Reason |
|---|---|---|---|
| `claim_next_scan_batch()` plpgsql function (inside migration 017) | migration (RPC) | event-driven (atomic claim) | Verified via grep: zero `.rpc()` calls and zero `create or replace function` statements anywhere in this repo's `supabase/migrations/`, `lib/`, or `app/` today. This is the project's first Postgres function — planner should use RESEARCH.md's Pattern 1 (§"Postgres claim function via Supabase RPC") as the reference implementation, and the migration's own comment-style convention (016/013) for documentation tone. |
| Scanner-service test harness for the new capacity-check branch | test | — | `scanner-service` has zero test files today (confirmed: no `*.test.ts` under `scanner-service/src/`). No in-repo scanner-service test convention to copy; the root project's Vitest convention (`lib/triage-fetch.test.ts`'s fetch-stubbing style) is the closest cross-tier analog, but the test runner/harness itself (supertest vs direct handler invocation) has no precedent in this repo. |

## Metadata

**Analog search scope:** `lib/`, `app/api/admin/`, `app/api/cron/`, `components/admin/`, `supabase/migrations/`, `scanner-service/src/`
**Files scanned (read in full or targeted range):** `04-CONTEXT.md`, `04-RESEARCH.md`, `lib/triage-release.ts`, `lib/triage-fetch.ts`, `lib/triage-constants.ts`, `lib/scanner-client.ts`, `app/api/admin/release-prospects/route.ts`, `app/api/admin/shortlist/route.ts`, `app/api/cron/follow-up/route.ts`, `components/admin/release-button.tsx`, `components/admin/shortlist-table.tsx`, `supabase/migrations/013_add_prospect_id_to_scans.sql`, `supabase/migrations/016_add_scan_release_marker.sql`, `scanner-service/src/index.ts` (targeted range 380-430, plus grep-located line numbers), `scanner-service/src/discovery.ts` (targeted range 1-35), `scanner-service/src/scanner.ts` (targeted range 215-240), `scanner-service/src/ai.ts` (targeted range 815-900)
**Pattern extraction date:** 2026-07-21
