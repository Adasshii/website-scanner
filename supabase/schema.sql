-- Adashi Website Scanner — Database Schema

-- Scans table
CREATE TABLE IF NOT EXISTS scans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  domain TEXT NOT NULL,
  url TEXT NOT NULL,
  email TEXT,
  quick_scan_result JSONB,
  full_scan_result JSONB,
  score INTEGER,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'scanning', 'quick_done', 'processing', 'complete', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  domain TEXT NOT NULL,
  scan_id UUID REFERENCES scans(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'scanner',
  gdpr_consent BOOLEAN DEFAULT TRUE,
  consent_timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_scans_domain ON scans(domain);
CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);
CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_domain ON leads(domain);

-- Auto-update updated_at on scans
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scans_updated_at ON scans;
CREATE TRIGGER scans_updated_at
  BEFORE UPDATE ON scans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Anon users can only read scans by ID (for the report page)
CREATE POLICY "Allow anon read scans by id" ON scans
  FOR SELECT USING (true);

-- No anon access to leads table
-- (All lead operations go through service role key in API routes)
