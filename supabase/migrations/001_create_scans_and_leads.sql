-- Scans table: stores all scan results
create table if not exists scans (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  domain text not null,
  type text not null check (type in ('quick', 'full')),
  status text not null default 'pending' check (status in ('pending', 'scanning', 'completed', 'failed')),
  scores jsonb,
  summary jsonb,
  pages jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  ip_hash text not null
);

-- Index for rate limiting queries
create index if not exists idx_scans_ip_hash_created on scans (ip_hash, created_at desc);

-- Index for looking up scans by domain
create index if not exists idx_scans_domain on scans (domain, created_at desc);

-- Leads table: stores email captures (GDPR-compliant)
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references scans(id) on delete cascade,
  email text not null,
  domain text not null,
  consented_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_leads_email on leads (email);
create index if not exists idx_leads_domain on leads (domain);

-- Enable RLS (service role key bypasses these)
alter table scans enable row level security;
alter table leads enable row level security;

-- Auto-delete scans older than 90 days (data retention policy)
-- This requires pg_cron extension on Supabase or a scheduled function
-- For now, create a function that can be called by a cron job
create or replace function delete_expired_scans()
returns void as $$
begin
  delete from scans where created_at < now() - interval '90 days';
end;
$$ language plpgsql security definer;

-- Auto-delete leads older than 12 months
create or replace function delete_expired_leads()
returns void as $$
begin
  delete from leads where created_at < now() - interval '12 months';
end;
$$ language plpgsql security definer;
