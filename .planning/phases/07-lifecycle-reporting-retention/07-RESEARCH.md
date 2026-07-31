# Phase 7: Lifecycle, Reporting & Retention - Research

**Researched:** 2026-07-31
**Domain:** Derived-state modeling, admin reporting aggregation, and a scheduled data-retention job on Vercel Hobby + Supabase Postgres
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Locked by ROADMAP / PROJECT / prior phases (do not re-litigate):**
- **D-7-R1:** Reply rate and booked-call figures read empty until Phase 8. By design. Phase 7
  builds the state machine, the transitions that already have events, and the counters. Phase 8
  calls the hooks.
- **D-7-R2:** TRK-01/02 must not overwrite `lifecycle_state = 'rejected'`. Carried forward from
  Phase 6 (STATE.md note, D-6-15). D-7-01 makes this structurally impossible rather than a rule
  someone has to follow.
- **D-7-R3:** CMP-13's 12-month window is a placeholder pending the LIA, not a legal fact. It is
  config (CMP-14), so counsel's answer changes a value, not code.
- **D-7-R4:** Scale is 10 to 50 prospects per week. Solutions sized for thousands are rejected on
  sight (PROJECT.md Constraints).
- **D-7-R5:** Nothing in this phase may put the existing public scanner's email or scanning at
  risk (PROJECT.md blast radius). D-7-09 and D-7-16 exist specifically to hold this line.

**Lifecycle state machine (TRK-01, TRK-02):**
- **D-7-01:** Lifecycle state is derived, never written. A pure `deriveLifecycleState()` reads
  the markers that already carry the truth: `prospects.lifecycle_state` (terminals only),
  `triage_checked_at`, `scan_released_at`, `scan_status`, `contact_email`, `booked_at`, and the
  owning `outreach_messages.status`. No migration for lifecycle, no backfill of the ~800 rows
  sitting at `'new'`, and no write added to any Phase 1 through 6 code path.
- **D-7-02:** The derivation returns the fine-grained state; the funnel groups it. Fine: `new`,
  `no_website`, `triaged`, `qualified`, `scan_queued`, `scanned`, `drafted`, `approved`,
  `contacted`, `replied`, `booked`, `rejected`. A grouping maps it to the five names TRK-01 uses.
- **D-7-03:** It lives in TypeScript, not SQL. `lib/lifecycle.ts`, a pure predicate applied at
  read time, the same shape as `isReleasable` (Phase 4.1) and `lib/triage-eligibility.ts`.
- **D-7-04:** Precedence — stored terminals win, then furthest stage reached. The stored column
  is read first and only for its terminal values (`rejected`, `no_website`); otherwise the
  derivation returns the furthest marker stage.
- **D-7-05:** The derivation does not join suppressions. Suppression is a separate axis. The
  `'suppressed'` enum value stays unused, as it is today.

**Booking attribution (TRK-04):**
- **D-7-06:** Match email exact, then fall back to domain, screened through
  `isAggregatorDomain()`. No change to the adashi.io site or the Fillout form config.
- **D-7-07:** Record `prospects.booked_at` and `prospects.booked_match_method`. One additive
  migration, same shape as migration 004 did for `leads`. Reversibility: costly.
- **D-7-08:** Attribute only after contact, and only once — requires an `outreach_messages` row
  with status `'sent'`, and `.is("booked_at", null)` guard.
- **D-7-09:** Leads first, prospects after, in a try/catch. A broken attribution query can never
  stop a lead being marked booked or make Fillout retry.

**Reporting (TRK-03, TRK-05):**
- **D-7-10:** A "run" is a calendar day, derived from timestamps. Group `prospects.created_at`,
  `triage_checked_at`, `scan_released_at`, `scans.created_at`, `outreach_messages.sent_at` by day.
  No `runs` table, no `run_id`.
- **D-7-11:** The numbers live on a 5th admin tab, following D-6-01's precedent.
- **D-7-12:** Default view is the current funnel plus a 30-day per-day table.
- **D-7-13:** Figures that depend on a Phase 8 signal render an explicit "not yet sending" state,
  not 0%.
- **D-7-14:** The fine-grained state shows as a column on the existing Shortlist tab.

**Retention (CMP-13, CMP-14, CMP-15):**
- **D-7-15:** The clock is the most recent of contact, scan, or import (coalesce down: last sent
  message, then last scan, then `created_at`). Known tradeoff recorded deliberately, not acted on.
- **D-7-16:** Scope is prospect-owned rows only — `prospects`, their `outreach_messages`, and
  `scans WHERE prospect_id IS NOT NULL`. Public-scanner scans and `leads` are explicitly out of
  scope. Reversibility: one-way.
- **D-7-17:** Anonymise is the default; delete is the alternative; both by config. Clear `name`,
  `domain`, `website_url`, `contact_email` and the draft body; keep the row, timestamps, scores,
  lifecycle markers. `RETENTION_MODE` env var through `lib/retention-constants.ts`.
- **D-7-18:** `RETENTION_MODE` carries a third value: dry run. Reports which rows it would have
  touched, changes nothing.
- **D-7-19:** CMP-15 is enforced structurally and by a test, not by a comment. Explicit allowlist
  of tables the job may touch; `suppressions` is absent, backed by an integration test.
- **D-7-20:** A dedicated monthly cron route, `/api/cron/retention`. Not folded into an existing
  cron. **Open for research (resolved in this document, see Priority Open Question above):**
  whether a 5th cron and a monthly schedule string are permitted on Vercel Hobby.

### Claude's Discretion
- How the aggregate counts are computed given D-7-03 (pull rows and count in TypeScript vs
  per-stage SQL counts). At ~800 rows either is fine; follow whatever the existing
  `app/api/admin/*` routes already do.
- The exact visual treatment of the funnel on the new tab (resolved by 07-UI-SPEC.md).
- Naming of the 5th tab and of the new module files.
- The precise field list anonymised by D-7-17, beyond the identifiers named there.

