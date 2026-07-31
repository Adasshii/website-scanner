# Phase 7: Lifecycle, Reporting & Retention - Pattern Map

**Mapped:** 2026-07-31
**Files analyzed:** 10 new/extended + 5 test files
**Analogs found:** 15 / 15 (one flagged with an infrastructure gap, see Q5)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `lib/lifecycle.ts` | utility (pure predicate) | transform | `lib/triage-eligibility.ts` | exact |
| `lib/retention-constants.ts` | config | — | `lib/triage-constants.ts` / `lib/bulk-scan-constants.ts` | exact |
| `lib/retention.ts` | service (query + mode branch) | batch | `lib/scan-queue.ts` (claim/reconcile) — role-match | role-match |
| `lib/reporting-aggregates.ts` | utility (aggregation) | transform | none in-repo (new shape); use `lib/triage-candidates.ts` for the row-shaping convention | partial |
| `app/api/admin/reporting/route.ts` | route (admin GET) | request-response | `app/api/admin/outreach/route.ts` | exact |
| `app/api/cron/retention/route.ts` | route (cron GET) | batch/scheduled | `app/api/cron/drain-scan-queue/route.ts` | exact |
| `supabase/migrations/019_add_booked_at_to_prospects.sql` | migration | — | `supabase/migrations/004_add_booked_at.sql` + `016_add_scan_release_marker.sql` (header style) | exact |
| `app/api/webhooks/fillout/route.ts` (extend) | route (webhook, extended) | event-driven | itself (existing leads-update block, lines 42-56) | exact |
| `components/admin/shortlist-table.tsx` (extend) | component | CRUD/render | itself (existing `StatusPill`, lines 26-44) | exact |
| `app/admin/page.tsx` (extend) | component (tab container) | request-response | itself (`Tab` union line 58, `ShortlistTab`, `TabButton`) | exact |
| `lib/lifecycle.test.ts` | test (unit) | — | any existing `lib/*.test.ts` for pure functions (e.g. `lib/triage-eligibility` has no test file itself — use vitest unit conventions from `lib/scoring.test.ts` if present, else the project's standard `describe/it` shape) | role-match |
| `lib/reporting-aggregates.integration.test.ts` | test (integration) | — | `lib/scan-drain.integration.test.ts` (referenced in migration 017 comment) | role-match |
| `lib/retention.integration.test.ts` | test (integration) | — | same integration-test convention (fileParallelism:false, shared local Supabase) | role-match |
| `app/api/webhooks/fillout/route.integration.test.ts` | test (integration) | — | none found — no existing test file for this route (confirmed by search below) | no analog |
| `app/admin/reporting-gate.test.tsx` | test (component/UI-state) | — | **none exist anywhere in the repo** | no analog — infrastructure gap |

## Pattern Assignments

### `lib/lifecycle.ts` (utility, transform)

**Analog:** `lib/triage-eligibility.ts` (full file, 39 lines — read in full above)

**Core pattern** — pure predicate, no DB calls, single exported function plus a lookup/constant, heavy header comment naming which other callers MUST route through it to avoid divergence:
```typescript
// Single releasability rule (D-4.1-01/03/04). Both the server release path
// (lib/triage-release.ts selectWorstN) and the admin UI eligible count MUST
// call isReleasable — a divergent copy re-introduces the mislead this phase
// fixes.
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
**Apply to `deriveLifecycleState()`:** same shape — plain object in, plain string out, no supabase import, one exported type + one exported function + one exported constant map (`FUNNEL_GROUPS`, mirroring `EXCLUDED_CATEGORIES_SET`'s role as a companion lookup). RESEARCH.md's Pattern 1 code block already follows this shape verbatim — use it as written, but flag the precedence ladder (A5) for confirmation per RESEARCH's own recommendation before treating it as locked.

---

### `lib/retention-constants.ts` (config)

**Analog:** `lib/triage-constants.ts` (full file above) and `lib/bulk-scan-constants.ts` (full file above)

**Pattern** — top comment naming the "single tunable constants block" convention, one exported constant per env-driven or tunable value, inline comment naming which decision (D-nn) or research section justifies each value, env vars read once at module scope (not inside functions), with a fallback default:
```typescript
// (bulk-scan-constants.ts style)
export const BULK_BATCH_SIZE = 10; // tunable default — rows claimed per cron tick
```
No existing constants module reads `process.env` directly in this repo's `lib/*-constants.ts` files (both triage and bulk-scan hardcode tunables, not env vars) — RESEARCH.md's Code Examples block is the correct pattern to follow instead for the env-var read:
```typescript
export const RETENTION_MODE: RetentionMode =
  (process.env.RETENTION_MODE as RetentionMode) || "dry-run";
export const RETENTION_MONTHS = Number(process.env.RETENTION_MONTHS ?? 12);
export const RETENTION_TABLE_ALLOWLIST = ["prospects", "outreach_messages", "scans"] as const;
```
Keep the "never add X here" comment style used for `EXCLUDED_CATEGORIES` and copy it onto `RETENTION_TABLE_ALLOWLIST` re: `suppressions` (D-7-19 requires the comment AND the test).

---

### `lib/retention.ts` (service, batch)

**Analog (auth/shape not applicable — this is a pure module, no route file):** `lib/scan-queue.ts`'s `claimNextScanBatch`/`reconcileInFlightScans` — the closest existing "importable module wrapping a batch DB operation, called from both a cron route and its own integration test" shape. Also structurally informed by migration 017's `claim_next_scan_batch` RPC comment block, which documents the exact hazard class (planner rewriting LIMIT, FK ordering) this module must avoid.

**Core pattern to copy:** export named async functions (not a class), accept a `SupabaseClient` as the first parameter (dependency-injected, never constructed inside — this is what makes `lib/retention.integration.test.ts` able to call it directly against a test client), return a plain result object the caller (cron route) turns into JSON.

**Mode-branch + FK-safe delete order** — copy verbatim from RESEARCH.md's Common Pitfall #1:
```typescript
// delete mode, exact order:
// 1. UPDATE prospects SET latest_scan_id = NULL WHERE id IN (expiring_ids)
// 2. DELETE FROM scans WHERE prospect_id IN (expiring_ids)
// 3. DELETE FROM prospects WHERE id IN (expiring_ids)  -- cascades outreach_messages
```

**Scope-guard pattern to copy** (from D-7-16 / migration 013's `scans.prospect_id IS NOT NULL` convention):
```typescript
.from("scans")
.select("id")
.not("prospect_id", "is", null)
```

---

### `lib/reporting-aggregates.ts` (utility, transform)

**Analog:** no direct precedent for day-bucketed aggregation exists in this repo (RESEARCH.md Pitfall 6 confirms this explicitly — "no existing code in this repo groups anything by day today"). Nearest structural analog for "shape rows for the admin surface" is `lib/triage-candidates.ts` (produces `ShortlistRow[]` consumed directly by `ShortlistTable`) — follow its convention of one exported function per payload shape, typed return, no direct route-level JSON formatting inside the lib file.

**Day-grouping pattern** (RESEARCH.md Code Examples / Pitfall 6 — UTC calendar day, no timezone library):
```typescript
const day = new Date(row.created_at).toISOString().slice(0, 10); // YYYY-MM-DD, UTC
```

---

### `app/api/admin/reporting/route.ts` (route, request-response)

**Analog:** `app/api/admin/outreach/route.ts` (full file above)

**Imports pattern** (lines 1-9):
```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { /* domain functions */ } from "@/lib/outreach-queue";
```

**Auth pattern** (lines 33-36) — copy verbatim, this is NOT a shared helper, it is copy-pasted per admin route (confirmed — see Q1 below):
```typescript
const secret = request.headers.get("x-admin-secret");
if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

