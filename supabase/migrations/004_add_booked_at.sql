-- Migration: Add booked_at to leads table for Fillout appointment tracking
-- Feature 5: Follow-up emails skip leads who have booked an appointment

ALTER TABLE leads ADD COLUMN IF NOT EXISTS booked_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_booked_at ON leads(booked_at);
