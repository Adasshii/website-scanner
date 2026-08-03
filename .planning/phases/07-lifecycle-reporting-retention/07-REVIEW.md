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

gap_closure_reviewed: 2026-08-03T10:44:26Z
gap_closure_plans: ["07-08", "07-09", "07-10"]
gap_closure_depth: standard
gap_closure_commit_range: "0656ece..HEAD"
gap_closure_files_reviewed: 10
gap_closure_files_reviewed_list:
  - lib/chunk-ids.ts
  - lib/chunk-ids.test.ts
  - lib/retention.ts
  - lib/retention-constants.ts
  - lib/triage-candidates.ts
  - lib/triage-candidates.integration.test.ts
  - lib/booking-attribution.ts
  - lib/retention.integration.test.ts
  - app/api/webhooks/fillout/route.integration.test.ts
  - vercel.json
gap_closure_findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
gap_closure_status: issues_found
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

**GAP-CLOSURE UPDATE (2026-08-03): CLOSED CORRECTLY.** See the "Gap-Closure Review" section below.

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

**GAP-CLOSURE UPDATE (2026-08-03): CLOSED CORRECTLY**, with one over-claimed test-coverage note. See below.

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

**GAP-CLOSURE UPDATE (2026-08-03): CLOSED CORRECTLY**, with one new reporting-accuracy gap
introduced alongside the fix (GC-01 below). See the "Gap-Closure Review" section.

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

---

# Gap-Closure Review (Plans 07-08, 07-09, 07-10)

**Reviewed:** 2026-08-03T10:44:26Z
**Depth:** standard
**Commit range:** `0656ece..HEAD`
**Files Reviewed:** 10 production + test files (see `gap_closure_files_reviewed_list` in frontmatter)
**Status:** issues_found (4 new findings; all three original warnings closed)

## Summary

This pass reviews only what plans 07-08, 07-09, and 07-10 changed: `lib/chunk-ids.ts` (new),
`lib/retention.ts`'s `prospect_sources` delete inside `anonymizeProspects()`, the widened
`RETENTION_TABLE_ALLOWLIST`, `getShortlist()`'s chunked outreach lookup with its
accumulate-then-sort pass, `attributeBookingToProspect()`'s uncapped candidate queries, and the
daily-cron `vercel.json` change. I traced each of the four areas of particular concern by hand
against the actual code (not the SUMMARY prose), cross-checked the integration tests that claim
to pin each fix, and read `07-DECISION-RECORD.md` for the two binding decisions this pass
enforces.

**WR-01, WR-02, and WR-03 are all closed, and closed correctly** — verified by direct code
reading plus tests that exercise the specific failure mode each original finding described (3+
candidate booking attribution, a >150-row chunk boundary on the Shortlist read, and a real
`prospect_sources` row surviving/not-surviving an anonymise pass). None of the three original
defects is still present. Two new issues surfaced during verification, both introduced by this
gap-closure work itself rather than left over from the original review, plus two informational
notes worth recording so the next reader doesn't over-trust claims made in the plan SUMMARYs.

### Closure verdicts

- **WR-01 (booking-attribution 2-row cap): closed correctly.** `lib/booking-attribution.ts:76-79`
  and `:97-100` both dropped `.limit(2)` entirely — not raised to a larger fixed number, which
  would only have moved the same bug to a higher threshold. Ambiguity is decided from
  `gatedIds.size` (the post-sent-gate set), confirmed by four new integration cases
  (`app/api/webhooks/fillout/route.integration.test.ts:319-407`) that seed exactly 3 candidates
  with 1/2/0 of them sent-gated, plus a fourth case proving step 1 never falls through to the
  domain step once step 1 finds any row. `prospects.domain`'s partial unique index
  (`supabase/migrations/010_create_prospects.sql:39`) confirmed the domain-fallback query can
  never itself return more than one row, so removing its `.limit(2)` was for symmetry, not a
  live bug fix — consistent with what the plan's own decisions log claims.
- **WR-02 (unbounded Shortlist `.in()`): closed correctly**, with one over-claimed test-coverage
  note — see GC-03 (Info) below. `getShortlist()` now chunks via the shared `chunkIds()` at
  `SHORTLIST_ID_CHUNK_SIZE` (150), and `lib/triage-candidates.integration.test.ts:324-360` proves
  completeness and correct `stage`/`has_outreach_draft` across a `SHORTLIST_ID_CHUNK_SIZE + 5`
  fixture set — the exact scenario WR-02 said was untested and would fail.