**Error handling pattern** (lines 18-26, 44-59) — the `serializeError` helper handles Supabase's non-`Error` `PostgrestError` shape; copy this helper verbatim into the new route rather than re-deriving it:
```typescript
function serializeError(e: unknown): string {
  return e instanceof Error
    ? e.message
    : e && typeof e === "object" && "message" in e
    ? String((e as { message: unknown }).message)
    : JSON.stringify(e);
}
```
Wrap `createServerClient()` in its own try/catch (lines 44-50) before the query try/catch, matching the two-stage error handling this route already uses.

---

### `app/api/cron/retention/route.ts` (route, batch/scheduled)

**Analog:** `app/api/cron/drain-scan-queue/route.ts` (relevant excerpt above)

**Imports + exports pattern** (lines 1-8):
```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { /* lib functions */ } from "@/lib/retention";

export const runtime = "nodejs";
export const maxDuration = 60;
```

**Cron auth pattern** (lines 25-29) — copy verbatim, this is the exact `CRON_SECRET` Bearer guard, confirmed identical across all existing cron routes (see Q2 below):
```typescript
const authHeader = request.headers.get("authorization");
const cronSecret = process.env.CRON_SECRET;

if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

**Core pattern** — no request-driven parameters (batch size etc. come from constants, never from the request — same "never trust request input for tuning" note in `drain-scan-queue`'s own header comment), single top-level try/catch around the whole job, return counts as JSON.

**`vercel.json` entry to add** (append as a 5th array element, exact shape):
```json
{
  "path": "/api/cron/retention",
  "schedule": "0 3 1 * *"
}
```

---

### `supabase/migrations/019_add_booked_at_to_prospects.sql` (migration)

**Analog:** `supabase/migrations/004_add_booked_at.sql` (full file above, for the column shape) + `016_add_scan_release_marker.sql` (full file above, for the header-comment and index conventions used since migration 013)

**Pattern to copy** — header comment stating what this migration reads/writes and does NOT touch, `add column if not exists`, matching index style, explicit "RLS already enabled, not re-enabled" trailing comment (every migration since 013 includes this):
```sql
-- [phase/decision reference]: additive columns only, same shape as
-- migration 004's leads.booked_at. This phase reads and writes no
-- existing row beyond the guarded UPDATE in the Fillout webhook (D-7-08).
alter table prospects add column if not exists booked_at timestamptz;
alter table prospects add column if not exists booked_match_method text
  check (booked_match_method in ('email', 'domain'));