### Deferred Ideas (OUT OF SCOPE)
- A shorter retention window for never-contacted prospects. Revisit when counsel returns the LIA.
- A `prospect_events` append-only log (considered and rejected for D-7-07).
- Token-carrying report links for exact booking attribution (considered and rejected for D-7-06).
- Dutch report locale — pre-existing code this phase does not touch.
- Prompt-injection gate at volume (T-06-PI) — belongs in Phase 8's threat model.
- Scan throughput investigation — not measured, not urgent.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRK-01 | Every prospect carries a lifecycle state (new, qualified, contacted, replied, booked) | Pattern 1 (`deriveLifecycleState()` ladder + `FUNNEL_GROUPS` mapping); Architectural Responsibility Map |
| TRK-02 | Lifecycle state advances as real events happen rather than by manual bookkeeping where avoidable | Pattern 1 — every branch reads an existing marker column, none is written by this phase (Anti-Patterns) |
| TRK-03 | Joshua can see reply rate across contacted prospects | Common Pitfall #2 (no data source exists yet — genuine gap, not just a gated zero); D-7-13 gate in Code Examples' `ReportingPayload` shape |
| TRK-04 | Joshua can see booked calls attributable to outreach, reusing the existing Fillout `booked_at` signal | Pattern 2 (webhook extension); confirms the webhook writes to `leads` not `prospects` today, requiring the new attribution block |
| TRK-05 | Joshua can see how many prospects were imported, triaged, scanned, and contacted per run | Code Examples' `ReportingPayload`; Common Pitfall #6 (timezone/day-boundary gap); confirmed all four timestamps exist and are queryable |
| CMP-13 | A scheduled retention job expires prospect, scan, and outreach data | Priority Open Question (Vercel Hobby cron feasibility, resolved); System Architecture Diagram retention block |
| CMP-14 | Retention expiry can delete or anonymise by config, not hardcoded | Code Examples (`lib/retention-constants.ts`); Common Pitfall #1 (delete-mode FK ordering) |
| CMP-15 | Suppression records are exempt from retention deletion and retained indefinitely, flagged explicitly in code | Code Examples (`RETENTION_TABLE_ALLOWLIST`); Validation Architecture (mandatory suppression-survives test); Security Domain threat table |
</phase_requirements>

## Summary

Phase 7 is three small, independent pieces of read-side plumbing bolted onto an already-complete
write-side pipeline (Phases 1–6): a pure derivation function that reads seven existing marker
columns and returns one of 12 fine-grained lifecycle states, two new admin-surface reads (a
Reporting tab and a Shortlist column) that consume that derivation, and a monthly cron that
anonymises or deletes prospect-owned rows past a config-driven age. No new tables beyond one
additive two-column migration (`booked_at`, `booked_match_method`), no new npm dependencies, and
no change to any Phase 1–6 write path. The single mechanical risk that could reshape the plan —
whether Vercel Hobby permits a 5th cron on a monthly schedule — is resolved below: it does, with
room to spare (Hobby now allows 100 crons/project; the only Hobby restriction is that a schedule
may not fire **more** than once a day, which a monthly expression never does).

The one place this phase carries real, non-obvious risk is the retention job's delete-mode path:
two foreign keys between `prospects` and `scans` (`scans.prospect_id` and
`prospects.latest_scan_id`) both lack `ON DELETE` clauses, so naive deletion in the wrong order
throws a Postgres FK violation. Anonymise mode (the config default per D-7-17) never touches
row existence and is unaffected; delete mode needs a specific three-step order documented below.
Separately, `TRK-03`'s reply-rate figure has no data source anywhere in this codebase yet — not
"reads zero because gated," but literally no column, table, or webhook produces a reply signal
until Phase 8 builds one. That is by design (D-7-R1) and the fine-state vocabulary already
reserves `replied` for it, but the derivation function built in this phase can never return it.

**Primary recommendation:** Build `lib/lifecycle.ts` as a single pure function applying a
furthest-marker-reached ladder (terminal check first, then six ordered marker checks, `new` as
the floor); reuse it from both the new Reporting API route and the Shortlist column; keep the
retention job's delete path to the exact FK-safe three-statement order in Common Pitfalls; and
schedule `/api/cron/retention` on Vercel Hobby with a genuine monthly cron expression — no
self-gating, no `pg_cron`, no manual-script fallback needed.

## Priority Open Question — Resolved

**1. How many cron jobs can a Hobby project define? Does a 5th exceed it?**
No. As of a Vercel platform change effective **2026-01-20**, per-project cron limits were raised
to **100 cron jobs on every plan tier**, including Hobby, and the prior per-team cap was removed
entirely `[VERIFIED: vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan]`.
`vercel.json` in this repo currently defines 4 crons (`keepalive`, `follow-up`,
`send-pending-reports`, `drain-scan-queue`); adding a 5th (`retention`) brings the project to 5 of
100 — nowhere near the ceiling.

**2. Does Hobby accept a monthly expression like `0 3 1 * *`, or coerce it to daily?**
Accepted, unmodified. The official Vercel docs (`docs/cron-jobs/usage-and-pricing`, last updated
2026-06-16) state the Hobby restriction precisely: *"Hobby accounts are limited to cron jobs that
run once per day. Cron expressions that would run more frequently will fail during deployment."*
`[CITED: vercel.com/docs/cron-jobs/usage-and-pricing]` The restriction is a ceiling on frequency
(nothing finer-grained than daily), not a floor — it does not force every cron to run daily, and
it does not reject expressions that fire **less** often than daily. A monthly expression like
`0 3 1 * *` (once per calendar month) never violates "no more than once per day," so it deploys
as literally specified: once a month, not coerced to a daily tick. This directly overturns this
project's own prior operational finding ("Vercel Hobby forces daily crons") — that finding is
correct only for `drain-scan-queue`, which genuinely needs `0 7 * * *` because bulk-scan draining
is a daily-cadence operation; it was never a platform-wide floor. Two secondary Hobby caveats
apply regardless of frequency and should be documented in the route's own comment: (a) timing
precision is "per-hour, ±59 min" on Hobby — a `0 3 1 * *` cron may fire anywhere in the 03:00–03:59
window, not at exactly 03:00; and (b) cron delivery is best-effort and can duplicate or skip an
invocation, so the retention job must already be idempotent (a delete/anonymise pass is naturally
idempotent — re-running it against already-anonymised rows is a no-op) `[CITED:
vercel.com/docs/cron-jobs/manage-cron-jobs]`.

