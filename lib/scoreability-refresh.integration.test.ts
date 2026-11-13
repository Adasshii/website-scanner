/**
 * Integration suite for lib/scoreability-refresh.ts (ENG-06, D-9-17): the
 * persisted explanation of why a business was dropped, asserted against a real
 * Postgres with migration 022 applied.
 *
 * PRECONDITION: a local Supabase stack, NOT production (see
 * lib/triage-release.integration.test.ts for the same setup). This repo's own
 * .env.local points at REMOTE PRODUCTION Supabase, so the env override below is
 * what keeps this suite on the local stack.
 *
 * refreshScoreability reads EVERY un-released prospect, not just this file's
 * fixtures, so assertions about a fixture read that fixture's row, and the
 * count assertions compare the returned counts against a tally taken from the
 * database after the call.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase";
import type { ScoreableFailureReason } from "@/lib/triage-eligibility";
import { refreshScoreability } from "./scoreability-refresh";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const CAMPAIGN_TAG = "test-09-06-scoreability-refresh";

let sb: SupabaseClient;
let counter = 0;

beforeAll(() => {
  sb = createServerClient();
});

afterEach(async () => {
  // prospect_sources cascades from prospects.
  const { error } = await sb.from("prospects").delete().eq("campaign_tag", CAMPAIGN_TAG);
  if (error) throw error;
});

interface SeedOptions {
  websiteUrl?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** One prospect_sources row per entry. Default: a single 0.9 match. */
  confidences?: number[];
  operatingStatus?: string | null;
  scanReleasedAt?: string | null;
  notScoreableReason?: ScoreableFailureReason | null;
  scoreableCheckedAt?: string | null;
}

