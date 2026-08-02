---
phase: 07-lifecycle-reporting-retention
reviewed: 2026-08-02T17:30:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - lib/lifecycle.ts
  - lib/reporting-aggregates.ts
  - lib/reporting-format.ts
  - lib/booking-attribution.ts
  - lib/retention.ts
  - lib/retention-constants.ts
  - lib/triage-candidates.ts
  - app/api/admin/reporting/route.ts
  - app/api/cron/retention/route.ts
  - app/api/webhooks/fillout/route.ts
  - app/admin/page.tsx
  - components/admin/reporting-tab.tsx
  - components/admin/shortlist-table.tsx
  - components/admin/stat-card.tsx
  - supabase/migrations/019_add_booked_at_to_prospects.sql
  - vercel.json
  - package.json
  - vitest.config.ts
  - lib/lifecycle.test.ts
  - lib/reporting-format.test.ts
  - lib/reporting-aggregates.integration.test.ts
  - lib/retention.integration.test.ts
  - lib/triage-candidates.integration.test.ts
  - app/api/cron/retention/route.integration.test.ts
  - app/api/webhooks/fillout/route.integration.test.ts
  - app/admin/reporting-gate.test.tsx
  - components/admin/shortlist-table.test.tsx
  - components/admin/signal-chips.test.tsx
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-08-02T17:30:00Z
**Depth:** standard
**Files Reviewed:** 24 production + test files
**Status:** issues_found

## Summary

This phase adds derived-state lifecycle tracking, admin reporting aggregation, booking
attribution, and a monthly retention cron on top of an already-complete write-side pipeline.
I read the full RESEARCH/VALIDATION/plan-SUMMARY trail, the migration chain governing the
`prospects`↔`scans` FK cycle, and every production file in scope, then traced the highest-risk
areas by hand: the retention cutoff/scope/mode logic, the cron's auth gate, the booking-email
matcher's multi-row handling, and the Fillout webhook's failure isolation.

**The retention job itself is solid.** `lib/retention.ts`'s delete-mode ordering (null
`latest_scan_id` → delete `outreach_messages` → delete `scans` → delete `prospects`) correctly
navigates the two-table FK cycle from migration 013 *and* the second, easy-to-miss NO ACTION FK
on `outreach_messages.scan_id` (migration 012) that a naive three-step order would miss. The
dry-run arm never reaches a write call. The cron route's `CRON_SECRET` Bearer check runs before
any query, and `runRetention()` accepts no caller-supplied mode — production always resolves
mode/window from env only. `RETENTION_TABLE_ALLOWLIST` structurally excludes `suppressions`, and
the integration suite has a dedicated FK-error-forcing test plus a suppression-survival test in
every mode. `RETENTION_MODE` is confirmed unset in production (still dry-run), so none of the
below has fired against real data yet.

**Three warnings remain**, none of them in the retention delete path itself: a candidate-cap
edge case in the booking-email matcher that could silently under-attribute when 3+ prospects
share a lookup key, an un-chunked `.in()` query in the Shortlist route that is the exact same
PostgREST failure mode this phase's own `lib/retention.ts` discovered and fixed elsewhere, and a
child table (`prospect_sources`) that anonymise mode never touches, leaving the original business
name/address/URL joinable after "anonymisation." The last one is already self-flagged by the
team in 07-06-PLAN.md/07-07-PLAN.md as `FA-CMP-13-SOURCES`, pending the LIA — restated here
because it directly bears on data the anonymise-mode field lists were designed to erase, and the
default mode is "anonymise, not delete" once the job goes live.

One item explicitly excluded from grading per the review brief: the `afterEach` in
`lib/reporting-aggregates.integration.test.ts` (~lines 47-92) doesn't inspect its own delete
errors, so an FK-rejected cleanup silently leaves fixture rows behind for the next run. This is
already tracked separately and is not counted in the findings totals above.

## Warnings

### WR-01: Booking-attribution's 2-row cap can silently miss the correct match when 3+ prospects share a lookup key