**3. Fallback, if needed.** Not needed. D-7-20's dedicated monthly
`/api/cron/retention` entry in `vercel.json` ships as originally specified — no self-gating daily
cron, no `pg_cron`, no `scripts/*.ts` manual-invocation fallback. Recommendation: proceed with the
locked design exactly as written in CONTEXT.md.

**Correction to prior session finding:** a web search surfaced a stale third-party article
(`crontap.com`, undated) claiming "Hobby users have at most 2 cron jobs" — this contradicts the
current official docs above and should be discarded; it likely reflects Vercel's pricing terms
from before the 2026-01-20 change (previously 20 crons/project platform-wide) or an even older
tier. Treat `vercel.com/docs/*` as authoritative over any crontap/runhooks/cronjobpro blog post.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Lifecycle state derivation | API / Backend (`lib/lifecycle.ts`, pure function) | — | Read-time computation over existing columns; no DB view, no client-side logic — same tier as `isReleasable`/`lib/triage-eligibility.ts` |
| Funnel + per-day aggregation (TRK-03/05) | API / Backend (`app/api/admin/reporting/route.ts`) | Database (source rows) | Aggregation happens in the Next.js API route reading Supabase rows, matching the existing `app/api/admin/stats` pattern — not a SQL view, not client-side reduction of raw rows |
| Reporting tab UI (funnel cards, per-day table) | Frontend Server / Client (`app/admin/page.tsx`) | — | Presentation only; consumes the aggregation route's JSON, no computation of its own beyond the "not yet sending" gate check |
| Shortlist `Stage` column | Frontend Client (`components/admin/shortlist-table.tsx`) | API / Backend (derivation feeds the payload) | Column renders a pill from a value the API already derived server-side and included in the shortlist payload — the client never re-derives lifecycle state |
| Booking attribution (TRK-04) | API / Backend (`app/api/webhooks/fillout/route.ts`) | Database (`prospects.booked_at`) | Webhook receiver extends an existing server-side handler; attribution write is a guarded UPDATE, no new service |
| Retention job (CMP-13/14/15) | API / Backend (`app/api/cron/retention/route.ts`) | Database (DELETE/UPDATE statements) | Headless cron route triggered by Vercel's scheduler; all logic (scope, mode, allowlist) lives in the route + `lib/retention-constants.ts`, not in SQL functions (the codebase's existing `delete_expired_scans()`/`delete_expired_leads()` SQL functions are dead code and must not be reused — see Common Pitfalls) |

## Standard Stack

No new dependency is introduced by this phase. Every capability is built on what is already
installed and already used by prior phases:

| Library | Version (installed) | Purpose in this phase | Why no alternative was considered |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.99.3 `[VERIFIED: package.json]` | All reads/writes: derivation input rows, aggregation queries, retention DELETE/UPDATE | Already the only DB client in the codebase |
| `tldts` | 7.4.9 `[VERIFIED: package.json]` | `normalizeDomain()` reuse for TRK-04's domain-fallback booking match | Already used by `lib/domain-normalize.ts`; D-7-06 explicitly reuses it |
| Next.js App Router route handlers | 14.2.35 `[VERIFIED: package.json]` | `/api/cron/retention`, `/api/admin/reporting` | Matches every existing `app/api/*` route in the repo |
| Vercel Cron | platform feature, no package | Monthly retention schedule | Matches `vercel.json`'s existing 4 crons |

**Installation:** none required. `npm install` is a no-op for this phase.

## Package Legitimacy Audit

**Not applicable.** This phase installs zero new npm packages, per the Standard Stack table
above — every library it touches is already a direct dependency used by prior phases. No
`gsd-tools query package-legitimacy check` run was needed.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ EXISTING WRITE PATHS (Phase 1-6, untouched by Phase 7)              │
│  import → triage → release → scan → contact-extract → draft/approve │
│  writes: created_at, triage_checked_at, scan_released_at,           │
│          scan_status, contact_email, outreach_messages.status       │
└───────────────────────────┬───────────────────────────────────────┘
                            │ (read-only)
                            ▼
                 ┌─────────────────────┐
                 │  lib/lifecycle.ts   │  pure function, no DB calls
                 │ deriveLifecycleState│  input: one prospect row + its
                 │  (furthest-marker   │  latest outreach_messages row
                 │   ladder, D-7-04)   │
                 └──────┬───────┬──────┘
                        │       │
        ┌───────────────┘       └────────────────┐
        ▼                                         ▼
┌──────────────────────┐              ┌────────────────────────────┐
│ GET /api/admin/       │              │ GET /api/admin/shortlist   │
│     reporting          │              │  (existing route, extended)│
│ - funnel counts        │              │ - adds `stage` field per   │
│   (5-group, D-7-02)    │              │   row via same derivation  │
│ - 30-day per-day table │              └──────────────┬─────────────┘
│   (TRK-05)             │                             │
│ - reply-rate / booked  │                             ▼
│   gated by D-7-13       │              components/admin/
└──────────┬─────────────┘              shortlist-table.tsx
           ▼                             (new `Stage` pill column)
app/admin/page.tsx
  5th "Reporting" tab
  (funnel cards + table, D-7-11/12)

