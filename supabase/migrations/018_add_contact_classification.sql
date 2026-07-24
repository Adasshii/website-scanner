-- Contact classification columns (CON-03/CON-06/CON-07): the storage
-- contract the Wave 2 pure module (lib/contact-extraction.ts) writes
-- against and the Wave 2/3 aggregator reads.
--
-- commercial_contact_invited defaults to false (D-5-R2) — a prospect is
-- never treated as having invited commercial contact until something
-- explicitly sets this true.
--
-- sole_proprietorship is a three-state signal (D-5-01), defaulting to
-- 'unknown' so an unwritten row is treated cautiously (as personal data)
-- by construction, not by convention.
alter table prospects add column if not exists commercial_contact_invited
  boolean not null default false;

alter table prospects add column if not exists sole_proprietorship
  text not null default 'unknown'
  check (sole_proprietorship in ('yes', 'no', 'unknown'));

-- contact_email_type already exists (migration 010), created null and never
-- constrained. This CHECK is added here, guarded by a pg_constraint
-- existence test, so re-running this file is a no-op instead of erroring
-- on "constraint already exists". Permits NULL (not-yet-extracted) or one
-- of generic/named-person (CON-03).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'prospects_contact_email_type_check'
  ) then
    alter table prospects add constraint prospects_contact_email_type_check
      check (contact_email_type is null or contact_email_type in ('generic', 'named-person'));
  end if;
end $$;

-- RLS already enabled on prospects (migration 010) — not re-enabled here,
-- and no new policy added (service-role-only convention, migration 014).
