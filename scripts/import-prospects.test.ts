/**
 * CLI arg-validation and dry-run/--limit behavior for scripts/import-prospects.ts.
 *
 * DB-free and Overture-free by design: queryOverturePlaces/upsertOverturePlace/
 * createServerClient are all stubbed via the ImportDeps seam. validateUrlSafe
 * is stubbed too, EXCEPT in the private-IP test, which uses the real
 * implementation to prove the SSRF-safe gate is actually wired in (T-01-06).
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeOverturePlace } from "@/tests/fixtures/overture";
import type { ScoreabilityRefreshResult } from "@/lib/scoreability-refresh";
import { INSTALLERS_PROFILE } from "@/lib/niche-profile";
import { resolveBbox } from "@/lib/overture-bboxes";
import { validateUrlSafe } from "@/lib/url-validation.server";
import {
  ImportArgsError,
  parseImportArgs,
  pickRandomSample,
  runCli,
  runImport,
  type ImportArgs,
  type ImportDeps,
} from "./import-prospects";

const fakeSupabase = {} as SupabaseClient;

const EMPTY_REFRESH: ScoreabilityRefreshResult = {
  considered: 0,
  scoreable: 0,
  byReason: { no_own_domain: 0, no_unique_match: 0, no_location: 0, permanently_closed: 0 },
};

function makeDeps(overrides?: Partial<ImportDeps>): ImportDeps {
  return {
    queryOverturePlaces: vi.fn(async () => []),
    upsertOverturePlace: vi.fn(async () => ({ prospectId: "fixture-id", created: true })),
    createServerClient: vi.fn(() => fakeSupabase),
    validateUrlSafe: vi.fn(async (url: string) => url),
    fetchReachability: vi.fn(async () => ({ ok: true, status: 200 })),
    refreshScoreability: vi.fn(async () => EMPTY_REFRESH),
    ...overrides,
  };
}

const baseArgs: ImportArgs = {
  country: "NL",
  region: "NH",
  category: "cafe",
  dryRun: false,
  campaignTag: null,
};

describe("parseImportArgs", () => {
  it("rejects a run missing --country, --region, or --category", () => {
    expect(() => parseImportArgs(["--region=NH", "--category=cafe"])).toThrow(ImportArgsError);
    expect(() => parseImportArgs(["--country=NL", "--category=cafe"])).toThrow(ImportArgsError);
    expect(() => parseImportArgs(["--country=NL", "--region=NH"])).toThrow(ImportArgsError);
    expect(() => parseImportArgs([])).toThrow(ImportArgsError);
  });

  it("parses required and optional flags", () => {
    const args = parseImportArgs([
      "--country=NL",
      "--region=NH",
      "--category=cafe",
      "--dry-run",
      "--limit=5",
      "--campaign-tag=wave-1",
    ]);
    expect(args).toEqual({
      country: "NL",
      region: "NH",
      category: "cafe",
      dryRun: true,
      limit: 5,
      campaignTag: "wave-1",
    });
  });

  it("defaults dryRun to false and campaignTag to null when omitted", () => {
    const args = parseImportArgs(["--country=NL", "--region=NH", "--category=cafe"]);
    expect(args.dryRun).toBe(false);
    expect(args.campaignTag).toBeNull();
    expect(args.limit).toBeUndefined();
  });

  it("rejects a non-positive --limit", () => {
    expect(() =>
      parseImportArgs(["--country=NL", "--region=NH", "--category=cafe", "--limit=0"])
    ).toThrow(ImportArgsError);
    expect(() =>
      parseImportArgs(["--country=NL", "--region=NH", "--category=cafe", "--limit=abc"])
    ).toThrow(ImportArgsError);
  });
});

/** A random source that returns the given values in order, then throws if asked for another. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error("random source drawn more times than expected");
    return values[i++];
  };
}

const PROFILE_REGIONS = INSTALLERS_PROFILE.regions;
const PROFILE_CATEGORIES = INSTALLERS_PROFILE.overtureCategories;

describe("parseImportArgs — random category and region (D-9-11, NIC-04)", () => {
  it("--category=random resolves to an exact member of the profile's category list", () => {
    const first = parseImportArgs(["--country=NL", "--region=NH", "--category=random"], sequence(0));
    const last = parseImportArgs(["--country=NL", "--region=NH", "--category=random"], sequence(0.999999));

    expect(first.category).toBe(PROFILE_CATEGORIES[0]);
    expect(last.category).toBe(PROFILE_CATEGORIES[PROFILE_CATEGORIES.length - 1]);
  });

  it("--region=random resolves to an exact member of the profile's region list", () => {
    const first = parseImportArgs(["--country=NL", "--region=random", "--category=cafe"], sequence(0));
    const last = parseImportArgs(["--country=NL", "--region=random", "--category=cafe"], sequence(0.999999));

    expect(first.region).toBe(PROFILE_REGIONS[0]);
    expect(last.region).toBe(PROFILE_REGIONS[PROFILE_REGIONS.length - 1]);
  });

  it("both flags random at once draws the region first, then the category, and returns concrete values", () => {
    const args = parseImportArgs(
      ["--country=NL", "--region=random", "--category=random"],
      sequence(0, 0.999999)
    );

    expect(args.region).toBe(PROFILE_REGIONS[0]);
    expect(args.category).toBe(PROFILE_CATEGORIES[PROFILE_CATEGORIES.length - 1]);
    expect(args.region).not.toBe("random");
    expect(args.category).not.toBe("random");
  });

  it("explicit values pass through byte-identical and never draw from the random source", () => {
    const never = () => {
      throw new Error("random source must not be drawn for explicit values");
    };

    const args = parseImportArgs(
      ["--country=NL", "--region=Noord-Holland", "--category=roofing", "--limit=3"],
      never
    );

    expect(args).toEqual({
      country: "NL",
      region: "Noord-Holland",
      category: "roofing",
      dryRun: false,
      limit: 3,
      campaignTag: null,
    });
  });

  it("random is a value, not a way to omit a flag: each missing flag still raises with random on the other", () => {
    expect(() => parseImportArgs(["--country=NL", "--region=random"], sequence(0))).toThrow(
      ImportArgsError
    );
    expect(() => parseImportArgs(["--country=NL", "--category=random"], sequence(0))).toThrow(
      ImportArgsError
    );
    expect(() => parseImportArgs(["--region=random", "--category=random"], sequence(0, 0))).toThrow(
      ImportArgsError
    );
  });

  it("a random source that returns exactly 1 still resolves to a list member, never undefined", () => {
    const args = parseImportArgs(["--country=NL", "--region=random", "--category=random"], sequence(1, 1));

    expect(PROFILE_REGIONS).toContain(args.region);
    expect(PROFILE_CATEGORIES).toContain(args.category);
  });

  it("refuses a random region for a country other than the profile's, instead of crashing later in resolveBbox", () => {
    expect(() =>
      parseImportArgs(["--country=BE", "--region=random", "--category=roofing"], sequence(0))
    ).toThrow(ImportArgsError);
  });

  it("every region in the profile's list resolves through resolveBbox without throwing", () => {
    expect(PROFILE_REGIONS.length).toBeGreaterThan(0);
    for (const region of PROFILE_REGIONS) {
      expect(() => resolveBbox(INSTALLERS_PROFILE.country, region), region).not.toThrow();
    }
  });

  it("the usage text names random as an accepted value for both flags", () => {
    let message = "";
    try {
      parseImportArgs([]);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/--region=<region\|random>/);
    expect(message).toMatch(/--category=<category\|random>/);
  });

  it("runCli hands the injected random source to the parser and queries Overture with the sampled values", async () => {
    const queryOverturePlaces = vi.fn(async () => []);
    const deps = makeDeps({ queryOverturePlaces, random: sequence(0, 0) });

    await runCli(["--country=NL", "--region=random", "--category=random", "--dry-run"], deps);

    expect(queryOverturePlaces).toHaveBeenCalledWith(
      expect.objectContaining({
        country: "NL",
        region: PROFILE_REGIONS[0],
        category: PROFILE_CATEGORIES[0],
      })
    );
  });
});

describe("runCli — missing filter has zero DB/Overture side effects (D-10)", () => {
  it("throws before queryOverturePlaces, createServerClient, or upsertOverturePlace are ever called", async () => {
    const deps = makeDeps();
    await expect(runCli(["--region=NH", "--category=cafe"], deps)).rejects.toThrow(
      ImportArgsError
    );
    expect(deps.queryOverturePlaces).not.toHaveBeenCalled();
    expect(deps.createServerClient).not.toHaveBeenCalled();
    expect(deps.upsertOverturePlace).not.toHaveBeenCalled();
  });
});

describe("pickRandomSample", () => {
  it("returns all rows when the dataset is at or below the 20-row floor", () => {
    const rows = Array.from({ length: 15 }, (_, i) => i);
    expect(pickRandomSample(rows)).toHaveLength(15);
  });

  it("caps the sample at 30 rows for a large dataset", () => {
    const rows = Array.from({ length: 200 }, (_, i) => i);
    expect(pickRandomSample(rows)).toHaveLength(30);
  });

  it("returns between 20 and 30 rows for a mid-size dataset", () => {
    const rows = Array.from({ length: 25 }, (_, i) => i);
    const sample = pickRandomSample(rows);
    expect(sample.length).toBeGreaterThanOrEqual(20);
    expect(sample.length).toBeLessThanOrEqual(30);
  });
});

describe("runImport — --dry-run", () => {
  it("makes zero upsertOverturePlace / createServerClient calls and samples up to 20-30 rows", async () => {
    const rows = Array.from({ length: 25 }, () => makeOverturePlace());
    const deps = makeDeps({ queryOverturePlaces: vi.fn(async () => rows) });

    const result = await runImport({ ...baseArgs, dryRun: true }, deps);

    expect(deps.upsertOverturePlace).not.toHaveBeenCalled();
    expect(deps.createServerClient).not.toHaveBeenCalled();
    expect(result.dryRun).toBe(true);
    expect(result.totalRows).toBe(25);
    expect(result.created).toBe(0);
    expect(result.collapsed).toBe(0);
  });

  it("does not run the marker refresh, because the refresh writes (D-9-17)", async () => {
    const deps = makeDeps({ queryOverturePlaces: vi.fn(async () => [makeOverturePlace()]) });

    await runImport({ ...baseArgs, dryRun: true }, deps);

    expect(deps.refreshScoreability).not.toHaveBeenCalled();
  });

  it("counts has-domain vs no-website after normalizeDomain", async () => {
    const rows = [
      makeOverturePlace({ websiteUrl: "https://real-business.test" }),
      makeOverturePlace({ websiteUrl: null }),
    ];
    const deps = makeDeps({ queryOverturePlaces: vi.fn(async () => rows) });

    const result = await runImport({ ...baseArgs, dryRun: true }, deps);

    expect(result.hasDomainCount).toBe(1);
    expect(result.noWebsiteCount).toBe(1);
  });

  it("a private-IP-class fixture URL (localhost) is reported blocked via the real validateUrlSafe, never fetched", async () => {
    const blockedRow = makeOverturePlace({ websiteUrl: "http://localhost/" });
    const deps = makeDeps({
      queryOverturePlaces: vi.fn(async () => [blockedRow]),
      // The REAL implementation — proves the reachability check is actually
      // routed through validateUrlSafe(), not a bare fetch() on raw input.
      validateUrlSafe,
    });

    await runImport({ ...baseArgs, dryRun: true }, deps);

    // validateUrlSafe rejects "localhost" synchronously (BLOCKED_HOSTNAMES) —
    // fetchReachability must never be reached for this row.
    expect(deps.fetchReachability).not.toHaveBeenCalled();
  });

  it("D-11 fix: an aggregator-domain row (tripadvisor.com) is labeled 'aggregator', counts as no-website, and is never fetched", async () => {
    const aggregatorRow = makeOverturePlace({
      websiteUrl: "https://www.tripadvisor.com/Restaurant_Review-x",
    });
    const deps = makeDeps({ queryOverturePlaces: vi.fn(async () => [aggregatorRow]) });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await runImport({ ...baseArgs, dryRun: true }, deps);

    expect(result.hasDomainCount).toBe(0);
    expect(result.noWebsiteCount).toBe(1);
    // Aggregator check short-circuits before validateUrlSafe/fetchReachability —
    // an Overture-listed directory link is never fetched at all.
    expect(deps.validateUrlSafe).not.toHaveBeenCalled();
    expect(deps.fetchReachability).not.toHaveBeenCalled();
    const sampleLines = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(sampleLines).toContain("aggregator");

    logSpy.mockRestore();
  });
});

describe("runImport — marker refresh (D-9-17)", () => {
  it("runs the refresh once, with the run's client, after every upsert has been attempted", async () => {
    const order: string[] = [];
    const rows = [makeOverturePlace(), makeOverturePlace()];
    const deps = makeDeps({
      queryOverturePlaces: vi.fn(async () => rows),
      upsertOverturePlace: vi.fn(async () => {
        order.push("upsert");
        return { prospectId: "ok-id", created: true };
      }),
      refreshScoreability: vi.fn(async () => {
        order.push("refresh");
        return EMPTY_REFRESH;
      }),
    });

    await runImport({ ...baseArgs, dryRun: false }, deps);

    expect(deps.refreshScoreability).toHaveBeenCalledTimes(1);
    expect(deps.refreshScoreability).toHaveBeenCalledWith(fakeSupabase);
    expect(order).toEqual(["upsert", "upsert", "refresh"]);
  });
});

describe("runImport — --limit caps a real (writing) run", () => {
  it("--limit 5 with 20 fixture rows caps upsertOverturePlace at 5 calls", async () => {
    const rows = Array.from({ length: 20 }, () => makeOverturePlace());
    const deps = makeDeps({ queryOverturePlaces: vi.fn(async () => rows) });

    const result = await runImport({ ...baseArgs, dryRun: false, limit: 5 }, deps);

    expect(deps.upsertOverturePlace).toHaveBeenCalledTimes(5);
    expect(result.created + result.collapsed).toBe(5);
    expect(result.skipped).toBe(0);
  });

  it("a bad row is logged and skipped, not fatal (IMP-07 / T-01-07)", async () => {
    const rows = [makeOverturePlace(), makeOverturePlace(), makeOverturePlace()];
    const deps = makeDeps({
      queryOverturePlaces: vi.fn(async () => rows),
      upsertOverturePlace: vi
        .fn()
        .mockRejectedValueOnce(new Error("malformed row"))
        .mockResolvedValue({ prospectId: "ok-id", created: true }),
    });

    const result = await runImport({ ...baseArgs, dryRun: false }, deps);

    expect(deps.upsertOverturePlace).toHaveBeenCalledTimes(3);
    expect(result.skipped).toBe(1);
    expect(result.created).toBe(2);
  });
});
