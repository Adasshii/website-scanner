// Unit tests for the single releasability predicate (D-4.1-01/03/04) and the
// scoreable rule folded into it (ENG-06, D-9-14). No Supabase — pure
// functions only. Integration coverage for selectWorstN wiring lives in
// lib/triage-release.integration.test.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TriageScore } from "@/types/triage";
import { MIN_MATCH_CONFIDENCE } from "./triage-constants";
import {
  isExcludedCategory,
  isReleasable,
  scoreableVerdict,
  type ScoreableFailureReason,
  type ScoreableRow,
  type ScoreableSource,
  type ScoreableVerdict,
} from "./triage-eligibility";

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

type ReleasableRow = ScoreableRow & { triage_score: TriageScore; category: string | null };

/**
 * A fully populated row that is scoreable AND releasable at a cutoff of 60.
 * Each case overrides only the field it is about, so widening the row type
 * later does not rewrite every fixture.
 */
function releasableRow(overrides?: Partial<ReleasableRow>): ReleasableRow {
  return {
    triage_score: makeTriageScore(),
    category: "software_agency",
    domain: "voorbeeld.nl",
    website_url: "https://voorbeeld.nl",
    address: "Kerkstraat 1, Utrecht",
    latitude: 52.09,
    longitude: 5.12,
    sources: [{ raw_confidence: 0.9, raw_operating_status: null }],
    ...overrides,
  };
}

/** Sources with the given confidences and no operating status. */
function sourcesAt(...confidences: Array<number | null>): ScoreableSource[] {
  return confidences.map((raw_confidence) => ({ raw_confidence, raw_operating_status: null }));
}

// The function is exercised at a fixed limit, independent of the tunable
// constant, so a retune of MIN_MATCH_CONFIDENCE cannot silently move these
// boundary cases.
const LIMIT = 0.5;

describe("isExcludedCategory", () => {
  it("returns false for null", () => {
    expect(isExcludedCategory(null)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isExcludedCategory("")).toBe(false);
  });

  it("returns true for an excluded category, exact case", () => {
    expect(isExcludedCategory("restaurant")).toBe(true);
  });

  it("normalizes casing", () => {
    expect(isExcludedCategory("Restaurant")).toBe(true);
  });

  it("normalizes surrounding whitespace", () => {
    expect(isExcludedCategory(" cafe ")).toBe(true);
  });

  it("returns false for a non-excluded category", () => {
    expect(isExcludedCategory("software_agency")).toBe(false);
  });
});

describe("scoreableVerdict (tracer slice: own domain and one match)", () => {
  it("a null domain is not scoreable: no_own_domain", () => {
    expect(scoreableVerdict(releasableRow({ domain: null }), LIMIT)).toEqual({
      scoreable: false,
      reason: "no_own_domain",
    });
  });

  it("a source at exactly the limit counts (>=, not >)", () => {
    expect(scoreableVerdict(releasableRow({ sources: sourcesAt(0.5) }), LIMIT)).toEqual({
      scoreable: true,
    });
  });

  it("a source just under the limit does not count: no_unique_match", () => {
    expect(scoreableVerdict(releasableRow({ sources: sourcesAt(0.4999) }), LIMIT)).toEqual({
      scoreable: false,
      reason: "no_unique_match",
    });
  });

  it("zero sources is not one match: no_unique_match", () => {
    expect(scoreableVerdict(releasableRow({ sources: [] }), LIMIT)).toEqual({
      scoreable: false,
      reason: "no_unique_match",
    });
  });
});

// ── The full four-condition truth table (ENG-06, D-9-14/15/22) ───────────
// Each case names only the field it is about; releasableRow() supplies the rest.
type VerdictCase = [name: string, overrides: Partial<ScoreableRow>, expected: ScoreableVerdict];

const PASS: ScoreableVerdict = { scoreable: true };
const fail = (reason: ScoreableFailureReason): ScoreableVerdict => ({ scoreable: false, reason });

function runCases(cases: VerdictCase[]) {
  it.each(cases)("%s", (_name, overrides, expected) => {
    expect(scoreableVerdict(releasableRow(overrides), LIMIT)).toEqual(expected);
  });
}

