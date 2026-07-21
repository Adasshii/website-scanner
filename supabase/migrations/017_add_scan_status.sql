-- Bulk scan queue: per-prospect status (D-01, SCAN-01/SCAN-03) and this
-- project's first plpgsql RPC, the atomic claim function that drains the
-- Phase 3 -> Phase 4 handoff (prospects.scan_released_at, migration 016).
--
-- scan_status is NULL until a prospect is armed for a batch (D-07); once
-- armed it moves queued -> scanning -> done|failed and never anything else
-- (D-01/D-03). scan_attempts is a visible counter (D-04): one attempt, no
-- automatic retry, incremented at dispatch time (plan 04-03), not here.
-- scan_status_reason records both a skip reason (D-10, e.g. robots-blocked)
-- and a failure reason (D-04) in the same column — a bulk scan has exactly
-- one terminal narrative, never both at once.
alter table prospects add column if not exists scan_status text
  check (scan_status in ('queued', 'scanning', 'done', 'failed'));

alter table prospects add column if not exists scan_attempts integer not null default 0;

alter table prospects add column if not exists scan_status_reason text;

-- D-01's "reference to the produced scan" is NOT a new column.
-- prospects.latest_scan_id already exists (migration 013, FK to scans(id))
-- and is currently unused — this phase is the first writer. No new
-- scan-reference column is added here.

-- Drain hot path: the claim function's inner select filters on exactly
-- this predicate, ordered oldest-release-first (FIFO by scan_released_at).
create index if not exists idx_prospects_scan_status_queued
  on prospects (scan_released_at) where scan_status = 'queued';

-- RLS already enabled on prospects (migration 010) — not re-enabled here,
-- and no new policy added (service-role-only convention, migration 014).

-- Atomic claim: SELECT ... FOR UPDATE SKIP LOCKED inside a single UPDATE so
-- two overlapping callers (e.g. an overlapping cron tick) never claim the
-- same row (SCAN-01). batch_size is clamped server-side regardless of what
-- the caller passes (V5 input-validation defence-in-depth, T-04-01) — the
-- function does not trust its own argument.
--
-- Does NOT touch scan_attempts (spent at dispatch time, plan 04-03, so a
-- capacity-refusal requeue never burns D-04's single attempt) and does NOT
-- write lifecycle_state (those enum values exist in migration 010 but are
-- never written anywhere in this codebase; Phase 3 left them alone and
-- Phase 4 follows that convention).
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
    where scan_status = 'queued'
      and scan_released_at is not null
      and website_url is not null
    order by scan_released_at asc
    for update skip locked
    limit least(greatest(batch_size, 0), 10)
  )
  returning *;
end;
$$;