┌─────────────────────────────────────────────────────────────────────┐
│ BOOKING ATTRIBUTION (TRK-04) — extension of an existing webhook      │
│  Fillout POST → app/api/webhooks/fillout/route.ts                    │
│    1. update leads (existing, untouched)                             │
│    2. try { attribute to prospects } catch { log, still return 200 } │
│       - email-exact match on prospects.contact_email                 │
│       - else domain match via normalizeDomain()+isAggregatorDomain() │
│       - only if prospect has an outreach_messages row status='sent'  │
│       - .is("booked_at", null) first-write-wins guard                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ RETENTION (CMP-13/14/15) — headless, no UI                           │
│  Vercel Cron (monthly) → GET /api/cron/retention                     │
│    1. compute cutoff = now - RETENTION_MONTHS (lib/retention-        │
│       constants.ts, RETENTION_MODE = anonymize | delete | dry-run)   │
│    2. select expiring prospects: clock = greatest(last sent_at,      │
│       last scan.created_at, prospects.created_at) < cutoff           │
│    3. scope = prospects, outreach_messages (via prospect_id),        │
│       scans WHERE prospect_id IS NOT NULL — suppressions NEVER       │
│       in the allowlist (D-7-19, enforced + tested, not commented)    │
│    4. anonymize: UPDATE columns in place (no row deletion)           │
│       delete: FK-safe 3-step order (see Common Pitfalls)             │
│       dry-run: SELECT only, return counts, write nothing             │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
lib/
├── lifecycle.ts                # NEW — deriveLifecycleState(), FUNNEL_GROUPS mapping (D-7-01/02/03)
├── retention-constants.ts       # NEW — RETENTION_MODE, RETENTION_MONTHS, RETENTION_ALLOWLIST (D-7-17/19)
├── retention.ts                 # NEW — the job's query + mode-branch logic, importable for its own test
├── reporting-aggregates.ts      # NEW — per-day imported/triaged/scanned/contacted counts (TRK-05)
app/api/
├── admin/reporting/route.ts     # NEW — GET, x-admin-secret auth, funnel + per-day payload
├── cron/retention/route.ts      # NEW — GET, CRON_SECRET Bearer auth, calls lib/retention.ts
├── webhooks/fillout/route.ts    # EXTENDED — D-7-06/08/09 attribution block, after existing leads update
components/admin/
├── shortlist-table.tsx          # EXTENDED — new `Stage` column between Status and Released (D-7-14)
supabase/migrations/
├── 019_add_booked_at_to_prospects.sql  # NEW — booked_at, booked_match_method (D-7-07)
```

### Pattern 1: Furthest-marker-reached derivation (D-7-01/02/03/04)

**What:** A pure function that checks markers from most-advanced to least-advanced and returns
the first match; terminal stored values short-circuit before any marker check.

**When to use:** Any time a "current stage" concept can be recomputed from columns that are
already written by their owning phase, instead of adding a redundant status column that a bulk
update could accidentally clobber (this is exactly the D-6-15/`'rejected'` bug this phase is
designed to make structurally impossible).

**Example** (derivation ladder — precedence resolved from CONTEXT.md's marker list, the ROADMAP's
"new, qualified from triage, booked" event language, and the schema read above):

```typescript
// lib/lifecycle.ts — Source: derived from CONTEXT.md D-7-01/02/03/04 and the
// schema in supabase/migrations/010,012,013,016,017,004(019).
export type FineLifecycleState =
  | "new" | "no_website" | "triaged" | "qualified" | "scan_queued" | "scanned"
  | "drafted" | "approved" | "contacted" | "replied" | "booked" | "rejected";

export interface LifecycleInputs {
  lifecycle_state: string;        // stored column — only 'rejected'/'no_website' are read as terminals
  triage_checked_at: string | null;
  scan_released_at: string | null;
  scan_status: "queued" | "scanning" | "done" | "failed" | null;
  booked_at: string | null;
  // latest outreach_messages row for this prospect, if any (pick by
  // created_at desc — no DB uniqueness constraint enforces one-to-one,
  // see Common Pitfalls)
  outreachStatus: "draft" | "edited" | "approved" | "rejected" | "sent" | null;
}

export function deriveLifecycleState(row: LifecycleInputs): FineLifecycleState {
  // D-7-04: stored terminals win, read first, and ONLY for these two values.
  if (row.lifecycle_state === "rejected") return "rejected";
  if (row.lifecycle_state === "no_website") return "no_website";

  // Furthest marker reached, walked backwards from most-advanced.
  if (row.booked_at) return "booked";
  // 'replied' has no marker in this codebase yet (Phase 8 owns the reply
  // signal) — this branch is unreachable until Phase 8 adds one and
  // extends this function. Left out of the ladder deliberately, not
  // hidden: see Assumptions Log A3.
  if (row.outreachStatus === "sent") return "contacted";
  if (row.outreachStatus === "approved") return "approved";
  if (row.outreachStatus === "draft" || row.outreachStatus === "edited") return "drafted";
  if (row.scan_status === "done") return "scanned";
  if (row.scan_status === "queued" || row.scan_status === "scanning") return "scan_queued";
  // scan_status === 'failed' has no dedicated fine state in the 12-value
  // vocabulary — falls through to 'qualified' if released, else 'triaged'.
  // See Common Pitfalls / Assumptions Log A2.
  if (row.scan_released_at) return "qualified";
  if (row.triage_checked_at) return "triaged";
  return "new";
}

