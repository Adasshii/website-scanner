-- Add dedicated column for the homepage screenshot URL
-- Extracted from the screenshots JSONB blob for easy access by email templates, reports, and the results page
ALTER TABLE scans ADD COLUMN IF NOT EXISTS homepage_screenshot_url TEXT;
