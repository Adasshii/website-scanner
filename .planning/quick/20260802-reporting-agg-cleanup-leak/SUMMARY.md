---
type: quick-summary
slug: reporting-agg-cleanup-leak
status: complete
completed: 2026-08-02
---

# Summary

`afterEach` in `lib/reporting-aggregates.integration.test.ts` no longer leaks
fixture rows into the shared local Supabase.

## Root cause (confirmed, not inferred)

`scans_prospect_id_fkey` is `ON DELETE NO ACTION` (`confdeltype = 'a'` in
`pg_constraint`) because migration 013 declared no `ON DELETE` clause. The
per-day test seeds a `scans` row pointing at a fixture prospect, which made the
`prospects` delete raise:

```
update or delete on table "prospects" violates foreign key constraint
"scans_prospect_id_fkey" on table "scans"
```

Because a PostgREST delete is one statement over all matched ids, that single
blocked row aborted the delete for *every* fixture prospect. The result was
never inspected, so cleanup reported success. The survivors were prefix-matched
again on the next run, so from the first leak onward every later run failed at
its first `afterEach`: cumulative, and self-perpetuating.

## Change

- `afterEach` now deletes in FK-safe order: null `prospects.latest_scan_id`,
  delete `outreach_messages`, delete fixture `scans` (found by the
  `test-reporting-agg` `ip_hash` marker), then `prospects`.
- Every select, update, and delete checks `error` and throws.
- The public-scanner test's inline scan cleanup was removed. The row carries
  the `ip_hash` marker, so `afterEach` sweeps it, and a failed assertion in
  that test no longer leaks it.

## Verification

| Check | Result |
|---|---|
| Pre-existing leftovers before the fix | 5 prospects, 1 scan |
| Run 1 (no manual purge first) | 12/12 pass, **0** rows left, swept the old leftovers itself |
| Run 2, back to back | 12/12 pass, **0** rows left |
| Zero rows by prospect domain, scan `ip_hash`, scan domain, orphan outreach | all 0 |
| Guard actually fires (planted an unsweepable blocking scan) | old code: error swallowed, row survived; new code: throws |
| Full integration project | 14 files, 133 tests pass |
| `tsc --noEmit` | clean |

## Deliberately not done

Changing migration 013 to `ON DELETE CASCADE`. `scans` is shared with the live
public scanner and a cascade there carries real blast radius. The test owns its
fixtures and cleans them itself.
