/**
 * Integration suite for the ENG-06 re-check in lib/bulk-scan-dispatch.ts,
 * asserted against a real Postgres with migration 022 applied. The unit suite
 * stubs the Supabase client, so only this file proves the fresh
 * `prospects` + `prospect_sources` select that dispatch runs is valid against
 * the real schema and embed.
 *
 * PRECONDITION: a local Supabase stack, NOT production (see
 * lib/triage-release.integration.test.ts). This repo's own .env.local points at
 * REMOTE PRODUCTION Supabase, so the env override below keeps this suite local.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase";
import { dispatchClaimedProspects } from "./bulk-scan-dispatch";
import type { ClaimedProspect } from "./scan-queue";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const CAMPAIGN_TAG = "test-09-06-dispatch-recheck";

let sb: SupabaseClient;
let counter = 0;

beforeAll(() => {
  sb = createServerClient();
});

afterEach(async () => {
  const { data, error } = await sb.from("prospects").select("id").eq("campaign_tag", CAMPAIGN_TAG);
  if (error) throw error;
  const ids = (data ?? []).map((p) => p.id as string);
  if (ids.length === 0) return;
  // latest_scan_id references scans, so release it before deleting scans.
  await sb.from("prospects").update({ latest_scan_id: null }).in("id", ids);
  await sb.from("scans").delete().in("prospect_id", ids);
  const { error: deleteError } = await sb.from("prospects").delete().in("id", ids);
  if (deleteError) throw deleteError;
});

/** A released, armed-and-claimed prospect with NO stored marker, as one released before migration 022 is. */
async function seedClaimed(options: {
  websiteUrl?: string;
  address?: string | null;
  confidences?: number[];
  operatingStatus?: string | null;
}): Promise<ClaimedProspect> {
  counter += 1;
  const n = counter;
  const domain = `dispatch-recheck-${n}.test`;
  const websiteUrl = options.websiteUrl ?? `https://${domain}`;
  const { data, error } = await sb
    .from("prospects")
    .insert({
      domain,
      website_url: websiteUrl,
      address: options.address === undefined ? "Kerkstraat 1, Utrecht" : options.address,
      country: "NL",
      campaign_tag: CAMPAIGN_TAG,
      scan_released_at: "2026-01-01T00:00:00.000Z",
      scan_status: "scanning",
      not_scoreable_reason: null,
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
  return { id: data.id as string, domain, website_url: websiteUrl, scan_attempts: 0 };
}

const robotsMissing = vi.fn(async () => ({
  status: 404,
  ok: false,
  headers: { get: () => null },
  body: null,
  async text() {
    return "";
  },
}));

async function dispatch(prospect: ClaimedProspect) {
  const client = { fullScanBulk: vi.fn(async () => ({ accepted: true })) };
  const outcomes = await dispatchClaimedProspects(sb, [prospect], {
    client,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchImpl: robotsMissing as any,
    sleep: async () => {},
    validateUrlSafe: async (url: string) => url,
  });
  return { outcomes, client };
}

describe("dispatchClaimedProspects ENG-06 re-check, against real rows", () => {
  it.each<[string, Parameters<typeof seedClaimed>[0]]>([
    ["no_own_domain", { websiteUrl: "https://www.tripadvisor.com/Hotel_Review-x" }],
    ["no_unique_match", { confidences: [0.5, 0.5] }],
    ["no_location", { address: null }],
    ["permanently_closed", { operatingStatus: "permanently_closed" }],
  ])("refuses a released prospect with no stored marker that fails the rule (%s)", async (_reason, options) => {
    const prospect = await seedClaimed(options);

    const { outcomes, client } = await dispatch(prospect);

    expect(outcomes).toEqual([{ id: prospect.id, dispatched: false, reason: "not_scoreable" }]);
    expect(client.fullScanBulk).toHaveBeenCalledTimes(0);
    const { data } = await sb
      .from("prospects")
      .select("scan_status, scan_status_reason, scan_attempts")
      .eq("id", prospect.id)
      .single();
    expect(data).toEqual({ scan_status: "failed", scan_status_reason: "not_scoreable", scan_attempts: 0 });
    const { data: scans } = await sb.from("scans").select("id").eq("prospect_id", prospect.id);
    expect(scans).toHaveLength(0);
  });

  it("dispatches a released prospect with no stored marker that passes the rule", async () => {
    const prospect = await seedClaimed({});

    const { outcomes, client } = await dispatch(prospect);

    expect(outcomes).toEqual([{ id: prospect.id, dispatched: true }]);
    expect(client.fullScanBulk).toHaveBeenCalledTimes(1);
  });
});
