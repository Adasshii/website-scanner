// Unit tests for the single releasability predicate (D-4.1-01/03/04) and the
// scoreable rule folded into it (ENG-06, D-9-14). No Supabase — pure
// functions only. Integration coverage for selectWorstN wiring lives in
// lib/triage-release.integration.test.ts.
import { describe, expect, it } from "vitest";
import type { TriageScore } from "@/types/triage";
import { MIN_MATCH_CONFIDENCE } from "./triage-constants";
import {
  isExcludedCategory,
  isReleasable,
  scoreableVerdict,
  type ScoreableRow,
  type ScoreableSource,
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