describe("scoreableVerdict condition 1: own domain", () => {
  runCases([
    ["a null domain fails", { domain: null }, fail("no_own_domain")],
    ["an empty domain fails", { domain: "" }, fail("no_own_domain")],
    ["a null website_url fails", { website_url: null }, fail("no_own_domain")],
    ["a social page website_url fails", { website_url: "https://www.facebook.com/voorbeeld" }, fail("no_own_domain")],
    ["a directory listing website_url fails", { website_url: "https://www.tripadvisor.com/x" }, fail("no_own_domain")],
    ["a real own domain passes", { domain: "dakdekker-utrecht.nl", website_url: "https://dakdekker-utrecht.nl" }, PASS],
  ]);
});

describe("scoreableVerdict condition 2: exactly one qualifying match", () => {
  runCases([
    ["no sources fails: zero is not one", { sources: [] }, fail("no_unique_match")],
    ["a single null confidence fails: null never qualifies", { sources: sourcesAt(null) }, fail("no_unique_match")],
    ["0.3 fails at a limit of 0.5", { sources: sourcesAt(0.3) }, fail("no_unique_match")],
    ["0.4999 fails just under the limit", { sources: sourcesAt(0.4999) }, fail("no_unique_match")],
    ["0.5 passes exactly at the limit (>=)", { sources: sourcesAt(0.5) }, PASS],
    ["0.9 passes", { sources: sourcesAt(0.9) }, PASS],
    ["[0.5, 0.5] fails: two matches at the limit are never merged", { sources: sourcesAt(0.5, 0.5) }, fail("no_unique_match")],
    ["[0.9, 0.9] fails: two strong matches", { sources: sourcesAt(0.9, 0.9) }, fail("no_unique_match")],
    ["[0.5, 0.3] passes: the weak duplicate is ignored, not disqualifying", { sources: sourcesAt(0.5, 0.3) }, PASS],
    ["[0.5, null] passes: the null is ignored, not disqualifying", { sources: sourcesAt(0.5, null) }, PASS],
    ["[0.3, 0.4] fails: two weak sources are still zero matches", { sources: sourcesAt(0.3, 0.4) }, fail("no_unique_match")],
  ]);
});

describe("scoreableVerdict condition 3: location", () => {
  runCases([
    ["an address with no point passes", { address: "Kerkstraat 1", latitude: null, longitude: null }, PASS],
    ["a whitespace-only address with no point fails", { address: "   ", latitude: null, longitude: null }, fail("no_location")],
    ["a whitespace-only address with a stored point passes", { address: "   ", latitude: 52.1, longitude: 5.1 }, PASS],
    ["a null address with a stored point passes", { address: null, latitude: 52.1, longitude: 5.1 }, PASS],
    ["no address and no point fails", { address: null, latitude: null, longitude: null }, fail("no_location")],
    ["half a point (latitude only) with no address fails", { address: null, latitude: 52.1, longitude: null }, fail("no_location")],
    ["a point at 0,0 is a stored point, not an absent one", { address: null, latitude: 0, longitude: 0 }, PASS],
  ]);
});

describe("scoreableVerdict condition 4: operating status, judged on the qualifying source only", () => {
  const closed = (raw_confidence: number): ScoreableSource => ({
    raw_confidence,
    raw_operating_status: "permanently_closed",
  });
  const open = (raw_confidence: number): ScoreableSource => ({ raw_confidence, raw_operating_status: "open" });
  runCases([
    ["the single qualifying source permanently closed fails", { sources: [closed(0.9)] }, fail("permanently_closed")],
    [
      "a NON-qualifying source marked permanently closed does not fail the row",
      { sources: [open(0.9), closed(0.3)] },
      PASS,
    ],
    ["a null operating status passes", { sources: sourcesAt(0.9) }, PASS],
    ["an open source passes", { sources: [open(0.9)] }, PASS],
    [
      "a temporarily closed source passes: only permanently closed is a dead business",
      { sources: [{ raw_confidence: 0.9, raw_operating_status: "temporarily_closed" }] },
      PASS,
    ],
  ]);
});