// D-7-02: fine → 5-group funnel mapping for TRK-01's summary view.
export const FUNNEL_GROUPS: Record<FineLifecycleState, string> = {
  new: "New", no_website: "New",
  triaged: "Qualified", qualified: "Qualified", scan_queued: "Qualified",
  scanned: "Qualified", drafted: "Qualified", approved: "Qualified",
  contacted: "Contacted",
  replied: "Replied",
  booked: "Booked",
  rejected: "Rejected",
};
```

### Pattern 2: Booking attribution as a guarded post-step (D-7-06/08/09)

**What:** Extend an existing webhook's happy path with a second, independently-failing step.

```typescript
// app/api/webhooks/fillout/route.ts — after the existing `leads` update
// (D-7-09: leads first, unconditionally; prospects after, in a try/catch
// that can never make this handler return non-200 or block the lead write).
try {
  let prospectId: string | null = null;
  let matchMethod: "email" | "domain" | null = null;

  const { data: byEmail } = await supabase
    .from("prospects")
    .select("id")
    .eq("contact_email", email)
    .maybeSingle();
  if (byEmail) {
    prospectId = byEmail.id;
    matchMethod = "email";
  } else {
    const domain = normalizeDomain(email.split("@")[1] ?? "");
    if (domain && !isAggregatorDomain(domain)) {
      const { data: byDomain } = await supabase
        .from("prospects")
        .select("id")
        .eq("domain", domain)
        .maybeSingle();
      if (byDomain) {
        prospectId = byDomain.id;
        matchMethod = "domain";
      }
    }
  }

  if (prospectId) {
    // D-7-08: attribute only after a real send, and only once.
    const { data: sentMsg } = await supabase
      .from("outreach_messages")
      .select("id")
      .eq("prospect_id", prospectId)
      .eq("status", "sent")
      .limit(1)
      .maybeSingle();
    if (sentMsg) {
      await supabase
        .from("prospects")
        .update({ booked_at: now, booked_match_method: matchMethod })
        .eq("id", prospectId)
        .is("booked_at", null);
    }
  }
} catch (attributionError) {
  console.error("[webhook/fillout] Prospect attribution failed (non-fatal):", attributionError);
}
```

### Anti-Patterns to Avoid

- **Writing `lifecycle_state` for any new stage.** The whole point of D-7-01 is that this phase
  adds zero writers to that column. If a plan proposes "update `lifecycle_state` to `'scanned'`
  when the scan completes," that plan has reintroduced the exact bug (D-6-15/D-7-R2) this phase
  exists to make impossible.
- **A SQL view or generated column for lifecycle state.** D-7-03 locks this to TypeScript,
  explicitly to keep it unit-testable without a database and to match `isReleasable`'s pattern.
- **Reusing `delete_expired_scans()`/`delete_expired_leads()`** (migration 001). These are dead
  SQL functions with no `prospect_id` filter at all — invoking them (or copying their pattern)
  would delete public-scanner scans and non-prospect leads, directly violating D-7-16/D-7-R5.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Registrable-domain extraction for the booking-email fallback | A second domain parser or regex | `normalizeDomain()` (`lib/domain-normalize.ts`) | Already public-suffix aware via `tldts`; a second implementation risks disagreeing with the one `prospect-upsert.ts` and `outreach-queue.ts` already trust |
| Excluding aggregator/free-mail-adjacent domains from the fallback match | A new denylist | `isAggregatorDomain()` / `AGGREGATOR_DOMAINS` | D-7-06 explicitly names this reuse; a second list drifts from the first |
| Cron auth | A bespoke signature scheme | The existing `CRON_SECRET` Bearer-header check, copied verbatim from `app/api/cron/drain-scan-queue/route.ts` | Every existing cron route uses this one pattern; a new scheme is an unrequested abstraction |
| Admin route auth | A new session/JWT layer | The existing `x-admin-secret` header check against `process.env.ADMIN_SECRET`, copied verbatim from `app/api/admin/outreach/route.ts` | Single-tenant tool, one operator — matches every other `app/api/admin/*` route exactly |

**Key insight:** every piece of "new" infrastructure this phase seems to need (auth, domain
matching, config pattern, pure-predicate module shape) already has exactly one precedent
elsewhere in this codebase. The work here is composition, not invention — the plan should cite
the file being copied from for every one of these, not describe the pattern in the abstract.

## Common Pitfalls

### Pitfall 1: Delete-mode retention hits a circular FK constraint

**What goes wrong:** `DELETE FROM prospects WHERE id IN (...)` fails with a foreign-key violation
if any `scans` row still has `prospect_id` pointing at it, and separately `DELETE FROM scans
WHERE prospect_id IN (...)` fails if any `prospects` row still has `latest_scan_id` pointing at
one of those scans.

**Why it happens:** Two FKs were added in migration 013 with no `ON DELETE` clause —
`scans.prospect_id REFERENCES prospects(id)` and `prospects.latest_scan_id_fkey REFERENCES
scans(id)` — both default to Postgres `NO ACTION`, and together they form a two-table reference
cycle `[VERIFIED: supabase/migrations/013_add_prospect_id_to_scans.sql]`. This is invisible if
you only look at one table's migration in isolation. (`outreach_messages.prospect_id`, by
contrast, is declared `ON DELETE CASCADE` in migration 012, so it needs no special handling.)

**How to avoid:** In delete mode, run exactly this order inside the retention job:
1. `UPDATE prospects SET latest_scan_id = NULL WHERE id IN (expiring_ids)` — clears the only
   inbound reference from the expiring prospects to their scans.
2. `DELETE FROM scans WHERE prospect_id IN (expiring_ids)` — now safe; no remaining `prospects`
   row references these scan ids (a prospect's `latest_scan_id` only ever points to its own scan).
3. `DELETE FROM prospects WHERE id IN (expiring_ids)` — cascades `outreach_messages` automatically.

**Warning signs:** A Postgres error containing `violates foreign key constraint
"prospects_latest_scan_id_fkey"` or `"scans_prospect_id_fkey"` during a delete-mode dry-run-to-live
flip. Catch this in the dry-run stage (D-7-18) before it ever reaches production data — the
dry-run's SELECT-only pass will not surface it, so the delete-mode code path needs its own test
independent of the dry-run smoke test.

### Pitfall 2: The reply-rate figure has no data source at all, not just a gated one

**What goes wrong:** A plan or reviewer assumes TRK-03 is "built but reads zero until Phase 8" in
the same sense the funnel counts are — i.e., that some column exists and just isn't populated yet.

**Why it happens:** Every other fine state in the 12-value vocabulary has a real marker column
backing it today. `replied` does not — there is no `replied_at`, no reply-detection webhook, no
`prospect_events` log (explicitly deferred, D-7-07's rejected alternative). The enum value exists
in the `lifecycle_state` check constraint (migration 010) purely as a placeholder for Phase 8.

**How to avoid:** Do not write a `replied` branch into `deriveLifecycleState()`'s ladder at all —
there is nothing to check. Document in the function's own comment that Phase 8 must add both the
marker and the branch when it ships the reply signal. The Reporting tab's reply-rate cell reads
the D-7-13 "not yet sending" gate for exactly this reason, and that gate must never flip to a real
percentage until Phase 8 actually adds a marker — a plan that computes `0 / 0` or `0%` instead of
using the explicit awaiting-copy state silently reintroduces the Phase 6 stale-health-flag bug
this decision is named against.

### Pitfall 3: `scan_status = 'failed'` has no dedicated fine state

**What goes wrong:** A prospect whose bulk scan failed (D-04: one attempt, no auto-retry) is
invisible in the funnel unless the derivation explicitly decides where it falls.

**Why it happens:** The 12-value vocabulary has `scan_queued` and `scanned` but no `scan_failed`.
D-7-01/02 do not resolve this explicitly.

**How to avoid:** Fall through to `qualified` (if `scan_released_at` is set, which it always will
be for anything that reached `scan_status`) rather than inventing a 13th state or silently
counting it as `scanned`. This keeps the row visible as "still needs attention" in the funnel
rather than falsely advanced. Flag this mapping for explicit confirmation at plan time — it is
recorded as Assumption A2 below, not a locked decision.

### Pitfall 4: `outreach_messages` has no DB uniqueness constraint per prospect

**What goes wrong:** The derivation (and the Shortlist column) join "the owning
`outreach_messages` row" as if it were guaranteed singular; if two rows ever exist for one
prospect (a data anomaly, a future bug), picking the wrong one silently misreports lifecycle
state.

**Why it happens:** Migration 012 declares no `UNIQUE` constraint on `outreach_messages
(prospect_id)`. Today this is enforced only in application code (`generateDraftForProspect` and
`draft-on-scan-complete.ts` both check-then-insert, `[VERIFIED:
lib/outreach-queue.ts:363-372, lib/draft-on-scan-complete.ts:107-116]`), not the database.

**How to avoid:** When the derivation (or its API caller) fetches the outreach row, explicitly
order by `created_at desc limit 1` rather than assuming `.single()`/`.maybeSingle()` will be safe
forever. Cheap insurance, not a new constraint — do not add a migration for this in Phase 7.

### Pitfall 5: Vercel Hobby cron timing imprecision plus 30-day/monthly windows

**What goes wrong:** A retention job scheduled for `0 3 1 * *` may fire any time in the 03:00–03:59
UTC window on Hobby, and could rarely be invoked twice or skipped for a given month (best-effort
delivery, per Vercel's own docs).

**Why it happens:** Documented Hobby platform behavior (see Priority Open Question §2).

**How to avoid:** Design the job to be naturally idempotent — a delete/anonymise pass against
already-processed rows is a no-op by construction (the clock expression re-evaluates against
`now()` each run, and an anonymised row's synthetic `null`/anonymised timestamp inputs will not
re-qualify). No lock or dedup logic is needed beyond that; do not add Redis-style distributed
locking for a once-a-month job at this data volume.

### Pitfall 6: "Calendar day" grouping needs an explicit timezone, and none is specified

**What goes wrong:** `prospects.created_at` etc. are stored as `timestamptz` (UTC internally).
Grouping "by day" without picking a timezone silently defaults to whatever the query engine's
session timezone happens to be, which can shift a late-evening Amsterdam event into the next
day's bucket (or the reverse, during CET/CEST transitions).

**Why it happens:** D-7-10 specifies grouping by calendar day but does not specify which
timezone's calendar. No existing code in this repo groups anything by day today (no precedent
found — see Assumptions Log A4).

**How to avoid:** Default to UTC calendar-day grouping (`date_trunc('day', ts at time zone
'UTC')` or, in TypeScript, `.toISOString().slice(0, 10)`) — simplest, deterministic, and matches
how every timestamp in this codebase is already stored and compared. This is flagged as an
assumption because a single-operator tool in Amsterdam might reasonably prefer local-day
grouping instead; the difference only matters for events near midnight, at 10–50 prospects/week
volume.

## Code Examples

### Retention job's mode branch (D-7-17/18)

```typescript
// lib/retention-constants.ts — Source: pattern matches lib/triage-constants.ts,
// lib/bulk-scan-constants.ts (constants module + env var, no config table/UI).
export type RetentionMode = "anonymize" | "delete" | "dry-run";

export const RETENTION_MODE: RetentionMode =
  (process.env.RETENTION_MODE as RetentionMode) || "dry-run"; // ship in dry-run first (D-7-18)

export const RETENTION_MONTHS = Number(process.env.RETENTION_MONTHS ?? 12); // CMP-13 placeholder pending LIA

// D-7-19: the explicit allowlist. suppressions is deliberately absent, and
// this array is the thing a test asserts against — not a comment alone.
export const RETENTION_TABLE_ALLOWLIST = ["prospects", "outreach_messages", "scans"] as const;
// Never add "suppressions" here. Suppression rows key on email independently
// of any prospect row and must survive every retention pass, permanently —
// deleting them recreates exactly the re-contact risk suppression exists to
// prevent (CMP-15). Enforced by an integration test that seeds a
// suppression older than the retention window, runs the job, and asserts
// the row survives (D-7-19) — this comment documents the rule, the test
// enforces it.
```

```typescript
// Retention scope query (D-7-16) — the discriminator that keeps this job
// off the public scanner's data. Same `WHERE prospect_id IS NOT NULL` shape
// already used by the reciprocal index in migration 013.
const { data: expiring } = await supabase
  .from("prospects")
  .select("id, created_at, latest_scan_id")
  .lt(
    "clock_expression_placeholder", // computed client-side per D-7-15, see below
    cutoffIso
  );

// D-7-15's clock: greatest(last outreach sent_at, last scan.created_at,
// prospects.created_at). Because this coalesces across two other tables,
// compute it in application code from three separate queries (or a single
// query with LEFT JOINs) rather than attempting a cross-table SQL GREATEST
// inline — at ~800 rows this is a non-issue performance-wise (D-7-03's
// same reasoning applies here).
```

### Reporting API funnel + per-day payload shape (D-7-11/12)

```typescript
// app/api/admin/reporting/route.ts — GET, matches the x-admin-secret pattern
// verbatim from app/api/admin/outreach/route.ts.
interface ReportingPayload {
  funnel: { new: number; qualified: number; contacted: number; replied: number; booked: number };
  sentGateOpen: boolean; // D-7-13/UI-SPEC: true once any outreach_messages row has ever reached 'sent'
  days: Array<{
    date: string; // YYYY-MM-DD, UTC calendar day (see Pitfall 6)
    imported: number;
    triaged: number;
    scanned: number;
    contacted: number;
    replyRate: number | null; // null while sentGateOpen === false — UI renders "— Not yet sending"
    booked: number | null;    // same gating
  }>; // exactly 30 rows, newest first (D-7-12)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vercel cron limits: 20/project, per-team caps | 100/project, no per-team cap | 2026-01-20 platform change | This phase's 5th cron is a non-issue; older blog posts citing "2 crons on Hobby" are stale and should not be trusted |
| This project's own prior finding: "Vercel Hobby forces daily crons" | Correct only for sub-daily frequency; less-frequent-than-daily (weekly, monthly) schedules are unaffected | N/A — the prior finding was an overgeneralization from one cron's own daily requirement | Directly resolves D-7-20's open research question in favor of the originally-locked monthly design |

**Deprecated/outdated:** the `delete_expired_scans()`/`delete_expired_leads()` SQL functions in
migration 001 are dead code (never invoked by any cron or route in this repo) and must not be
treated as a retention precedent — they predate `prospect_id` existing on `scans` entirely and
have no prospect-ownership filter.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Booking-email domain fallback extracts the domain via `email.split("@")[1]` then `normalizeDomain()`, mirroring the pattern already used for `prospects.domain` | Pattern 2 / Code Examples | Low — this is the only sane way to derive a domain from an email address; matches D-7-06's own wording |
| A2 | `scan_status = 'failed'` maps to the `qualified` fine state (falls back to "released but not advanced"), since the 12-value vocabulary has no `scan_failed` state | Common Pitfalls #3, Pattern 1 | Medium — if the planner or Joshua prefers `failed` to render as `scan_queued` instead (so it stays visually near "still in the scan pipeline"), the funnel/Shortlist grouping shifts by one bucket; either choice is cheap to change since it is one line in `deriveLifecycleState()` |
| A3 | `deriveLifecycleState()` should have no `replied` branch at all in Phase 7 (dead code otherwise), and Phase 8 is responsible for both adding the marker and extending this function | Pattern 1, Common Pitfalls #2 | Low — consistent with D-7-R1 and the phase's own "Phase 8 calls the hooks it defines" framing; the alternative (a stub branch that always returns false) adds no value and invites confusion about whether Phase 7 already wired something |
| A4 | "Calendar day" (D-7-10) means UTC calendar day, not Europe/Amsterdam local day | Common Pitfalls #6, Code Examples | Low-Medium — only affects events within ~1-2 hours of midnight; at 10-50 prospects/week this could misplace at most one or two rows into an adjacent day's bucket. Cheap to flip to local-day grouping later since it is one date-formatting expression, not a schema decision |
| A5 | The furthest-marker-reached precedence order (`booked > contacted > approved > drafted > scanned > scan_queued > qualified > triaged > new`) is the correct total ordering implied by D-7-02's listed sequence and D-7-04's "furthest stage reached" wording | Pattern 1 | Medium — this is the load-bearing design decision of the whole phase; CONTEXT.md names the markers but does not spell out the exact ladder. Recommend the planner treat this table as a proposal to confirm with Joshua at plan-review time, not a silently-adopted fact, since getting one rung wrong silently misreports every prospect's stage |

**If this table is empty:** N/A — see rows above. All five assumptions are cheap, single-line
changes if reconsidered; none requires a schema change or migration to reverse.

## Open Questions

1. **Exact precedence in the derivation ladder (A5 above).**
   - What we know: the marker columns, the terminal-first rule (D-7-04), and the five-group
     mapping (D-7-02).
   - What's unclear: CONTEXT.md does not spell out the exact fine-state ladder order as a table;
     this research proposes one, reasoned from the ROADMAP's event-language and the schema.
   - Recommendation: the planner should present the Pattern 1 ladder to Joshua as a one-screen
     confirmation before implementation, since it is the single highest-leverage decision in the
     phase and cheap to get right up front versus expensive to discover wrong after Shortlist rows
     are already showing incorrect stages.

2. **`scan_status = 'failed'` fine-state mapping (A2 above).**
   - What we know: no dedicated vocabulary value exists for it.
   - What's unclear: whether Joshua wants failed scans visually distinguishable from
     still-qualified-but-unscanned prospects.
   - Recommendation: default to `qualified` (Pattern 1) unless Joshua flags a preference during
     plan review; either choice is a one-line change.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Vercel Hobby cron scheduling (monthly expression) | D-7-20 `/api/cron/retention` | Yes `[CITED: vercel.com/docs/cron-jobs/usage-and-pricing]` | Hobby plan, 100 crons/project, ≥1-day interval floor | Not needed — monthly schedule deploys as specified |
| Supabase Postgres (existing) | All reads/writes in this phase | Yes | Already provisioned | — |
| `CRON_SECRET`, `ADMIN_SECRET` env vars | Cron/admin route auth | Yes (already set — used by every existing `app/api/cron/*` and `app/api/admin/*` route) | — | — |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** none — no external dependency this phase needs is
missing.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (`vitest.config.ts`, projects: `unit` + `integration`) |
| Config file | `vitest.config.ts` (repo root) |
| Quick run command | `npx vitest run --project unit` |
| Full suite command | `npx vitest run` (348/348 passing as of Phase 6 — integration project runs `fileParallelism: false` against the shared local Supabase; do not use `npm test` in parallel shells) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRK-01/TRK-02 | `deriveLifecycleState()` returns the correct fine state for every marker combination, including the terminal short-circuit for `rejected`/`no_website` | unit | `npx vitest run lib/lifecycle.test.ts` | ❌ Wave 0 |
| TRK-01/TRK-02 | A `lifecycle_state = 'rejected'` row is never overwritten by the funnel grouping or Shortlist column, even when other markers advance | unit | `npx vitest run lib/lifecycle.test.ts -t rejected` | ❌ Wave 0 (covered in the same file) |
| TRK-05 | Per-day aggregate counts match manually-seeded fixture rows across a UTC day boundary | integration | `npx vitest run lib/reporting-aggregates.integration.test.ts` | ❌ Wave 0 |
| TRK-04 | Fillout webhook attributes a booking by email-exact and by domain-fallback; a webhook DB failure in the attribution step still returns 200 and leaves `leads` updated | integration | `npx vitest run app/api/webhooks/fillout/route.integration.test.ts` | ❌ Wave 0 (extend if a fillout test file already exists — confirm at plan time) |
| CMP-13/CMP-14 | Dry-run mode reports the correct expiring-row count and writes nothing; anonymize mode clears exactly the named fields and preserves timestamps/scores; delete mode succeeds without FK violation given the 3-step order | integration | `npx vitest run lib/retention.integration.test.ts` | ❌ Wave 0 |
| CMP-15 | A suppression row older than the retention window survives a full retention job run, in every mode | integration | `npx vitest run lib/retention.integration.test.ts -t suppression` | ❌ Wave 0 (D-7-19 requires this exact test — non-negotiable per CONTEXT.md) |
| UI-SPEC E1/E2 "partial" backstop rows | The sent-gate boolean correctly renders the awaiting-copy treatment when closed and real numbers when open, for both the funnel cards and every per-day table cell | UI-state test (held-out, per UI-SPEC's explicit note) | `npx vitest run app/admin/reporting-gate.test.tsx` (or equivalent component test asserting on gate=false and gate=true render output) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --project unit`
- **Per wave merge:** `npx vitest run` (full suite, both projects)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `lib/lifecycle.test.ts` — covers TRK-01/TRK-02, the full precedence ladder, and the
      `rejected`/`no_website` terminal short-circuit
- [ ] `lib/reporting-aggregates.integration.test.ts` — covers TRK-05's per-day counts and the
      UTC-day-boundary edge case (Pitfall 6)
- [ ] `app/api/webhooks/fillout/route.integration.test.ts` (new or extended) — covers TRK-04's
      email/domain attribution and the D-7-09 fire-and-forget guarantee
- [ ] `lib/retention.integration.test.ts` — covers CMP-13/14/15, including the mandatory
      suppression-survives-the-job assertion (D-7-19) and the FK-safe delete-mode ordering
      (Pitfall 1) as a dedicated assertion, not merely "the job completed without throwing"
- [ ] A held-out UI-state test for the two `backstop` rows the UI-SPEC flags (gate closed vs.
      open, both the funnel cards and the per-day table cells) — the UI-SPEC is explicit that
      code inspection alone is insufficient evidence here; a regression that silently renders
      `0%` instead of the awaiting-copy state must be caught by an assertion on rendered output

**Note on the two `backstop` UI rows:** per the UI-SPEC's own reasoning, these fail silently —
a broken sent-gate produces a plausible `0%`, which looks like a valid answer. Do not accept
"the derivation function has a unit test" as sufficient coverage for these two rows; the
component/page-level render output must be asserted with the gate both open and closed.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No new auth mechanism — this phase reuses existing `CRON_SECRET`/`ADMIN_SECRET` shared-secret checks, unchanged in shape |
| V3 Session Management | No | Admin surface has no session concept beyond the existing `sessionStorage`-cached secret, unchanged |
| V4 Access Control | Yes | Every new route (`GET /api/admin/reporting`, `GET /api/cron/retention`) MUST perform the exact same authorization check as its sibling routes before any query runs — `x-admin-secret` for admin routes, `Authorization: Bearer ${CRON_SECRET}` for cron routes. No route in this phase may skip this because "it's read-only" |
| V5 Input Validation | Yes | `RETENTION_MODE`/`RETENTION_MONTHS` env values must be validated against the closed enum/number range at read time in `lib/retention-constants.ts`, not trusted as free-form strings passed into a query |
| V6 Cryptography | No | No new cryptographic operation is introduced |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Retention job scope creep deletes/anonymises non-prospect data (public scanner scans, `leads`) | Tampering / Elevation of Privilege (over-broad data access) | `scans.prospect_id IS NOT NULL` filter as the sole discriminator (D-7-16), asserted by an integration test seeding both a prospect-owned and a public scan and confirming only the former is touched |
| Suppression record deleted by a generic retention sweep, re-enabling contact to a business that opted out | Tampering (compliance-critical data loss) | Explicit table allowlist (`RETENTION_TABLE_ALLOWLIST`) that omits `suppressions`, backed by the D-7-19 integration test — a comment alone is not treated as a control here per this project's own security convention (06-SECURITY.md flags "attestation-only" mitigations as weak) |
| Booking-attribution domain fallback misattributes a booking to the wrong prospect via a shared free-mail or aggregator domain | Tampering (incorrect audit trail — `booked_match_method` exists so this stays auditable, not silent) | `isAggregatorDomain()` screen before the domain match (D-7-06); `booked_match_method` column makes every domain-inferred attribution visible and reversible rather than indistinguishable from a certain email match |
| Cron route invoked without the shared secret (unauthenticated retention trigger) | Spoofing / Tampering | `CRON_SECRET` Bearer check, identical to the three existing cron routes — reject with 401 before any query executes |
| Cron delivery duplicates an invocation (Vercel's own documented best-effort behavior) | Tampering (double-processing) | Idempotent design by construction — re-running the retention pass against already-anonymised/deleted rows selects zero additional rows; no additional locking needed at this data volume |

## Sources

### Primary (HIGH confidence)
- `vercel.com/docs/cron-jobs/usage-and-pricing` (last_updated 2026-06-16) — Hobby cron limits: 100/project, once-per-day minimum interval, per-hour scheduling precision
- `vercel.com/docs/cron-jobs/manage-cron-jobs` (last_updated 2026-06-02) — Hobby daily-frequency restriction wording, best-effort delivery, idempotency guidance
- `vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan` — the 2026-01-20 limit change from 20/project to 100/project
- This repo's own source: `vercel.json`, `supabase/migrations/{001,004,010,011,012,013,014,016,017}`, `lib/{outreach-queue,prospect-upsert,triage-eligibility,domain-normalize,triage-constants,bulk-scan-constants,scan-queue}.ts`, `app/api/{webhooks/fillout,cron/drain-scan-queue,admin/outreach,admin/shortlist}/route.ts`, `app/admin/page.tsx`, `vitest.config.ts`, `package.json`

### Secondary (MEDIUM confidence)
- None used as load-bearing claims — all cron-limit claims were cross-checked against official
  Vercel docs directly rather than relying on WebSearch summaries alone.

### Tertiary (LOW confidence, explicitly discarded)
- `crontap.com/blog/vercel-cron-hourly-limit-and-how-to-beat-it` and similar third-party blog
  posts claiming "Hobby is limited to 2 cron jobs" — contradicted by current official docs;
  flagged in State of the Art as stale/incorrect, not used as a basis for any recommendation.

## Metadata

**Confidence breakdown:**
- Vercel Hobby cron limits (Priority Open Question): HIGH — confirmed directly against two
  official, dated Vercel doc pages plus the platform changelog
- Lifecycle derivation ladder (Pattern 1 / A5): MEDIUM — the markers and terminal rule are
  locked by CONTEXT.md; the exact precedence ordering is this research's reasoned proposal, not
  a value copied from an authoritative source, and should be confirmed at plan review
- FK circular-dependency finding (Pitfall 1): HIGH — directly verified by reading the migration
  SQL; not inferred
- Retention scope / suppression exclusion: HIGH — directly locked by CONTEXT.md (D-7-16/19) and
  confirmed against the actual `scans.prospect_id` and `suppressions` schema

**Research date:** 2026-07-31
**Valid until:** 2026-08-30 (30 days — stable domain; re-check only if Vercel changes cron
pricing/limits again, which last happened without much notice)
