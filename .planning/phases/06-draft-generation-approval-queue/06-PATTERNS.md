# Phase 6: Draft Generation & Approval Queue - Pattern Map

**Mapped:** 2026-07-28
**Files analyzed:** 12
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `lib/scoring.ts` (modify, DRA-06) | utility/model | transform | itself (`scanner-service/src/index.ts` verdict fn) | exact — merge target |
| `scanner-service/src/index.ts` (modify, remove dup) | service | transform | `lib/scoring.ts` | exact — deletion target |
| `lib/draft-metric-selector.ts` (new) | utility | transform | `lib/contact-extraction.ts` | exact (pure fn, no I/O) |
| `lib/draft-prompt.ts` (new) | utility | transform | `scanner-service/src/design-prompt.ts` | exact (prompt builder) |
| `lib/draft-generator.ts` (new) | service | request-response (external API) | `lib/bulk-scan-dispatch.ts` (DI seam) + `scanner-service/src/ai.ts` (Gemini call/timeout) | exact composite |
| `lib/draft-locale.ts` (new) | config | transform | `lib/triage-constants.ts` / `EXCLUDED_CATEGORIES`-style constant | role-match |
| `app/api/internal/scan-complete/route.ts` (modify) | route/webhook | event-driven | itself (existing email-lead branch) | exact — add sibling branch |
| `app/api/admin/outreach/route.ts` (new) | route | CRUD | `app/api/admin/shortlist/route.ts` (GET) + `app/api/admin/release-prospects/route.ts` (POST/PATCH-style action) | exact |
| `components/admin/outreach-table.tsx` (new) | component | request-response | `components/admin/shortlist-table.tsx` | exact |
| `components/admin/outreach-row-panel.tsx` (new, per UI-SPEC) | component | request-response | `components/admin/release-button.tsx` (action/confirm pattern) + `shortlist-table.tsx` (pill/score styling) | role-match |
| `app/admin/page.tsx` (modify, 4th tab) | page/container | CRUD | itself (`Tab` union + `shortlist` fetch branch) | exact |
| `supabase/migrations/0NN_*.sql` (new) | migration | batch/DDL | `supabase/migrations/018_add_contact_classification.sql` | exact |
| `lib/scoring.test.ts`, `lib/draft-*.test.ts` (new) | test | transform | `lib/contact-extraction.test.ts`, `lib/scanner-design-prompt.test.ts` | exact |
| `app/api/internal/scan-complete/route.integration.test.ts`, `app/api/admin/outreach/route.integration.test.ts` (new) | test | CRUD | `lib/suppression.integration.test.ts` | exact (harness pattern) |

## Pattern Assignments

### `lib/scoring.ts` (utility, DRA-06 verdict consolidation)

**Analog:** `scanner-service/src/index.ts` lines 680-745 (the richer, divergent copy to absorb)

**Current `lib/scoring.ts` verdict block** (lines 43-79, thresholds 95/85/70/50 — to be replaced):
```typescript
export function buildSummary(pages: PageResult[]): ScanSummary {
  const allIssues = pages.flatMap((p) => p.issues);
  const criticalIssues = allIssues.filter((i) => i.severity === "critical").length;
  const majorIssues = allIssues.filter((i) => i.severity === "major").length;
  // ... dedup top 10 by impact ...
  const scores = aggregateScores(pages);
  let verdict: string;
  if (scores.overall >= 95) { verdict = "Excellent work..."; }
  else if (scores.overall >= 85) { verdict = "Your website is performing well..."; }
  // ...
}
```

**Scanner-service copy to migrate IN** (lines 727-745, thresholds 90/70/50, richer — becomes the one true function):
```typescript
function generateVerdict(scores: ScanScores, criticalCount: number): string {
  if (scores.overall >= 90) {
    return "Great job! Your website is well-built and performs strongly across all categories.";
  }
  if (scores.overall >= 70) {
    const weakest = getWeakestCategory(scores);
    return `Your website is in decent shape, but ${weakest} needs attention to reach its full potential.`;
  }
  if (scores.overall >= 50) {
    return `Your website has several areas for improvement. Addressing the ${criticalCount > 0 ? "critical" : "major"} issues would make a real difference.`;
  }
  return "Your website has significant issues that are likely costing you visitors and search rankings. The good news: most fixes are straightforward.";
}
```

