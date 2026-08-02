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
