/**
 * Integration suite for upsertOverturePlace() — dedupe, idempotency, and
 * freeze-by-omission, asserted against a real Postgres with migrations
 * 010-013 applied.
 *
 * PRECONDITION: a local Supabase stack, NOT production:
 *   supabase start
 *   supabase db reset   # applies supabase/migrations/*, including 010-013
 *   npx vitest run lib/prospect-upsert.integration.test.ts
 *
 * The client is pointed at the local stack via the env vars set below —
 * the fixed local-dev URL and demo service-role JWT `supabase start` always
 * prints for a fresh local project. These are Supabase's published local-only
 * defaults (see CLI output), not a real secret, and are never valid against
 * a hosted/production project. createServerClient() (lib/supabase.ts) reads
 * them from process.env, so setting them here (before any call) is what
 * "instantiate via createServerClient() pointed at the test DB" means.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase";
import { makeOverturePlace } from "@/tests/fixtures/overture";
import { upsertOverturePlace } from "./prospect-upsert";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const CAMPAIGN_TAG = "test-01-03-integration";

let sb: SupabaseClient;

beforeAll(() => {
  sb = createServerClient();
});

afterEach(async () => {
  // Scoped cleanup — prospect_sources cascades via the FK (migration 011).
  const { error } = await sb.from("prospects").delete().eq("campaign_tag", CAMPAIGN_TAG);
  if (error) throw error;
});

describe("upsertOverturePlace", () => {
  it("IMP-04: two rows, different gersId, same website domain -> 1 prospects row + 2 prospect_sources rows", async () => {
    const a = makeOverturePlace({ websiteUrl: "https://shared-domain.test/a" });
    const b = makeOverturePlace({ websiteUrl: "https://www.shared-domain.test/b" });

    const r1 = await upsertOverturePlace(sb, a, CAMPAIGN_TAG);
    const r2 = await upsertOverturePlace(sb, b, CAMPAIGN_TAG);

    expect(r1.created).toBe(true);
    expect(r2.created).toBe(false);
    expect(r2.prospectId).toBe(r1.prospectId);

    const { data: prospects, error: prospectsError } = await sb
      .from("prospects")
      .select("id")
      .eq("domain", "shared-domain.test");
    if (prospectsError) throw prospectsError;
    expect(prospects).toHaveLength(1);

    const { data: sources, error: sourcesError } = await sb
      .from("prospect_sources")
      .select("id")
      .eq("prospect_id", r1.prospectId);
    if (sourcesError) throw sourcesError;
    expect(sources).toHaveLength(2);
  });

  it("IMP-03: running upsertOverturePlace twice on an unchanged fixture leaves row counts unchanged", async () => {
    const place = makeOverturePlace();

    const r1 = await upsertOverturePlace(sb, place, CAMPAIGN_TAG);
    const r2 = await upsertOverturePlace(sb, place, CAMPAIGN_TAG);

    expect(r1.created).toBe(true);
    expect(r2.created).toBe(false);
    expect(r2.prospectId).toBe(r1.prospectId);

    const { data: prospects, error: prospectsError } = await sb
      .from("prospects")
      .select("id")
      .eq("campaign_tag", CAMPAIGN_TAG);
    if (prospectsError) throw prospectsError;
    expect(prospects).toHaveLength(1);

    const { data: sources, error: sourcesError } = await sb
      .from("prospect_sources")
      .select("id")
      .eq("prospect_id", r1.prospectId);
    if (sourcesError) throw sourcesError;
    expect(sources).toHaveLength(1);
  });

  it("IMP-05: re-import that changes incoming name/address leaves triage_score, lifecycle_state, contact_email untouched", async () => {
    const place = makeOverturePlace();
    const { prospectId } = await upsertOverturePlace(sb, place, CAMPAIGN_TAG);

    const triageScore = { reachable: true, https: true, score: 72 };
    const { error: seedError } = await sb
      .from("prospects")
      .update({
        lifecycle_state: "qualified",
        triage_score: triageScore,
        triage_checked_at: new Date().toISOString(),
        contact_email: "info@shared-domain.test",
      })
      .eq("id", prospectId);
    if (seedError) throw seedError;

    const changed = { ...place, name: "Renamed Business", address: "New Address 99" };
    await upsertOverturePlace(sb, changed, CAMPAIGN_TAG);

    const { data: prospect, error } = await sb
      .from("prospects")
      .select("*")
      .eq("id", prospectId)
      .single();
    if (error) throw error;

    expect(prospect.lifecycle_state).toBe("qualified");
    expect(prospect.triage_score).toEqual(triageScore);
    expect(prospect.contact_email).toBe("info@shared-domain.test");
  });

  it("D-05: a qualified prospect's website_url is frozen; a differing incoming website sets website_url_pending", async () => {
    const place = makeOverturePlace();
    const { prospectId } = await upsertOverturePlace(sb, place, CAMPAIGN_TAG);

    const { error: seedError } = await sb
      .from("prospects")
      .update({ lifecycle_state: "qualified" })
      .eq("id", prospectId);
    if (seedError) throw seedError;

    const changedUrl = { ...place, websiteUrl: "https://a-completely-different-site.test" };
    await upsertOverturePlace(sb, changedUrl, CAMPAIGN_TAG);

    const { data: prospect, error } = await sb
      .from("prospects")
      .select("*")
      .eq("id", prospectId)
      .single();
    if (error) throw error;

    expect(prospect.website_url).toBe(place.websiteUrl);
    expect(prospect.website_url_pending).toBe(changedUrl.websiteUrl);
    expect(prospect.website_url_changed_at).not.toBeNull();
  });

  it("D-13: a non-'new' prospect's country is frozen; a differing incoming country sets country_pending", async () => {
    const place = makeOverturePlace({ country: "NL" });
    const { prospectId } = await upsertOverturePlace(sb, place, CAMPAIGN_TAG);

    const { error: seedError } = await sb
      .from("prospects")
      .update({ lifecycle_state: "qualified" })
      .eq("id", prospectId);
    if (seedError) throw seedError;

    const changedCountry = { ...place, country: "BE" };
    await upsertOverturePlace(sb, changedCountry, CAMPAIGN_TAG);

    const { data: prospect, error } = await sb
      .from("prospects")
      .select("*")
      .eq("id", prospectId)
      .single();
    if (error) throw error;

    expect(prospect.country).toBe("NL");
    expect(prospect.country_pending).toBe("BE");
    expect(prospect.country_changed_at).not.toBeNull();
  });

  it("IMP-07/D-06: rows with no website import with domain NULL and lifecycle_state='no_website'; two such rows never collapse", async () => {
    const a = makeOverturePlace({ websiteUrl: null });
    const b = makeOverturePlace({ websiteUrl: null });

    const r1 = await upsertOverturePlace(sb, a, CAMPAIGN_TAG);
    const r2 = await upsertOverturePlace(sb, b, CAMPAIGN_TAG);

    expect(r1.prospectId).not.toBe(r2.prospectId);

    const { data: p1, error: e1 } = await sb
      .from("prospects")
      .select("*")
      .eq("id", r1.prospectId)
      .single();
    if (e1) throw e1;
    const { data: p2, error: e2 } = await sb
      .from("prospects")
      .select("*")
      .eq("id", r2.prospectId)
      .single();
    if (e2) throw e2;

    expect(p1.domain).toBeNull();
    expect(p1.lifecycle_state).toBe("no_website");
    expect(p2.domain).toBeNull();
    expect(p2.lifecycle_state).toBe("no_website");
  });

  it("D-11 fix: a row whose website resolves to an aggregator domain (tripadvisor.com) imports as no_website with null domain/website_url, and the raw URL survives in prospect_sources", async () => {
    const a = makeOverturePlace({ websiteUrl: "https://www.tripadvisor.com/Restaurant_Review-a" });
    const b = makeOverturePlace({ websiteUrl: "https://www.tripadvisor.com/Restaurant_Review-b" });

    const r1 = await upsertOverturePlace(sb, a, CAMPAIGN_TAG);
    const r2 = await upsertOverturePlace(sb, b, CAMPAIGN_TAG);

    // Two different aggregator listings must never collapse into one
    // prospect — they share tripadvisor.com but are different businesses.
    expect(r1.prospectId).not.toBe(r2.prospectId);

    const { data: prospect, error } = await sb
      .from("prospects")
      .select("*")
      .eq("id", r1.prospectId)
      .single();
    if (error) throw error;

    expect(prospect.domain).toBeNull();
    expect(prospect.website_url).toBeNull();
    expect(prospect.lifecycle_state).toBe("no_website");

    const { data: source, error: sourceError } = await sb
      .from("prospect_sources")
      .select("raw_website_url")
      .eq("overture_gers_id", a.gersId)
      .single();
    if (sourceError) throw sourceError;

    expect(source.raw_website_url).toBe(a.websiteUrl);
  });

  it("D-14: a no_website prospect gaining a website stays no_website with null domain; the URL is recorded as pending", async () => {
    const place = makeOverturePlace({ websiteUrl: null });
    const { prospectId } = await upsertOverturePlace(sb, place, CAMPAIGN_TAG);

    const gainedWebsite = { ...place, websiteUrl: "https://newly-built-site.test" };
    await upsertOverturePlace(sb, gainedWebsite, CAMPAIGN_TAG);

    const { data: prospect, error } = await sb
      .from("prospects")
      .select("*")
      .eq("id", prospectId)
      .single();
    if (error) throw error;

    expect(prospect.lifecycle_state).toBe("no_website");
    expect(prospect.domain).toBeNull();
    expect(prospect.website_url_pending).toBe(gainedWebsite.websiteUrl);
    expect(prospect.website_url_changed_at).not.toBeNull();
  });
});
