-- Suppressions table: the single source of truth for who must not be
-- contacted (CMP-01). Matches on both exact email and registrable domain
-- (CMP-03) — every other address on a suppressed domain is also blocked.
-- Permanent, no expiry column (CMP-05). D-07: this table is a pure lookup,
-- never a prospect mutation — nothing here writes to prospects.
--
-- D-09: an override *lifts* a suppression (lifted_at/lifted_by_reason), it
-- never deletes the row — lifted rows stay forever as history and a later
-- re-suppression for the same email inserts a fresh row. A plain UNIQUE on
-- email would contradict that, so uniqueness is scoped to active rows only
-- via a partial unique index (mirrors prospects.domain, migration 010).
create table if not exists suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  domain text,                              -- normalised registrable domain; nullable (domain-less email)
  reason text not null
    check (reason in ('bounced', 'complained', 'unsubscribe')),
  source text not null
    check (source in ('resend_webhook', 'unsubscribe_link', 'backfill')),
  lifted_at timestamptz,
  lifted_by_reason text,
  created_at timestamptz not null default now()
);

-- D-09/CMP-06: at most one ACTIVE suppression per email at a time; lifted
-- rows fall outside this index, so a fresh row can be inserted after a lift.
create unique index if not exists suppressions_email_active_idx on suppressions (email) where lifted_at is null;

-- Domain-wide lookup support (CMP-03) — active rows only.
create index if not exists idx_suppressions_domain_active
  on suppressions (domain) where lifted_at is null;

-- RLS-enable-no-policy convention (migration 010) — service-role only,
-- anon gets zero access. Do not add a policy.
alter table suppressions enable row level security;
