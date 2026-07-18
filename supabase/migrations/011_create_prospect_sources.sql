-- Prospect sources table: child table holding the raw Overture Maps records
-- that contributed to each prospect (D-02). One prospect can have many
-- sources when domain-collapse (IMP-04) merges multiple Overture rows.
-- overture_gers_id is the idempotency key (IMP-03) re-imports upsert against.
create table if not exists prospect_sources (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  overture_gers_id text not null unique,   -- IMP-03: the idempotency key for re-imports
  overture_release text,                    -- traceability: which Overture release produced this row
  raw_name text,
  raw_address text,
  raw_category text,
  raw_region text,
  raw_country text,
  raw_website_url text,
  raw_confidence numeric,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_prospect_sources_prospect_id on prospect_sources (prospect_id);

alter table prospect_sources enable row level security;
