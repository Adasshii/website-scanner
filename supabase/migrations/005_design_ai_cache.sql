-- Design AI analysis cache columns
-- Stores Gemini Vision result per scan, indexed by domain + analyzed_at for 24h cache lookups

ALTER TABLE scans ADD COLUMN IF NOT EXISTS design_ai_analysis JSONB DEFAULT NULL;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS design_ai_analyzed_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_scans_design_ai ON scans (domain, design_ai_analyzed_at);
