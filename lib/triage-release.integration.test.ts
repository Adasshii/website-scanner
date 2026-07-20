/**
 * Integration suite for selectWorstN()/releaseWorstN() — the TRI-08/TRI-09
 * ceiling-independent-of-cutoff invariants, asserted against a real
 * Postgres with migrations 010-016 applied.
 *
 * PRECONDITION: a local Supabase stack, NOT production:
 *   supabase start
 *   supabase db reset   # applies supabase/migrations/*, including 016
 *   npx vitest run lib/triage-release.integration.test.ts
 *
 * Mirrors lib/prospect-upsert.integration.test.ts's env-var +
 * createServerClient() + scoped-cleanup-by-campaign_tag pattern verbatim.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase";
import type { TriageScore } from "@/types/triage";
import { releaseWorstN, selectWorstN } from "./triage-release";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const CAMPAIGN_TAG = "test-03-03-integration";

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

async function seedTriaged(overrides?: {
  score?: number;
  gated?: boolean;
  scanReleasedAt?: string | null;
}) {
  domainCounter += 1;
  const { data, error } = await sb
    .from("prospects")
    .insert({
      domain: `triage-release-${domainCounter}.test`,
      country: "NL",
      campaign_tag: CAMPAIGN_TAG,
      triage_score: makeTriageScore({
        score: overrides?.score ?? 50,
        gated: overrides?.gated ?? false,
      }),
      triage_checked_at: new Date().toISOString(),
      scan_released_at: overrides?.scanReleasedAt ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

describe("releaseWorstN / selectWorstN", () => {
  it("TRI-09: releases at most `ceiling` prospects even with a maximally permissive cutoff (ceiling-never-exceeded)", async () => {
    await Promise.all(Array.from({ length: 30 }, () => seedTriaged({ score: 90, gated: false })));

    const released = await releaseWorstN(sb, { cutoff: 100, ceiling: 20 });
    expect(released.length).toBe(20);

    const { count, error } = await sb
      .from("prospects")
      .select("id", { count: "exact", head: true })
      .eq("campaign_tag", CAMPAIGN_TAG)
      .not("scan_released_at", "is", null);
    if (error) throw error;
    expect(count).toBe(20);
  });

  it("releases the N lowest-scoring eligible prospects, not an arbitrary subset (worst-N correctness)", async () => {
    for (const score of [10, 20, 5, 80, 45]) {
      await seedTriaged({ score, gated: false });
    }

    const released = await releaseWorstN(sb, { cutoff: 50, ceiling: 2 });
    expect(released.map((r) => r.triage_score.score).sort((a, b) => a - b)).toEqual([5, 10]);
  });

  it("TRI-08: cutoff changes the eligible set", async () => {
    await seedTriaged({ score: 30, gated: false }); // below cutoff — eligible
    await seedTriaged({ score: 70, gated: false }); // above cutoff — ineligible

    const eligible = await selectWorstN(sb, { cutoff: 50, ceiling: 20 });
    const eligibleFromThisTest = eligible.filter((r) => r.triage_score.score === 30 || r.triage_score.score === 70);
    expect(eligibleFromThisTest.map((r) => r.triage_score.score)).toEqual([30]);
  });

  it("gated prospects are always eligible regardless of cutoff", async () => {
    await seedTriaged({ score: 95, gated: true }); // gated, score well above cutoff

    const eligible = await selectWorstN(sb, { cutoff: 10, ceiling: 20 });
    expect(eligible.some((r) => r.triage_score.gated && r.triage_score.score === 95)).toBe(true);
  });

  it("D-06: already-released prospects are never re-selected (excluded on a second release)", async () => {
    const releasedId = await seedTriaged({ score: 10, gated: false, scanReleasedAt: new Date().toISOString() });
    await seedTriaged({ score: 20, gated: false });

    const released = await releaseWorstN(sb, { cutoff: 100, ceiling: 20 });
    expect(released.some((r) => r.id === releasedId)).toBe(false);
    expect(released.some((r) => r.triage_score.score === 20)).toBe(true);
  });

  it("a run with zero eligible prospects releases nothing and errors on nothing", async () => {
    await seedTriaged({ score: 95, gated: false }); // above cutoff, not gated — ineligible

    const released = await releaseWorstN(sb, { cutoff: 10, ceiling: 20 });
    expect(released).toEqual([]);
  });
});