- **WR-03 (`prospect_sources` untouched by anonymise mode): closed correctly** on the write path
  — `anonymizeProspects()` deletes each chunk's `prospect_sources` rows
  (`lib/retention.ts:272-277`) inside the same bounded `idChunk` loop as the other three tables,
  cannot run outside `mode === "anonymize"` (the dry-run arm returns before any writer is called;
  `runRetention()`'s dispatch at `lib/retention.ts:417-429` confirms this), and counts rows
  actually returned by `.select("id")` rather than rows attempted. Proven by
  `lib/retention.integration.test.ts:750-799` (past-window deletion by three different lookup
  keys, in-window survival column-for-column, delete-mode cascade re-assertion). The decision
  itself (B-delete-source-rows, accepting the IMP-03 duplicate-prospect cost) is recorded in
  `07-DECISION-RECORD.md` exactly as the plan claims. **However**, the write path's correctness
  is undercut by a reporting gap on the observability side — see GC-01 below, which is new to
  this gap-closure pass and not one of the original three findings.

## Warnings

### GC-01: `RetentionResult.sourcesAnonymized` stays 0 after a delete-mode run, even though `prospect_sources` rows were actually deleted by cascade

**File:** `lib/retention.ts:431-441` (the `delete` branch of `runRetention()`)
**Issue:** `runRetention()`'s anonymize branch sets `result.sourcesAnonymized = sources` from
`anonymizeProspects()`'s return value. The delete branch does not:
```ts
const ids = expiring.map((row) => row.id);
const { prospects, outreach, scans } = await deleteProspects(sb, ids);
result.prospectsDeleted = prospects;
result.outreachAnonymized = outreach;
result.scansDeleted = scans;
return result;
```
`result.sourcesAnonymized` is left at its `0` default (set at `lib/retention.ts:414`) for every
delete-mode run. But delete mode *does* remove `prospect_sources` rows — via migration 011's
`ON DELETE CASCADE` when `deleteProspects()`'s step 4 deletes the owning `prospects` row, exactly
as `lib/retention.integration.test.ts:789-799` ("delete: a source row for a prospect past the
window is gone via migration 011's ON DELETE CASCADE") proves. So the actual deletion is correct,
but the job's own reported counters are wrong for that mode: an operator reading
`GET /api/cron/retention`'s JSON response (the exact surface `07-DEPLOY-EVIDENCE.md` treats as
compliance evidence) after a delete-mode run sees `sourcesAnonymized: 0` regardless of how many
source rows the cascade actually removed. No test in either `lib/retention.integration.test.ts`'s
`anonymizeProspects` describe or its `deleteProspects` describe asserts a non-zero
`sourcesAnonymized`/equivalent in delete mode — the delete-mode wiring test at
`lib/retention.integration.test.ts:973-987` checks `prospectsDeleted`, `scansDeleted`, and
`outreachAnonymized`, but never a sources counter, so this gap has no regression guard.
**Fix:** Either have `deleteProspects()` return a `sources` count from the cascade (requires
selecting affected `prospect_sources` ids before the cascading `prospects` delete removes them,
since a cascade delete does not itself return the child rows to the caller — e.g., a
`retentionFrom(sb, "prospect_sources").select("id").in("prospect_id", idChunk)` immediately before
step 4, or a `.delete()` on `prospect_sources` explicit in `deleteProspects()` mirroring
`anonymizeProspects()`'s own explicit delete rather than relying on the cascade at all), or
document explicitly in the `RetentionResult` type/comment that `sourcesAnonymized` is
anonymize-mode-only and rename it accordingly (e.g., add a dedicated `sourcesDeleted` field, or
note in a comment that delete mode's cascade count is intentionally unreported, matching the
existing "counted separately" convention `outreachAnonymized` already documents for its own
dual-mode reuse).

### GC-02: `chunkIds()` loops forever for a chunk size of `0` or a negative size

**File:** `lib/chunk-ids.ts:8-14`
**Issue:**
```ts
export function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}
```
For `size === 0` and any non-empty `ids`, `i` never advances past `0` (`i += 0`), so the loop
never terminates — the function hangs the calling request forever (or until a platform timeout
kills the process). For a negative `size`, `i` decreases every iteration and diverges away from
`ids.length` in the wrong direction, also never terminating. Both call sites today pass a
hardcoded literal (`RETENTION_ID_CHUNK_SIZE = 150`, `SHORTLIST_ID_CHUNK_SIZE = 150`), so this is
not reachable in the current codebase — but this function is now explicitly positioned as "the
one dependency-free chunking helper this codebase has" (its own header comment) shared across a
cron write path and an admin read path, specifically so a future caller reuses it rather than
writing a third implementation. `lib/chunk-ids.test.ts`'s five cases cover empty input and the
below/at/above-boundary cases (per its own comments) but never a non-positive `size`, so nothing
guards this edge going forward. This matches area-of-concern #4's explicit ask to check
"chunk size of 0 or negative."
**Fix:** Guard at the top of the function rather than relying on every future caller to pass a
sane constant:
```ts
export function chunkIds(ids: string[], size: number): string[][] {
  if (size <= 0) throw new Error(`chunkIds: size must be positive, got ${size}`);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}
```
Add a `chunkIds([...], 0)` / `chunkIds([...], -1)` throw-assertion to `lib/chunk-ids.test.ts`.

## Info

### GC-03: `getShortlist()`'s global re-sort of accumulated outreach rows is currently unreachable by any test — the coverage claim in `07-09-SUMMARY.md` overstates what's proven

**File:** `lib/triage-candidates.ts:118-132`; `07-09-SUMMARY.md` (frontmatter `coverage` id D2,
and the "Decisions Made" section)
**Issue:** This was the area of particular concern flagged as highest-risk in the review brief,
so it's worth stating precisely what the trace found. The code is:
```ts
const idChunks = chunkIds(rawRows.map((r) => r.id), SHORTLIST_ID_CHUNK_SIZE);
const outreachRows: { prospect_id: string; status: string; created_at: string }[] = [];
for (const idChunk of idChunks) {
  const { data, error } = await sb
    .from("outreach_messages")
    .select("prospect_id, status, created_at")
    .in("prospect_id", idChunk)
    .order("created_at", { ascending: true });
  if (error) throw error;
  outreachRows.push(...(data ?? []));
}
outreachRows.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
```
The re-sort is present, sorts on `created_at` ascending (the correct key and direction for a
last-write-wins reduction that must end on the newest row), and would be needed *if* a single
prospect's outreach rows could ever be split across two different chunk queries. But
`idChunks` partitions `rawRows.map(r => r.id)` — every prospect's `id` appears in exactly one
element of `idChunks`, since a prospect row is not duplicated in `rawRows`. Each chunk's
`.in("prospect_id", idChunk)` query therefore returns *all* of a given prospect's
`outreach_messages` rows within that single chunk's own result set, which is already sorted
ascending by that chunk's own `.order()`. So for any single prospect, its rows arrive in the
correct ascending order in the concatenated array with or without the final global
`outreachRows.sort(...)` — the per-prospect order the last-write-wins reduction actually depends
on was never at risk from the chunking change in the first place. Deleting the global sort line
would not make any existing test fail, including the two chunk-boundary tests
(`lib/triage-candidates.integration.test.ts:324-360`) that were written specifically to prove
this: the second of the two (`"resolves stage from the newest of two outreach rows for one
prospect even when the fixture set spans two chunks"`) seeds its target prospect via a single,
separate `seedProspect()` call, so that one prospect's `id` — like every other prospect's — still
lands in exactly one chunk; its two outreach rows are never actually split across the chunk
boundary the test's own name claims to exercise. This is consistent with `07-09-SUMMARY.md`'s
own "Decisions Made" section, which candidly says the sort is "defensive... even though under
this specific chunking-by-prospect-id partition a single prospect's rows can never actually
straddle two chunks" — but the plan's `coverage` entry D2 and the WR-02 closure claim in the same
SUMMARY ("proven by integration tests that exercise the real, previously-unreachable code paths —
not by inspection") state more than that candid admission supports for this specific line. Not a
functional bug: the code is correct, and the defensive sort costs nothing at this data volume.
**Fix:** None required. Consider either removing the redundant sort with a comment explaining why
it's provably unnecessary under the current id-based chunking (simpler, matches what's actually
tested), or keeping it as insurance against a future chunking-strategy change but rewording the
SUMMARY-level claim so a future reader doesn't treat "a test would fail if this were removed" as
literally true for this line.

### GC-04: `app/api/cron/retention/route.ts`'s doc comment is now stale after the D-7-20 schedule supersede, and isn't the tracked "known inconsistency"

**File:** `app/api/cron/retention/route.ts:8-9` (unchanged by any of the three gap plans)
**Issue:** The route's own header comment still reads "Runs monthly via Vercel cron (D-7-20) —
data expiry does not need day resolution..." but `vercel.json`'s schedule for this exact route
changed from `0 3 1 * *` (monthly) to `0 3 * * *` (daily) as part of plan 07-10, per
`07-DECISION-RECORD.md`'s "D-7-20 superseded" section. `07-DECISION-RECORD.md` explicitly names
one stale artifact left behind by this change (`07-07-PLAN.md` line 367's schedule assertion) but
does not mention this route file's own comment, which makes the same now-incorrect claim in the
one file most likely to be read when debugging the live cron. `route.ts` itself was not part of
this gap-closure pass's file list (confirmed via `git diff 0656ece..HEAD -- app/api/cron/retention/route.ts`,
which is empty), so this is a side effect of the `vercel.json` change rather than a defect
introduced by editing this file.
**Fix:** One-line comment update: `Runs daily via Vercel cron (D-7-20 superseded — see
07-DECISION-RECORD.md) — a monthly schedule silently failed to register on Vercel Hobby.`

---

_Gap-closure reviewed: 2026-08-03T10:44:26Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Scope: plans 07-08, 07-09, 07-10 (commit range 0656ece..HEAD)_
