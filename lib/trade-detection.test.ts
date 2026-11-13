/**
 * detectTrade(): Phase 9, ENG-01 / NIC-01 (D-9-05 to D-9-08).
 *
 * Lives in the root Vitest tree, not beside scanner-service/src/trade-detection.ts:
 * root Vitest picks this file up while the scanner's own `tsc` build would fail on a
 * vitest import if it sat under src/ (same placement as lib/own-site-facts.test.ts).
 *
 * Every fixture is a literal object. No network, no saved third-party HTML.
 * The Dutch trade words below live in this TEST file on purpose: the engine file
 * must stay vocabulary-free, so the words it matches arrive through the slice.
 */
import { describe, expect, it } from "vitest";
import { detectTrade, normaliseText } from "../scanner-service/src/trade-detection";
import type { TradeZones } from "../scanner-service/src/trade-detection";
import type { NicheScanSlice } from "../types/niche-scan-slice";

type SliceTrade = NicheScanSlice["trades"][number];
type Term = SliceTrade["terms"][number];

interface TradeSpec {
  id: string;
  terms: Term[];
  tieBreakRank?: number;
}

/** A slice built from literal specs. Thresholds default to a low minimum so one title hit decides. */
function sliceOf(
  trades: TradeSpec[],
  overrides: Partial<Pick<NicheScanSlice, "minTradeScore" | "dominanceRatio">> = {}
): NicheScanSlice {
  return {
    nicheId: "test",
    trades: trades.map((trade, index) => ({
      id: trade.id,
      terms: trade.terms,
      tieBreakRank: trade.tieBreakRank ?? index + 1,
      checks: { quoteTerms: [], projectTerms: [], certificationTerms: [] },
    })),
    reviewWidgetHosts: [],
    minTradeScore: overrides.minTradeScore ?? 4,
    dominanceRatio: overrides.dominanceRatio ?? 1.5,
  };
}

/** One page of zones, every zone empty unless the case names it. */
function zones(over: Partial<TradeZones> = {}): TradeZones {
  return { title: "", h1: [], h2h3: [], navTexts: [], internalPaths: [], bodyText: "", ...over };
}

/** One-line comparison: multi-line vitest diffs corrupt the TAP report the RED gate reads. */
function flat(value: unknown): string {
  return JSON.stringify(value);
}

const ROOFING_PREFIX: TradeSpec = { id: "roofing", terms: [{ term: "dak", match: "prefix" }] };
const ROOFING_WORD: TradeSpec = { id: "roofing", terms: [{ term: "dak", match: "word" }] };
const KITCHEN_PREFIX: TradeSpec = { id: "kitchen", terms: [{ term: "keuken", match: "prefix" }] };

