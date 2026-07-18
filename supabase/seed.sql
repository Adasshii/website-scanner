-- Local-dev-only seed, applied automatically by `supabase db reset`.
-- Never pushed to remote/production (seed.sql is not part of the migration
-- history `supabase db push` applies).
--
-- This repo has no supabase/config.toml / prior local-dev history, so a fresh
-- `supabase start` + `supabase db reset` does not carry the default-privilege
-- grants a Supabase-provisioned project normally gets automatically. Without
-- this, every table (including pre-existing ones like `scans`) fails with
-- "permission denied for table X" for anon/authenticated/service_role, since
-- RLS being enabled is a separate layer from these base GRANTs. This makes
-- local integration testing possible without touching any versioned
-- migration or affecting the already-live production schema.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to anon, authenticated, service_role;