**File:** `lib/booking-attribution.ts:61-65` (email step) and `:83-87` (domain step)
**Issue:** Both candidate lookups cap at `.limit(2)`:
```ts
const { data: emailMatches } = await sb
  .from("prospects").select("id").eq("contact_email", address).limit(2);
...
const { data: domainMatches } = await sb
  .from("prospects").select("id").eq("domain", domain).limit(2);
```
This is sized to distinguish "exactly one candidate" from "more than one" (correctly reported
as `"ambiguous"`), which is fine when at most 2 rows share the key. But `contact_email` carries
no unique index (confirmed in migration 010/017 and called out in this module's own header
comment), and the query has no `.order()`, so with 3+ prospects sharing an email or domain, the
2 rows PostgREST happens to return may both lack a `status: "sent"` outreach row while the real
match — the row with the sent message — falls outside the fetched set entirely. The function
then returns `"no_sent_outreach"` (or, if only one of the 2 fetched rows is gated, silently
attributes to the wrong prospect) instead of correctly attributing or reporting `"ambiguous"`.
The integration suite (`app/api/webhooks/fillout/route.integration.test.ts:280-314`) only covers
the 2-candidate case, so this path is untested at 3+.
**Fix:** Don't truncate the candidate set before applying the contact gate — fetch all matches
(the row counts here are tiny at this project's scale) and base the ambiguity decision on the
post-gate set size, not the pre-gate query limit:
```ts
const { data: emailMatches, error: emailError } = await sb
  .from("prospects")
  .select("id")
  .eq("contact_email", address); // no .limit() — correctness over a needless cap
```
Apply the same change to the domain-fallback query.

### WR-02: `getShortlist()`'s unbounded `.in()` reproduces the exact PostgREST "URI too long" bug this phase found and fixed in `lib/retention.ts`

**File:** `lib/triage-candidates.ts:104-112`
**Issue:**
```ts
const { data: outreachRows, error: outreachError } = await sb
  .from("outreach_messages")
  .select("prospect_id, status, created_at")
  .in("prospect_id", rawRows.map((r) => r.id))   // no chunking
  .order("created_at", { ascending: true });
```
`rawRows` is every prospect with a non-null `triage_score` — i.e., it grows without bound as
more prospects get triaged. `07-06-SUMMARY.md` and `lib/retention-constants.ts`
(`RETENTION_ID_CHUNK_SIZE = 150`) document that this exact `.in("prospect_id", ids)` shape
against PostgREST overflowed the gateway's URL length limit ("URI too long") in this project's
own local dev database at 711 rows. `getShortlist()` builds the identical query shape with no
chunking. Phase 07-04 (`stage` column) reuses this same `outreachRows` result without touching
the query, so the Shortlist tab — and the `stage` derivation that rides along with it — will
start failing outright once the triaged-prospect count crosses roughly the same threshold that
already broke retention's read path in this same codebase.
**Fix:** Reuse the chunking helper this phase already wrote (or an equivalent) rather than
inventing a second one:
```ts
// lib/triage-candidates.ts
import { chunkIds } from "@/lib/retention"; // or hoist chunkIds to a shared util
...
const idChunks = chunkIds(rawRows.map((r) => r.id), 150);
const outreachRows: { prospect_id: string; status: string; created_at: string }[] = [];
for (const chunk of idChunks) {
  const { data, error } = await sb
    .from("outreach_messages")
    .select("prospect_id, status, created_at")
    .in("prospect_id", chunk)
    .order("created_at", { ascending: true });
  if (error) throw error;
  outreachRows.push(...(data ?? []));
}
```
(`chunkIds` is currently unexported from `lib/retention.ts`; export it or move it to a small
shared module so both callers use one implementation.)

### WR-03: Anonymise mode never touches `prospect_sources`, leaving the original name/address/URL joinable after "anonymisation"

**File:** `lib/retention-constants.ts:76` (`RETENTION_TABLE_ALLOWLIST`), `lib/retention.ts` (no
`prospect_sources` handling anywhere)
**Issue:** `prospect_sources` (migration 011) stores `raw_name`, `raw_address`,
`raw_website_url` per prospect and is never cleared or deleted by either writing mode.
`prospect_sources.prospect_id` is `ON DELETE CASCADE`, so **delete mode** removes it correctly
as a side effect — but **anonymise mode**, the D-7-17 default once this job is switched on,
updates `prospects.name/domain/website_url/address` to `null` while `prospect_sources` rows for
that same `prospect_id` still hold the un-normalised original name, address, and website URL.
A single join recovers everything the anonymise pass was supposed to erase. This is already
self-flagged in `07-06-PLAN.md`/`07-07-PLAN.md` as `FA-CMP-13-SOURCES`, "surfaced for the LIA,"
so it is not a fresh discovery — restating it here because it directly undermines the field
lists in `ANONYMIZED_PROSPECT_FIELDS`, and because `RETENTION_MODE` currently defaults to
`dry-run` in production (confirmed unset per 07-07-SUMMARY.md), which means this gap has not yet
mattered but will the moment anonymise mode is turned on.
**Fix:** No code change needed until the LIA resolves the open question, but the switch from
`dry-run` to `anonymize` should be blocked on either (a) adding `prospect_sources` to the
allowlist with its own field list, or (b) an explicit, documented decision that
`prospect_sources` is out of scope forever (not just "not yet decided"). Track this as a release
gate, not a code defect to silently ship past.

## Info

### IN-01: `retentionCutoff()`'s month arithmetic can drift by a day near month-end for non-default windows

**File:** `lib/retention.ts:47-59`
**Issue:** `cutoff.setUTCMonth(cutoff.getUTCMonth() - months)` is exact for the default 12-month
window (same day-of-month a year earlier, except across a Feb 29 leap boundary), but for other
`RETENTION_MONTHS` values, subtracting into a shorter month rolls over (e.g., May 31 minus 1
month lands on Mar 3, not Apr 30). This is already documented in the function's own comment as a
bounded, few-day imprecision. No action needed at the current 12-month default; worth a second
look if `RETENTION_MONTHS` is ever configured to something other than a multiple of 12 for the
LIA's eventual answer.

### IN-02: Known, separately-tracked cleanup gap in `lib/reporting-aggregates.integration.test.ts`

**File:** `lib/reporting-aggregates.integration.test.ts` (~lines 47-92)
**Issue:** Per the review brief, this is already tracked and is not a new finding: the
`afterEach` deletes fixture rows without inspecting the delete calls' `error` results, so an
FK-rejected cleanup (e.g., a scan row still referencing a fixture prospect) silently reports
success and leaves the row behind for the next run. `07-04-SUMMARY.md` documents this exact
failure mode having already occurred once and required a manual data cleanup. Restated here for
completeness only; not counted in the findings totals.

---

_Reviewed: 2026-08-02T17:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
