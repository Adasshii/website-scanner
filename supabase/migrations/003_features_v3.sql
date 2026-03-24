-- Migration: Add columns for screenshots, AI analysis, sales brief, and email tracking
-- Features: Screenshots (F1), Cost Estimate (F2), Quick Wins (F3), Website Personality (F4),
--           Email Tracking (F6), Sales Brief (F8)

-- ── New columns on scans table ─────────────────────────────────────

ALTER TABLE scans ADD COLUMN IF NOT EXISTS screenshots JSONB DEFAULT NULL;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS cost_estimate JSONB DEFAULT NULL;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS quick_wins JSONB DEFAULT NULL;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS website_personality TEXT DEFAULT NULL;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS sales_brief TEXT DEFAULT NULL;

-- ── Email events table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID REFERENCES scans(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  email_type TEXT NOT NULL
    CHECK (email_type IN ('confirmation', 'report_ready', 'follow_up', 'admin_notification')),
  resend_email_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed')),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_events_scan_id ON email_events(scan_id);
CREATE INDEX IF NOT EXISTS idx_email_events_resend_id ON email_events(resend_email_id);
CREATE INDEX IF NOT EXISTS idx_email_events_type_status ON email_events(email_type, status);

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

-- Service role only — no anon access to email events
-- (Service role bypasses RLS by default, so no explicit policy needed)
