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

/**
 * Seeds a prospect that is releasable AND scoreable by default (ENG-06): an
 * own-domain website, a street address, and exactly one Overture source above
 * the confidence limit. A case that is about the scoreable rule overrides only
 * the field it is about; every other case is unaffected by the rule.
 */
async function seedTriaged(overrides?: {
  score?: number;
  gated?: boolean;
  scanReleasedAt?: string | null;
  category?: string | null;
  reachable?: boolean;
  https?: boolean;
  /** One prospect_sources row per entry. Default: a single 0.9 match. */
  confidences?: number[];
  operatingStatus?: string | null;
  address?: string | null;
}) {
  domainCounter += 1;
  // Captured before the first await: callers seed in parallel with Promise.all,
  // so reading the shared counter after an await would hand every fixture the
  // same value and collide on prospect_sources.overture_gers_id (unique).
  const n = domainCounter;
  const domain = `triage-release-${n}.test`;
  const { data, error } = await sb
    .from("prospects")
    .insert({
      domain,
      website_url: `https://${domain}`,
      address: overrides?.address === undefined ? "Kerkstraat 1, Utrecht" : overrides.address,
      country: "NL",
      campaign_tag: CAMPAIGN_TAG,
      category: overrides?.category ?? null,
      triage_score: makeTriageScore({
        score: overrides?.score ?? 50,
        gated: overrides?.gated ?? false,
        reachable: overrides?.reachable ?? true,
        https: overrides?.https ?? true,
      }),
      triage_checked_at: new Date().toISOString(),
      scan_released_at: overrides?.scanReleasedAt ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const confidences = overrides?.confidences ?? [0.9];
  if (confidences.length > 0) {
    const { error: sourceError } = await sb.from("prospect_sources").insert(
      confidences.map((raw_confidence, i) => ({
        prospect_id: data.id,
        overture_gers_id: `${CAMPAIGN_TAG}-${n}-${i}`,
        raw_confidence,
        raw_operating_status: overrides?.operatingStatus ?? null,
      }))
    );
    if (sourceError) throw sourceError;
  }
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

  it("D-4.1-01: a reachable, below-cutoff, excluded-category prospect is NOT returned", async () => {
    const excludedId = await seedTriaged({ score: 10, category: "restaurant" });
    const eligibleId = await seedTriaged({ score: 20, category: null });

    const eligible = await selectWorstN(sb, { cutoff: 50, ceiling: 20 });
    expect(eligible.some((r) => r.id === excludedId)).toBe(false);
    expect(eligible.some((r) => r.id === eligibleId)).toBe(true);
  });

  it("D-4.1-03: an unreachable prospect below cutoff is NOT returned even though gated===true", async () => {
    const unreachableId = await seedTriaged({
      score: 5,
      gated: true,
      reachable: false,
      https: false,
    });

    const eligible = await selectWorstN(sb, { cutoff: 50, ceiling: 20 });
    expect(eligible.some((r) => r.id === unreachableId)).toBe(false);
  });

  it("D-4.1-04: a reachable no-HTTPS prospect is returned and sorts ahead of a non-gated eligible prospect", async () => {
    const noHttpsId = await seedTriaged({
      score: 90, // above cutoff — only eligible via the no-HTTPS fast-track
      gated: true,
      reachable: true,
      https: false,
    });
    const nonGatedId = await seedTriaged({ score: 20, gated: false, reachable: true, https: true });

    const eligible = await selectWorstN(sb, { cutoff: 50, ceiling: 20 });
    const noHttpsIdx = eligible.findIndex((r) => r.id === noHttpsId);
    const nonGatedIdx = eligible.findIndex((r) => r.id === nonGatedId);
    expect(noHttpsIdx).toBeGreaterThanOrEqual(0);
    expect(nonGatedIdx).toBeGreaterThanOrEqual(0);
    expect(noHttpsIdx).toBeLessThan(nonGatedIdx);
  });

  it("a null-category reachable prospect below cutoff IS returned (null is not excluded)", async () => {
    const id = await seedTriaged({ score: 20, category: null });

    const eligible = await selectWorstN(sb, { cutoff: 50, ceiling: 20 });
    expect(eligible.some((r) => r.id === id)).toBe(true);
  });
});

describe("ENG-06: the scoreable rule inside the single releasability predicate", () => {
  it("a not-scoreable prospect is absent from selectWorstN while an otherwise identical scoreable one is present", async () => {
    const scoreableId = await seedTriaged({ score: 20, confidences: [0.9] });
    const noMatchId = await seedTriaged({ score: 20, confidences: [] }); // zero matches: no_unique_match

    const eligible = await selectWorstN(sb, { cutoff: 50, ceiling: 20 });
    expect(eligible.some((r) => r.id === scoreableId)).toBe(true);
    expect(eligible.some((r) => r.id === noMatchId)).toBe(false);
  });

  it("a prospect whose only match is below the confidence limit is never released, even when gated", async () => {
    const weakId = await seedTriaged({ score: 95, gated: true, https: false, confidences: [0.3] });

    const released = await releaseWorstN(sb, { cutoff: 100, ceiling: 20 });
    expect(released.some((r) => r.id === weakId)).toBe(false);

    const { data, error } = await sb.from("prospects").select("scan_released_at").eq("id", weakId).single();
    if (error) throw error;
    expect(data.scan_released_at).toBeNull();
  });

  it("a prospect whose only match is permanently closed is not returned", async () => {
    const closedId = await seedTriaged({ score: 20, operatingStatus: "permanently_closed" });
    const openId = await seedTriaged({ score: 20, operatingStatus: "open" });

    const eligible = await selectWorstN(sb, { cutoff: 50, ceiling: 20 });
    expect(eligible.some((r) => r.id === closedId)).toBe(false);
    expect(eligible.some((r) => r.id === openId)).toBe(true);
  });
});
