# Architecture Research

**Domain:** Outbound prospecting layer added to an existing two-deployable scan system
**Researched:** 2026-07-17
**Confidence:** HIGH (grounded directly in the existing codebase: `.planning/codebase/ARCHITECTURE.md`, `STRUCTURE.md`, `CONCERNS.md`) / MEDIUM on the one external fact (Overture GERS ID stability, confirmed via docs)

## Standard Architecture

### System Overview

Nothing here is a new deployable. Prospect Radar is new tables, new routes inside the
existing Next.js app, and small, targeted extensions to two existing scanner-service
files. The two-deployable shape from `ARCHITECTURE.md` is preserved exactly.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Next.js App (Vercel) — unchanged shape                │
│                                                                            │
│  EXISTING                              NEW                               │
│  ┌─────────────┐  ┌──────────┐         ┌───────────────┐  ┌────────────┐ │
│  │ /start       │  │ /admin   │         │ /admin/       │  │ importer   │ │
│  │ /scan/[id]   │  │ (leads)  │         │ prospects     │  │ (CLI/one-  │ │
│  │ /report/[id] │  │          │         │ (triage +     │  │ off script,│ │
│  └──────┬───────┘  └────┬─────┘         │ approval UI)  │  │ NOT a route)│ │
│         │               │               └───────┬───────┘  └─────┬──────┘ │
│  ┌──────▼───────────────▼──────────────────────▼────────────────▼──────┐ │
│  │ API Routes (`app/api/`)                                              │ │
│  │ EXISTING: /scan, /scan/[id]/status, /internal/scan-complete, /cron/* │ │
│  │ NEW:                                                                  │ │
│  │  /api/prospects/import        (invokes importer logic, or CLI-only) │ │
│  │  /api/prospects/[id]/triage   (stage-1 cheap check, no Playwright)  │ │
│  │  /api/prospects/[id]/draft    (Gemini cold-email draft)             │ │
│  │  /api/prospects/[id]/approve  /reject  /send                        │ │
│  │  /api/unsubscribe/[token]     (writes suppressions)                 │ │
│  │  /cron/prospect-scan-dispatch (drains scan queue, rate-limited)     │ │
│  └──────┬─────────────────────────────────────────────────────────────┘ │
│         │ ScannerClient.fullScanAsync() — REUSED, not rebuilt            │
└─────────┼──────────────────────────────────────────────────────────────┘
          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      Supabase Postgres — unchanged tables + new           │
│  EXISTING: scans, leads, email_events                                    │
│  NEW: prospects, outreach_messages, suppressions                         │
│  scans gets one nullable column: prospect_id                             │
└──────────────────────────────────────────────────────────────────────────┘
          ▲
          │ Bearer auth, same as today
          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│              Express Scanner Service (Railway) — unchanged shape          │
│  EXISTING: /api/scan/quick, /api/scan/full, /api/scan/full-async         │
│            scanner.ts, analyzer.ts, extractor.ts, scoring.ts, ai.ts      │
│            activeFullScans map (already tracks in-flight scans)          │
│  MODIFIED (small):                                                        │
│   - extractor.ts: pull a contact email while the page is already loaded  │
│   - index.ts: activeFullScans gains a capacity check → 429/backpressure  │
│  NOT MODIFIED: scanner.ts pipeline, ai.ts pipeline, Playwright singleton  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Lives in |
|-----------|----------------|----------|
| **Importer** | Pull Overture Places rows for a country/region/category filter, upsert into `prospects` keyed on GERS ID | One-off script (`scripts/import-prospects.ts`), run locally or via `railway run` / GH Action on demand — NOT a Vercel route (Overture reads are large GeoParquet scans, wrong shape for a 300s function) |
| **Triage worker (stage 1)** | Reachability, HTTPS, viewport meta, page weight, load time — plain `fetch()`, no Playwright, no Lighthouse, no AI | Next.js (`lib/prospect-triage.ts` + `app/api/cron/prospect-triage/route.ts`). Cheap enough (seconds per prospect) to fit Vercel's duration budget in small batches |
| **Scan queue dispatcher** | Claims a bounded batch of `qualified` prospects, calls the existing `full-async` scanner-service endpoint, never exceeds the service's concurrency ceiling | Next.js cron (`app/api/cron/prospect-scan-dispatch/route.ts`), reusing `lib/scanner-client.ts` — no new HTTP client |
| **Concurrency gate** | Reject/queue new full-scan requests once N are already in flight | Scanner-service (`scanner-service/src/index.ts`), extending the existing `activeFullScans` map — it already tracks exactly what's needed |
| **Email extractor** | Pull a contact email off the prospect's own site during the scan, prefer `info@` over a named person | Scanner-service (`scanner-service/src/extractor.ts`) — the page is already loaded there; don't fetch it twice |
| **Draft generator** | Cold email grounded in the completed scan's findings | Next.js (`app/api/prospects/[id]/draft/route.ts`), calling Gemini directly — no Playwright dependency, single AI call fits Vercel's default timeout |
| **Approval queue UI** | List drafts, edit/approve/reject, trigger send | Next.js admin surface (`app/admin/prospects/`), same pattern as `app/admin/lead/[id]/page.tsx` |
| **Suppression check** | Gate every send against the suppression table | Next.js (`lib/suppression.ts`), called from the send route and the unsubscribe route |

## Recommended Project Structure

```
app/
├── admin/
│   └── prospects/
│       ├── page.tsx              # triage list, ranked by score, bulk qualify
│       └── [id]/page.tsx         # single prospect: scan result, draft, approve/reject/send
├── api/
│   ├── prospects/
│   │   ├── import/route.ts       # thin wrapper if importer needs an HTTP trigger; optional
│   │   ├── [id]/triage/route.ts  # stage-1 check for one prospect
│   │   ├── [id]/draft/route.ts   # generate cold email draft
│   │   ├── [id]/approve/route.ts
│   │   ├── [id]/reject/route.ts
│   │   └── [id]/send/route.ts    # suppression check → Resend → outreach_messages + email_events
│   ├── unsubscribe/[token]/route.ts
│   └── cron/
│       ├── prospect-triage/route.ts        # batches stage-1 checks
│       └── prospect-scan-dispatch/route.ts # drains scan queue, respects concurrency
├── lib/
│   ├── prospect-triage.ts        # stage-1 scoring, cutoff constant
│   └── suppression.ts            # isSuppressed(email), addSuppression()
scripts/
└── import-prospects.ts           # Overture pull + upsert, run manually / via CLI
scanner-service/src/
├── extractor.ts                  # +extractContactEmail()
└── index.ts                      # +capacity check on activeFullScans before accepting full-async
supabase/migrations/
├── 0NN_create_prospects.sql
├── 0NN_create_outreach_messages.sql
├── 0NN_create_suppressions.sql
└── 0NN_add_prospect_id_to_scans.sql
```

### Structure Rationale

- **`app/admin/prospects/`, not a new top-level section**: mirrors the existing
  `app/admin/lead/[id]/` pattern exactly. Same auth guard, same list/detail shape. No new
  UI framework or layout decision needed.
- **`scripts/import-prospects.ts`, not an API route**: the importer touches Overture's
  bulk GeoParquet data (typically pulled via DuckDB or S3), which is the wrong shape for
  a request/response Vercel function and runs on Joshua's schedule (weekly/ad hoc), not
  on user action. A CLI script matches how this will actually be invoked and sidesteps
  Vercel's execution-time ceiling entirely — rung 1 of the lazy ladder: this doesn't need
  to be a service.
- **Two new cron routes, not one**: triage and scan-dispatch have different cost profiles
  (seconds vs. minutes) and different concurrency concerns (triage is nearly free to
  batch large; scan-dispatch must stay small). Splitting them keeps each cron invocation
  well inside Vercel's duration budget without inventing a job runner.
- **`extractor.ts` gets the email extractor, not a new module**: the page is already
  loaded and parsed there for links/images/metadata. Adding contact-email extraction is
  one more field on the same pass, not a second fetch.

## Architectural Patterns

### Pattern 1: DB-backed queue, cron-drained, capacity-gated at the consumer

**What:** `prospects.lifecycle_state = 'qualified'` is the queue. A Vercel cron
(`prospect-scan-dispatch`) runs every 1–2 minutes, claims a small batch (e.g. 2–3 rows)
via `UPDATE ... SET lifecycle_state = 'scan_queued' WHERE id IN (SELECT ... FOR UPDATE
SKIP LOCKED LIMIT 3)`, and calls the existing `full-async` scanner-service endpoint for
each. The scanner-service itself is the actual backpressure authority: extend the
in-memory `activeFullScans` map (`scanner-service/src/index.ts`) with a capacity check —
if `activeFullScans.size >= MAX_CONCURRENT_FULL_SCANS` (start at 2), respond `429` with
`Retry-After`, and leave the dispatcher's row in `scan_queued` for the next cron tick to
retry.

**When to use:** Exactly this scale (10–50/week). No Redis, no Bull, no separate worker
process — Postgres `SKIP LOCKED` plus a cron tick is the entire queue.

**Trade-offs:** Not real-time (up to ~2 min latency to pick up a newly qualified
prospect) — irrelevant at this volume, Joshua isn't watching a live counter. Doesn't
survive a total cron outage gracefully beyond "nothing dispatches" — acceptable, it's
retried on the next tick, and this is a single-tenant internal tool, not an SLA product.

**Example (concurrency gate, scanner-service):**
```typescript
// scanner-service/src/index.ts — extend the existing activeFullScans check
const MAX_CONCURRENT_FULL_SCANS = 2; // ponytail: fixed ceiling, raise if triage volume grows

app.post('/api/scan/full-async', async (req, res) => {
  if (activeFullScans.size >= MAX_CONCURRENT_FULL_SCANS) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'At capacity, retry shortly' });
  }
  // ...existing accept-and-run-in-background logic, unchanged
});
```

### Pattern 2: Stable identity via upstream ID, not fuzzy re-matching

**What:** Overture Places entities carry a GERS ID — a stable UUID v4 maintained by
Overture's own conflation across releases (confirmed against current Overture docs,
2025-06 release onward). Store it as `prospects.overture_gers_id UNIQUE NOT NULL` and
upsert (`ON CONFLICT (overture_gers_id) DO UPDATE SET name=..., website_url=...,
updated_at=now()`) on every import run. This makes re-imports idempotent without any
fuzzy name/address matching.

**When to use:** Any dataset with a maintained stable ID should use that ID as the
natural key, full stop — building your own dedup heuristic (name+address fuzzy match)
when the upstream already solved it is pure waste.

**Trade-offs:** None material here. The only risk is Overture deprecating/splitting an
entity between releases (rare, and Overture's own stability docs describe how this is
handled at the feature-type level); not a v1 concern at 10–50/week.

### Pattern 3: Split AI work by whether it needs the browser

**What:** Anything that needs the loaded page (screenshots, DOM, extracted contact
email) stays in `scanner-service/src/ai.ts` / `extractor.ts`, because that's where the
Playwright context already exists. Anything that only needs already-persisted scan
results (the cold-email draft) goes in Next.js, calling Gemini directly from an API
route triggered by the approval UI.

**When to use:** Whenever a new AI-generated artifact is proposed, ask "does this need
the live page, or just the finished scan row?" before deciding which deployable owns it.

**Trade-offs:** Two places call an LLM instead of one. Acceptable — they already do
(scanner-service calls Gemini for the scan pipeline; this just adds a second, unrelated
call site in Next.js for a different artifact triggered by a different actor at a
different time). Consolidating into one "AI service" would be solving a problem that
doesn't exist yet at this volume.

## Data Flow

### Import → Triage → Qualify

```
scripts/import-prospects.ts (manual/cron trigger, run outside Vercel)
    ↓ upsert on overture_gers_id
prospects (lifecycle_state='new')
    ↓
/cron/prospect-triage (Vercel cron, batches of ~20, plain fetch() per prospect)
    ↓ writes triage_score, triage_checked_at
prospects (lifecycle_state='triaged')
    ↓ Joshua reviews ranked list in app/admin/prospects, bulk-marks a shortlist
prospects (lifecycle_state='qualified')
```

### Qualify → Scan → Draft → Send

```
prospects (lifecycle_state='qualified')
    ↓
/cron/prospect-scan-dispatch (claims batch via SKIP LOCKED, calls existing full-async)
    ↓ ScannerClient.fullScanAsync() — REUSED endpoint, unchanged contract
scanner-service full-async pipeline (unchanged) + extractContactEmail() (new, in extractor.ts)
    ↓ existing /internal/scan-complete webhook fires as it does today
scans (prospect_id set) + prospects (lifecycle_state='scanned', contact_email set)
    ↓ Joshua opens prospect detail → triggers draft generation
/api/prospects/[id]/draft (Gemini call, grounded in scans.summary + scans.issues)
    ↓
outreach_messages (status='draft')
    ↓ Joshua edits/approves in app/admin/prospects/[id]
outreach_messages (status='approved')
    ↓ /api/prospects/[id]/send
lib/suppression.ts: isSuppressed(contact_email)? → abort if yes
    ↓ Resend send with List-Unsubscribe header
outreach_messages (status='sent', sent_at, resend_message_id) + email_events (reused table)
prospects (lifecycle_state='contacted')
```

### Unsubscribe (must exist before the first send)

```
Recipient clicks List-Unsubscribe or the hosted link
    ↓
/api/unsubscribe/[token]
    ↓ writes suppressions (email, reason='unsubscribed', source='unsubscribe_link')
Every future /api/prospects/[id]/send checks suppressions first — source of truth,
Resend's own Suppressions API is a backstop only (per PROJECT.md: Resend doesn't manage
lists for transactional email).
```

## Data Model

### `prospects` (new table)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `overture_gers_id` | text, unique, not null | Stable identity across re-imports — the whole answer to "no duplicates" |
| `name` | text | |
| `website_url` | text | |
| `category` | text | Overture category, filterable |
| `country` | text, not null | Parameter, never hardcoded, per PROJECT.md constraint |
| `region` | text | Locality/admin region from Overture |
| `address` | text | |
| `campaign_tag` | text, nullable | Free-text label for an import/outreach wave — see note below on why not a full `campaigns` table yet |
| `lifecycle_state` | text (enum-checked) | `new → triaged → qualified → scan_queued → scanned → drafted → approved → contacted → replied → booked` plus `rejected`, `suppressed` |
| `triage_score` | jsonb | Signals: reachable, https, has_viewport_meta, page_weight_kb, load_time_ms + computed score |
| `triage_checked_at` | timestamptz | |
| `latest_scan_id` | uuid, FK → scans.id, nullable | |
| `contact_email` | text, nullable | |
| `contact_email_type` | text, nullable | `generic` (`info@`) or `personal` — drives the GDPR distinction PROJECT.md already flagged |
| `created_at`, `updated_at` | timestamptz | |

**Why a new table, not an extension of `leads`:** `leads` means "a visitor submitted
their own URL," which carries implied consent. `prospects` means "Joshua is targeting
this business without their opt-in." PROJECT.md treats that distinction as the entire
legal crux of the milestone. Merging the tables would blur exactly the line the project
depends on keeping sharp — this is the one place where "reuse the existing table" is the
wrong lazy move, because the two rows mean legally different things even if their
columns look similar.

**Relationship to `scans`:** add one nullable column, `scans.prospect_id uuid FK`. A scan
triggered from the inbound flow leaves it null; a scan triggered by the prospect
dispatcher sets it. No new join table needed — `prospects.latest_scan_id` covers "what's
the current scan for this prospect" and `scans.prospect_id` covers "which prospect (if
any) does this scan belong to," which is what a re-scan history query would use.

### `outreach_messages` (new table) — also the audit trail

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `prospect_id` | uuid, FK → prospects.id | |
| `scan_id` | uuid, FK → scans.id | The findings the draft is grounded in |
| `draft_subject`, `draft_body` | text | |
| `status` | text | `draft → approved/edited → sent`, or `rejected` |
| `approved_by`, `approved_at` | text/timestamptz | Single-tenant, so `approved_by` is really just a marker, not a real user FK — no user table exists and none should be built for one user |
| `sent_at` | timestamptz | |
| `resend_message_id` | text | |
| `created_at` | timestamptz | |

One row per send attempt (not one row per prospect) — allows a rejected draft to be
regenerated and a second approved message to exist later without losing the first
attempt's history. This table, plus reusing `email_events` for delivery/open/click, is
the audit trail — no separate `audit_log` table is needed at this scale (rung 1: no
speculative infrastructure for reporting nobody asked for yet).

### `suppressions` (new table) — source of truth, per PROJECT.md decision

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `email` | text, unique, normalized lowercase | |
| `domain` | text, nullable | Optional whole-company suppression |
| `reason` | text | `unsubscribed`, `bounced`, `complaint`, `manual` |
| `source` | text | `unsubscribe_link`, `manual`, `resend_webhook` |
| `created_at` | timestamptz | |

Checked by `lib/suppression.ts` before every send — no exceptions, per PROJECT.md's
"compliance in v1" decision.

### `campaigns` — deliberately not built yet

A `campaign_tag text` column on `prospects` covers "which import/wave does this belong
to" today. A dedicated `campaigns` table (with its own date ranges, targets, reporting
rollups) is speculative at 10–50/week — add it only when cross-campaign comparison
reporting is actually requested (rung 1 of the lazy ladder: this doesn't need to exist
yet).

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 10–50/week (target) | Everything above, as specified. DB-backed queue, 2 concurrent full scans, cron-driven dispatch. This is already sized correctly — do not add Redis/Bull/a worker fleet. |
| 200+/week | Raise `MAX_CONCURRENT_FULL_SCANS` cautiously and re-check Railway resource limits (`CONCERNS.md` already flags no explicit CPU/memory ceiling set); consider a dedicated scan-worker dyno separate from the request-handling process if triage volume alone starts competing with inbound quick-scans for the same Playwright browser. |
| 1000+/week | Out of scope for this milestone by explicit constraint. Would need horizontal scaling of scanner-service and a real job queue — not a decision to pre-build for an unvalidated single-tenant tool. |

### Scaling Priorities

1. **First bottleneck:** scanner-service browser contention under concurrent full-scans
   — already identified in `CONCERNS.md`, fixed by Pattern 1 above (capacity gate on
   `activeFullScans`), not by adding new infrastructure.
2. **Second bottleneck (only if it happens):** Vercel cron overlap — if
   `prospect-scan-dispatch` runs long enough to overlap its own next invocation, add a
   simple advisory lock (`pg_try_advisory_lock`) rather than a queueing library.

## Anti-Patterns

### Anti-Pattern 1: Building a new job-queue system

**What people do:** Reach for Bull/BullMQ + Redis, or a hosted queue service, the moment
"bulk" and "queue" appear in requirements.
**Why it's wrong:** At 10–50/week, a Postgres table with `SKIP LOCKED` and a cron tick
is strictly simpler, has zero new infrastructure, and is already how this codebase does
scheduled work (`vercel.json` crons). Redis/Bull adds a new deployable and a new failure
mode for a queue depth measured in single digits.
**Do this instead:** `lifecycle_state` column + cron dispatcher, as specified above.

### Anti-Pattern 2: Re-fetching the page to extract the contact email

**What people do:** Add a separate "email finder" service that re-crawls the prospect's
site after the scan completes.
**Why it's wrong:** The page is already loaded, parsed, and torn down inside
`scanner.ts`/`extractor.ts` during the scan. A second fetch doubles load time, doubles
the chance of getting blocked/rate-limited by the target site, and duplicates crawling
logic that already exists.
**Do this instead:** Extend `extractPageData()` in `extractor.ts` to also look for
`mailto:` links and common contact patterns while the page is already in hand.

### Anti-Pattern 3: Building multi-tenant plumbing "just in case"

**What people do:** Add a `user_id` column and role checks everywhere because "we might
sell this later."
**Why it's wrong:** PROJECT.md is explicit: single-tenant, and productizing is a
separate, unvalidated future milestone. Building for a buyer who may never exist is
exactly the over-engineering this research is supposed to prevent.
**Do this instead:** No user table. `approved_by` on `outreach_messages` is a free-text
marker, not a foreign key into anything.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Overture Maps | Bulk read (GeoParquet via DuckDB or S3), not an API call per prospect | GERS ID (UUID v4) is stable across releases — the identity key for `prospects.overture_gers_id` |
| Resend | Reuse existing `lib/email.ts` send pattern; add `List-Unsubscribe` header | Suppressions API is a backstop, not the source of truth — Supabase `suppressions` table is |
| Gemini | Reuse the existing AI-call pattern from `scanner-service/src/ai.ts`, but the draft generator itself calls it from Next.js since it doesn't need the browser | New prompt for cold-email drafting, grounded in `scans.summary` / `scans.pages[].issues` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Next.js dispatcher ↔ scanner-service | HTTP, via existing `lib/scanner-client.ts` and the existing `full-async` endpoint | No new endpoint needed on the service side for triggering a scan — only the capacity-check addition inside it |
| Next.js triage ↔ prospect websites | Direct `fetch()`, no scanner-service involvement | Stage 1 deliberately bypasses the browser entirely — that's the whole point of the two-stage funnel |
| Next.js send route ↔ suppression table | Direct Supabase query via `lib/suppression.ts` | Called synchronously before every Resend call, no exceptions |

## Build Order

Dependencies point downward; nothing below can start meaningfully before what's above
it, except where noted as parallelizable.

1. **Migrations**: `prospects`, `outreach_messages`, `suppressions` tables +
   `scans.prospect_id` nullable column. Nothing else has anywhere to write.
2. **Suppression table + unsubscribe endpoint + `lib/suppression.ts`**. Build this
   immediately after migrations, in parallel with everything else below — PROJECT.md is
   explicit that compliance ships in v1, not after the first send exists. Do not treat
   this as step 9; treat it as a co-requisite of step 1.
3. **Importer** (`scripts/import-prospects.ts`). Nothing to triage without prospects.
4. **Triage stage 1** (`lib/prospect-triage.ts` + cron). Produces the shortlist.
5. **Scan queue + concurrency gate** (`prospect-scan-dispatch` cron +
   `activeFullScans` capacity check in scanner-service). This is the piece `CONCERNS.md`
   calls a hard blocker for bulk scanning — build it before scanning more than one
   prospect at a time, even in testing.
6. **Contact-email extraction** (`extractor.ts` addition). Piggybacks on step 5's scans.
7. **Draft generator** (`app/api/prospects/[id]/draft/route.ts`). Depends on a completed
   scan (step 5) and, ideally, a contact email (step 6) to be useful, though it can be
   built and tested against any completed scan first.
8. **Approval queue UI** (`app/admin/prospects/`). Depends on drafts existing to review.
9. **Send route** (`app/api/prospects/[id]/send/route.ts`). Depends on step 2
   (suppression, already done), step 8 (an approved message), and the existing Resend
   integration in `lib/email.ts`.
10. **Lifecycle/reply/booked reporting polish**. Last — `booked_at` via the Fillout
    webhook already exists per PROJECT.md; this step is presentation, not new plumbing.

**Shortest path to a first sent email:** 1 → 2 → 3 (import one real prospect, even by
hand) → 5 (run one full scan on it, manually invoking the dispatcher logic against a
single row) → 6 → 7 → a minimal step-8 (even a raw DB update marking one message
`approved` is acceptable for the very first test) → 9. Steps 4's automated triage and
10's reporting are not on this critical path — they matter for the *product*, not for
proving the pipe works end to end.

## Scoring Duplication — Resolve or Sidestep?

**Sidestep the aggregation-vs-per-page split.** `ARCHITECTURE.md` already documents this
as intentional layering, not a bug: `scorePage()` (service-side, per page) and
`aggregateScores()` (app-side, multi-page) do different jobs. The triage stage-1 score is
a new, independent function — it never touches either of these — so prospecting adds no
new pressure here. Leave it alone.

**Do fix the verdict-threshold divergence, as a small prerequisite, not a full
refactor.** `CONCERNS.md` documents a real, separate bug: `lib/scoring.ts` and
`scanner-service/src/index.ts` each have their own verdict-threshold function with
different cutoffs (95/85/70/50 vs. 90/70/50). Today that's an internal inconsistency
between the admin dashboard and the report page. The draft generator is about to quote a
verdict *in an email sent to a stranger* — the same number now has to mean the same
thing in the ranked prospect list, the scan report, and the cold email, or the sales
pitch contradicts itself. That's a materially different stakes level than "cosmetic
admin-panel mismatch."

Fix: consolidate the two verdict functions into one, exported from `lib/scoring.ts`,
imported by `scanner-service/src/index.ts` and by the new draft generator. This is a
one-function fix (root-cause, not per-caller patching — the exact ponytail bug-fix
rule), not a merge of `scorePage`/`aggregateScores`. Do it as a small prerequisite before
step 7 (draft generator) in the build order above; don't gate everything else on it.

## Sources

- `.planning/codebase/ARCHITECTURE.md` (existing system, read in full)
- `.planning/codebase/STRUCTURE.md` (existing file/directory layout, read in full)
- `.planning/codebase/CONCERNS.md` (throughput and scoring-duplication findings, read in full)
- `.planning/PROJECT.md` (locked decisions: bad-website-first, Overture over Places, two-stage funnel, compliance-in-v1, single-tenant)
- [What is GERS? | Overture Documentation](https://docs.overturemaps.org/gers/) — GERS ID stability confirmation
- [Stability by Feature Type | Overture Maps Documentation](https://docs.overturemaps.org/gers/stability/)
- [Vercel Functions Limits](https://vercel.com/docs/functions/limitations) — confirms long-running scan work cannot live in a Vercel function, matching the existing architecture's Railway split

---
*Architecture research for: Prospect Radar (outbound prospecting layer)*
*Researched: 2026-07-17*
