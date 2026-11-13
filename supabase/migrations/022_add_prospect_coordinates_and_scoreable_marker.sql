-- D-9-16, D-9-17, D-9-22: additive columns for the Overture point, the
-- not-scoreable marker and Overture's operating status. This migration reads
-- and writes no existing row; every new column starts null and fills on the
-- next re-import (coordinates, operating status) or at the next scoreable
-- check (reason, checked_at). lifecycle_state is never touched here.
--
-- Numbering: 021 is claimed by the unmerged feat/atrium-routes branch
-- (021_add_prospect_owner.sql), so Phase 9 owns 022 and 023.
--
-- latitude / longitude: the Overture point captured once at import. ENG-06's
-- location condition and Phase 10's competitor radius both read it.
-- A business point is personal data for a sole trader, so both columns are
-- in ANONYMIZED_PROSPECT_FIELDS (lib/retention-constants.ts, D-9-25).
alter table prospects add column if not exists latitude double precision;
alter table prospects add column if not exists longitude double precision;

-- not_scoreable_reason / scoreable_checked_at: a business that fails the
-- scoreable rule keeps its row and the reason it was dropped stays readable.
-- Holds a reason code and a timestamp, no personal data, so neither is
-- anonymised (D-9-25).
alter table prospects add column if not exists not_scoreable_reason text;
alter table prospects add column if not exists scoreable_checked_at timestamptz;

-- raw_operating_status: Overture's operating_status as received, next to
-- raw_confidence. The fourth scoreable condition (D-9-22) reads it.
alter table prospect_sources add column if not exists raw_operating_status text;

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS. Guarded existence check on
-- pg_constraint, same workaround migrations 005 and 019 used, so re-running
-- this file is a no-op instead of erroring on "constraint already exists".
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'prospects_not_scoreable_reason_check'
  ) then
    alter table prospects add constraint prospects_not_scoreable_reason_check
      check (
        not_scoreable_reason is null
        or not_scoreable_reason in (
          'no_own_domain',
          'no_unique_match',
          'no_location',
          'permanently_closed'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'prospects_coordinates_range_check'
  ) then
    alter table prospects add constraint prospects_coordinates_range_check
      check (
        latitude is null
        or longitude is null
        or (latitude between -90 and 90 and longitude between -180 and 180)
      );
  end if;
end $$;

-- No index: 10 to 50 prospects a week, measured in 09-RESEARCH.md.
-- RLS already enabled on prospects (migration 010) and prospect_sources
-- (migration 011) — not re-enabled here, and no new policy added
-- (service-role-only convention, migration 014).
