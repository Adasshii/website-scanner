/**
 * The three seams the scanner route and page scanner call (plan 09-09,
 * D-9-12, D-9-R6): validateNicheSlice, collectOwnSiteHarvest and
 * storeOwnSiteFacts. Root Vitest tree for the same reason as
 * lib/own-site-aggregate.test.ts.
 *
 * Absence is asserted by stub call count, never by inspecting a result: a
 * result-based assertion would pass even if the work ran and its output was
 * discarded, and "ran and discarded" is still browser time and a failure
 * surface on the revenue-earning public path.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OWN_SITE_WRITE_TIMEOUT_MS,
  SLICE_LIMITS,
  collectOwnSiteHarvest,
  storeOwnSiteFacts,
  validateNicheSlice,
} from "../scanner-service/src/own-site-run";
import { INSTALLERS_PROFILE, toScannerSlice } from "./niche-profile";
import type { NicheScanSlice } from "../types/niche-scan-slice";
import type { OwnSiteFacts, OwnSiteHarvestOutcome } from "../types/own-site";

function flat(value: unknown): string {
  return JSON.stringify(value);
}

type Trade = NicheScanSlice["trades"][number];

function trade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: "t",
    terms: [{ term: "term", match: "word" }],
    tieBreakRank: 1,
    checks: { quoteTerms: ["q"], projectTerms: ["p"], certificationTerms: ["c"] },
    ...overrides,
  };
}

function slice(overrides: Partial<NicheScanSlice> = {}): NicheScanSlice {
  return {
    nicheId: "test",
    trades: [trade()],
    reviewWidgetHosts: ["host.test"],
    minTradeScore: 8,
    dominanceRatio: 1.5,
    ...overrides,
  };
}

const many = (n: number, make: (i: number) => string = (i) => `s${i}`): string[] => Array.from({ length: n }, (_, i) => make(i));
const terms = (n: number): Trade["terms"] => many(n).map((term) => ({ term, match: "word" as const }));

function rejected(raw: unknown): string {
  const result = validateNicheSlice(raw);
  if (result.ok) throw new Error("expected the slice to be rejected");
  return result.reason;
}

describe("validateNicheSlice: absent and well-formed", () => {
  it("an absent slice is valid and means no own-site work", () => {
    for (const raw of [undefined, null]) {
      const result = validateNicheSlice(raw);
      expect(result.ok).toBe(true);
      if (result.ok) expect(String(result.slice)).toBe("null");
    }
  });

  it("the real seeded profile slice passes unchanged and sits well under the byte cap", () => {
    const real = toScannerSlice(INSTALLERS_PROFILE);
    const result = validateNicheSlice(JSON.parse(JSON.stringify(real)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(flat(result.slice)).toBe(flat(real));
    expect(Buffer.byteLength(JSON.stringify(real), "utf8")).toBeLessThan(SLICE_LIMITS.serialisedBytes / 4);
  });

  it("states the four limits the plan fixes", () => {
    expect(SLICE_LIMITS.trades).toBe(12);
    expect(SLICE_LIMITS.termsPerList).toBe(60);
    expect(SLICE_LIMITS.stringChars).toBe(80);
    expect(SLICE_LIMITS.serialisedBytes).toBe(20480);
  });

  it("accepts a value exactly at each cap", () => {
    const atCaps = slice({
      nicheId: "n".repeat(80),
      trades: Array.from({ length: 12 }, (_, i) =>
        trade({
          id: `t${i}`,
          terms: [{ term: "x".repeat(80), match: "prefix" }],
          checks: { quoteTerms: many(60, () => "q"), projectTerms: [], certificationTerms: [] },
        })
      ),
      reviewWidgetHosts: many(60),
    });
    expect(Buffer.byteLength(JSON.stringify(atCaps), "utf8")).toBeLessThan(SLICE_LIMITS.serialisedBytes);
    expect(validateNicheSlice(atCaps).ok).toBe(true);
    expect(validateNicheSlice(slice({ trades: [trade({ terms: terms(60) })] })).ok).toBe(true);
  });

  it("rebuilds the slice field by field: a key the engine does not know never reaches it", () => {
    const smuggled = {
      ...slice(),
      copy: "prospect-facing words",
      trades: [{ ...trade(), jobValue: 4200, copy: "more words" }],
    };
    const result = validateNicheSlice(smuggled);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const text = flat(result.slice);
      expect(text.includes("prospect-facing")).toBe(false);
      expect(text.includes("jobValue")).toBe(false);
      expect(text.includes("more words")).toBe(false);
    }
  });
});

describe("validateNicheSlice: every cap, with an input that exceeds it (T-9-18)", () => {
  it("rejects more than 12 trades", () => {
    const reason = rejected(slice({ trades: Array.from({ length: 13 }, (_, i) => trade({ id: `t${i}` })) }));
    expect(reason).toContain("trades is over 12 entries");
  });

  it("rejects more than 60 keyword terms on a trade", () => {
    const reason = rejected(slice({ trades: [trade({ terms: terms(61) })] }));
    expect(reason).toContain("trades[0].terms is over 60 entries");
  });

  it("rejects more than 60 entries in each of the three check lists and in the review hosts", () => {
    const quote = rejected(slice({ trades: [trade({ checks: { quoteTerms: many(61), projectTerms: [], certificationTerms: [] } })] }));
    const project = rejected(slice({ trades: [trade({ checks: { quoteTerms: [], projectTerms: many(61), certificationTerms: [] } })] }));
    const cert = rejected(slice({ trades: [trade({ checks: { quoteTerms: [], projectTerms: [], certificationTerms: many(61) } })] }));
    const hosts = rejected(slice({ reviewWidgetHosts: many(61) }));
    expect(quote).toContain("checks.quoteTerms is over 60");
    expect(project).toContain("checks.projectTerms is over 60");
    expect(cert).toContain("checks.certificationTerms is over 60");
    expect(hosts).toContain("reviewWidgetHosts is over 60");
  });

  it("rejects a string over 80 characters wherever one appears", () => {
    const long = "x".repeat(81);
    expect(rejected(slice({ nicheId: long }))).toContain("nicheId is over 80 characters");
    expect(rejected(slice({ trades: [trade({ id: long })] }))).toContain("trades[0].id is over 80 characters");
    expect(rejected(slice({ trades: [trade({ terms: [{ term: long, match: "word" }] })] }))).toContain("terms[0].term is over 80 characters");
    expect(rejected(slice({ trades: [trade({ checks: { quoteTerms: [long], projectTerms: [], certificationTerms: [] } })] }))).toContain(
      "checks.quoteTerms[0] is over 80 characters"
    );
    expect(rejected(slice({ reviewWidgetHosts: [long] }))).toContain("reviewWidgetHosts[0] is over 80 characters");
  });

  it("rejects a slice over 20KB serialised even when every individual cap is respected", () => {
    const heavy = slice({
      trades: Array.from({ length: 12 }, (_, i) =>
        trade({ id: `t${i}`, terms: many(60, (j) => `${"y".repeat(76)}${String(j).padStart(2, "0")}`).map((term) => ({ term, match: "word" as const })) })
      ),
    });
    const bytes = Buffer.byteLength(JSON.stringify(heavy), "utf8");
    expect(bytes).toBeGreaterThan(SLICE_LIMITS.serialisedBytes);
    expect(rejected(heavy)).toContain("over 20480 bytes serialised");
  });

  it("the byte cap is inclusive: exactly 20480 bytes passes and 20481 is rejected", () => {
    // Build a slice that respects every other cap, then trim one filler string to land on the exact size.
    const sizeOf = (s: NicheScanSlice) => Buffer.byteLength(JSON.stringify(s), "utf8");
    const withFiller = (fillerLength: number): NicheScanSlice => {
      const hosts = many(60, () => "h".repeat(80));
      const lists = { quoteTerms: many(60, () => "q".repeat(80)), projectTerms: many(60, () => "p".repeat(80)), certificationTerms: many(60, () => "c".repeat(80)) };
      return slice({
        trades: [trade({ terms: terms(13), checks: lists })],
        reviewWidgetHosts: [...hosts.slice(0, 59), "f".repeat(fillerLength)],
      });
    };
    const at = (n: number) => withFiller(n);
    let length = 1;
    while (sizeOf(at(length)) < SLICE_LIMITS.serialisedBytes && length < 80) length++;
    expect(sizeOf(at(length))).toBe(SLICE_LIMITS.serialisedBytes);
    expect(validateNicheSlice(at(length)).ok).toBe(true);
    expect(sizeOf(at(length + 1))).toBe(SLICE_LIMITS.serialisedBytes + 1);
    expect(rejected(at(length + 1))).toContain("bytes serialised");
  });

  it("measures the serialised size in bytes, not characters", () => {
    // 300 strings of 40 two-byte characters: under 20KB counted as characters, over it counted as bytes.
    const wide = "é".repeat(40);
    const heavy = slice({
      trades: [
        trade({
          terms: many(60, () => wide).map((term) => ({ term, match: "word" as const })),
          checks: { quoteTerms: many(60, () => wide), projectTerms: many(60, () => wide), certificationTerms: many(60, () => wide) },
        }),
      ],
      reviewWidgetHosts: many(60, () => wide),
    });
    const text = JSON.stringify(heavy);
    expect(text.length).toBeLessThan(SLICE_LIMITS.serialisedBytes);
    expect(Buffer.byteLength(text, "utf8")).toBeGreaterThan(SLICE_LIMITS.serialisedBytes);
    expect(rejected(heavy)).toContain("bytes serialised");
  });
});

describe("validateNicheSlice: malformed input is a rejection, never an exception", () => {
  it("rejects a value that is not an object", () => {
    for (const raw of ["a string", 42, true, [], [slice()]]) {
      expect(validateNicheSlice(raw).ok, flat(raw)).toBe(false);
    }
  });

  it("rejects each missing or mistyped member", () => {
    const base = slice();
    const cases: Array<[string, unknown]> = [
      ["trades is not a list", { ...base, trades: "no" }],
      ["trades[0] is not an object", { ...base, trades: ["no"] }],
      ["trades[0].checks is not an object", { ...base, trades: [{ ...trade(), checks: null }] }],
      ["trades[0].terms is not a list", { ...base, trades: [{ ...trade(), terms: "no" }] }],
      ["trades[0].terms[0] is not an object", { ...base, trades: [{ ...trade(), terms: ["no"] }] }],
      ["trades[0].terms[0].match is not a known mode", { ...base, trades: [trade({ terms: [{ term: "a", match: "regex" as never }] })] }],
      ["trades[0].id is not a string", { ...base, trades: [{ ...trade(), id: 7 }] }],
      ["trades[0].tieBreakRank is not a finite number", { ...base, trades: [{ ...trade(), tieBreakRank: "1" }] }],
      ["minTradeScore is not a finite number", { ...base, minTradeScore: Number.POSITIVE_INFINITY }],
      ["dominanceRatio is not a finite number", { ...base, dominanceRatio: null }],
      ["nicheId is not a string", { ...base, nicheId: undefined }],
      ["reviewWidgetHosts is not a list", { ...base, reviewWidgetHosts: undefined }],
    ];
    for (const [expected, raw] of cases) {
      expect(rejected(raw), expected).toContain(expected);
    }
  });

  it("accepts each of the three match modes and no other", () => {
    for (const match of ["substring", "prefix", "word"] as const) {
      expect(validateNicheSlice(slice({ trades: [trade({ terms: [{ term: "a", match }] })] })).ok, match).toBe(true);
    }
  });

  it("names the field and the limit and never echoes the offending content", () => {
    const secret = "SECRET-PAYLOAD-".padEnd(120, "z");
    const reason = rejected(slice({ trades: [trade({ terms: [{ term: secret, match: "word" }] })] }));
    expect(reason.includes("SECRET-PAYLOAD")).toBe(false);
    expect(reason).toContain("trades[0].terms[0].term");
  });

  it("an object that throws when read is a rejection, not an exception", () => {
    const hostile = {
      get trades(): unknown {
        throw new Error("boom");
      },
    };
    const result = validateNicheSlice(hostile);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("nicheSlice could not be read");
  });
});

describe("collectOwnSiteHarvest: the per-page hook", () => {
  const PAGE = { id: "page" };
  const OUTCOME: OwnSiteHarvestOutcome = { state: "unreadable" };

  it("with no slice, never calls the harvester and answers null", async () => {
    const harvest = vi.fn(async () => OUTCOME);
    for (const none of [undefined, null]) {
      const outcome = await collectOwnSiteHarvest(PAGE, none, harvest);
      expect(String(outcome)).toBe("null");
    }
    expect(harvest).toHaveBeenCalledTimes(0);
  });

  it("with a slice, hands the page and the slice to the harvester and returns its outcome", async () => {
    const given = slice();
    const harvest = vi.fn<(page: typeof PAGE, slice: NicheScanSlice) => Promise<OwnSiteHarvestOutcome | null>>(
      async () => ({ state: "unreadable" })
    );
    const outcome = await collectOwnSiteHarvest(PAGE, given, harvest);
    expect(harvest).toHaveBeenCalledTimes(1);
    expect(harvest.mock.calls[0][0]).toBe(PAGE);
    expect(harvest.mock.calls[0][1]).toBe(given);
    expect(outcome?.state).toBe("unreadable");
  });

  it("a harvester that throws costs this page's harvest and nothing else", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const harvest = vi.fn(async () => {
      throw new Error("evaluate blew up");
    });
    const outcome = await collectOwnSiteHarvest(PAGE, slice(), harvest);
    expect(outcome?.state).toBe("unreadable");
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain("evaluate blew up");
    error.mockRestore();
  });
});

describe("storeOwnSiteFacts: the second, separately caught update", () => {
  const FACTS = { schemaVersion: 1 } as unknown as OwnSiteFacts;
  const OUTCOMES: OwnSiteHarvestOutcome[] = [{ state: "unreadable" }];

  afterEach(() => {
    vi.useRealTimers();
  });

  function deps(overrides: Partial<Parameters<typeof storeOwnSiteFacts>[1]> = {}) {
    const log = vi.fn();
    const aggregate = vi.fn(() => FACTS);
    const write = vi.fn(async () => ({ error: null }));
    return { aggregate, write, log, deps: { aggregate, write, log, now: () => "2026-11-14T10:00:00.000Z", ...overrides } };
  }

  it("with no slice, calls neither the aggregator nor the write and answers skipped", async () => {
    const d = deps();
    const result = await storeOwnSiteFacts({ scanId: "s1", slice: undefined, outcomes: OUTCOMES }, d.deps);
    expect(result).toBe("skipped");
    expect(d.aggregate).toHaveBeenCalledTimes(0);
    expect(d.write).toHaveBeenCalledTimes(0);
    expect(d.log).toHaveBeenCalledTimes(0);
    const viaNull = await storeOwnSiteFacts({ scanId: "s1", slice: null, outcomes: OUTCOMES }, d.deps);
    expect(viaNull).toBe("skipped");
    expect(d.aggregate).toHaveBeenCalledTimes(0);
    expect(d.write).toHaveBeenCalledTimes(0);
  });

  it("a request with no slice performs no own-site work at all: harvest, aggregate and the second update are each called zero times", async () => {
    const harvest = vi.fn(async () => OUTCOMES[0]);
    const d = deps();
    const outcome = await collectOwnSiteHarvest({}, undefined, harvest);
    const stored = await storeOwnSiteFacts({ scanId: "s1", slice: undefined, outcomes: [outcome] }, d.deps);
    expect(stored).toBe("skipped");
    expect(harvest).toHaveBeenCalledTimes(0);
    expect(d.aggregate).toHaveBeenCalledTimes(0);
    expect(d.write).toHaveBeenCalledTimes(0);
  });

  it("with a slice, aggregates once with the outcomes, the slice and the injected time, and writes once to that scan", async () => {
    const d = deps();
    const given = slice();
    const result = await storeOwnSiteFacts({ scanId: "scan-42", slice: given, outcomes: OUTCOMES }, d.deps);
    expect(result).toBe("stored");
    expect(d.aggregate).toHaveBeenCalledTimes(1);
    const [outcomes, usedSlice, meta] = d.aggregate.mock.calls[0] as unknown as [unknown, unknown, { readAt: string }];
    expect(outcomes).toBe(OUTCOMES);
    expect(usedSlice).toBe(given);
    expect(meta.readAt).toBe("2026-11-14T10:00:00.000Z");
    expect(d.write).toHaveBeenCalledTimes(1);
    const [scanId, facts] = d.write.mock.calls[0] as unknown as [string, unknown];
    expect(scanId).toBe("scan-42");
    expect(facts).toBe(FACTS);
    expect(d.log).toHaveBeenCalledTimes(0);
  });

  it("an aggregator that throws is logged, issues no write, and does not throw (the callback is still reached)", async () => {
    const d = deps({
      aggregate: vi.fn(() => {
        throw new Error("aggregate exploded");
      }),
    });
    const result = await storeOwnSiteFacts({ scanId: "s1", slice: slice(), outcomes: OUTCOMES }, d.deps);
    expect(result).toBe("failed");
    expect(d.write).toHaveBeenCalledTimes(0);
    expect(d.log).toHaveBeenCalledTimes(1);
    expect(String(d.log.mock.calls[0][0])).toContain("aggregate exploded");
  });

  it("a write that returns an error (a column the migration has not created yet) is logged and does not throw", async () => {
    const d = deps({ write: vi.fn(async () => ({ error: { message: 'column "own_site_facts" of relation "scans" does not exist' } })) });
    const result = await storeOwnSiteFacts({ scanId: "s1", slice: slice(), outcomes: OUTCOMES }, d.deps);
    expect(result).toBe("failed");
    expect(d.log).toHaveBeenCalledTimes(1);
    const line = String(d.log.mock.calls[0][0]);
    expect(line).toContain("own_site_facts");
    expect(line).toContain("does not exist");
    expect(line).toContain("scan s1");
  });

  it("a write that rejects, or throws before returning a promise, is logged and does not throw", async () => {
    const rejects = deps({ write: vi.fn(async () => Promise.reject(new Error("network down"))) });
    expect(await storeOwnSiteFacts({ scanId: "s1", slice: slice(), outcomes: OUTCOMES }, rejects.deps)).toBe("failed");
    expect(String(rejects.log.mock.calls[0][0])).toContain("network down");
    const throws = deps({
      write: vi.fn(() => {
        throw new Error("sync failure");
      }),
    });
    expect(await storeOwnSiteFacts({ scanId: "s1", slice: slice(), outcomes: OUTCOMES }, throws.deps)).toBe("failed");
    expect(String(throws.log.mock.calls[0][0])).toContain("sync failure");
  });

  it("a write that never settles is abandoned at the deadline so the report callback is not held back", async () => {
    vi.useFakeTimers();
    const d = deps({ write: vi.fn(() => new Promise<never>(() => {})), timeoutMs: 5_000 });
    const pending = storeOwnSiteFacts({ scanId: "s1", slice: slice(), outcomes: OUTCOMES }, d.deps);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(d.log).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe("failed");
    expect(String(d.log.mock.calls[0][0])).toContain("timed out");
  });

  it("the default deadline is 15 seconds", () => {
    expect(OWN_SITE_WRITE_TIMEOUT_MS).toBe(15_000);
  });

  it("leaves no timer running after a successful write, so a finished scan holds nothing open", async () => {
    vi.useFakeTimers();
    const d = deps();
    await storeOwnSiteFacts({ scanId: "s1", slice: slice(), outcomes: OUTCOMES }, d.deps);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a write that rejects after the deadline has passed does not surface as an unhandled rejection", async () => {
    vi.useFakeTimers();
    let rejectLate: (e: Error) => void = () => {};
    const d = deps({ write: vi.fn(() => new Promise<never>((_, reject) => (rejectLate = reject))), timeoutMs: 10 });
    const pending = storeOwnSiteFacts({ scanId: "s1", slice: slice(), outcomes: OUTCOMES }, d.deps);
    await vi.advanceTimersByTimeAsync(10);
    expect(await pending).toBe("failed");
    rejectLate(new Error("late failure"));
    await vi.advanceTimersByTimeAsync(1);
    expect(d.log).toHaveBeenCalledTimes(1);
  });
});
