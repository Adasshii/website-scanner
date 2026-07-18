-- Prospects table: durable prospect list imported from Overture Maps (Phase 1).
-- Domain is the primary identity (D-01); no-website prospects (domain IS NULL,
-- lifecycle_state = 'no_website', D-06/D-07) are keyed by their GERS source
-- instead (see prospect_sources). country is required (IMP-06) and, like
-- website_url, is frozen once set on first import (D-13) — a later re-import
-- that reports a different country is recorded in country_pending /
-- country_changed_at for Joshua to review, never auto-applied (same pattern
-- as website_url_pending / website_url_changed_at, D-05).
create table if not exists prospects (
  id uuid primary key default gen_random_uuid(),
  domain text,                              -- normalised registrable domain; NULL = no-website prospect
  name text,
  address text,
  category text,
  region text,
  country text not null,                    -- IMP-06: parameter, never hardcoded; frozen after first import (D-13)
  website_url text,
  website_url_pending text,                 -- D-05: proposed change while frozen, never auto-applied
  website_url_changed_at timestamptz,
  country_pending text,                     -- D-13: proposed country change while frozen, never auto-applied
  country_changed_at timestamptz,
  campaign_tag text,
  lifecycle_state text not null default 'new'
    check (lifecycle_state in (
      'new', 'no_website', 'triaged', 'qualified', 'scan_queued', 'scanned',
      'drafted', 'approved', 'contacted', 'replied', 'booked', 'rejected', 'suppressed'
    )),
  triage_score jsonb,
  triage_checked_at timestamptz,
  latest_scan_id uuid,                      -- FK added in 013, once scans/prospects both exist (avoids forward reference)
  contact_email text,
  contact_email_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- D-06: partial unique index — lets many NULL-domain no-website prospects
-- coexist while has-domain prospects stay unique on domain.
create unique index if not exists prospects_domain_unique_idx
  on prospects (domain) where domain is not null;

create index if not exists idx_prospects_lifecycle_state on prospects (lifecycle_state);
create index if not exists idx_prospects_country on prospects (country);

alter table prospects enable row level security;
