-- Add locale persistence for i18n (EN / NL).
-- Stored at scan submission time from the NEXT_LOCALE cookie so that
-- async follow-ups, emails, and shared report links honor the original
-- visitor language even after the cookie is gone.

ALTER TABLE scans
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en';

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en';

-- Restrict to supported locales. Add new entries here as we expand.
ALTER TABLE scans
  DROP CONSTRAINT IF EXISTS scans_locale_check;
ALTER TABLE scans
  ADD CONSTRAINT scans_locale_check CHECK (locale IN ('en', 'nl'));

ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_locale_check;
ALTER TABLE leads
  ADD CONSTRAINT leads_locale_check CHECK (locale IN ('en', 'nl'));