describe("scoreableVerdict fixed evaluation order", () => {
  it("a row failing own domain, two matches and location reports exactly no_own_domain", () => {
    const row = releasableRow({
      domain: null,
      sources: sourcesAt(0.9, 0.9),
      address: null,
      latitude: null,
      longitude: null,
    });
    for (let i = 0; i < 5; i += 1) {
      expect(scoreableVerdict(row, LIMIT)).toEqual({ scoreable: false, reason: "no_own_domain" });
    }
  });

  it("a row failing two matches and location reports exactly no_unique_match", () => {
    const row = releasableRow({ sources: sourcesAt(0.9, 0.9), address: null, latitude: null, longitude: null });
    expect(scoreableVerdict(row, LIMIT)).toEqual({ scoreable: false, reason: "no_unique_match" });
  });

  it("a row failing location and permanently closed reports exactly no_location", () => {
    const row = releasableRow({
      sources: [{ raw_confidence: 0.9, raw_operating_status: "permanently_closed" }],
      address: null,
      latitude: null,
      longitude: null,
    });
    expect(scoreableVerdict(row, LIMIT)).toEqual({ scoreable: false, reason: "no_location" });
  });
});

describe("scoreableVerdict precision: no rounding toward the limit", () => {
  it("0.5000000000000001 (the next double above) is at or above the limit and passes", () => {
    expect(scoreableVerdict(releasableRow({ sources: sourcesAt(0.5000000000000001) }), LIMIT)).toEqual(PASS);
  });

  it("0.49999999999999994 (the next double below) is under the limit and fails", () => {
    expect(scoreableVerdict(releasableRow({ sources: sourcesAt(0.49999999999999994) }), LIMIT)).toEqual(
      fail("no_unique_match")
    );
  });
});

describe("scoreableVerdict trade independence (D-9-05, D-9-08)", () => {
  it("two rows identical except for a trade field produce the same verdict", () => {
    const base = releasableRow();
    const withTrade = { ...base, trade: "roofing", trade_score: 12, own_site: { trade: "roofing" } };
    const withoutTrade = { ...base, trade: null, trade_score: null, own_site: null };
    expect(scoreableVerdict(withTrade, LIMIT)).toEqual(scoreableVerdict(withoutTrade, LIMIT));
    expect(scoreableVerdict(withTrade, LIMIT)).toEqual(PASS);
  });
});

describe("ScoreableFailureReason matches migration 022's CHECK constraint", () => {
  // An exhaustive Record: tsc fails here if the union gains or loses a member.
  const reasons: Record<ScoreableFailureReason, true> = {
    no_own_domain: true,
    no_unique_match: true,
    no_location: true,
    permanently_closed: true,
  };

  it("has exactly the four values the database allows, character for character", () => {
    const sql = readFileSync(
      "supabase/migrations/022_add_prospect_coordinates_and_scoreable_marker.sql",
      "utf8"
    );
    const block = sql.slice(sql.indexOf("not_scoreable_reason in ("));
    const allowed = Array.from(block.slice(0, block.indexOf(")")).matchAll(/'([a-z_]+)'/g), (m) => m[1]);
    expect(Object.keys(reasons).sort()).toEqual([...allowed].sort());
    expect(allowed).toHaveLength(4);
  });
});

describe("MIN_MATCH_CONFIDENCE", () => {
  it("is seeded at 0.5, the value the production histogram confirmed", () => {
    expect(MIN_MATCH_CONFIDENCE).toBe(0.5);
  });
});

