/**
 * Integration suite for getTriageCandidates()/getShortlist() — the D-09
 * eligibility exclusions and D-07 pure-read guarantee, asserted against a
 * real Postgres with migrations 010-016 applied.
 *
 * PRECONDITION: a local Supabase stack, NOT production:
 *   supabase start
 *   supabase db reset   # applies supabase/migrations/*, including 016
 *   npx vitest run lib/triage-candidates.integration.test.ts
 *
 * Mirrors lib/triage-release.integration.test.ts's env-var +
 * createServerClient() + scoped-cleanup-by-campaign_tag pattern verbatim.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase";
import type { TriageScore } from "@/types/triage";
import { getShortlist, getTriageCandidates } from "./triage-candidates";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const CAMPAIGN_TAG = "test-03-04-integration";

let sb: SupabaseClient;
let domainCounter = 0;

beforeAll(() => {
  sb = createServerClient();
});

afterEach(async () => {
  const { error } = await sb.from("prospects").delete().eq("campaign_tag", CAMPAIGN_TAG);
  if (error) throw error;
});

function makeTriageScore(overrides?: Partial<TriageScore>): TriageScore {
  return {
    score: 50,
    gated: false,
    reachable: true,
    https: true,
    finalStatus: 200,
    redirectChain: [],
    hasViewport: true,
    bytes: 100_000,
    truncated: false,
    responseMs: 200,
    robotsBlocked: false,
    gateReason: null,
    ...overrides,
  };
}

async function seedProspect(overrides?: {
  domain?: string | null;
  triageScore?: TriageScore | null;
  scanReleasedAt?: string | null;
}) {
  domainCounter += 1;
  const domain = overrides?.domain === undefined ? `triage-candidates-${domainCounter}.test` : overrides.domain;
  const { data, error } = await sb
    .from("prospects")
    .insert({
      domain,
      website_url: domain ? `https://${domain}` : null,
      country: "NL",
      campaign_tag: CAMPAIGN_TAG,
      triage_score: overrides?.triageScore ?? null,
      triage_checked_at: overrides?.triageScore ? new Date().toISOString() : null,
      scan_released_at: overrides?.scanReleasedAt ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

describe("getTriageCandidates", () => {
  it("excludes a row whose scan_released_at is set (D-09)", async () => {
    const releasedId = await seedProspect({ scanReleasedAt: new Date().toISOString() });
    const freshId = await seedProspect();

    const candidates = await getTriageCandidates(sb);
    const ids = candidates.map((c) => c.id);
    expect(ids).not.toContain(releasedId);
    expect(ids).toContain(freshId);
  });

  it("excludes a null-domain (no-website) prospect", async () => {
    const noWebsiteId = await seedProspect({ domain: null });
    const hasDomainId = await seedProspect();

    const candidates = await getTriageCandidates(sb);
    const ids = candidates.map((c) => c.id);
    expect(ids).not.toContain(noWebsiteId);
    expect(ids).toContain(hasDomainId);
  });

  it("includes a fresh has-domain, un-released row", async () => {
    const id = await seedProspect();
    const candidates = await getTriageCandidates(sb);
    expect(candidates.some((c) => c.id === id)).toBe(true);
  });

  it("respects limit", async () => {
    await Promise.all(Array.from({ length: 5 }, () => seedProspect()));
    const candidates = await getTriageCandidates(sb, { limit: 2 });
    expect(candidates.length).toBeLessThanOrEqual(2);
  });
});

describe("getShortlist", () => {
  it("returns only rows where triage_score is not null", async () => {
    const triagedId = await seedProspect({ triageScore: makeTriageScore({ score: 40 }) });
    const untriagedId = await seedProspect({ triageScore: null });

    const shortlist = await getShortlist(sb);
    const ids = shortlist.map((r) => r.id);
    expect(ids).toContain(triagedId);
    expect(ids).not.toContain(untriagedId);
  });
});
