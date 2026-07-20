/**
 * CLI arg-validation and dry-run/--limit/--cutoff behavior for
 * scripts/triage-prospects.ts.
 *
 * DB-free and network-free by design: getTriageCandidates/fetchTriageSignals/
 * computeTriageScore/createServerClient/validateUrlSafe are all stubbed via
 * the TriageDeps seam.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TriageCandidate } from "@/lib/triage-candidates";
import type { TriageSignals } from "@/types/triage";
import {
  TriageArgsError,
  parseTriageArgs,
  runCli,
  runTriage,
  type TriageArgs,
  type TriageDeps,
} from "./triage-prospects";

const fakeSupabase = {} as SupabaseClient;

function makeCandidate(overrides?: Partial<TriageCandidate>): TriageCandidate {
  return {
    id: "prospect-1",
    domain: "example.test",
    website_url: "https://example.test",
    ...overrides,
  };
}

function makeSignals(overrides?: Partial<TriageSignals>): TriageSignals {
  return {
    reachable: true,
    https: true,
    finalStatus: 200,
    redirectChain: [{ url: "https://example.test", status: 200 }],
    hasViewport: true,
    bytes: 100_000,
    truncated: false,
    responseMs: 200,
    robotsBlocked: false,
    gateReason: null,
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<TriageDeps>): TriageDeps {
  return {
    getTriageCandidates: vi.fn(async () => [makeCandidate()]),
    validateUrlSafe: vi.fn(async (url: string) => url),
    fetchTriageSignals: vi.fn(async () => makeSignals()),
    computeTriageScore: vi.fn((signals) => ({ ...signals, score: 80, gated: false })),
    createServerClient: vi.fn(() => fakeSupabase),
    ...overrides,
  };
}

const baseArgs: TriageArgs = { dryRun: false, cutoff: 60 };

describe("parseTriageArgs", () => {
  it("defaults dryRun to false, limit to undefined, cutoff to DEFAULT_CUTOFF", () => {
    const args = parseTriageArgs([]);
    expect(args.dryRun).toBe(false);
    expect(args.limit).toBeUndefined();
    expect(args.cutoff).toBe(60);
  });

  it("parses --dry-run, --limit, --cutoff", () => {
    const args = parseTriageArgs(["--dry-run", "--limit=5", "--cutoff=40"]);
    expect(args).toEqual({ dryRun: true, limit: 5, cutoff: 40 });
  });

  it("rejects a non-positive --limit", () => {
    expect(() => parseTriageArgs(["--limit=0"])).toThrow(TriageArgsError);
    expect(() => parseTriageArgs(["--limit=abc"])).toThrow(TriageArgsError);
  });

  it("rejects a --cutoff outside 0-100", () => {
    expect(() => parseTriageArgs(["--cutoff=-1"])).toThrow(TriageArgsError);
    expect(() => parseTriageArgs(["--cutoff=101"])).toThrow(TriageArgsError);
    expect(() => parseTriageArgs(["--cutoff=abc"])).toThrow(TriageArgsError);
  });
});

describe("runCli — invalid args have zero DB/network side effects", () => {
  it("throws before createServerClient or getTriageCandidates are ever called", async () => {
    const deps = makeDeps();
    await expect(runCli(["--limit=abc"], deps)).rejects.toThrow(TriageArgsError);
    expect(deps.createServerClient).not.toHaveBeenCalled();
    expect(deps.getTriageCandidates).not.toHaveBeenCalled();
  });
});

describe("runTriage — --dry-run", () => {
  it("performs zero DB writes while still producing a summary", async () => {
    const updateMock = vi.fn();
    const fakeSb = {
      from: vi.fn(() => ({ update: updateMock })),
    } as unknown as SupabaseClient;
    const deps = makeDeps({ createServerClient: vi.fn(() => fakeSb) });

    const result = await runTriage({ ...baseArgs, dryRun: true }, deps);

    expect(updateMock).not.toHaveBeenCalled();
    expect(result.dryRun).toBe(true);
    expect(result.triaged).toBe(1);
    expect(result.totalRows).toBe(1);
  });
});

describe("runTriage — writes on a real (non-dry-run) pass", () => {
  it("persists via .update(...).eq('id', ...) for each triaged prospect", async () => {
    const eqMock = vi.fn(async () => ({ error: null }));
    const updateMock = vi.fn((_payload: Record<string, unknown>) => ({ eq: eqMock }));
    const fakeSb = {
      from: vi.fn(() => ({ update: updateMock })),
    } as unknown as SupabaseClient;
    const deps = makeDeps({ createServerClient: vi.fn(() => fakeSb) });

    const result = await runTriage(baseArgs, deps);

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toMatchObject({ triage_score: expect.any(Object) });
    expect(eqMock).toHaveBeenCalledWith("id", "prospect-1");
    expect(result.triaged).toBe(1);
  });

  it("counts clear-the-cutoff and unreachable correctly", async () => {
    const eqMock = vi.fn(async () => ({ error: null }));
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    const fakeSb = { from: vi.fn(() => ({ update: updateMock })) } as unknown as SupabaseClient;
    const deps = makeDeps({
      createServerClient: vi.fn(() => fakeSb),
      getTriageCandidates: vi.fn(async () => [
        makeCandidate({ id: "p1" }),
        makeCandidate({ id: "p2" }),
      ]),
      fetchTriageSignals: vi
        .fn()
        .mockResolvedValueOnce(makeSignals())
        .mockResolvedValueOnce(makeSignals({ reachable: false, https: false })),
      computeTriageScore: vi
        .fn()
        .mockReturnValueOnce({ ...makeSignals(), score: 30, gated: false })
        .mockReturnValueOnce({ ...makeSignals({ reachable: false, https: false }), score: 100, gated: true }),
    });

    const result = await runTriage({ ...baseArgs, cutoff: 60 }, deps);

    expect(result.triaged).toBe(2);
    expect(result.clearsCutoff).toBe(2); // p1 score 30 <= 60; p2 gated
    expect(result.unreachable).toBe(1); // p2 not reachable
  });

  it("a bad prospect is logged and skipped, not fatal", async () => {
    const eqMock = vi.fn(async () => ({ error: null }));
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    const fakeSb = { from: vi.fn(() => ({ update: updateMock })) } as unknown as SupabaseClient;
    const deps = makeDeps({
      createServerClient: vi.fn(() => fakeSb),
      getTriageCandidates: vi.fn(async () => [
        makeCandidate({ id: "p1" }),
        makeCandidate({ id: "p2" }),
      ]),
      fetchTriageSignals: vi
        .fn()
        .mockRejectedValueOnce(new Error("network blew up"))
        .mockResolvedValueOnce(makeSignals()),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runTriage(baseArgs, deps);

    expect(result.skipped).toBe(1);
    expect(result.triaged).toBe(1);
    expect(updateMock).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });

  it("--limit is passed through to getTriageCandidates", async () => {
    const eqMock = vi.fn(async () => ({ error: null }));
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    const fakeSb = { from: vi.fn(() => ({ update: updateMock })) } as unknown as SupabaseClient;
    const deps = makeDeps({ createServerClient: vi.fn(() => fakeSb) });

    await runTriage({ ...baseArgs, limit: 5 }, deps);

    expect(deps.getTriageCandidates).toHaveBeenCalledWith(fakeSb, { limit: 5 });
  });
});