/** A scoreable prospect by default; each case overrides only the field it is about. */
async function seed(options: SeedOptions = {}): Promise<string> {
  counter += 1;
  const n = counter;
  const domain = `refresh-${n}-${CAMPAIGN_TAG}.test`;
  const { data, error } = await sb
    .from("prospects")
    .insert({
      domain,
      website_url: options.websiteUrl === undefined ? `https://${domain}` : options.websiteUrl,
      address: options.address === undefined ? "Kerkstraat 1, Utrecht" : options.address,
      latitude: options.latitude ?? null,
      longitude: options.longitude ?? null,
      country: "NL",
      campaign_tag: CAMPAIGN_TAG,
      scan_released_at: options.scanReleasedAt ?? null,
      not_scoreable_reason: options.notScoreableReason ?? null,
      scoreable_checked_at: options.scoreableCheckedAt ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const confidences = options.confidences ?? [0.9];
  if (confidences.length > 0) {
    const { error: sourceError } = await sb.from("prospect_sources").insert(
      confidences.map((raw_confidence, i) => ({
        prospect_id: data.id,
        overture_gers_id: `${CAMPAIGN_TAG}-${n}-${i}`,
        raw_confidence,
        raw_operating_status: options.operatingStatus ?? null,
      }))
    );
    if (sourceError) throw sourceError;
  }
  return data.id as string;
}

async function readMarker(id: string) {
  const { data, error } = await sb
    .from("prospects")
    .select("not_scoreable_reason, scoreable_checked_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as { not_scoreable_reason: string | null; scoreable_checked_at: string | null };
}

describe("refreshScoreability", () => {
  it("writes no_own_domain and a checked-at timestamp for a prospect whose website is an aggregator listing", async () => {
    const id = await seed({ websiteUrl: "https://www.tripadvisor.com/Hotel_Review-g1-d2-Reviews-Acme.html" });

    await refreshScoreability(sb);

    const marker = await readMarker(id);
    expect(marker.not_scoreable_reason).toBe("no_own_domain");
    expect(marker.scoreable_checked_at).not.toBeNull();
  });

  it("writes null and a checked-at timestamp for a fully scoreable prospect", async () => {
    const id = await seed();

    await refreshScoreability(sb);

    const marker = await readMarker(id);
    expect(marker.not_scoreable_reason).toBeNull();
    expect(marker.scoreable_checked_at).not.toBeNull();
  });

  it("clears a stale reason once the prospect has become scoreable", async () => {
    const id = await seed({
      notScoreableReason: "no_unique_match",
      scoreableCheckedAt: "2026-01-01T00:00:00.000Z",
    });

    await refreshScoreability(sb);

    const marker = await readMarker(id);
    expect(marker.not_scoreable_reason).toBeNull();
    expect(new Date(marker.scoreable_checked_at as string).getTime()).toBeGreaterThan(
      new Date("2026-01-01T00:00:00.000Z").getTime()
    );
  });

  it.each<[ScoreableFailureReason, SeedOptions]>([
    ["no_own_domain", { websiteUrl: null }],
    ["no_unique_match", { confidences: [0.5, 0.5] }],
    ["no_location", { address: null }],
    ["permanently_closed", { operatingStatus: "permanently_closed" }],
  ])("persists the verdict's reason %s verbatim, so the CHECK constraint accepts every value the rule can return", async (reason, options) => {
    const id = await seed(options);

    await refreshScoreability(sb);

    expect((await readMarker(id)).not_scoreable_reason).toBe(reason);
  });

  it("leaves an already-released prospect byte-identical, both the reason and the checked-at timestamp", async () => {
    // Its row would read no_own_domain if it were refreshed, so an untouched
    // marker proves the refresh skipped it rather than agreeing with it.
    const id = await seed({
      websiteUrl: "https://www.facebook.com/acme",
      scanReleasedAt: "2026-02-01T00:00:00.000Z",
      notScoreableReason: "no_location",
      scoreableCheckedAt: "2026-02-02T00:00:00.000Z",
    });
    const before = await readMarker(id);

    await refreshScoreability(sb);

    const after = await readMarker(id);
    expect(after).toEqual(before);
    expect(after.not_scoreable_reason).toBe("no_location");
  });

  it("returns a count per reason plus a scoreable count that sums to the rows considered, and matches the database", async () => {
    await seed({ websiteUrl: null });
    await seed({ confidences: [0.5, 0.5] });
    await seed({ address: null });
    await seed({ operatingStatus: "permanently_closed" });
    await seed();
    await seed({ scanReleasedAt: "2026-02-01T00:00:00.000Z", websiteUrl: null });

    const result = await refreshScoreability(sb);

    const reasonTotal = Object.values(result.byReason).reduce((sum, n) => sum + n, 0);
    expect(reasonTotal + result.scoreable).toBe(result.considered);

    const { data, error } = await sb
      .from("prospects")
      .select("not_scoreable_reason")
      .is("scan_released_at", null);
    if (error) throw error;
    const tally = { scoreable: 0, no_own_domain: 0, no_unique_match: 0, no_location: 0, permanently_closed: 0 };
    for (const row of data ?? []) {
      const reason = row.not_scoreable_reason as ScoreableFailureReason | null;
      if (reason === null) tally.scoreable += 1;
      else tally[reason] += 1;
    }
    expect(result.considered).toBe(data?.length);
    expect(result.scoreable).toBe(tally.scoreable);
    expect(result.byReason).toEqual({
      no_own_domain: tally.no_own_domain,
      no_unique_match: tally.no_unique_match,
      no_location: tally.no_location,
      permanently_closed: tally.permanently_closed,
    });
  });

  it("is idempotent: a second call with no data change keeps every reason and only moves the timestamp", async () => {
    const failing = await seed({ websiteUrl: null });
    const passing = await seed();

    await refreshScoreability(sb);
    const first = { failing: await readMarker(failing), passing: await readMarker(passing) };
    await refreshScoreability(sb);
    const second = { failing: await readMarker(failing), passing: await readMarker(passing) };

    expect(second.failing.not_scoreable_reason).toBe(first.failing.not_scoreable_reason);
    expect(second.passing.not_scoreable_reason).toBe(first.passing.not_scoreable_reason);
    expect(new Date(second.failing.scoreable_checked_at as string).getTime()).toBeGreaterThan(
      new Date(first.failing.scoreable_checked_at as string).getTime()
    );
  });
});
