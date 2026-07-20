-- Release marker: the single Phase 3 -> Phase 4 state change (D-08). Triage
-- (this phase) only ever writes triage_score/triage_checked_at; it never
-- touches lifecycle_state (D-07: eligibility is a pure query). Release is
-- the one deliberate mutation: NULL means not yet released to the scan
-- queue; a set timestamp means released, and is permanently excluded from
-- every future release (D-06) and from future re-triage (D-09). Phase 4
-- owns the actual scan queue and drains prospects marked here.
alter table prospects add column if not exists scan_released_at timestamptz;

-- Speeds the "not yet released" eligibility filter used by the release
-- query's worst-N select (partial index, mirrors the convention already
-- used in migrations 010/014 for domain-uniqueness and active-suppression
-- lookups).
create index if not exists idx_prospects_scan_released_at_null
  on prospects (scan_released_at) where scan_released_at is null;

-- RLS already enabled on prospects (migration 010) — not re-enabled here,
-- and no new policy added (service-role-only convention, migration 014).
