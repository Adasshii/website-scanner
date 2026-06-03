-- Store AI-generated scan content in BOTH languages at scan time
-- so the language toggle works on already-completed reports without
-- requiring a re-scan.
--
-- Primary-locale content stays in the existing columns (executive
-- summary in summary.verdict, visitor_experience, cost_estimate,
-- quick_wins, website_personality, and pages[].issues[]).
-- The OTHER-language version is mirrored into the two columns below.
--
-- Both columns are nullable so legacy scans (created before this
-- change) keep working as-is; the render layer falls back to the
-- primary content and shows a "re-scan in {language}" affordance.

ALTER TABLE scans
  ADD COLUMN IF NOT EXISTS ai_content_alt jsonb,
  ADD COLUMN IF NOT EXISTS issues_alt jsonb;
