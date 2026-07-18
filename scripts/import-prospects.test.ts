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

function makeDeps(overrides?: Partial<ImportDeps>): ImportDeps {
  return {
    queryOverturePlaces: vi.fn(async () => []),
    upsertOverturePlace: vi.fn(async () => ({ prospectId: "fixture-id", created: true })),
    createServerClient: vi.fn(() => fakeSupabase),
    validateUrlSafe: vi.fn(async (url: string) => url),
    fetchReachability: vi.fn(async () => ({ ok: true, status: 200 })),
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
