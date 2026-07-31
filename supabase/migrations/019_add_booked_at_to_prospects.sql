-- D-7-07: additive booking-attribution columns, same shape as migration
-- 004's leads.booked_at. This migration reads and writes no existing row.
-- The only writer of these two columns is the guarded UPDATE in the
-- Fillout webhook (D-7-08, plan 07-05). booked_at becomes an input marker
-- to deriveLifecycleState() (D-7-01) — lifecycle_state itself is never
-- touched here. booked_match_method exists so a domain-inferred booking is
-- never indistinguishable from an email-exact one.
alter table prospects add column if not exists booked_at timestamptz;
alter table prospects add column if not exists booked_match_method text;

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS. Guarded existence check on
-- pg_constraint, same workaround migration 005 used for
-- prospects_contact_email_type_check (STATE.md:138), so re-running this
-- file is a no-op instead of erroring on "constraint already exists".
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'prospects_booked_match_method_check'
  ) then
    alter table prospects add constraint prospects_booked_match_method_check
      check (booked_match_method in ('email', 'domain'));
  end if;
end $$;

create index if not exists idx_prospects_booked_at on prospects (booked_at)
  where booked_at is not null;

-- RLS already enabled on prospects (migration 010) — not re-enabled here,
-- and no new policy added (service-role-only convention, migration 014).
