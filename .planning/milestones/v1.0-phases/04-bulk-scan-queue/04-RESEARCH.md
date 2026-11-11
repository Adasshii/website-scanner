# Phase 4: Bulk Scan Queue - Research

**Researched:** 2026-07-21
**Domain:** Postgres work-queue semantics via Supabase (PostgREST), Vercel Cron reliability, scanner-service concurrency gating, WAF-aware bulk crawling
**Confidence:** MEDIUM-HIGH — architecture is locked and independently corroborated by two prior research passes; the mechanism-level gaps this research closes (SKIP LOCKED requires an RPC, p-limit version drift, no existing capacity refusal) are all HIGH confidence (verified directly against this repo's code).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Queue state & status (SCAN-01, SCAN-03)**
- D-01: Scan status lives as columns on the existing `prospects` row (`scan_status`, an attempt counter, and a reference to the produced scan), added via migration `017`. No new queue table.
- D-02: Status surfaces by extending the existing admin Shortlist tab with a status column, not a separate Queue tab.
- D-03: A `done` row links directly to its hosted report at `/report/[id]`.

**Failure policy (SCAN-04)**
- D-04: One attempt, no automatic retry. The attempt counter still increments.
- D-05: A failed prospect is manually re-queueable from the Shortlist; nothing re-queues it automatically.
- D-06: No report means no pitch. A failed scan drops the prospect out of the outreach flow.

**Pacing & blast radius (SCAN-02, SCAN-05, SCAN-06)**
- D-07: A bulk run is started manually ("Run batch") and drained by Vercel Cron in paced ticks.
- D-08: Bulk concurrency is capped strictly below the scanner-service's total capacity, reserving permanent headroom for the live public scanner. Small extension to the existing `activeFullScans` gate.
- D-09: Bulk scans identify with a distinct, honest user agent naming Adashi and a contact URL, separate from the public scanner's identity.
- D-10: A prospect whose robots.txt disallows crawling is skipped and marked, with the reason recorded, and drops out of outreach.

**Report exposure & incidental personal data (SCAN-07, CMP-17)**
- D-11: Prospect scans reuse `/report/[id]` exactly — same route, same components, no prospect-specific variant.
- D-12: The report is publicly reachable at an unguessable UUID — no auth, no email gate, no expiry.
- D-13: CMP-17 is enforced, not asserted: the design-analysis prompt is explicitly instructed not to describe or identify individuals, and nothing person-identifying derived from screenshots is persisted. Recorded in `docs/legal/lia/LIA-v1.md`.

### Claude's Discretion
- Queue drain ordering (worst-first mirroring the shortlist vs FIFO by release time).
- The exact over-capacity rejection shape for SCAN-02 (status code, retry-after semantics, how `scanner-client.ts` surfaces it).
- Cron cadence, batch size per tick, and inter-scan spacing values — subject to D-08's reserved-headroom rule and the 10–50/week scale.
- Migration number confirmation (`017` expected), column names, and the `p-limit` wiring.
- Where the reserved-headroom constant lives (a single tunable constants block is the Phase 3 precedent).

### Deferred Ideas (OUT OF SCOPE)
- Mid-run progress indicator and abort control — per-prospect status (D-02) covers visibility for now.
- Face redaction in screenshots — rejected as over-cost against the near-zero-spend constraint; D-13's no-profiling control is the chosen posture.
- Contact extraction (Phase 5), draft generation (Phase 6), review queue (Phase 7), send (Phase 8).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCAN-01 | Shortlisted prospects queued for full scan without exhausting browser concurrency | Drain cron + RPC claim function (Architecture Patterns §1) bounds concurrent dispatch; reuses `activeFullScans` size as the live concurrency signal |
| SCAN-02 | Scanner service refuses over-capacity requests instead of accepting-and-timing-out | `full-async` currently has **zero** capacity check (verified, index.ts:390-420) — Architecture Patterns §3 gives the exact insertion point and response shape |
| SCAN-03 | Visible per-prospect status: queued/scanning/done/failed | Migration 017 column design (Architecture Patterns §2); `getShortlist()` extension (Code Examples) |
| SCAN-04 | Failed scan skipped, not retried indefinitely | Attempt-counter column + `scan_status='failed'` terminal state, no retry path in the drain query |
| SCAN-05 | Honest UA, robots.txt respected | Phase 3's `lib/triage-fetch.ts` already has a tested robots.txt parser and honest-UA pattern to extend (Architecture Patterns §5) — NOT currently wired into scanner-service's Playwright crawl |
| SCAN-06 | Bulk scanning rate-limited so it cannot get the Railway IP blacklisted | Pitfall 2 (already researched in this project); D-08 reserved headroom + D-09 distinct UA are the structural mitigations; Validation Architecture §SCAN-06 gives the concrete before/during measurement |
| SCAN-07 | Same report artefact at a hosted URL | D-11 reuse of `/report/[id]` verbatim — verified this route requires no prospect-aware branching (generateMetadata reads only `scans.domain/scores`) |
| CMP-17 | Incidental personal data not indexed/profiled/reused | Exact prompt location for the fix identified: `scanner-service/src/ai.ts:generateDesignAnalysis` (Architecture Patterns §6) — currently has no such instruction, and is **shared** with the public scanner |
</phase_requirements>

## Summary

The locked architecture (Postgres `SELECT ... FOR UPDATE SKIP LOCKED` + Vercel Cron + `p-limit`, extending `activeFullScans`, reusing `scanner-client.ts` + `full-async`) is sound and this research does not challenge it. What planning needs is the mechanism-level detail the roadmap couldn't specify: **`SELECT ... FOR UPDATE SKIP LOCKED` cannot be expressed through this project's Supabase client** (`@supabase/supabase-js`, a PostgREST wrapper) — every one of the 17 prior migrations is pure DDL with zero RPC/plpgsql functions, so migration 017 is this project's *first* Postgres function, invoked via `.rpc()`. That's not a blocker, it's the concrete "how."

Three other locked assumptions need correction before planning, not re-litigation:

1. **`p-limit` "already installed at 3.1.0" is misleading.** It's physically present in `node_modules` only as a *transitive devDependency* (pulled in by something else, marked `"dev": true` in `package-lock.json`) — never declared, never a production dependency. This project's own prior research (`.planning/research/STACK.md`, 2026-07-17) independently recommended installing `p-limit@7.3.0` fresh as a real dependency. Current npm registry latest is `7.3.1` (verified via `npm view`), ESM-only, requires Node ≥20. The plan needs an explicit `npm install p-limit` (declaring it in `dependencies`, not relying on the incidental transitive copy) — this is package hygiene, not a new library decision.

2. **`full-async` has no capacity check today.** It calls `res.json({ accepted: true, scanId })` unconditionally before doing any work (verified, `scanner-service/src/index.ts:390-420`). SCAN-02 requires refusal, which means adding an `activeFullScans.size` check *before* that response — a small, surgical edit to the existing handler, not a new endpoint.

3. **The bulk-specific honest UA (D-09) has nowhere to attach today.** `discoverPages()` and `scanPage()` hardcode `"AdashiScanner/1.0 (+https://scan.adashi.io)..."` as the Playwright context UA (verified, `discovery.ts:24`, `scanner.ts:226`) with no per-request override. Satisfying D-09 requires threading an optional UA string through the existing `full-async` request body into these two functions — again an extension of the existing endpoint, not a new one.

A genuine reuse win: `prospects.latest_scan_id` (added in migration 013, FK to `scans(id)`, currently unused) is already exactly the "reference to the produced scan" D-01 asks for — migration 017 likely only needs to add `scan_status` and an attempt counter, not a third column.

**Primary recommendation:** Build migration 017 as columns + one plpgsql claim function (`claim_next_scan_batch`), invoked via `.rpc()` from a new `app/api/cron/drain-scan-queue/route.ts` that uses `p-limit@^7.3.1` (declared as a real dependency) to bound concurrent dispatch calls to `lib/scanner-client.ts`, which is extended (not replaced) to pass a bulk flag, a distinct UA string, and an optional pre-flight robots.txt check reusing Phase 3's `isHomepageDisallowed`/`parseRobotsForRoot` logic.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Batch trigger ("Run batch" button) | Frontend Server (Next.js admin route) | — | Mirrors Phase 3's Release button (D-07); a human-gated write, same tier as every other admin mutation |
| Queue claim (atomic row selection) | Database / Storage | — | `SKIP LOCKED` is a Postgres-level guarantee; must live in a Postgres function, not application code, to be race-safe across overlapping cron invocations |
| Drain pacing (cron tick, concurrency bound) | API / Backend (Vercel Cron route) | — | Vercel Cron is a serverless function on the Next.js side; `p-limit` bounds outbound dispatch calls from here |
| Full-scan capacity gate | API / Backend (scanner-service, Railway) | — | `activeFullScans` already lives here; capacity refusal must be enforced at the same tier that tracks in-flight scans, not guessed at from the caller side |
| Scan execution (Playwright crawl) | API / Backend (scanner-service) | — | Unchanged; Phase 4 adds parameters (UA, bulk flag), not a new execution path |
| Status display | Browser / Client (admin Shortlist table, React) | Frontend Server (data fetch) | Existing `components/admin/shortlist-table.tsx` + `app/api/admin/shortlist/route.ts` pattern; D-02 extends, doesn't relocate |
| Report rendering | Frontend Server (SSR) | — | `/report/[id]` is a Next.js server component; D-11 reuses verbatim |
| robots.txt / UA compliance check | API / Backend (Next.js, pre-dispatch) | — | Reuses Phase 3's plain-`fetch`-based check (`lib/triage-fetch.ts`), which already runs on this tier — keeps scanner-service (Railway) untouched for this concern |
| CMP-17 no-profiling control | API / Backend (scanner-service, Gemini prompt) | — | The screenshot never leaves scanner-service until the AI call; the control must be in the prompt sent from there |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `p-limit` | `^7.3.1` [VERIFIED: npm registry — `npm view p-limit version` → 7.3.1, published 2026-07-20] | Bounds concurrent dispatch calls from the drain cron to `lib/scanner-client.ts` | Already this project's own prior recommendation (`.planning/research/STACK.md`); one-line concurrency limiter, no custom semaphore |
| Postgres `plpgsql` function using `FOR UPDATE ... SKIP LOCKED` | Postgres 15+ (Supabase-managed, no extension) | Atomic multi-invocation-safe row claim | `@supabase/supabase-js` (PostgREST) cannot express `FOR UPDATE` — this is the only way to get the locked semantics through Supabase [CITED: multiple sources cross-referencing PostgREST limitations, see Sources] |
| Vercel Cron | — (already in use, `vercel.json`) | Scheduled drain invocation | Already the project's cron mechanism (3 existing entries); adding a 4th is zero new infrastructure |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/triage-fetch.ts` (`isHomepageDisallowed`, `parseRobotsForRoot`) | existing, in-repo | robots.txt pre-flight check before dispatching a bulk scan | Reuse directly if the check can stay a plain-fetch homepage check (consistent with Phase 3); extract into a shared module (e.g. `lib/robots-check.ts`) if both triage and bulk-scan need it, to avoid a second copy |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Postgres `SKIP LOCKED` RPC | `pg-boss` / Supabase `pgmq` + Edge Functions | Already rejected in `.planning/research/STACK.md` — persistent-worker or new-compute-surface assumptions that don't fit Vercel's stateless functions or this project's "no new infrastructure" constraint. Do not revisit. |
| `p-limit@7.3.1` (ESM) | `p-limit@3.1.0` (CJS, incidentally present) | Only if the drain route somehow can't tolerate an ESM-only import (it can — Next.js API routes bundle ESM packages transparently); otherwise 7.3.1 matches this project's own prior research and current npm state |

**Installation:**
```bash
npm install p-limit
```

**Version verification:** `npm view p-limit version` → `7.3.1` (dist-tag `latest`), `engines.node` → `>=20`. `type: "module"` (ESM-only). This project has no `.nvmrc`/`engines` field pinning Node version; `app/api/scan/route.ts` already runs `maxDuration = 300` in production, implying the deployed plan/runtime already tolerates long-running functions — but the exact Vercel-assigned Node major version was not directly verifiable from the repo. **Recommendation:** add `"engines": { "node": ">=20" }` to root `package.json` alongside the `p-limit` bump, to make the requirement explicit rather than implicit.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `p-limit` | npm | Package itself is long-established (sindresorhus, foundational ecosystem utility); the **7.3.1 patch** was published 2026-07-20, one day before this research | 298,082,419/week | `github.com/sindresorhus/p-limit` | [SUS] per automated check (`too-new` — flags the *patch release date*, not package history) | **Approved with note.** The `too-new` signal is a false positive triggered by a same-day patch release on an extremely well-established package (298M/week downloads is one of the highest possible legitimacy signals in the npm ecosystem, correct GitHub org linkage). If cautious, pin `^7.3.0` (the prior minor, not same-day) instead of `^7.3.1` — functionally identical for this use case. |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `p-limit` — flagged only because of a same-day patch publish date; downloads/repo signals are unambiguous. No `checkpoint:human-verify` gate needed given the download count and repo match, but note it in the plan so it isn't a silent surprise if re-audited later.

*No other new packages are introduced by this phase — no job-queue library, no new HTTP/scraping library (robots.txt handling reuses in-repo Phase 3 code).*

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  Joshua clicks "Run batch" (admin Shortlist tab)                     │
└───────────────────────────────┬─────────────────────────────────────┘
                                 │ POST /api/admin/run-batch (x-admin-secret)
                                 ▼
                    ┌────────────────────────────┐
                    │ Marks a bounded set of      │   (optional explicit
                    │ released, un-queued         │    "arm the batch" step —
                    │ prospects as eligible for   │    Claude's discretion on
                    │ the drain to pick up        │    whether this writes a
                    │ (or simply flips a run flag)│    flag or just lets the
                    └───────────────┬────────────┘    drain start immediately)
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Vercel Cron: /api/cron/drain-scan-queue  (paced ticks, e.g. */5 min) │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ 1. supabase.rpc('claim_next_scan_batch', { batch_size })      │    │
│  │    → Postgres function: SELECT ... FOR UPDATE SKIP LOCKED     │    │
│  │      WHERE scan_released_at IS NOT NULL                       │    │
│  │        AND scan_status IS NULL (or 'queued')                   │    │
│  │      LIMIT batch_size                                          │    │
│  │      → UPDATE scan_status = 'scanning' RETURNING claimed rows  │    │
│  │ 2. p-limit(N) bounds concurrent dispatch of claimed rows        │    │
│  │ 3. For each: robots.txt pre-flight check (reused from Phase 3) │    │
│  │    → disallowed? mark scan_status='failed', reason recorded    │    │
│  │    → allowed? call scanner-client.fullScanBulk(url, {           │    │
│  │        prospectId, userAgent: BULK_USER_AGENT })                │    │
│  └──────────────────────────────────────────────────────────────┘    │
└────────────────────────────────┬───────────────────────────────────┘
                                  │ POST /api/scan/full-async (extended body:
                                  │   scanId, prospectId?, source: "bulk", userAgent?)
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│  scanner-service (Railway) — full-async handler                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 0. Capacity check (NEW): if source==="bulk" and                 │  │
│  │    activeFullScans.size >= (MAX_TOTAL - RESERVED_FOR_PUBLIC):    │  │
│  │      respond 503 immediately, do NOT register in activeFullScans│  │
│  │    else: proceed exactly as today                                │  │
│  │ 1. activeFullScans.set(scanId, supabase)  [existing]             │  │
│  │ 2. discoverPages/scanPage — now accept userAgent param          │  │
│  │    (defaults to existing public-scanner UA if absent)           │  │
│  │ 3. On completion: writes scans row with prospect_id (existing    │  │
│  │    FK, migration 013) + calls back to update prospects.scan_status│ │
│  └────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬───────────────────────────────────┘
                                  │ webhook-style callback (existing pattern,
                                  │ app/api/internal/scan-complete) OR direct
                                  │ DB write from scanner-service (existing
                                  │ pattern for scans table)
                                  ▼
              prospects.scan_status = 'done' | 'failed'
              prospects.latest_scan_id = scans.id  (existing FK, reused)
                                  │
                                  ▼
          Admin Shortlist tab (extended, D-02) shows status + report link
                                  │
                                  ▼
                  /report/[id]  (D-11, reused verbatim, unchanged)
```

### Recommended Project Structure
```
supabase/migrations/
└── 017_add_scan_status.sql        # columns + claim_next_scan_batch() plpgsql function

app/api/
├── admin/run-batch/route.ts       # human-gated batch start (mirrors release-prospects/route.ts)
└── cron/drain-scan-queue/route.ts # Vercel Cron entry, calls .rpc(), p-limit-bounded dispatch

lib/
├── scanner-client.ts              # extended: fullScanBulk() or fullScan() gains {prospectId, source, userAgent}
├── bulk-scan-constants.ts         # BULK_USER_AGENT, RESERVED_FOR_PUBLIC, BATCH_SIZE, TICK cadence (mirrors triage-constants.ts)
└── robots-check.ts                # extracted from lib/triage-fetch.ts if shared between triage + bulk scan (or bulk scan imports triage-fetch's exports directly if visibility allows)

scanner-service/src/
├── index.ts                       # full-async handler gains capacity check + userAgent passthrough
├── discovery.ts                   # discoverPages() accepts optional userAgent param
└── scanner.ts                     # scanPage() accepts optional userAgent param

components/admin/
└── shortlist-table.tsx            # extended: status column + re-queue action + report link
```

### Pattern 1: Postgres claim function via Supabase RPC (the only way to get SKIP LOCKED)
**What:** `@supabase/supabase-js` is a PostgREST client — it has no `.forUpdate()` / `.skipLocked()` method because PostgREST's query builder doesn't expose row-locking clauses over HTTP. The only way to run `SELECT ... FOR UPDATE SKIP LOCKED` against a Supabase-managed Postgres instance is to define a Postgres function and call it via `supabase.rpc('fn_name', params)`.
**When to use:** Any time multiple concurrent invocations (here: overlapping Vercel Cron ticks) must claim non-overlapping rows from a shared table.
**Example:**
```sql
-- supabase/migrations/017_add_scan_status.sql
alter table prospects add column if not exists scan_status text
  check (scan_status in ('queued', 'scanning', 'done', 'failed'));
alter table prospects add column if not exists scan_attempts integer not null default 0;
-- NOTE: no new "scan reference" column — prospects.latest_scan_id (migration 013,
-- FK to scans(id)) already exists and is unused; reuse it (D-01's "reference to
-- the produced scan").

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
```typescript
// app/api/cron/drain-scan-queue/route.ts
const { data: claimed, error } = await supabase.rpc("claim_next_scan_batch", {
  batch_size: BATCH_SIZE,
});
```
[VERIFIED: this repo — zero existing `.rpc()`/`plpgsql` calls in `supabase/migrations/`, `lib/`, or `app/`; confirmed via grep. This is the first RPC function in the project.]

### Pattern 2: Capacity refusal via existing `activeFullScans` map (extends, doesn't replace)
**What:** `full-async` currently accepts unconditionally. Add a single guard before the immediate `res.json({accepted:true})`.
**When to use:** SCAN-02's refuse-don't-timeout requirement.
**Example:**
```typescript
// scanner-service/src/index.ts — inside app.post("/api/scan/full-async", ...)
const { url, scanId, maxPages = 7, locale = "en", source, userAgent } = req.body as {
  url: string; scanId: string; maxPages?: number; locale?: string;
  source?: "bulk"; userAgent?: string;
};

const effectiveLimit = source === "bulk"
  ? MAX_TOTAL_FULL_SCANS - RESERVED_FOR_PUBLIC
  : MAX_TOTAL_FULL_SCANS;

if (activeFullScans.size >= effectiveLimit) {
  res.status(503).json({ error: "At capacity", retryAfterSeconds: 30 });
  return; // do NOT register in activeFullScans — never accept what can't run
}

res.json({ accepted: true, scanId }); // existing line, now gated
```
[VERIFIED: this repo, `scanner-service/src/index.ts:390-420` — confirmed no capacity check exists today; `res.json({accepted:true})` fires unconditionally.]

### Pattern 3: Distinct honest UA threaded through existing Playwright contexts
**What:** `discoverPages()` and `scanner.ts:scanPage()` hardcode the public scanner's UA string in `browser.newContext({ userAgent: "AdashiScanner/1.0..." })`. Thread an optional param through instead of forking the function.
**Example:**
```typescript
// scanner-service/src/discovery.ts
export interface DiscoveryOptions {
  startUrl: string;
  maxPages: number;
  timeoutMs?: number;
  userAgent?: string; // NEW — defaults to existing public-scanner identity
}
// ...
const context = await browser.newContext({
  userAgent: options.userAgent ??
    "AdashiScanner/1.0 (+https://scan.adashi.io) — accessibility & SEO checker",
  viewport: { width: 1280, height: 720 },
  ignoreHTTPSErrors: true,
});
```
```typescript
// lib/bulk-scan-constants.ts (mirrors lib/triage-constants.ts's TRIAGE_USER_AGENT pattern)
export const BULK_USER_AGENT =
  "AdashiProspecting/1.0 (+https://adashi.io/contact) — outreach research crawler";
```
[VERIFIED: this repo, `scanner-service/src/discovery.ts:24`, `scanner-service/src/scanner.ts:226` — both hardcode the same public-scanner UA string with no override param today.]

### Pattern 4: robots.txt pre-flight reusing Phase 3's tested parser
**What:** `lib/triage-fetch.ts` already has `parseRobotsForRoot(text, uaToken)` and `isHomepageDisallowed(origin, uaToken, fetchImpl)` — a homepage-only, fail-open-on-404 check, unit-tested in `lib/triage-fetch.test.ts`. Phase 4 needs the same check before dispatching a bulk scan, using `BULK_USER_AGENT` (not `TRIAGE_USER_AGENT` — D-09 wants a distinct identity per surface, though both are checking the same robots.txt rules text).
**When to use:** In the drain cron, before calling `scanner-client`'s bulk dispatch method — never inside scanner-service (keeps the check on the Next.js tier, consistent with Phase 3, and needs no scanner-service change).
**Example:**
```typescript
// app/api/cron/drain-scan-queue/route.ts
import { isHomepageDisallowed } from "@/lib/triage-fetch"; // or extracted shared module
import { BULK_USER_AGENT } from "@/lib/bulk-scan-constants";

for (const prospect of claimed) {
  const origin = new URL(prospect.website_url!).origin;
  const disallowed = await isHomepageDisallowed(origin, BULK_USER_AGENT, fetch);
  if (disallowed) {
    await supabase.from("prospects")
      .update({ scan_status: "failed", scan_attempts: 1 })
      .eq("id", prospect.id);
    continue; // never calls scanner-service for this prospect (D-10)
  }
  // ... dispatch under p-limit
}
```
**Discretion note:** if `isHomepageDisallowed` isn't exported/reusable as-is, extract the shared logic into `lib/robots-check.ts` taking `uaToken` as a parameter — do not fork/duplicate the parser.

### Pattern 5: CMP-17 enforcement at the exact prompt that needs it
**What:** `scanner-service/src/ai.ts:generateDesignAnalysis()` is the Gemini vision call on the homepage screenshot — the only place a person's face/name in a screenshot could get described. It is currently used by **both** the public scanner and (per D-11) Phase 4's bulk scans, since there's no separate bulk analysis path.
**Example addition to the existing prompt:**
```typescript
// scanner-service/src/ai.ts — inside generateDesignAnalysis()'s prompt string
`... Rate each dimension 0-100 and identify the most important visual issues.

Do not describe, name, or identify any person visible in the screenshot (staff photos,
headshots, named bios). Focus only on layout, color, typography, and CTA design.

Website: ${domain}
...`
```
**Verification implication:** since this prompt is shared code, this phase's CMP-17 fix also changes the public scanner's design-analysis output — flag this in the plan's verification step so it's an intentional, reviewed change, not a silent side effect.
[VERIFIED: this repo, `scanner-service/src/ai.ts:858-879` — confirmed the current prompt has no such instruction and is the single shared function for both scan paths.]

### Anti-Patterns to Avoid
- **Adding a new scanner-service endpoint for bulk scans:** explicitly locked against (CONTEXT.md, ROADMAP.md). Extend `full-async`'s request body and internal logic instead.
- **Retrying failed/blocked scans "to be safe":** Pitfall 2 and D-04/D-10 both forbid this — a blocked scan is a terminal skip, retries amplify the exact WAF fingerprint SCAN-06 exists to avoid.
- **Using `.upsert()` anywhere on `prospects`:** `country` is `NOT NULL` with no default (Pitfall 3, already documented in this codebase) — use `.update().eq()` / `.in()` exclusively, as the drain cron and claim function both do.
- **Advancing `prospects.lifecycle_state` to `'scan_queued'`/`'scanned'`:** those enum values exist in the migration-010 check constraint but are never written anywhere in the current codebase — Phase 3 deliberately never touches `lifecycle_state` (D-07, "pure query"). Follow the established convention: `scan_status` is Phase 4's own dedicated column, exactly like `triage_score` was Phase 3's. Do not resurrect the unused `lifecycle_state` values now.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic queue claim across overlapping cron ticks | A custom "SELECT then UPDATE WHERE status='queued'" race-prone pattern (the exact pattern `lib/triage-release.ts` uses and explicitly justifies as fine for human-click-only concurrency) | A Postgres `FOR UPDATE SKIP LOCKED` function via `.rpc()` | Vercel Cron does not guarantee non-overlapping invocations or exactly-once delivery [CITED below] — the select-then-update pattern that's correct for a single human click is not correct for a cron tick that can overlap itself |
| Concurrency limiting | A hand-rolled counter/semaphore around `Promise.all` | `p-limit` | One-line, already the project's own prior recommendation, zero edge cases to get wrong |
| robots.txt parsing | A new parser for Phase 4 | `lib/triage-fetch.ts`'s existing `parseRobotsForRoot`/`isHomepageDisallowed` | Already written, already unit-tested (`lib/triage-fetch.test.ts`), fail-open behavior already decided (D-12 precedent from Phase 3) |

**Key insight:** every "don't hand-roll" item in this phase already has a working implementation somewhere in this repo (triage's robots check, triage's honest-UA pattern, the existing `activeFullScans` map). The work is *extension*, not invention.

## Runtime State Inventory

Not applicable — this is a greenfield addition (new columns, new cron route, new RPC function), not a rename/refactor/migration of existing state. Skipped per instructions.

## Common Pitfalls

### Pitfall 1: Treating `p-limit` as "no new dependency" and skipping the `package.json` declaration
**What goes wrong:** The plan imports `p-limit` in a new production route relying on its incidental presence as a transitive devDependency. A future `npm ci` in a stricter CI mode, or the transitive chain shifting when an unrelated package updates, silently removes it and breaks the drain cron in production with an unhelpful "module not found."
**Why it happens:** CONTEXT.md's "already installed at 3.1.0" note is true but describes an accident of the dependency tree, not a declared dependency.
**How to avoid:** `npm install p-limit` explicitly (adds it to `dependencies`, bumps the resolved version to current).
**Warning signs:** `p-limit` absent from `package.json`'s `dependencies` block after the plan is executed.

### Pitfall 2: WAF fingerprinting shared with the live public scanner (already researched — Pitfall 2 in `.planning/research/PITFALLS.md`)
**What goes wrong:** Bulk-scanning dozens of stranger sites per week from the same Railway IP that serves the live public scanner risks the IP getting fingerprinted/blacklisted by a shared WAF vendor, degrading the paying product.
**How to avoid:** D-08 (reserved headroom) + D-09 (distinct UA) are the structural mitigations already locked. This research adds: rate/pace the drain ticks (don't burst all claimed rows through `p-limit` instantly — space dispatch calls within a tick, not just cap total concurrency), and treat every non-2xx/timeout/blocked response as `scan_status='failed'` immediately, never retried (D-04 already covers this).
**Warning signs:** bulk scan success rate declining week over week; public scanner success rate dipping during/after a bulk run (see Validation Architecture, SCAN-06).

### Pitfall 3: Vercel Cron overlapping invocations without the SKIP LOCKED guard actually wired up correctly
**What goes wrong:** [CITED: Vercel Cron Jobs docs] cron delivery is best-effort and can invoke the same scheduled run more than once, and if a cron function runs longer than its interval, Vercel can start a second instance while the first is still running. If the claim function's `WHERE` clause doesn't exactly match what's set to `'scanning'`, two overlapping ticks could both claim overlapping prospects before either commits its `UPDATE`.
**How to avoid:** The `FOR UPDATE SKIP LOCKED` claim function (Pattern 1) is exactly the guard against this — verify in testing that two rapid-fire invocations of the drain route never claim the same prospect id (an integration test with two concurrent `.rpc()` calls against a shared local Supabase, mirroring the style of `lib/triage-release.integration.test.ts`).
**Warning signs:** a prospect showing `scan_attempts > 1` when D-04 says exactly one attempt; two `scans` rows with the same `prospect_id` from the same batch.

### Pitfall 4: `maxDuration` mismatch between the drain cron and the actual claim-batch size
**What goes wrong:** [CITED: Vercel Cron Jobs docs / Vercel Functions duration docs] Cron function duration limits match ordinary Vercel Function limits (up to 800s on Pro/Enterprise with Fluid Compute, lower on some configurations). Since `full-async` dispatch is fire-and-forget (the scanner-service call returns immediately per the existing pattern), the drain route itself should return quickly after dispatching a bounded batch — it should NOT wait for scans to complete.
**How to avoid:** Mirror the existing `send-pending-reports` cron's `// Limit to N per run to stay within maxDuration` comment and pattern — pick a batch size the dispatch loop can fire through well within the route's `maxDuration` (existing crons in this repo use 30-60s; this route likely needs slightly more given multiple robots.txt pre-flight fetches, but should stay well under Vercel limits since it never awaits scan completion).
**Warning signs:** drain route timing out; scanner-service receiving duplicate dispatches because a timed-out cron invocation retriggered before its claimed rows were marked `'scanning'`.

### Pitfall 5: Sharing the CMP-17 prompt fix silently changes public-scanner output
**What goes wrong:** `generateDesignAnalysis()`'s prompt is shared between the public scanner and bulk scans (Pattern 5). Adding the no-profiling instruction is correct and required, but if unflagged, a reviewer verifying "did Phase 4 touch the public scanner?" could be surprised.
**How to avoid:** Call this out explicitly in the plan and in verification — it's an intentional, desirable shared-code improvement (no reason the public scanner shouldn't also avoid profiling incidental faces), not a scope leak.

## Code Examples

### Extending `lib/scanner-client.ts` for bulk dispatch (D-09, D-08 wiring point)
```typescript
// lib/scanner-client.ts — add alongside the existing fullScan()
async fullScanBulk(
  url: string,
  opts: { prospectId: string; userAgent: string; maxPages?: number }
): Promise<{ accepted: boolean; scanId: string }> {
  const body: Record<string, unknown> = {
    url,
    scanId: crypto.randomUUID(), // generated here so the caller can persist it before dispatch
    maxPages: opts.maxPages ?? 7,
    source: "bulk",
    userAgent: opts.userAgent,
    prospectId: opts.prospectId,
  };
  const res = await fetch(`${this.baseUrl}/api/scan/full-async`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000), // short timeout — this call only needs the immediate accept/reject
  });
  if (res.status === 503) {
    return { accepted: false, scanId: body.scanId as string };
  }
  if (!res.ok) throw new Error(`Scanner service error (${res.status})`);
  return res.json();
}
```
[VERIFIED: this repo — mirrors the exact request/response shape of the existing `full-async` handler and the class's existing `request()` helper pattern, `lib/scanner-client.ts`.]

### Drain cron skeleton
```typescript
// app/api/cron/drain-scan-queue/route.ts
import { NextRequest, NextResponse } from "next/server";
import pLimit from "p-limit";
import { createServerClient } from "@/lib/supabase";
import { ScannerClient } from "@/lib/scanner-client";
import { BULK_USER_AGENT, BATCH_SIZE, DISPATCH_CONCURRENCY } from "@/lib/bulk-scan-constants";
import { isHomepageDisallowed } from "@/lib/triage-fetch";

export const runtime = "nodejs";
export const maxDuration = 60; // matches existing cron conventions in this repo

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data: claimed, error } = await supabase.rpc("claim_next_scan_batch", {
    batch_size: BATCH_SIZE,
  });
  if (error) {
    console.error("[drain-scan-queue] claim failed:", error);
    return NextResponse.json({ error: "Claim failed" }, { status: 500 });
  }

  const client = new ScannerClient();
  const limit = pLimit(DISPATCH_CONCURRENCY);

  const results = await Promise.all(
    (claimed ?? []).map((prospect) =>
      limit(async () => {
        const origin = new URL(prospect.website_url).origin;
        const blocked = await isHomepageDisallowed(origin, BULK_USER_AGENT, fetch);
        if (blocked) {
          await supabase.from("prospects")
            .update({ scan_status: "failed", scan_attempts: 1 })
            .eq("id", prospect.id);
          return { id: prospect.id, dispatched: false, reason: "robots_disallowed" };
        }
        try {
          const { accepted } = await client.fullScanBulk(prospect.website_url, {
            prospectId: prospect.id,
            userAgent: BULK_USER_AGENT,
          });
          if (!accepted) {
            // At capacity — revert claim so a later tick retries this prospect
            await supabase.from("prospects")
              .update({ scan_status: "queued" })
              .eq("id", prospect.id);
          }
          return { id: prospect.id, dispatched: accepted };
        } catch (e) {
          await supabase.from("prospects")
            .update({ scan_status: "failed", scan_attempts: 1 })
            .eq("id", prospect.id);
          return { id: prospect.id, dispatched: false, reason: String(e) };
        }
      })
    )
  );

  return NextResponse.json({ claimed: claimed?.length ?? 0, results });
}
```
**Note:** the "revert claim to `queued` on 503" branch is a design decision left to the planner — an alternative is to treat a 503 the same as any other dispatch failure (mark `failed`, per D-04's one-attempt rule) rather than requeue. Given D-08 makes 503s an expected/structural outcome (not a scan failure), reverting to `queued` for a later tick to retry is likely more correct than burning the one attempt on a capacity rejection — but this should be confirmed with the plan author rather than assumed.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `p-limit` v3.x (CJS default export, dual CJS/ESM) | `p-limit` v7.x (ESM-only, requires Node ≥20) | v4 (per package history) | Import must be a static/dynamic ESM `import`, not `require()`; Next.js API routes handle this transparently, standalone `tsx`-run scripts may need `import()` |

**Deprecated/outdated:** None specific to this phase's stack — Postgres `SKIP LOCKED` and Vercel Cron are both current, actively maintained mechanisms with no newer replacement pattern for this scale.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vercel Cron's exact overlapping-invocation behavior and 800s Pro/Enterprise maxDuration ceiling, as described in public docs, apply unchanged to this project's specific Vercel plan/config | Common Pitfalls §3, §4 | If the deployed plan has a lower ceiling than assumed, the drain route's `maxDuration` needs adjusting downward; low risk since the recommended batch size keeps the route far under any plausible ceiling |
| A2 | The project's Vercel-assigned Node.js runtime version is ≥20 (needed for `p-limit@7.3.1`) | Standard Stack | If actually pinned lower, `p-limit@7.3.1` import could fail at build/runtime; mitigated by recommending an explicit `engines` field and, if verification shows Node <20, falling back to declaring `p-limit@^3.1.0` explicitly instead (still valid, just an older CJS-compatible line) |
| A3 | `isHomepageDisallowed`/`parseRobotsForRoot` in `lib/triage-fetch.ts` are exported (not module-private) and safe to import directly from a new module, or can be trivially extracted | Architecture Patterns §4 | If not exported, a short extraction into a shared `lib/robots-check.ts` is a small, low-risk refactor — not a blocker either way |
| A4 | Reverting a 503-rejected prospect's `scan_status` back to `'queued'` (rather than counting it as the one failed attempt) is the intended interpretation of D-08/D-04's interaction | Code Examples (drain cron skeleton) | If wrong, a capacity-rejected prospect could either loop forever getting requeued (if not also attempt-limited) or burn its one attempt on a transient capacity issue unrelated to the site itself — needs explicit confirmation during planning |

## Open Questions

1. **Does "Run batch" (D-07) need its own explicit write, or does it just trigger the first drain tick?**
   - What we know: D-07 says a bulk run is "started manually... and then drained by Vercel Cron in paced ticks" — mirroring Phase 3's Release button.
   - What's unclear: Release (Phase 3) is a one-shot mutation (`scan_released_at`) that's already the trigger the drain cron reads (`scan_released_at IS NOT NULL AND scan_status IS NULL`). It's possible "Run batch" needs no separate mechanism at all — every released-but-unscanned prospect is already eligible, and the cron drains continuously in the background regardless of a button click. If so, "Run batch" may be purely a UX affordance (a manual "drain now" trigger, or just informational) rather than a new state flag.
   - Recommendation: the planner should decide whether "Run batch" (a) triggers an immediate one-off drain invocation (calling the same logic as the cron route, on demand) or (b) writes some kind of "batch armed" flag the cron checks. Option (a) is simpler and avoids a new state dimension — recommended unless Joshua's intent from CONTEXT.md implies otherwise.

2. **Exact reserved-headroom numbers (`MAX_TOTAL_FULL_SCANS`, `RESERVED_FOR_PUBLIC`, `DISPATCH_CONCURRENCY`).**
   - What we know: D-08 requires bulk to be capped strictly below total capacity; CONCERNS.md flags that even today's single-Playwright-instance sequential scanning is fragile at volume; scale is 10-50/week.
   - What's unclear: no documented current real-world safe concurrency ceiling for the existing single Railway instance/Playwright browser (CONCERNS.md flags the risk but doesn't give a tested number).
   - Recommendation: start conservative (e.g., total cap 2-3 concurrent full scans, reserve 1 for public), tunable via the single constants block (mirroring `lib/triage-constants.ts`); treat as Claude's Discretion per CONTEXT.md and validate empirically per the Validation Architecture below.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Postgres (Supabase-managed) | Migration 017's `plpgsql` function | ✓ | Supabase-managed Postgres 15+ (implied by existing schema/RLS usage) | — |
| Vercel Cron | Drain route scheduling | ✓ | Already in use (`vercel.json`, 3 existing entries) | — |
| Railway (scanner-service) | Capacity gate + UA passthrough | ✓ | Already deployed | — |
| `p-limit` | Concurrency bounding | ✓ (transitively present at 3.1.0; needs explicit `dependencies` declaration at current 7.3.1) | 3.1.0 present / 7.3.1 latest | Declare `^3.1.0` explicitly instead of bumping, if Node <20 is confirmed on the deploy target |
| Node.js runtime version (exact, on Vercel) | `p-limit@7.3.1`'s `engines.node >=20` requirement | **Not directly verifiable from this repo** | unknown (no `.nvmrc`/`engines` field) | Confirm via Vercel project settings before merging; falls back to `p-limit@^3.1.0` if <20 |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** exact Node runtime version (falls back to older `p-limit` if needed, per above).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (already in root `package.json`) |
| Config file | none dedicated — see existing `lib/*.integration.test.ts` / `lib/*.test.ts` convention (e.g. `lib/triage-release.integration.test.ts`, `lib/triage-fetch.test.ts`) |
| Quick run command | `npx vitest run lib/<new-file>.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCAN-01 | Released prospects transition queued→scanning without exceeding a set concurrency | integration | `npx vitest run lib/scan-drain.integration.test.ts` | ❌ Wave 0 |
| SCAN-02 | `full-async` returns 503 (not 200-then-timeout) when `activeFullScans.size` is at the bulk ceiling | integration (scanner-service, against a stubbed/mocked Supabase, using supertest or direct handler invocation) | `npm --prefix scanner-service run test -- full-async-capacity` | ❌ Wave 0 — scanner-service currently has **no test files at all** (CONCERNS.md flags this); this phase should add the minimal test needed for its own new logic, not a full retrofit |
| SCAN-03 | A prospect's `scan_status` visibly moves through queued→scanning→done/failed and the admin API surfaces it | integration | `npx vitest run app/api/admin/shortlist/route.integration.test.ts` (or extend existing shortlist test) | ❌ Wave 0 (extend if a shortlist route test exists; none found for this route currently) |
| SCAN-04 | A failed prospect's `scan_attempts` stays at 1, never auto-retried, and is excluded from later claim batches | unit + integration | `npx vitest run lib/scan-claim.test.ts` | ❌ Wave 0 |
| SCAN-05 | robots.txt-disallowed prospects are skipped before any scanner-service call; bulk UA differs from public UA | unit (reuses `lib/triage-fetch.test.ts`'s style of fetch-stubbing) | `npx vitest run lib/bulk-scan-dispatch.test.ts` | ❌ Wave 0 |
| SCAN-06 | Public scanner's success rate holds during a bulk run | **manual-only + log-based** (see below — this is not unit-testable) | N/A — observed via logs/manual monitoring during a real or staged bulk run | — |
| SCAN-07 | A `done` prospect's report renders at `/report/[id]` identically to a public-scanner report | manual (smoke) — open the URL, compare against an existing public report | N/A | — |
| CMP-17 | The design-analysis prompt includes the no-profiling instruction | unit (string-contains assertion on the prompt template, if `ai.ts`'s prompt is exported/testable) or manual code-review checklist item | `npx vitest run scanner-service/src/ai.prompt.test.ts` (if feasible) or manual verification | ❌ Wave 0 |

### SCAN-06 — concrete before/during measurement (this is the load-bearing, non-obvious one)
SCAN-06 asks for a subjective-sounding claim ("holds its normal success rate") to be a pass condition, not a feeling. Concrete approach:
1. **Baseline:** before running any bulk batch, compute the public scanner's rolling success rate from `scans` table history (e.g., `count(status='completed') / count(*)` over the trailing 7 or 14 days, filtered to `prospect_id IS NULL` — i.e., public-scanner-originated scans only, using the existing `prospect_id` nullable FK from migration 013 as the discriminator).
2. **During/after:** re-run the identical query filtered to the same window immediately after a bulk batch completes, still restricted to `prospect_id IS NULL` rows only (so bulk scan failures never contaminate the metric being watched — the metric IS the public scanner's own rate, not blended).
3. **Pass condition:** the post-batch rate is not meaningfully lower than the pre-batch baseline (define a tolerance, e.g., within 5 percentage points, as a Claude's-Discretion tunable — this project's own scale is small enough that a hard threshold plus manual eyeballing by Joshua is proportionate; do not over-engineer a statistical significance test at 10-50/week volume).
4. **Implementation:** this can be a small script (`scripts/check-public-scanner-health.ts`, run manually or as a follow-up cron check) rather than a unit test — it's inherently a live-system observation, not a pure-function test. Log the before/after numbers so Joshua can eyeball them per D-07's human-in-the-loop philosophy.

### Wave 0 Gaps
- [ ] `lib/scan-claim.test.ts` — covers SCAN-04 (attempt-counter, no re-claim of already-claimed rows)
- [ ] `lib/scan-drain.integration.test.ts` — covers SCAN-01 (concurrency bound, claim-batch correctness under simulated overlap)
- [ ] `lib/bulk-scan-dispatch.test.ts` — covers SCAN-05 (robots.txt skip, correct UA used)
- [ ] scanner-service test harness for the new capacity-check branch (SCAN-02) — scanner-service has **zero** existing test files (CONCERNS.md-documented gap); this phase should add the minimal test for its own new logic only, not retrofit the whole service
- [ ] `scripts/check-public-scanner-health.ts` (or equivalent) — the SCAN-06 before/during measurement script; does not exist today

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (admin routes only) | Existing `x-admin-secret` header check (`app/api/admin/*`), reused verbatim for the new `run-batch` route — no new/weaker auth path |
| V3 Session Management | no | No session concept in this admin surface (shared-secret pattern, already a documented weakness in CONCERNS.md, out of scope for this phase to fix) |
| V4 Access Control | yes | Cron route uses `Authorization: Bearer ${CRON_SECRET}` (existing pattern, `app/api/cron/*`); scanner-service `full-async` uses existing `Bearer ${SCANNER_API_KEY}` check — the new `source`/`userAgent` fields in the request body are not themselves an auth mechanism and must not be trusted for anything beyond routing/labeling |
| V5 Input Validation | yes | The claim function's `batch_size` parameter and any request-body fields (`userAgent`, `source`) must be validated/bounded server-side before use — e.g. `batch_size` should be clamped to a sane max in the route handler before the `.rpc()` call, not trusted from any external input (it's cron-internal today, but validate defensively since the route is reachable at its URL) |
| V6 Cryptography | no new surface | Report UUIDs (D-12) reuse Postgres's existing `gen_random_uuid()` default (already used for `prospects.id`/`scans.id`) — cryptographically strong, non-sequential, already the project's standard |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSRF via a malicious/redirecting `website_url` fed into the robots.txt pre-flight fetch or the Playwright crawl | Tampering / Elevation of Privilege | This project already has `lib/url-validation.server.ts` (`validateUrlSafe()`) for exactly this — confirm the bulk-scan dispatch path runs the prospect's `website_url` through the same SSRF validation Phase 1's import pipeline already applies before triage/scan, rather than assuming a URL stored in `prospects` is automatically safe to fetch again at scan time |
| Cron/RPC route hit directly (not via Vercel's scheduler) with a guessed batch size | Denial of Service | `CRON_SECRET` bearer check (existing pattern) gates the route; additionally clamp `batch_size` server-side regardless of what's requested |
| Un-auth'd `/report/[id]` enumeration (D-12's accepted risk) | Information Disclosure | Already an accepted, deliberate tradeoff (D-12) — UUID unguessability is the sole control; not a new risk introduced by this phase, just inherited from the existing public-scanner report route |
| Bulk-scan capacity-refusal response leaking internal state (e.g., exact `activeFullScans.size` in the 503 body) | Information Disclosure (minor) | Keep the 503 response generic (`{error: "At capacity", retryAfterSeconds}`), don't echo internal counts |

## Sources

### Primary (HIGH confidence — verified directly against this repository)
- `scanner-service/src/index.ts` (lines 56, 204-420, 747-761) — `activeFullScans` map, `full-async` handler, no existing capacity check
- `scanner-service/src/discovery.ts` (line 24), `scanner-service/src/scanner.ts` (line 226) — hardcoded public-scanner UA, no per-request override today
- `scanner-service/src/ai.ts` (lines 821-900) — `generateDesignAnalysis()`, the shared design-analysis prompt with no current no-profiling instruction
- `lib/scanner-client.ts`, `lib/triage-fetch.ts`, `lib/triage-constants.ts`, `lib/triage-release.ts`, `lib/triage-candidates.ts` — existing patterns this phase extends
- `supabase/migrations/010_create_prospects.sql`, `013_add_prospect_id_to_scans.sql`, `016_add_scan_release_marker.sql` — existing schema, confirming `prospects.latest_scan_id` already exists and is unused, and confirming zero existing RPC/plpgsql functions in this project
- `package.json`, `package-lock.json`, `node_modules/p-limit/package.json` — confirmed `p-limit` 3.1.0 present as a transitive `dev` dependency only, not declared

### Secondary (MEDIUM confidence — cross-referenced against official docs)
- [Vercel Cron Jobs — Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — overlapping-invocation and best-effort delivery guarantees
- [Vercel Functions — Configuring Maximum Duration](https://vercel.com/docs/functions/configuring-functions/duration) — 800s ceiling on Pro/Enterprise with Fluid Compute
- `npm view p-limit version` / `npm view p-limit engines` / `npm view p-limit@latest type` — confirmed 7.3.1, `engines.node >=20`, ESM-only (`"type": "module"`)
- Context7 `/sindresorhus/p-limit` docs — basic usage patterns (`pLimit(n)`, `limitFunction`)
- `.planning/research/STACK.md` (this project's own 2026-07-17 research) — independently recommended `p-limit@7.3.0` fresh install and flagged the same SKIP LOCKED / PostgREST limitation this research confirms
- `.planning/research/PITFALLS.md` — Pitfall 2 (WAF fingerprinting), already fully researched with HIGH-confidence primary sources cited there

### Tertiary (LOW/MEDIUM confidence — general web search, cross-referenced but not single-authority)
- WebSearch: "Postgres SELECT FOR UPDATE SKIP LOCKED job queue pattern Supabase RPC function" — confirms PostgREST cannot express `FOR UPDATE`/`SKIP LOCKED` directly and RPC is the standard workaround; consistent across multiple independent sources (SupaExplorer, Netdata Academy, general PostgreSQL job-queue literature) but no single Supabase-official page was the primary source for this specific claim in this search pass

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified directly via `npm view`; no new packages beyond a version/declaration fix to `p-limit`
- Architecture: HIGH for the "how" findings (all verified against this repo's actual code); MEDIUM for exact reserved-headroom numbers (no empirically-tested concurrency ceiling exists yet for the Railway instance)
- Pitfalls: HIGH for the codebase-specific ones (verified against code); MEDIUM for the Vercel Cron reliability claims (official docs, but not independently load-tested against this project's specific deployment)

**Research date:** 2026-07-21
**Valid until:** 30 days (stable stack; re-verify `p-limit` version and Vercel Cron limits if planning is delayed past mid-August 2026)