describe("detectTrade: tracer (one zone, one match mode)", () => {
  it("reads a roofing compound in the h1 as roofing, by prefix", () => {
    const result = detectTrade(zones({ h1: ["Dakreparatie in Utrecht"] }), sliceOf([ROOFING_PREFIX]));
    expect(result.tradeId).toBe("roofing");
    expect(result.scores.roofing).toBeGreaterThan(0);
    expect(result.confidence).not.toBe("unreadable");
  });

  it("scores the same compound zero when the roofing term is a whole word, which is why prefix exists", () => {
    const result = detectTrade(zones({ h1: ["Dakreparatie in Utrecht"] }), sliceOf([ROOFING_WORD]));
    expect(result.scores.roofing).toBe(0);
    expect(result.tradeId).toBeNull();
  });

  it("treats every spelling of a hyphenated TERM as the same term", () => {
    const text = zones({ h1: ["Nieuwe cv ketel nodig?"] });
    const spellings = ["cv-ketel", "cv‐ketel", "cv‑ketel", "cv‒ketel", "cv–ketel", "cv—ketel", "cv―ketel", "cv_ketel", "cv ketel"];
    const scores = spellings.map(
      (term) => detectTrade(text, sliceOf([{ id: "central_heating", terms: [{ term, match: "prefix" }] }])).scores.central_heating
    );
    expect(scores[0]).toBeGreaterThan(0);
    expect(new Set(scores).size).toBe(1);
  });

  it("treats every spelling of a hyphenated ZONE TEXT as the same text", () => {
    const slice = sliceOf([{ id: "central_heating", terms: [{ term: "cv ketel", match: "prefix" }] }]);
    const spellings = ["CV-ketel", "CV‐ketel", "CV‑ketel", "CV‒ketel", "CV–ketel", "CV—ketel", "CV―ketel", "CV_ketel", "CV ketel", "CV   ketel"];
    const scores = spellings.map((h1) => detectTrade(zones({ h1: [`Nieuwe ${h1} nodig?`] }), slice).scores.central_heating);
    expect(scores[0]).toBeGreaterThan(0);
    expect(new Set(scores).size).toBe(1);
  });

  it("normalises: lower case, every hyphen variant and underscore to a space, whitespace collapsed", () => {
    expect(normaliseText("CV‑Ketel__Plaatsen –  Utrecht")).toBe("cv ketel plaatsen utrecht");
    expect(normaliseText("  Dak-Reparatie\n\tNu ")).toBe("dak reparatie nu");
  });

  it("reads a site with no term match as unreadable, never as a guess", () => {
    const result = detectTrade(zones({ h1: ["Welkom bij ons bedrijf"] }), sliceOf([ROOFING_PREFIX, KITCHEN_PREFIX]));
    expect(result.tradeId).toBeNull();
    expect(result.confidence).toBe("unreadable");
  });

  it("picks the highest-scoring trade at or above the minimum", () => {
    const slice = sliceOf([ROOFING_PREFIX, KITCHEN_PREFIX], { minTradeScore: 8 });
    const result = detectTrade(zones({ h1: ["Dakwerk en dakreparatie", "Keukens"] }), slice);
    expect(result.tradeId).toBe("roofing");
    expect(result.scores.roofing).toBe(10);
    expect(result.scores.kitchen).toBe(5);
  });

  it("accepts a score exactly at the minimum and refuses one just below it", () => {
    const h1 = zones({ h1: ["Dakreparatie"] });
    expect(detectTrade(h1, sliceOf([ROOFING_PREFIX], { minTradeScore: 5 })).tradeId).toBe("roofing");
    expect(detectTrade(h1, sliceOf([ROOFING_PREFIX], { minTradeScore: 6 })).tradeId).toBeNull();
    expect(detectTrade(h1, sliceOf([ROOFING_PREFIX], { minTradeScore: 6 })).confidence).toBe("unreadable");
  });

  it("never names a trade that scored zero, even when the minimum is zero", () => {
    const result = detectTrade(zones({ h1: ["Welkom"] }), sliceOf([ROOFING_PREFIX], { minTradeScore: 0 }));
    expect(result.tradeId).toBeNull();
    expect(result.confidence).toBe("unreadable");
  });

  it("returns the full score map, the runner-up and the margin", () => {
    const slice = sliceOf([ROOFING_PREFIX, KITCHEN_PREFIX, { id: "bathroom", terms: [{ term: "badkamer", match: "prefix" }] }]);
    const result = detectTrade(zones({ h1: ["Dakwerk en dakreparatie", "Keukens"] }), slice);
    expect(flat(Object.keys(result.scores).sort())).toBe(flat(["bathroom", "kitchen", "roofing"]));
    expect(result.scores.bathroom).toBe(0);
    expect(result.runnerUpId).toBe("kitchen");
    expect(result.margin).toBe(5);
  });

  it("names no runner-up when every other trade scored zero", () => {
    const result = detectTrade(zones({ h1: ["Dakreparatie"] }), sliceOf([ROOFING_PREFIX, KITCHEN_PREFIX]));
    expect(result.tradeId).toBe("roofing");
    expect(result.runnerUpId).toBeNull();
    expect(result.margin).toBe(5);
  });

  it("treats a term as a literal, never as a pattern", () => {
    const text = zones({ h1: ["Hello world dak abc d.k lekkage"] });
    const hostile = [".*", "(a+)+$", "[", "\\", "(", "d.k", "^dak$", "dak|hello"];
    for (const term of hostile) {
      const result = detectTrade(text, sliceOf([{ id: "t", terms: [{ term, match: "prefix" }] }]));
      expect(Number.isFinite(result.scores.t)).toBe(true);
    }
    // The dot is a dot: "d.k" matches the text "d.k" and not the text "dak" or "abc".
    expect(detectTrade(zones({ h1: ["d.k lekkage"] }), sliceOf([{ id: "t", terms: [{ term: "d.k", match: "prefix" }] }])).scores.t).toBeGreaterThan(0);
    expect(detectTrade(zones({ h1: ["dak lekkage"] }), sliceOf([{ id: "t", terms: [{ term: "d.k", match: "prefix" }] }])).scores.t).toBe(0);
    expect(detectTrade(zones({ h1: ["hello world"] }), sliceOf([{ id: "t", terms: [{ term: ".*", match: "prefix" }] }])).scores.t).toBe(0);
    expect(detectTrade(zones({ h1: ["dak"] }), sliceOf([{ id: "t", terms: [{ term: "dak|hello", match: "prefix" }] }])).scores.t).toBe(0);
  });

  it("finishes on a backtracking-shaped term against a long hostile text", () => {
    const text = zones({ h1: ["a".repeat(5000) + "!"] });
    const started = Date.now();
    const result = detectTrade(text, sliceOf([{ id: "t", terms: [{ term: "(a+)+$", match: "prefix" }] }]));
    expect(result.scores.t).toBe(0);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("ignores a blank term instead of matching everywhere", () => {
    const blanks = ["", "   ", "-", "_ _"];
    for (const term of blanks) {
      const result = detectTrade(zones({ h1: ["Dakreparatie"] }), sliceOf([{ id: "t", terms: [{ term, match: "prefix" }] }]));
      expect(result.scores.t).toBe(0);
    }
  });
});