create index if not exists idx_prospects_booked_at on prospects (booked_at)
  where booked_at is not null;

-- RLS already enabled on prospects (migration 010) — not re-enabled here,
-- and no new policy added (service-role-only convention, migration 014).
```

---

### `app/api/webhooks/fillout/route.ts` (extend)

**Analog:** itself — the existing leads-update block (full file above, lines 42-56)

**First-write-wins guard to copy verbatim** (line 50):
```typescript
.is("booked_at", null)
```

**Extension point:** insert the new try/catch block (RESEARCH.md Pattern 2, already a concrete, ready-to-use excerpt) immediately after line 65's `console.log`, before the `return NextResponse.json({...})` at line 61 executes — i.e., attribution runs after the leads update succeeds but before the response is sent, wrapped so it can never change the response shape or status on failure. Reuse `normalizeDomain()` and `isAggregatorDomain()` from `lib/domain-normalize.ts` (already imported nowhere in this file — add the import).

---

### `components/admin/shortlist-table.tsx` (extend)

**Analog:** itself — the existing `StatusPill` component and its usage (lines 26-44, 196-198 for the `<th>` header row)

**Pill-column pattern to copy verbatim in shape:**
```typescript
// Existing precedent (lines 26-44):
const statusPillStyles = {
  queued: "bg-gray-100 text-gray-600 border-gray-200",
  scanning: "bg-blue-100 text-blue-700 border-blue-200",
  done: "bg-green-100 text-green-700 border-green-200",
  failed: "bg-red-100 text-red-700 border-red-200",
} as const;

