/**
 * Integration suite for the legal-basis registry (lia_versions +
 * legal_regimes) — asserted against a real Postgres with migration 015
 * applied.
 *
 * PRECONDITION: a local Supabase stack, NOT production:
 *   supabase start
 *   supabase db reset   # applies supabase/migrations/*, including 015 + its seed
 *   npx vitest run "supabase/migrations/015_create_legal_basis.integration.test.ts"
 *
 * The client is pointed at the local stack via the env vars set below —
 * the fixed local-dev URL and demo service-role JWT `supabase start` always
 * prints for a fresh local project. These are Supabase's published local-only
 * defaults (see CLI output), not a real secret, and are never valid against
 * a hosted/production project.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// Test-created rows are scoped to a distinct country_code so cleanup never
// touches the migration's own NL seed row.
const TEST_COUNTRY = "XT";

let sb: SupabaseClient;

beforeAll(() => {
  sb = createServerClient();
});

afterEach(async () => {
  const { error } = await sb.from("legal_regimes").delete().eq("country_code", TEST_COUNTRY);
  if (error) throw error;
});

describe("lia_versions immutability", () => {
  it("immutable: UPDATE on an existing lia_versions row raises a DB error", async () => {
    const { error } = await sb
      .from("lia_versions")
      .update({ content_hash: "tampered" })
      .eq("version", 1);

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/immutable/i);
  });

  it("immutable: DELETE on an existing lia_versions row raises a DB error", async () => {
    const { error } = await sb.from("lia_versions").delete().eq("version", 1);

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/immutable/i);
  });
});

describe("legal_regimes resolution", () => {
  it("CMP-08/16: the seeded NL row resolves to opt-out-narrow-exemption and LIA version 1", async () => {
    const { data: regime, error: regimeError } = await sb
      .from("legal_regimes")
      .select("*")
      .eq("country_code", "NL")
      .single();
    if (regimeError) throw regimeError;

    expect(regime.spam_law_regime).toBe("opt-out-narrow-exemption");
    expect(regime.current_lia_version).toBe(1);

    const { data: lia, error: liaError } = await sb
      .from("lia_versions")
      .select("*")
      .eq("version", 1)
      .single();
    if (liaError) throw liaError;

    expect(lia.content_hash).toBeTruthy();
    expect(lia.content_hash.length).toBeGreaterThan(0);
  });

  it("a new country row inserts as config, no code change required", async () => {
    const { error: insertError } = await sb.from("legal_regimes").insert({
      country_code: TEST_COUNTRY,
      spam_law_regime: "opt-in-required",
      notes_url: "https://example.test/legal-note",
      current_lia_version: 1,
    });
    if (insertError) throw insertError;

    const { data: regime, error } = await sb
      .from("legal_regimes")
      .select("*")
      .eq("country_code", TEST_COUNTRY)
      .single();
    if (error) throw error;

    expect(regime.spam_law_regime).toBe("opt-in-required");
    expect(regime.current_lia_version).toBe(1);
  });
});
