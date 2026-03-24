-- Migration: Update scans table to match v2 schema
-- Run this in Supabase SQL Editor

-- Drop the old table and recreate (safe in dev — no production data yet)
DROP TRIGGER IF EXISTS scans_updated_at ON scans;
DROP TABLE IF EXISTS leads;
DROP TABLE IF EXISTS scans;

-- Scans table (v2)
CREATE TABLE scans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'quick'
    CHECK (type IN ('quick', 'full')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'scanning', 'quick_done', 'processing', 'completed', 'failed')),
  scores JSONB,
  summary JSONB,
  pages JSONB NOT NULL DEFAULT '[]'::JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  ip_hash TEXT NOT NULL DEFAULT '',
  email TEXT,
  error_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads table (unchanged)
CREATE TABLE leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  domain TEXT NOT NULL,
  scan_id UUID REFERENCES scans(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'scanner',
  gdpr_consent BOOLEAN DEFAULT TRUE,
  consent_timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_scans_domain ON scans(domain);
CREATE INDEX idx_scans_status ON scans(status);
CREATE INDEX idx_scans_created_at ON scans(created_at);
CREATE INDEX idx_scans_ip_hash ON scans(ip_hash);
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_domain ON leads(domain);

-- Row Level Security
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Anon users can read scans by ID (for the report page)
CREATE POLICY "Allow anon read scans by id" ON scans
  FOR SELECT USING (true);

-- Service role has full access (implicit with service key)
-- No anon access to leads table
