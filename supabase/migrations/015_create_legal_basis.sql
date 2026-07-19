-- Legal-basis registry: a versioned, immutable LIA (Legitimate Interest
-- Assessment) artifact registry plus per-country legal-regime config
-- (CMP-08, CMP-16). This is the mechanism that lets Joshua resolve "which
-- LIA version and which country's regime applies to a prospect" without
-- hardcoding country logic anywhere in the app (D-12).
--
-- lia_versions: one row per LIA artifact version. D-11: the artifact
-- content lives as an immutable file in the repo (docs/legal/lia/LIA-vN.md)
-- — this table is a queryable, hash-verifiable pointer to it, never the
-- content itself. A BEFORE UPDATE OR DELETE trigger enforces immutability
-- at the DB level (Pitfall 6) — a past send's lia_version reference must
-- always point at the exact assessment that applied.
create table if not exists lia_versions (
  version integer primary key,
  effective_from date not null,
  content_hash text not null,
  created_at timestamptz not null default now()
);

-- Immutability trigger: no code path may UPDATE or DELETE a lia_versions
-- row once inserted. A new version is a new row (and a new file), never a
-- mutation of an existing one.
create or replace function prevent_lia_versions_mutation()
returns trigger as $$
begin
  raise exception 'lia_versions rows are immutable; insert a new version instead';
end;
$$ language plpgsql;

create trigger lia_versions_no_update_delete
  before update or delete on lia_versions
  for each row execute function prevent_lia_versions_mutation();

-- legal_regimes: per-country legal-basis config (CMP-16). Adding a country
-- is a data change (an INSERT here), never a code change — app code reads
-- this table, it never branches on country_code. current_lia_version
-- points at the LIA version that applies to this country; a future country
-- could reference a different LIA version with no schema change (D-12).
create table if not exists legal_regimes (
  country_code text primary key,
  spam_law_regime text not null
    check (spam_law_regime in (
      'opt-out-narrow-exemption', 'opt-out-broad-corporate-exemption', 'opt-in-required'
    )),
  notes_url text,
  current_lia_version integer not null references lia_versions(version),
  created_at timestamptz not null default now()
);

-- Seed: LIA v1 (docs/legal/lia/LIA-v1.md), content_hash = sha256 of that
-- file at commit time (verifies the on-disk artifact was not tampered).
insert into lia_versions (version, effective_from, content_hash)
values (1, '2026-07-20', '40e38eb16cce8aeca969c17393549040f47ffd5089903e981a387c63d8914ea9')
on conflict do nothing;

-- Seed: NL regime, per LEGAL.md's Telecommunicatiewet art. 11.7 analysis —
-- opt-out regime with a narrow published-address exemption.
insert into legal_regimes (country_code, spam_law_regime, notes_url, current_lia_version)
values ('NL', 'opt-out-narrow-exemption', '.planning/research/LEGAL.md', 1)
on conflict do nothing;

-- RLS-enable-no-policy convention (migration 010, 014) — service-role
-- only, anon gets zero access. Do not add a policy.
alter table lia_versions enable row level security;
alter table legal_regimes enable row level security;