function StatusPill({ status }: { status: keyof typeof statusPillStyles }) {
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${statusPillStyles[status]}`}>
      {status.toUpperCase()}
    </span>
  );
}
```
Build `StagePill` the same way, keyed on the 12 fine states, using the color mapping the UI-SPEC already locks (funnel-group buckets, not per-state colors — 6 style buckets covering 12 states). Insert the `<th>` for `Stage` at line 198, between `Status` (line 197) and `Released` (line 198) — i.e. the new header cell goes right after `<th className="px-4 py-3">Status</th>` and before the `Released` header. Render `<StagePill state={row.stage} />` in the matching `<td>` position in the row-mapping body (row rendering starts at line 203's `.map`).

**Note:** the `Stage` value must arrive on `ShortlistRow` already derived server-side (UI-SPEC E4, architectural map row 4: "the client never re-derives lifecycle state") — this means the API route feeding the Shortlist tab (`lib/triage-candidates.ts` / its route) needs `deriveLifecycleState()` called and the result attached per row before this component ever sees it. Confirm at plan time which route produces `ShortlistRow[]` and add the derivation call there, not inside this component.

---

### `app/admin/page.tsx` (extend)

**Analog:** itself — the `Tab` union (line 58) and the `ShortlistTab`/`TabButton` pattern (lines 375-382, 390-399, 448 `StatCard`, 528 `TabButton`)

**Tab union extension** (line 58):
```typescript
type Tab = "scans" | "leads" | "shortlist" | "outreach" | "reporting";
```

**TabButton usage pattern to copy** (lines 375-382, the Shortlist tab's own registration — copy this block's shape for the new "Reporting" entry):
```typescript
<TabButton
  active={tab === "shortlist"}
  onClick={() => handleTabChange("shortlist")}
>
  Shortlist
</TabButton>
```

**Panel-switch pattern to copy** (lines 390-399 — ternary chain, not a switch statement):
```typescript
{tab === "shortlist" ? (
  <ShortlistTab ... />
) : tab === "outreach" ? (
  <OutreachTable ... />
) : ( /* existing scans/leads table */ )}
```
Add `: tab === "reporting" ? (<ReportingTab ... />)` before the final else branch. Also extend the guard at line 420 (`tab !== "shortlist" && tab !== "outreach"`) to include `&& tab !== "reporting"` so the shared pagination controls don't render under the new tab (Reporting has no pagination per D-7-12's fixed-30-day window).

**`StatCard` reuse** (component defined at line 448, used by every tab) — reuse verbatim for the 5-card funnel row; do not create a new stat-card component.

---

## Shared Patterns

### Admin route auth (`x-admin-secret`)
**Source:** `app/api/admin/outreach/route.ts` lines 33-36
**Apply to:** `app/api/admin/reporting/route.ts`
**Not a shared helper — copy-pasted per route** (see Q1). Copy the two-line check verbatim; do not introduce a new middleware/helper for this phase.

### Cron route auth (`CRON_SECRET` Bearer)
**Source:** `app/api/cron/drain-scan-queue/route.ts` lines 25-29
**Apply to:** `app/api/cron/retention/route.ts`
Copy verbatim (see Q2).

### Supabase client creation
**Source:** `lib/supabase.ts`'s `createServerClient()`, imported identically in every admin and cron route (`import { createServerClient } from "@/lib/supabase";`)
**Apply to:** all new routes and `lib/retention.ts` (accept a client as a parameter rather than importing `createServerClient` inside the lib module itself, matching `lib/scan-queue.ts`'s DI shape so the integration test can pass its own test client)

### Config-module shape (constants + env var)
**Source:** `lib/triage-constants.ts`, `lib/bulk-scan-constants.ts`
**Apply to:** `lib/retention-constants.ts`

### Pure-predicate module shape
**Source:** `lib/triage-eligibility.ts`
**Apply to:** `lib/lifecycle.ts`

### Additive, re-runnable migration header + index convention
**Source:** every migration since `013_add_prospect_id_to_scans.sql`
**Apply to:** `019_add_booked_at_to_prospects.sql`

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `lib/reporting-aggregates.ts` | utility | transform | No existing code in this repo groups anything by calendar day (confirmed by RESEARCH.md Pitfall 6 and by this mapping's own search) — follow RESEARCH.md's `ReportingPayload` shape and the UTC-day-bucket snippet directly, there is no in-repo precedent to copy beyond the general "typed function returning a payload shape" convention |
| `app/api/webhooks/fillout/route.integration.test.ts` | test | integration | No existing integration test file for the Fillout webhook route was found in the repo (only unit-style conventions exist elsewhere) — Wave 0 must author this from scratch, following the shared integration-test conventions (`fileParallelism:false`, disjoint fixture prefixes) documented in `vitest.config.ts`'s comments |
| `app/admin/reporting-gate.test.tsx` | test | UI-state | **No component test of any kind exists anywhere in this repository.** See Question 5 below — this is a Wave 0 infrastructure gap, not a missing analog to search harder for. |

## Metadata

**Analog search scope:** `app/api/admin/*`, `app/api/cron/*`, `app/api/webhooks/fillout/*`, `lib/*`, `components/admin/*`, `supabase/migrations/*`, `vitest.config.ts`, `package.json`
**Files scanned:** ~20 (targeted reads/greps, no full-repo enumeration needed — RESEARCH.md's Canonical References already named every relevant file)
**Pattern extraction date:** 2026-07-31

---

## Answers to Specific Questions

**1. Admin auth — exact guard, shared or copy-pasted?**
Copy-pasted per route, not a shared helper. Verbatim from `app/api/admin/outreach/route.ts:33-36`:
```typescript
const secret = request.headers.get("x-admin-secret");
if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```
No shared `lib/admin-auth.ts` or middleware exists in the repo; every `app/api/admin/*` route repeats this block inline. The new `app/api/admin/reporting/route.ts` should do the same — introducing a shared helper now would be an unrequested abstraction outside this phase's scope.

**2. Cron auth — exact `CRON_SECRET` guard.**
Verbatim from `app/api/cron/drain-scan-queue/route.ts:25-29`:
```typescript
const authHeader = request.headers.get("authorization");
const cronSecret = process.env.CRON_SECRET;

if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```
Same pattern repeated identically in every existing `app/api/cron/*` route (confirmed by `[VERIFIED]` claims already in RESEARCH.md's Don't Hand-Roll table) — copy-pasted, not shared.

**3. `vercel.json` crons — count and 5th-entry shape.**
Currently 4 crons defined (`keepalive` weekly Monday 09:00, `follow-up` daily 10:00, `send-pending-reports` daily 08:00, `drain-scan-queue` daily 07:00). Exact array shape a 5th entry must match:
```json
{
  "path": "/api/cron/retention",
  "schedule": "0 3 1 * *"
}
```
appended as a 5th object inside the top-level `"crons"` array, comma-separated after the `drain-scan-queue` entry.

**4. Supabase client factory.**
Both admin routes and cron routes use the same single factory: `createServerClient()` from `lib/supabase.ts`, imported identically everywhere: `import { createServerClient } from "@/lib/supabase";`. There is no separate admin-vs-cron client variant — one factory, one import path, used project-wide. `lib/retention.ts` should accept a client instance as a function parameter (dependency injection) rather than calling `createServerClient()` internally, matching `lib/scan-queue.ts`'s shape, so its own integration test can inject a test client.

**5. Component tests — infrastructure status. FLAG THIS EXPLICITLY.**
**No component-testing infrastructure exists in this repository at all.** Confirmed by three independent checks:
- `package.json` has no `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, or `happy-dom` in any dependency section.
- `vitest.config.ts` sets `environment: "node"` for both its `unit` and `integration` projects, explicitly commented: *"Node test environment (no jsdom) — these tests are Node-side logic and DB integration, not browser/DOM code."*
- A repo-wide search for `*.test.tsx` found zero files.

This means `app/admin/reporting-gate.test.tsx` (needed for the UI-SPEC's two mandatory `backstop` rows — E1/E2 "partial") cannot be written against current tooling. **Wave 0 must add jsdom (or happy-dom) + `@testing-library/react` as new dev dependencies, add a third `component`/`jsdom` vitest project (or environment override) to `vitest.config.ts`, and only then author the render-output test the UI-SPEC requires.** This is a real scoping fact, not a detail: it is new infrastructure this phase must stand up before Wave 0 can close, not merely "write one more test file." Flag this to the planner as its own task/step, separate from and prior to the `reporting-gate.test.tsx` file itself.

**6. Table column pattern — `shortlist-table.tsx` pill column.**
Exact excerpt to mirror (lines 26-44):
```typescript
const statusPillStyles = {
  queued: "bg-gray-100 text-gray-600 border-gray-200",
  scanning: "bg-blue-100 text-blue-700 border-blue-200",
  done: "bg-green-100 text-green-700 border-green-200",
  failed: "bg-red-100 text-red-700 border-red-200",
} as const;

function StatusPill({ status }: { status: keyof typeof statusPillStyles }) {
  return (
    <span
      className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${statusPillStyles[status]}`}
    >
      {status.toUpperCase()}
    </span>
  );
}
```
Header cell insertion point is line 198 (`<th className="px-4 py-3">Status</th>` is line 197, `Released` follows) — the new `Stage` `<th>` and matching `<td>` go in that exact slot, using the 6-bucket color mapping already locked in 07-UI-SPEC.md's Color section (not a 12-color mapping — group by funnel bucket, e.g. all of `triaged/qualified/scan_queued/scanned/drafted/approved` share the same blue pill style).

**7. Dead code — `delete_expired_scans()` / `delete_expired_leads()`.**
Confirmed dead. `grep -rn "delete_expired"` across the repo (excluding `node_modules`) returns exactly two matches, both the `CREATE OR REPLACE FUNCTION` definitions themselves in `supabase/migrations/001_create_scans_and_leads.sql` (lines 43 and 51) — no route, cron, or lib file anywhere calls either function. They also predate `scans.prospect_id` (added in migration 013) entirely, so they have no prospect-ownership filter and would delete public-scanner scans and all `leads` rows indiscriminately. **PATTERNS.md states explicitly: do not use these functions or their pattern (a bare SQL `DELETE ... WHERE created_at < now() - interval`) as the retention job's shape.** `lib/retention.ts` must implement D-7-16's scope filter (`scans.prospect_id IS NOT NULL`) and D-7-15's clock expression in application code per RESEARCH.md's own recommendation, not as a SQL function.
