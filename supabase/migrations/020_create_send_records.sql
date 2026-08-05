-- Send records: the immutable per-send audit trail (CMP-09, CMP-11, CMP-12).
-- One row answers "why were we allowed to email this business" in seconds:
-- the resolved address and its classification, the exact text sent, the
-- legal basis and LIA version that applied, whether a Tw exemption was
-- claimed, the approver, and the suppression-check result at that moment.
--
-- Written only by lib/send-gate.ts's future "mark as sent" step (plan
-- 08-02). This migration creates the table and its immutability guarantee;
-- nothing in Phase 8's first plan writes a row here.
create table if not exists send_records (
  id uuid primary key default gen_random_uuid(),
  outreach_message_id uuid not null references outreach_messages(id),
  prospect_id uuid not null references prospects(id),
  sent_at timestamptz not null default now(),
  resolved_email text not null,
  resolved_email_type text not null
    check (resolved_email_type in ('generic', 'named-person')),
  subject_sent text not null,
  body_sent text not null,
  legal_basis text not null,
  lia_version integer not null references lia_versions(version),
  tw_exemption_claimed boolean not null,
  first_contact_notice_included boolean not null,
  is_first_contact boolean not null,
  approved_by text not null,
  suppression_checked_at timestamptz not null,
  suppression_hit boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_send_records_prospect_id on send_records (prospect_id);

-- One approved message can produce at most one send record.
create unique index if not exists send_records_message_unique_idx
  on send_records (outreach_message_id);

-- Immutability: no code path may UPDATE or DELETE a send_records row once
-- inserted, mirroring lia_versions (migration 015). A correction is a new
-- row, never a mutation of an existing one.
create or replace function prevent_send_records_mutation()
returns trigger as $$
begin
  raise exception 'send_records rows are immutable; insert a new row instead';
end;
$$ language plpgsql;

-- Guarded so re-running this file is a no-op instead of erroring on
-- "trigger already exists" (CREATE TRIGGER has no IF NOT EXISTS clause).
-- Blocks DELETE as well as UPDATE: a future erasure or retention need must
-- drop this trigger in its own migration, deliberately, rather than by a
-- generic cleanup sweep silently removing audit history.
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'send_records_no_update_delete'
  ) then
    create trigger send_records_no_update_delete
      before update or delete on send_records
      for each row execute function prevent_send_records_mutation();
  end if;
end $$;

-- RLS-enable-no-policy convention (migrations 010, 014) — service-role only.
alter table send_records enable row level security;

-- Two counsel-supplied config values (CMP-10). Created unset and left unset
-- by this migration: legal_basis has no default and is never written here;
-- article_14_notice_approved defaults to false. lib/send-gate.ts refuses
-- every send while they hold these values, which is the intended shipped
-- state until counsel supplies the real values as a data change.
alter table legal_regimes add column if not exists legal_basis text;
alter table legal_regimes add column if not exists article_14_notice_approved boolean not null default false;

-- Short-lived prepared state (D-04): stamped by lib/send-gate.ts's Prepare
-- step, re-stamped on every re-prepare. Nothing reads a TTL from this column
-- directly; PREPARED_TTL_MINUTES documents the intended staleness window.
alter table outreach_messages add column if not exists prepared_at timestamptz;
