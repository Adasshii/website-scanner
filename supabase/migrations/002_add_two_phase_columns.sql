-- Migration 002: Add two-phase scan support
-- Adds email capture, error tracking, and expanded status flow

-- Add email column (nullable — populated when user submits email for full report)
ALTER TABLE scans ADD COLUMN IF NOT EXISTS email text;

-- Add error message column for better debugging
ALTER TABLE scans ADD COLUMN IF NOT EXISTS error_message text;

-- Add updated_at for tracking last modification
ALTER TABLE scans ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Expand status check to support two-phase scanning:
--   pending → scanning → quick_done → processing → completed | failed (at any step)
ALTER TABLE scans DROP CONSTRAINT IF EXISTS scans_status_check;
ALTER TABLE scans ADD CONSTRAINT scans_status_check
  CHECK (status IN ('pending', 'scanning', 'quick_done', 'processing', 'completed', 'failed'));

-- Index for status polling
CREATE INDEX IF NOT EXISTS idx_scans_status ON scans (status) WHERE status IN ('scanning', 'processing');
