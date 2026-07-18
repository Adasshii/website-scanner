-- Add prospect_id to scans as a nullable FK linking a scan to the prospect
-- it was run for. Existing inbound-flow scans (the public scanner) leave
-- this column NULL forever; the Phase 4 scan dispatcher sets it when it
-- queues a scan for a prospect. Fully additive and re-runnable: no existing
-- row is read or written by this migration.
ALTER TABLE scans ADD COLUMN IF NOT EXISTS prospect_id uuid REFERENCES prospects(id);

CREATE INDEX IF NOT EXISTS idx_scans_prospect_id ON scans (prospect_id) WHERE prospect_id IS NOT NULL;

-- Reciprocal FK: prospects.latest_scan_id -> scans.id. Added here, not in
-- 010, because scans must already exist for this reference to resolve —
-- avoids a forward-reference ordering problem within a single migration.
ALTER TABLE prospects
  ADD CONSTRAINT prospects_latest_scan_id_fkey
  FOREIGN KEY (latest_scan_id) REFERENCES scans(id);
