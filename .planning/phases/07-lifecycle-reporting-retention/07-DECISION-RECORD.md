# Decision Record: `prospect_sources` under anonymise mode (FA-CMP-13-SOURCES)

**Date:** 2026-08-02
**Plan:** 07-08 (gap closure, phase 07-lifecycle-reporting-retention)
**Closes:** FA-CMP-13-SOURCES, 07-REVIEW.md WR-03

## Decision

**Selected: B-delete-source-rows.**

`anonymizeProspects()` deletes a prospect's `prospect_sources` rows outright as part of the same
chunked anonymise pass, rather than nulling a field list in place.

## Rationale (recorded verbatim from the resolving decision)

Option A was rejected on the evidence surfaced during Task 1. `upsertOverturePlace`'s branch-1
`.update()` (`lib/prospect-upsert.ts:43-83`) rewrites `raw_name`, `raw_address` and
`raw_website_url` on every re-import matching the surviving `overture_gers_id`, with no gate on
lifecycle state or anonymisation status, and `maybeRefreshWebsiteUrl()` can replant the identifier
into `prospects.website_url` or `website_url_pending` on top of that. Anonymisation that silently
reverts on the next regional import is worse than none, because nothing signals it happened.
Keeping `overture_gers_id` also leaves a public resolver to the business in Overture's dataset, so
A was pseudonymisation even before the write-through was found.

Option B is chosen with the duplicate-prospect cost explicitly accepted: deleting the
`prospect_sources` rows breaks IMP-03 idempotency for that prospect, so the next regional import
creates a second, unlinked prospect row for the same business. That cost is acceptable at this
project's stated scale of 10-50 prospects per week, and it is bounded by CMP-15 — the suppression
list survives retention, so a business that unsubscribed stays suppressed even when a duplicate
prospect row later appears. A fresh sighting of a business whose retention basis expired 12 months
ago is arguably a new record rather than a lost one.

## `upsertOverturePlace` write-through finding (Task 1)

Confirmed by direct read of `lib/prospect-upsert.ts` lines 43-83: yes, it writes through, and
unconditionally. Branch 1 ("known source" — fires whenever a re-import's Overture record matches an
`overture_gers_id` already present in `prospect_sources`) issues an `.update()` against that exact
row setting `raw_name`, `raw_address`, `raw_category`, `raw_region`, `raw_country`,
`raw_website_url`, `raw_confidence` and `last_seen_at` to the freshly-imported values, with no check
of the owning prospect's `lifecycle_state` or anonymisation status. It can also reach the parent
`prospects` row: `maybeRefreshWebsiteUrl()` writes `prospects.website_url` directly if
`lifecycle_state` is still `"new"`, or `website_url_pending` otherwise — either way replanting the
identifier the anonymise pass just cleared, in the row or in a sibling column.

## What was explicitly accepted

Deleting `prospect_sources` rows breaks IMP-03 idempotency for that prospect. The next import of
the same region no longer matches an `overture_gers_id` it has already seen, so `upsertOverturePlace`
takes its brand-new-prospect branch and creates a second, unlinked `prospects` row for the same
business. The anonymised original keeps its timestamps, scores and funnel history (TRK-05 survives);
nothing reconciles it with the new duplicate. Accepted as bounded by scale (10-50 prospects/week) and
by CMP-15 (suppression survives independently of any prospect row).

## What enforces it

- **Code:** `lib/retention-constants.ts` — `RETENTION_TABLE_ALLOWLIST` gains a `"prospect_sources"`
  entry, with a comment paragraph naming this decision and pointing at this file.
  `lib/retention.ts` — `anonymizeProspects()`'s chunk loop issues a
  `.delete().in("prospect_id", idChunk).select("id")` against `prospect_sources`, counted into a new
  `sources` field / `RetentionResult.sourcesAnonymized`, with a comment at the call site explaining
  why an anonymise pass performs a delete here.
- **Test:** `lib/retention.integration.test.ts` — `describe("runRetention — prospect_sources
  (FA-CMP-13-SOURCES, Task 2)")`. Asserts, through a real `runRetention()` call: a source row for a
  prospect past the window is deleted outright (by `prospect_id`, by its own `id`, and by its
  `overture_gers_id`); a source row for a prospect inside the window is untouched column for column;
  delete mode still clears source rows via migration 011's `ON DELETE CASCADE`. The pre-existing
  `RETENTION_TABLE_ALLOWLIST` length assertion is updated from 3 to 4 and now also checks `leads` is
  absent.

---

# D-7-20 superseded: the retention cron runs daily, not monthly

**Decided:** 2026-08-02, by Joshua, during plan 07-10's deploy evidence step.
**Supersedes:** D-7-20 (`07-CONTEXT.md` line 163) — "A dedicated monthly cron route,
`/api/cron/retention`. Data expiry does not need day resolution, and a monthly run keeps the blast
radius of a first version small."

**Change:** `vercel.json` — `/api/cron/retention` moves from `0 3 1 * *` (monthly, 1st at 03:00 UTC)
to `0 3 * * *` (daily at 03:00 UTC). No code change.

## Why

The first production deploy (2026-08-02) shipped `vercel.json` with all five cron entries. Vercel
registered four. `/api/cron/retention` was absent from the Cron Jobs view, while the other four —
three daily (`0 7 * * *`, `0 8 * * *`, `0 10 * * *`) and one day-of-week (`0 9 * * 1`) — all
registered. The retention entry was the only one pinning a day-of-month.

This falsifies `07-RESEARCH.md` § "Priority Open Question", which resolved that Vercel Hobby accepts
a genuine monthly expression and recorded the Hobby restriction as a ceiling on frequency rather
than a floor. `07-CONTEXT.md` line 169 had flagged the monthly schedule string as needing
confirmation before planning committed to it; the confirmation came back negative. Empirical
dashboard state overrides the documentation reading.

## Why daily is acceptable, not merely available

D-7-20's stated rationale was blast radius. Frequency does not carry that: a wrong scope or a wrong
window destroys the same rows on its first run whether that run is monthly or daily. What actually
bounds the blast radius is `RETENTION_MODE` being unset (the job writes nothing) plus the fact that
switching it is a deliberate human act. Both are unchanged by this decision.

Daily is also the better compliance posture on its own terms: it caps the lag between a retention
basis expiring and the data going at one day instead of up to thirty-one. The cost is 30x more
invocations of a cheap read over ~800 rows, which is immaterial at this project's scale.

## Known inconsistency left behind

`07-07-PLAN.md` line 367 carries an automated verification asserting
`schedule === '0 3 1 * *'`. Plan 07-07 is complete and its SUMMARY is written, so that assertion is
not re-run by any workflow — but re-running it by hand will now fail. It is stale by design, not
broken. `07-10-PLAN.md`'s seven schedule references were updated in the same commit, since that plan
had not yet executed its deploy task.