**Target shape:** export `computeVerdict(scores: ScanScores, criticalCount: number): string` from `lib/scoring.ts` (this signature — it already has `getWeakestCategory` machinery scanner-service also defines locally, bring that helper over too). `buildSummary()` in `lib/scoring.ts` calls `computeVerdict(scores, criticalIssues)` instead of its own inline chain.

**Cross-boundary import (scanner-service consumes it):** add to `scanner-service/tsconfig.json`, mirroring the existing `@shared/*` → `../types/*` alias:
```json
"@shared-lib/*": ["../lib/*"]
```
Then in `scanner-service/src/index.ts`: `import { computeVerdict } from "@shared-lib/scoring";` — delete the local `generateVerdict`/`getWeakestCategory` (unless `getWeakestCategory` also needs export from `lib/scoring.ts`; keep both together).

**No test file exists today** — `lib/scoring.test.ts` is Wave 0 net-new. Shape it after `lib/contact-extraction.test.ts`'s fixture-based unit style (see below).

---

### `lib/draft-metric-selector.ts` (utility, transform, D-6-11)

**Analog:** `lib/contact-extraction.ts` (pure aggregation/classification, zero I/O, fully unit-testable over fixtures)

**Header/module-doc convention to copy** (lines 1-11):
```typescript
/**
 * lib/contact-extraction.ts — pure aggregation + classification of contact
 * material harvested by scanner-service/src/extractor.ts (PageData.contactExtraction).
 * No Supabase client, no I/O — mirrors the injectable/pure-function style of
 * scripts/legal-basis.ts and lib/domain-normalize.ts, fully unit-testable
 * over literal fixtures (CON-02/03/04/06/07).
 */
```
Adapt: `lib/draft-metric-selector.ts` — pure function over `scans.summary`/`scores`/`pages` (worst Core Web Vital, critical issue count, or lowest category score), no Supabase client, no I/O. Export a `CitableMetric { displayValue: string; description: string }`-shaped type (per RESEARCH.md's `metric.displayValue`).

**Type/export style to copy** (lines 17-31): plain exported `type`/`interface` declarations above the function body, e.g. `export interface ContactResult { ... }`.

**Test pairing** — `lib/contact-extraction.test.ts` (lines 1-11): imports every pure function by name and builds fixture helpers (`basePageData(overrides)`), no mocking framework, plain `describe/it/expect`. Copy this fixture-builder shape for `lib/draft-metric-selector.test.ts` (build a `baseScanSummary(overrides)` / `baseScores(overrides)` helper).

---

### `lib/draft-prompt.ts` (utility, transform, D-6-10)

**Analog:** `scanner-service/src/design-prompt.ts` (prompt-builder) + its test `lib/scanner-design-prompt.test.ts`

**Test-file placement convention** (module doc, lines 1-6 of `lib/scanner-design-prompt.test.ts`):
```typescript
/**
 * buildDesignAnalysisPrompt() — CMP-17 no-profiling control (D-13). Lives in
 * the root Vitest tree, not beside scanner-service/src/design-prompt.ts: root
 * Vitest picks up this file, scanner-service's own `tsc` build does not (its
 * tsconfig only includes src/**\/*), so the service ships no test-only
 * dependency (same placement rationale as lib/scanner-capacity.test.ts).
 */
```
Not directly applicable to `lib/draft-prompt.ts` (it lives natively in `lib/`, no cross-boundary placement issue) — but the **test style** transfers directly: plain string-assertion tests (`toContain`, `toMatch`, index-ordering checks), no snapshot testing:
```typescript
it("still contains all five scoring dimensions and the JSON-only response instruction", () => {
  const prompt = buildDesignAnalysisPrompt("example.nl");
  expect(prompt).toContain("visualHierarchy");
  // ...
});
it("places the no-profiling instruction after the dimension list and before ...", () => {
  const dimensionListEnd = prompt.indexOf("professionalism:");
  const noProfilingIndex = prompt.search(/person/i);
  expect(noProfilingIndex).toBeGreaterThan(dimensionListEnd);
});
```
Apply the same ordering-assertion technique to verify the Article 14 marker and the cited metric both appear in `buildDraftPrompt()`'s output in the right position relative to the tone brief.

**Language directive to reuse verbatim** (`scanner-service/src/ai.ts` lines 257-259 per RESEARCH.md, confirmed pattern shape from `VOICE_DIRECTIVE` at lines 18-38):
```typescript
const languageDirective = locale === "nl"
  ? `LANGUAGE: Respond entirely in natural Dutch (Nederlands)...`
  : "";
```

**Brand-voice injection pattern** (`scanner-service/src/ai.ts` lines 18-38) — a large constant string prepended to every user-facing-copy prompt:
```typescript
const VOICE_DIRECTIVE = `VOICE — write like a clear, thoughtful colleague talking to a smart friend. ...
NEVER use em dashes. Use commas, colons, or periods instead.
NEVER use these words or phrases: delve, tapestry, realm, ...`;
```
D-6-10's cold-outreach tone brief in `docs/prompts/draft-outreach-v1.md` should layer ON TOP of (not replace) this same voice directive — import/read the file as a string constant, concatenate with `VOICE_DIRECTIVE` at prompt-build time.

---

### `lib/draft-generator.ts` (service, request-response to Gemini, D-6-R5)

**Analog 1 — DI seam:** `lib/bulk-scan-dispatch.ts` lines 1-40

**Imports pattern:**
```typescript
import pLimit from "p-limit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateUrlSafe as defaultValidateUrlSafe } from "@/lib/url-validation.server";
```

**Injectable deps pattern** (lines 29-40):
```typescript
interface DispatchDeps {
  client?: Pick<ScannerClient, "fullScanBulk">;
  fetchImpl?: TriageFetchImpl;
  sleep?: Sleep;
  // Not part of the plan's documented dep surface, but injected the same
  // way lib/triage-fetch.ts's TriageDeps and scripts/import-prospects.ts's
  // ImportDeps already do — a real DNS-resolving validateUrlSafe() would
  // make this library's own unit tests non-deterministic and network-
  // dependent. Defaults to the real implementation everywhere else.
  validateUrlSafe?: ValidateUrlSafe;
}
export async function dispatchClaimedProspects(
  sb: SupabaseClient,
  prospects: ClaimedProspect[],
  deps: DispatchDeps = {}
) {
  const client = deps.client ?? new ScannerClient();
  const sleep = deps.sleep ?? defaultSleep;
  // ...
}
```
Apply identically: `generateDraft(prospect, scan, metric, deps: { generate?: (prompt: string) => Promise<string | null> } = {})`, defaulting `deps.generate` to a real Gemini call. RESEARCH.md's own Pattern 1 code example already gives the exact target shape — use it verbatim.

**Analog 2 — Gemini client init + non-fatal timeout:** `scanner-service/src/ai.ts` lines 40-46, 96-109 (per RESEARCH.md's Pattern 2)
```typescript
function getClient(): GoogleGenerativeAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}
```
```typescript
const withTimeoutLocal = <T>(p: Promise<T>, fallback: T): Promise<T> => {
  return Promise.race<T>([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]).catch(() => fallback);
};
```
Copy both verbatim into the Next.js side (no `@vercel/functions`, no SDK-level timeout option — plain `Promise.race`, per RESEARCH.md's Anti-Patterns section).

**Error handling:** Gemini call never throws to the caller — always resolves to `null` on failure/timeout, exactly like `runLocaleAiPipeline`'s `withTimeoutLocal(generateComprehensiveAnalysis(...), null)` fallback shape (`scanner-service/src/ai.ts` lines 108-112).

---

### `app/api/internal/scan-complete/route.ts` (route/webhook, modify)

**Analog:** itself — current full file (91 lines), the existing email-lead branch is the pattern the new prospect branch must sit BESIDE, not after.

**Auth pattern to reuse verbatim** (lines 14-19):
```typescript
const authHeader = request.headers.get("authorization");
const expectedKey = process.env.SCANNER_API_KEY;
if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

**Current fetch + gate (lines 27-38) — this is the guard that must move / branch BEFORE, per Pitfall 2:**
```typescript
const { data: scan, error } = await supabase
  .from("scans")
  .select("id, email, domain, scores, summary, status, sales_brief, locale")
  .eq("id", scanId)
  .single();

if (error || !scan) {
  return NextResponse.json({ error: "Scan not found" }, { status: 404 });
}

if (scan.status !== "completed" || !scan.email || !scan.scores || !scan.summary) {
  return NextResponse.json({ error: "Scan not ready or no email" }, { status: 400 });
}
```
**Required restructure:** select `prospect_id` too; branch on `scan.prospect_id` immediately after the fetch, BEFORE this `!scan.email` check — the prospect branch must never require `scan.email`. Existing email-lead logic (lines 40-73, `sendReportReadyEmail`/`sendAdminNotificationEmail`) stays completely unchanged in its own branch.

**Non-fatal failure pattern already established at the bottom of this exact file** (lines 63-73):
```typescript
await sendAdminNotificationEmail({ ... }).catch((err) => {
  console.error("Admin notification failed:", err);
});
```
Draft generation follows the same shape: never let a Gemini failure fail the webhook response (route must still return 200).

**maxDuration:** add `export const maxDuration = 60;` at module top — this route currently has none; RESEARCH.md confirms the sibling cron routes (`follow-up`, `send-pending-reports`) already use `maxDuration = 60`/`300` for exactly this "slow but bounded" reason.

---

### `app/api/admin/outreach/route.ts` (new admin route)

**Analog:** `app/api/admin/shortlist/route.ts` (GET, full file, 41 lines) + `app/api/admin/release-prospects` (POST-action shape, inferred from `release-button.tsx`'s fetch call)

**Full auth + error-handling shape to copy verbatim:**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase: ReturnType<typeof createServerClient>;
  try {
    supabase = createServerClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Admin shortlist: failed to create Supabase client:", msg);
    return NextResponse.json({ error: "Database client error", detail: msg }, { status: 500 });
  }

  try {
    const rows = await getShortlist(supabase);
    // Worst-first sort, mirrors D-6-04's "worst score first" requirement
    const sorted = [...rows].sort((a, b) => a.score - b.score);
    return NextResponse.json({ rows: sorted });
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : e && typeof e === "object" && "message" in e
        ? String((e as { message: unknown }).message)
        : JSON.stringify(e);
    console.error("Admin outreach error:", msg);
    return NextResponse.json({ error: "Failed to fetch drafts", detail: msg }, { status: 500 });
  }
}
```
The `.catch()` error-serialization block (Postgrest errors aren't `instanceof Error`) is a codebase-wide convention — copy it exactly for every new handler (GET/PATCH) in this route.

**PATCH/action fetch shape from the client side** (`release-button.tsx` lines 32-40, the pattern `outreach-table.tsx`/`outreach-row-panel.tsx` will reuse for Save edit/Regenerate/Approve/Reject):
```typescript
const res = await fetch("/api/admin/release-prospects", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-admin-secret": secret },
  body: JSON.stringify({ cutoff }),
});
if (res.ok) {
  onReleased();
} else {
  alert("Failed to release prospects.");
}
```

---

### `components/admin/outreach-table.tsx` (new)

**Analog:** `components/admin/shortlist-table.tsx` (full file referenced, table shell, pills, relative-date helper)

**Relative-date helper to reuse verbatim** (lines 17-24):
```typescript
// ponytail: Intl.RelativeTimeFormat (stdlib) over a date-fns dependency —
// this is the only relative-date display in the codebase.
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function relativeDate(dateStr: string): string {
  const diffMs = new Date(dateStr).getTime() - Date.now();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (Math.abs(diffDays) < 1) return "today";
  return rtf.format(diffDays, "day");
}
```

**StatusPill component to extend (not re-create)** (lines 27-42):
```typescript
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
Per UI-SPEC.md: add `draft`/`edited`/`approved`/`rejected` keys to this same style-map object (same component, new status keys) — do not build a second pill component.

**Score color-band logic to reuse exactly** (line 205):
```typescript
score.score >= 80 ? "text-green-600" : score.score >= 50 ? "text-yellow-600" : "text-red-600"
```
UI-SPEC.md's Color section locks these same thresholds/classes for the Outreach table's score column and evidence-pane badge — do not re-derive.

**NAMED-PERSON gate check to mirror for D-6-06's manual-generate condition** (line 167):
```typescript
const isNamedPerson = row.contact_email_type === "named-person";
```

---

### `components/admin/outreach-row-panel.tsx` (new, per UI-SPEC.md's expandable panel)

**Analog:** `components/admin/release-button.tsx` (confirm-then-POST action shape, full file)

**Confirm-dialog + disabled-while-loading pattern to copy for Approve/Reject/Regenerate** (lines 1-49):
```typescript
"use client";
import { useState } from "react";

export function ReleaseButton({ cutoff, eligibleCount, secret, onReleased }: ReleaseButtonProps) {
  const [releasing, setReleasing] = useState(false);
  const disabled = eligibleCount === 0 || releasing;

  async function handleClick() {
    const confirmed = window.confirm(`Release ${released} prospect...?`);
    if (!confirmed) return;
    setReleasing(true);
    try {
      const res = await fetch("/api/admin/release-prospects", { method: "POST", headers: {...}, body: JSON.stringify({...}) });
      if (res.ok) { onReleased(); } else { alert("Failed..."); }
    } catch {
      alert("Failed...");
    } finally {
      setReleasing(false);
    }
  }

  return (
    <button onClick={handleClick} disabled={disabled} className="bg-adashi-blue hover:bg-adashi-science text-white font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50">
      {releasing ? "Releasing..." : "Release to Scan Queue"}
    </button>
  );
}
```
Apply directly to Reject ("Reject prospect", red, `window.confirm` with the D-6-15 disambiguation copy from UI-SPEC.md) and Regenerate (conditional confirm only when `status === "edited"`, per D-6-14).

---

## Shared Patterns

### Admin-secret auth (every new/modified admin route)
**Source:** `app/api/admin/shortlist/route.ts` lines 7-10
**Apply to:** `app/api/admin/outreach/route.ts` (GET + PATCH), any new admin action endpoint
```typescript
const secret = request.headers.get("x-admin-secret");
if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

### Postgrest error serialization
**Source:** `app/api/admin/shortlist/route.ts` lines 32-39
**Apply to:** every catch block in `app/api/admin/outreach/route.ts`
```typescript
const msg =
  e instanceof Error
    ? e.message
    : e && typeof e === "object" && "message" in e
    ? String((e as { message: unknown }).message)
    : JSON.stringify(e);
```

### Non-fatal external-call wrapper (Gemini, and the existing admin-email pattern)
**Source:** `app/api/internal/scan-complete/route.ts` lines 63-73 (`.catch()` shape) + `scanner-service/src/ai.ts` `withTimeoutLocal` (lines 96-109)
**Apply to:** `lib/draft-generator.ts`'s Gemini call inside the new `scan-complete` prospect branch — never throw, always resolve to `null`/skip on failure, log with a `[draft]`-style bracketed prefix matching the codebase's `[scan]`/`[design-bg]` logging convention.

### Injectable dependency seam for external/non-deterministic calls
**Source:** `lib/bulk-scan-dispatch.ts` `DispatchDeps` (lines 29-40)
**Apply to:** `lib/draft-generator.ts`'s `generateDraft(..., deps: { generate?: ... } = {})` — makes the unit test suite (`lib/draft-generator.test.ts`) deterministic without a live Gemini call.

### Local-Supabase integration test harness
**Source:** `lib/suppression.integration.test.ts` lines 1-30
**Apply to:** `app/api/internal/scan-complete/route.integration.test.ts`, `app/api/admin/outreach/route.integration.test.ts`
```typescript
/**
 * PRECONDITION: a local Supabase stack, NOT production:
 *   supabase start
 *   supabase db reset   # applies supabase/migrations/*
 *   npx vitest run lib/suppression.integration.test.ts
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIs..."; // Supabase's published local-only demo JWT
```
Critical: `.env.local` in this repo points at REMOTE production Supabase (per session memory) — these `process.env` overrides at the top of the integration test file are what pins execution to 127.0.0.1, not a `.env.development.local` file alone. Copy this exact override-at-top-of-file placement.

### Idempotent migration convention
**Source:** `supabase/migrations/018_add_contact_classification.sql` (full file)
**Apply to:** the new migration for the D-6-15 reject flag (though Don't Hand-Roll in RESEARCH.md recommends reusing `prospects.lifecycle_state = 'rejected'` instead of a new column — if a migration is still needed for anything else this phase discovers, e.g. a failed-generation marker, follow this shape):
```sql
alter table prospects add column if not exists <col>
  <type> not null default <default>;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = '<constraint_name>'
  ) then
    alter table <table> add constraint <constraint_name>
      check (<condition>);
  end if;
end $$;
```

## No Analog Found

None — every new/modified file in this phase has at least one strong analog already in the codebase.

## Metadata

**Analog search scope:** `lib/`, `components/admin/`, `app/api/admin/`, `app/api/internal/`, `scanner-service/src/`, `supabase/migrations/`, root Vitest test files
**Files scanned:** `lib/scoring.ts`, `lib/contact-extraction.ts` + test, `lib/scanner-design-prompt.test.ts`, `lib/bulk-scan-dispatch.ts`, `lib/email.ts`, `lib/suppression.integration.test.ts`, `scanner-service/src/ai.ts`, `scanner-service/src/index.ts` (verdict block), `app/api/internal/scan-complete/route.ts`, `app/api/admin/shortlist/route.ts`, `components/admin/shortlist-table.tsx`, `components/admin/release-button.tsx`, `app/admin/page.tsx`, `supabase/migrations/018_add_contact_classification.sql`
**Pattern extraction date:** 2026-07-28
