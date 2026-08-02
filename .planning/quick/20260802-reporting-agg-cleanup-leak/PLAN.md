---
type: quick
slug: reporting-agg-cleanup-leak
created: 2026-08-02
mode: quick
---

# Stop `reporting-aggregates.integration.test.ts` leaking fixture rows

The `afterEach` at `lib/reporting-aggregates.integration.test.ts:41-51` deletes
`outreach_messages` then `prospects` and inspects neither result. Three
consecutive phase-07 executor runs (07-03, 07-04, 07-05) hit duplicate-key
errors from the survivors and hand-cleaned them.

## Root cause (confirmed against the live local DB, not inferred)

`pg_constraint` on the local stack:

| child | constraint | `confdeltype` |
|---|---|---|
| `prospect_sources` | `prospect_sources_prospect_id_fkey` | `c` (cascade) |
| `outreach_messages` | `outreach_messages_prospect_id_fkey` | `c` (cascade) |
| `scans` | `scans_prospect_id_fkey` | **`a` (no action)** |
| `prospects` | `prospects_latest_scan_id_fkey` → `scans` | **`a`** |
| `outreach_messages` | `outreach_messages_scan_id_fkey` → `scans` | **`a`** |

Migration 013 added `scans.prospect_id` with no `ON DELETE` clause. The
"per-day imported/triaged/scanned/contacted" test (line 257) inserts a `scans`
row carrying `prospect_id: contactedId`. That row makes the `prospects` delete
raise a foreign-key violation.

Two things then compound:

1. The delete is a **single statement** over all matched ids, so one blocked
   row aborts the whole statement: every prospect survives, not just the
   blocked one.
2. Nobody reads the error, so `afterEach` reports success.
3. The blocked prospect is still prefix-matched on the *next* run, so from the
   first leak onward every later run's cleanup fails at the first `afterEach`
   and the leak becomes permanent and cumulative.

Live state at the start of this task: 5 leftover prospects, 1 leftover scan,
`test-reporting-agg-day-contacted-1` holding the blocking reference.

## Fix

Rewrite `afterEach` to delete in an order that satisfies the FK graph and to
throw on any error:

1. Collect prospect ids by `domain LIKE 'test-reporting-agg-%'` and scan ids by
   `ip_hash LIKE 'test-reporting-agg%'` (both fixture scans carry that marker).
2. Null `prospects.latest_scan_id` for the fixture prospects. It is a
   no-action FK onto `scans` and would block step 4 the moment a future test
   sets it.
3. Delete `outreach_messages` for those prospects (also clears the no-action
   `outreach_messages.scan_id` edge).
4. Delete the fixture `scans`.
5. Delete the `prospects`.

Every step checks `error` and throws. A cleanup that cannot clean must fail
loudly in the run that caused it, not silently poison the next one.

## Verification

- Purge the existing leftovers once (they predate the fix).
- Run the file twice in a row against local Supabase; both runs green.
- Assert `0` rows for `test-reporting-agg-%` prospects and scans after each run.

## Out of scope

Changing migration 013 to `ON DELETE CASCADE`. `scans` is shared with the live
public scanner and a cascade there has real blast radius; the test owns its own
fixtures and can clean them itself.