describe("isReleasable", () => {
  const cutoff = 60;

  it("unreachable → false, regardless of score/https", () => {
    const row = releasableRow({ triage_score: makeTriageScore({ reachable: false, gated: true, score: 10 }) });
    expect(isReleasable(row, cutoff)).toBe(false);
  });

  it("excluded category → false, even below cutoff", () => {
    const row = releasableRow({
      triage_score: makeTriageScore({ reachable: true, score: 10 }),
      category: "restaurant",
    });
    expect(isReleasable(row, cutoff)).toBe(false);
  });

  it("reachable, no-https, non-excluded → true even above cutoff (D-4.1-04)", () => {
    const row = releasableRow({
      triage_score: makeTriageScore({ reachable: true, https: false, gated: true, score: 95 }),
    });
    expect(isReleasable(row, cutoff)).toBe(true);
  });

  it("reachable, https, non-excluded, score <= cutoff → true", () => {
    const row = releasableRow({
      triage_score: makeTriageScore({ reachable: true, https: true, gated: false, score: 30 }),
    });
    expect(isReleasable(row, cutoff)).toBe(true);
  });

  it("reachable, https, non-excluded, score > cutoff → false", () => {
    const row = releasableRow({
      triage_score: makeTriageScore({ reachable: true, https: true, gated: false, score: 90 }),
    });
    expect(isReleasable(row, cutoff)).toBe(false);
  });

  it("null category is not excluded — eligible below cutoff", () => {
    const row = releasableRow({
      triage_score: makeTriageScore({ reachable: true, https: true, gated: false, score: 30 }),
      category: null,
    });
    expect(isReleasable(row, cutoff)).toBe(true);
  });

  it("a row releasable before the scoreable rule and satisfying all four conditions is still true", () => {
    expect(isReleasable(releasableRow(), cutoff)).toBe(true);
  });

  it("a not-scoreable row is false even when the no-HTTPS fast track (gated) would release it", () => {
    const row = releasableRow({
      triage_score: makeTriageScore({ reachable: true, https: false, gated: true, score: 95 }),
      domain: null,
    });
    expect(isReleasable(row, cutoff)).toBe(false);
  });

  it("applies MIN_MATCH_CONFIDENCE itself: a source at the constant releases, one just under does not", () => {
    expect(isReleasable(releasableRow({ sources: sourcesAt(MIN_MATCH_CONFIDENCE) }), cutoff)).toBe(true);
    expect(isReleasable(releasableRow({ sources: sourcesAt(MIN_MATCH_CONFIDENCE - 0.0001) }), cutoff)).toBe(
      false
    );
  });
});

describe("isReleasable row contract (T-9-07: required fields, never fail open)", () => {
  /** The row minus one field, as a caller that forgot to select it would build it. */
  function without<K extends keyof ReleasableRow>(key: K): Omit<ReleasableRow, K> {
    const copy: Partial<ReleasableRow> = { ...releasableRow() };
    delete copy[key];
    return copy as Omit<ReleasableRow, K>;
  }

  it("the type rejects a row missing any one of the six new fields", () => {
    // Each line below must be a compile error. `npx tsc --noEmit` is the
    // assertion: an unused @ts-expect-error is itself an error.
    // @ts-expect-error domain is required
    const a: Parameters<typeof isReleasable>[0] = without("domain");
    // @ts-expect-error website_url is required
    const b: Parameters<typeof isReleasable>[0] = without("website_url");
    // @ts-expect-error address is required
    const c: Parameters<typeof isReleasable>[0] = without("address");
    // @ts-expect-error latitude is required
    const d: Parameters<typeof isReleasable>[0] = without("latitude");
    // @ts-expect-error longitude is required
    const e: Parameters<typeof isReleasable>[0] = without("longitude");
    // @ts-expect-error sources is required
    const f: Parameters<typeof isReleasable>[0] = without("sources");
    expect([a, b, c, d, e, f]).toHaveLength(6);
  });

  it("a row that reaches the rule at runtime without domain, website_url or sources is never releasable (fails closed)", () => {
    for (const key of ["domain", "website_url", "sources"] as const) {
      const row = without(key) as unknown as Parameters<typeof isReleasable>[0];
      expect(isReleasable(row, 60), `missing ${key}`).toBe(false);
    }
  });

  it("a row with address, latitude and longitude all absent at runtime has no location and is never releasable", () => {
    const row = without("address") as Partial<ReleasableRow>;
    delete row.latitude;
    delete row.longitude;
    expect(isReleasable(row as unknown as Parameters<typeof isReleasable>[0], 60)).toBe(false);
  });
});
