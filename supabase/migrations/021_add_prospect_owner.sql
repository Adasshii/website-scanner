-- 021: who owns a prospect. 'scanner' (the default) for every row the
-- scanner's own import makes. 'atrium' for prospects registered through
-- POST /api/admin/atrium/prospects. Atrium drafts and sends for its own
-- prospects (decision 2026-11-12), so the scan-complete draft hook, triage
-- and the bulk arm step skip them. Additive and safe to run twice.
alter table prospects add column if not exists owner text not null default 'scanner';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'prospects_owner_check'
  ) then
    alter table prospects add constraint prospects_owner_check
      check (owner in ('scanner', 'atrium'));
  end if;
end $$;
