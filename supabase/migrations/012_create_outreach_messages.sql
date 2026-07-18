-- Outreach messages table: foundation only — drafting/review/send behavior
-- lands in Phase 6. scan_id is declared inline (nullable) since scans
-- already exists in this database by the time this migration runs.
create table if not exists outreach_messages (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  scan_id uuid references scans(id),
  draft_subject text,
  draft_body text,
  status text not null default 'draft'
    check (status in ('draft', 'edited', 'approved', 'rejected', 'sent')),
  approved_by text,
  approved_at timestamptz,
  sent_at timestamptz,
  resend_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_outreach_messages_prospect_id on outreach_messages (prospect_id);

alter table outreach_messages enable row level security;
