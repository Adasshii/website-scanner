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
import { INSTALLERS_PROFILE, toScannerSlice } from "./niche-profile";
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

/**
 * Every way a site writes the gap in a compound: the ASCII hyphen, each Unicode
 * dash from U+2010 to U+2015, the underscore and a plain space. Built from code
 * points so no look-alike character sits in this source file.
 */
const UNICODE_DASHES = [0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015].map((code) => String.fromCharCode(code));
const SEPARATORS = ["-", ...UNICODE_DASHES, "_", " "];
const HYPHEN_U2011 = String.fromCharCode(0x2011);
const HYPHEN_U2013 = String.fromCharCode(0x2013);

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
    const spellings = SEPARATORS.map((separator) => `cv${separator}ketel`);
    const scores = spellings.map(
      (term) => detectTrade(text, sliceOf([{ id: "central_heating", terms: [{ term, match: "prefix" }] }])).scores.central_heating
    );
    expect(scores[0]).toBeGreaterThan(0);
    expect(new Set(scores).size).toBe(1);
  });

  it("treats every spelling of a hyphenated ZONE TEXT as the same text", () => {
    const slice = sliceOf([{ id: "central_heating", terms: [{ term: "cv ketel", match: "prefix" }] }]);
    const spellings = [...SEPARATORS, "   "].map((separator) => `CV${separator}ketel`);
    const scores = spellings.map((h1) => detectTrade(zones({ h1: [`Nieuwe ${h1} nodig?`] }), slice).scores.central_heating);
    expect(scores[0]).toBeGreaterThan(0);
    expect(new Set(scores).size).toBe(1);
  });

  it("normalises: lower case, every hyphen variant and underscore to a space, whitespace collapsed", () => {
    expect(normaliseText(`CV${HYPHEN_U2011}Ketel__Plaatsen ${HYPHEN_U2013}  Utrecht`)).toBe("cv ketel plaatsen utrecht");
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

  it("reads a minimum that is not a number, or a slice with no trades, as unreadable", () => {
    const notANumber = detectTrade(zones({ h1: ["Dakreparatie"] }), sliceOf([ROOFING_PREFIX], { minTradeScore: Number.NaN }));
    expect(notANumber.tradeId).toBeNull();
    expect(notANumber.confidence).toBe("unreadable");
    const noTrades = detectTrade(zones({ h1: ["Dakreparatie"] }), sliceOf([]));
    expect(noTrades.tradeId).toBeNull();
    expect(flat(noTrades.scores)).toBe(flat({}));
  });

  it("reads at most the first 50 terms of a trade", () => {
    const filler = (count: number): Term[] => Array.from({ length: count }, (_, index) => ({ term: `filler${index}`, match: "prefix" as const }));
    const text = zones({ h1: ["Dakreparatie"] });
    const inside = detectTrade(text, sliceOf([{ id: "t", terms: [...filler(49), { term: "dak", match: "prefix" }] }]));
    const outside = detectTrade(text, sliceOf([{ id: "t", terms: [...filler(50), { term: "dak", match: "prefix" }] }]));
    expect(inside.scores.t).toBe(5);
    expect(outside.scores.t).toBe(0);
  });

  it("ignores a blank term instead of matching everywhere", () => {
    const blanks = ["", "   ", "-", "_ _"];
    for (const term of blanks) {
      const result = detectTrade(zones({ h1: ["Dakreparatie"] }), sliceOf([{ id: "t", terms: [{ term, match: "prefix" }] }]));
      expect(result.scores.t).toBe(0);
    }
  });
});

/** The same page repeated, the way a scan of several pages hands them over. */
function pagesOf(count: number, over: Partial<TradeZones>): TradeZones[] {
  return Array.from({ length: count }, () => zones(over));
}

/** Score of a one-trade slice for one term, so a case reads as zone text in, score out. */
function scoreOf(over: Partial<TradeZones> | TradeZones[], term: string, match: Term["match"] = "prefix"): number {
  const input = Array.isArray(over) ? over : zones(over);
  return detectTrade(input, sliceOf([{ id: "t", terms: [{ term, match }] }], { minTradeScore: 1 })).scores.t;
}

describe("detectTrade: zone weights and caps", () => {
  it("weights each zone as the research measured it", () => {
    expect(scoreOf({ title: "Dakwerk" }, "dak")).toBe(5);
    expect(scoreOf({ h1: ["Dakwerk"] }, "dak")).toBe(5);
    expect(scoreOf({ navTexts: ["Dakwerk"] }, "dak")).toBe(3);
    expect(scoreOf({ internalPaths: ["/dakwerk"] }, "dak")).toBe(3);
    expect(scoreOf({ h2h3: ["Dakwerk"] }, "dak")).toBe(2);
    expect(scoreOf({ bodyText: "Dakwerk" }, "dak")).toBe(1);
  });

  it("orders the zones: title and h1 above nav and paths, above headings, above body", () => {
    const title = scoreOf({ title: "dak" }, "dak");
    const nav = scoreOf({ navTexts: ["dak"] }, "dak");
    const heading = scoreOf({ h2h3: ["dak"] }, "dak");
    const body = scoreOf({ bodyText: "dak" }, "dak");
    expect(title).toBeGreaterThan(nav);
    expect(nav).toBeGreaterThan(heading);
    expect(heading).toBeGreaterThan(body);
  });

  it("caps h2/h3 hits at 5 on a page, however many headings repeat the word", () => {
    expect(scoreOf({ h2h3: ["dak dak dak dak dak dak dak dak dak dak dak dak"] }, "dak")).toBe(10);
    expect(scoreOf({ h2h3: Array.from({ length: 12 }, () => "dak") }, "dak")).toBe(10);
    expect(scoreOf({ h2h3: ["dak dak dak dak dak"] }, "dak")).toBe(10);
    expect(scoreOf({ h2h3: ["dak dak dak dak"] }, "dak")).toBe(8);
  });

  it("caps body hits at 10 on a page, so a stuffed page scores the same as a ten-hit page", () => {
    const stuffed = scoreOf({ bodyText: "dak ".repeat(50) }, "dak");
    const tenHits = scoreOf({ bodyText: "dak ".repeat(10) }, "dak");
    expect(stuffed).toBe(10);
    expect(tenHits).toBe(10);
    expect(scoreOf({ bodyText: "dak ".repeat(9) }, "dak")).toBe(9);
  });

  it("two terms matching the same word are one hit, not two", () => {
    const slice = sliceOf([{ id: "t", terms: [{ term: "dak", match: "prefix" }, { term: "dakdekk", match: "prefix" }] }]);
    expect(detectTrade(zones({ h1: ["Dakdekker"] }), slice).scores.t).toBe(5);
  });

  it("reads at most 20,000 characters of one text and 200 items of one zone", () => {
    expect(scoreOf({ bodyText: "x ".repeat(10_001) + "dak" }, "dak")).toBe(0);
    expect(scoreOf({ bodyText: "x ".repeat(9_990) + "dak" }, "dak")).toBe(1);
    expect(scoreOf({ h1: Array.from({ length: 300 }, () => "dak") }, "dak")).toBe(1000);
  });
});

describe("detectTrade: aggregation across a 7-page scan", () => {
  it("sums body text across pages, because it differs per page", () => {
    expect(scoreOf(pagesOf(7, { bodyText: "dakwerk" }), "dak")).toBe(7);
  });

  it("sums title, h1 and h2/h3 across pages too", () => {
    expect(scoreOf(pagesOf(7, { title: "dakwerk" }), "dak")).toBe(35);
    expect(scoreOf(pagesOf(7, { h1: ["dakwerk"] }), "dak")).toBe(35);
    expect(scoreOf(pagesOf(7, { h2h3: ["dakwerk"] }), "dak")).toBe(14);
  });

  it("applies the heading and body caps per page, then sums", () => {
    expect(scoreOf(pagesOf(7, { h2h3: ["dak ".repeat(12)] }), "dak")).toBe(70);
    expect(scoreOf(pagesOf(7, { bodyText: "dak ".repeat(50) }), "dak")).toBe(70);
  });

  it("counts a nav that repeats on every page once, not seven times", () => {
    const once = scoreOf([zones({ navTexts: ["Dakreparatie"] })], "dak");
    const sevenPages = scoreOf(pagesOf(7, { navTexts: ["Dakreparatie"] }), "dak");
    expect(once).toBe(3);
    expect(sevenPages).toBe(3);
  });

  it("counts an internal link path that repeats on every page once", () => {
    expect(scoreOf(pagesOf(7, { internalPaths: ["/dakreparatie"] }), "dak")).toBe(3);
  });

  it("takes the distinct union of nav text, so different entries on different pages all count", () => {
    const pages = [zones({ navTexts: ["Dakreparatie"] }), zones({ navTexts: ["Dakreparatie", "Daklekkage"] })];
    expect(scoreOf(pages, "dak")).toBe(6);
  });

  it("treats nav entries that differ only by case or hyphen as the same entry", () => {
    const pages = [zones({ navTexts: ["Dak-reparatie"] }), zones({ navTexts: ["dak reparatie"] }), zones({ navTexts: ["DAK_REPARATIE"] })];
    expect(scoreOf(pages, "dak")).toBe(3);
  });

  it("proves the two rules differ on one scan: the same word counts once in nav and seven times in body", () => {
    const pages = pagesOf(7, { navTexts: ["Dakwerk"], bodyText: "dakwerk" });
    expect(scoreOf(pages, "dak")).toBe(3 + 7);
  });

  it("accepts one page or a list of one page and answers the same", () => {
    const page = zones({ h1: ["Dakreparatie"], navTexts: ["Dakwerk"] });
    const slice = sliceOf([ROOFING_PREFIX]);
    expect(flat(detectTrade([page], slice))).toBe(flat(detectTrade(page, slice)));
    expect(detectTrade([page], slice).tradeId).toBe("roofing");
  });

  it("reads an empty list of pages as unreadable", () => {
    const result = detectTrade([], sliceOf([ROOFING_PREFIX]));
    expect(result.tradeId).toBeNull();
    expect(result.confidence).toBe("unreadable");
  });
});

describe("detectTrade: the three match modes are not interchangeable", () => {
  const MODES: Term["match"][] = ["substring", "prefix", "word"];
  const hitsByMode = (text: string, term: string): number[] => MODES.map((mode) => scoreOf({ h1: [text] }, term, mode) / 5);

  it("substring matches inside a word, prefix only at a word start, word only as a whole word", () => {
    expect(flat(hitsByMode("warmtepomp installatie", "pomp"))).toBe(flat([1, 0, 0]));
    expect(flat(hitsByMode("pompinstallatie", "pomp"))).toBe(flat([1, 1, 0]));
    expect(flat(hitsByMode("pomp installatie", "pomp"))).toBe(flat([1, 1, 1]));
  });

  it("a whole word is bounded by punctuation, a hyphen and the ends of the text", () => {
    expect(scoreOf({ h1: ["EPDM."] }, "epdm", "word")).toBe(5);
    expect(scoreOf({ h1: ["epdm-dakbedekking"] }, "epdm", "word")).toBe(5);
    expect(scoreOf({ h1: ["(epdm)"] }, "epdm", "word")).toBe(5);
    expect(scoreOf({ h1: ["epdmx"] }, "epdm", "word")).toBe(0);
    expect(scoreOf({ h1: ["xepdm"] }, "epdm", "word")).toBe(0);
  });

  it("treats a multi-word phrase as one boundary-delimited unit, not as two independent words", () => {
    expect(scoreOf({ h1: ["Nieuwe cv ketel plaatsen"] }, "cv ketel", "word")).toBe(5);
    expect(scoreOf({ h1: ["Nieuwe CV-ketel plaatsen"] }, "cv ketel", "word")).toBe(5);
    expect(scoreOf({ h1: ["cv ketelservice"] }, "cv ketel", "word")).toBe(0);
    expect(scoreOf({ h1: ["xcv ketel"] }, "cv ketel", "word")).toBe(0);
    expect(scoreOf({ h1: ["de cv en ketel"] }, "cv ketel", "word")).toBe(0);
    expect(scoreOf({ h1: ["ketel cv"] }, "cv ketel", "word")).toBe(0);
    expect(scoreOf({ h1: ["cv, ketel"] }, "cv ketel", "word")).toBe(0);
  });

  it("matches a multi-word substring phrase across a hyphen, a space or an underscore", () => {
    for (const text of ["lucht-water warmtepomp", "lucht water warmtepomp", "lucht_water warmtepomp"]) {
      expect(scoreOf({ h1: [text] }, "lucht water", "substring")).toBe(5);
    }
  });

  it("treats a digit as a word character", () => {
    expect(scoreOf({ h1: ["dak2"] }, "dak", "word")).toBe(0);
    expect(scoreOf({ h1: ["2dak"] }, "dak", "prefix")).toBe(0);
    expect(scoreOf({ h1: ["dak 2"] }, "dak", "word")).toBe(5);
    expect(scoreOf({ h1: ["2 dak"] }, "dak", "prefix")).toBe(5);
  });

  it("matches on accented letters as word characters", () => {
    expect(scoreOf({ h1: ["cafeïne"] }, "cafe", "word")).toBe(0);
    expect(scoreOf({ h1: ["École"] }, "cole", "prefix")).toBe(0);
    expect(scoreOf({ h1: ["Café Dak"] }, "dak", "word")).toBe(5);
  });
});

describe("detectTrade: Dutch measured pitfalls, against the seeded profile", () => {
  const SEEDED = toScannerSlice(INSTALLERS_PROFILE);

  it("the solar stem matches both the singular and the plural, which differ by a vowel", () => {
    expect(scoreOf({ h1: ["Zonnepaneel kopen"] }, "zonnepane", "substring")).toBe(5);
    expect(scoreOf({ h1: ["Zonnepanelen kopen"] }, "zonnepane", "substring")).toBe(5);
    expect(detectTrade(zones({ h1: ["Zonnepaneel kopen"] }), SEEDED).scores.solar).toBe(5);
    expect(detectTrade(zones({ h1: ["Zonnepanelen kopen"] }), SEEDED).scores.solar).toBe(5);
  });

  it("neither full Dutch form matches the other, so the shortened stem is the fix and no stemmer is needed", () => {
    expect(scoreOf({ h1: ["Zonnepanelen kopen"] }, "zonnepaneel", "substring")).toBe(0);
    expect(scoreOf({ h1: ["Zonnepaneel kopen"] }, "zonnepanelen", "substring")).toBe(0);
  });

  it("the seeded central heating terms never include the bare abbreviation, which also means curriculum vitae", () => {
    const heating = SEEDED.trades.find((trade) => trade.id === "central_heating");
    expect(heating).toBeDefined();
    const bare = (heating?.terms ?? []).filter((entry) => normaliseText(entry.term) === "cv");
    expect(bare.length).toBe(0);
  });

  it("a vacancy block full of the abbreviation scores central heating zero", () => {
    const vacancy = zones({
      bodyText: "Werken bij ons? Stuur je CV naar info. Solliciteer met cv en motivatiebrief. Vacatures: monteur, planner. Je cv is welkom.",
      h2h3: ["Vacatures", "Solliciteer met je CV"],
    });
    expect(detectTrade(vacancy, SEEDED).scores.central_heating).toBe(0);
  });

  it("a roofer whose body mentions solar panels once is a roofer: a mention is not an offer", () => {
    const roofer = zones({
      title: "Jansen Dakdekkers | Dakreparatie en dakonderhoud",
      h1: ["Dakdekker in Utrecht"],
      h2h3: ["Wij repareren uw dak", "Lekkage"],
      navTexts: ["Home", "Dakwerk", "Dakreparatie", "Over ons"],
      internalPaths: ["/dakwerk", "/dakreparatie", "/contact"],
      bodyText: "Wij plaatsen ook zonnepanelen op uw dak.",
    });
    const result = detectTrade(roofer, SEEDED);
    expect(result.tradeId).toBe("roofing");
    expect(result.scores.roofing).toBe(35);
    expect(result.scores.solar).toBe(1);
    expect(result.confidence).toBe("clear");
  });

  it("matches a roofing compound the profile never enumerated", () => {
    // Title and h1 together reach the profile's minimum score of 8.
    const result = detectTrade(zones({ title: "Dakreparatie Utrecht", h1: ["Dakreparatie nodig? Wij helpen."] }), SEEDED);
    expect(result.tradeId).toBe("roofing");
    expect(result.scores.roofing).toBe(10);
  });
});

/**
 * Two trades whose h1 hit counts are chosen directly, so a case reads as
 * "a scored 30 and b scored 25". One h1 hit is worth the h1 weight of 5.
 */
function twoTrades(
  aHits: number,
  bHits: number,
  options: { aRank?: number; bRank?: number; ratio?: number; reverse?: boolean; minimum?: number } = {}
): ReturnType<typeof detectTrade> {
  const specs: TradeSpec[] = [
    { id: "a", terms: [{ term: "alfa", match: "prefix" }], tieBreakRank: options.aRank ?? 1 },
    { id: "b", terms: [{ term: "beta", match: "prefix" }], tieBreakRank: options.bRank ?? 2 },
  ];
  const text = `${"alfa ".repeat(aHits)}${"beta ".repeat(bHits)}`;
  return detectTrade(
    zones({ h1: [text] }),
    sliceOf(options.reverse ? [...specs].reverse() : specs, { minTradeScore: options.minimum ?? 1, dominanceRatio: options.ratio ?? 1.5 })
  );
}

describe("detectTrade: ties resolve by rank, never by array position", () => {
  it("an exact tie goes to the trade with the lower tieBreakRank", () => {
    const result = twoTrades(4, 4, { aRank: 1, bRank: 2 });
    expect(result.tradeId).toBe("a");
    expect(result.scores.a).toBe(result.scores.b);
    expect(result.runnerUpId).toBe("b");
    expect(result.margin).toBe(0);
  });

  it("with the ranks swapped in the slice the other trade wins, so the rank decides and not the order", () => {
    expect(twoTrades(4, 4, { aRank: 2, bRank: 1 }).tradeId).toBe("b");
    expect(twoTrades(4, 4, { aRank: 2, bRank: 1 }).runnerUpId).toBe("a");
  });

  it("lists the trades in the opposite order and still gives the same answer", () => {
    expect(twoTrades(4, 4, { aRank: 1, bRank: 2, reverse: true }).tradeId).toBe("a");
    expect(twoTrades(4, 4, { aRank: 2, bRank: 1, reverse: true }).tradeId).toBe("b");
  });

  it("two trades with the same rank and the same score fall back to the id, in either array order", () => {
    expect(twoTrades(4, 4, { aRank: 1, bRank: 1 }).tradeId).toBe("a");
    expect(twoTrades(4, 4, { aRank: 1, bRank: 1, reverse: true }).tradeId).toBe("a");
  });

  it("a rank that is not a number loses to a real rank", () => {
    expect(twoTrades(4, 4, { aRank: Number.NaN, bRank: 9 }).tradeId).toBe("b");
    expect(twoTrades(4, 4, { aRank: Number.NaN, bRank: 9, reverse: true }).tradeId).toBe("b");
  });

  it("a higher score beats a lower rank: the rank only breaks an exact tie", () => {
    expect(twoTrades(3, 4, { aRank: 1, bRank: 2 }).tradeId).toBe("b");
  });

  it("names the runner-up by the same order when three trades tie", () => {
    const slice = sliceOf(
      [
        { id: "x", terms: [{ term: "alfa", match: "prefix" }], tieBreakRank: 3 },
        { id: "y", terms: [{ term: "alfa", match: "prefix" }], tieBreakRank: 1 },
        { id: "z", terms: [{ term: "alfa", match: "prefix" }], tieBreakRank: 2 },
      ],
      { minTradeScore: 1 }
    );
    const result = detectTrade(zones({ h1: ["alfa"] }), slice);
    expect(result.tradeId).toBe("y");
    expect(result.runnerUpId).toBe("z");
  });

  it("a hybrid installer that ties heat pump against central heating 30 to 30 is a heat pump installer, in either array order", () => {
    const seeded = toScannerSlice(INSTALLERS_PROFILE);
    const reversed: NicheScanSlice = { ...seeded, trades: [...seeded.trades].reverse() };
    const tied = zones({ h1: [`${"warmtepomp ".repeat(6)}${"cv ketel ".repeat(6)}`] });
    for (const slice of [seeded, reversed]) {
      const result = detectTrade(tied, slice);
      expect(result.scores.heat_pump).toBe(30);
      expect(result.scores.central_heating).toBe(30);
      expect(result.tradeId).toBe("heat_pump");
      expect(result.runnerUpId).toBe("central_heating");
    }
  });
});

describe("detectTrade: a narrow winner is still the trade", () => {
  it("records narrow and keeps the trade when the margin is under the dominance ratio", () => {
    const result = twoTrades(6, 5);
    expect(result.tradeId).toBe("a");
    expect(result.confidence).toBe("narrow");
    expect(result.runnerUpId).toBe("b");
    expect(result.margin).toBe(5);
  });

  it("is clear at exactly the ratio and narrow just under it", () => {
    expect(twoTrades(6, 4).confidence).toBe("clear"); // 30 against 20 is exactly 1.5
    expect(twoTrades(7, 5).confidence).toBe("narrow"); // 35 against 25 is 1.4
    expect(twoTrades(8, 5).confidence).toBe("clear"); // 40 against 25 is 1.6
  });

  it("an exact tie is narrow", () => {
    expect(twoTrades(4, 4).confidence).toBe("narrow");
  });

  it("a winner with no runner-up score is clear", () => {
    expect(twoTrades(1, 0).confidence).toBe("clear");
  });

  it("reads the ratio from the slice, not from the scanner", () => {
    expect(twoTrades(6, 4, { ratio: 2 }).confidence).toBe("narrow"); // 1.5 is under 2
    expect(twoTrades(6, 3, { ratio: 2 }).confidence).toBe("clear"); // exactly 2
    expect(twoTrades(4, 4, { ratio: 1 }).confidence).toBe("clear"); // 1 is not under 1
    expect(twoTrades(6, 4, { ratio: 1.2 }).confidence).toBe("clear");
  });

  it("a ratio that is not a number reads narrow when there is a runner-up, never clear", () => {
    expect(twoTrades(6, 4, { ratio: Number.NaN }).confidence).toBe("narrow");
    expect(twoTrades(6, 0, { ratio: Number.NaN }).confidence).toBe("clear");
  });

  it("a narrow reading of the seeded profile still names the trade and both scores", () => {
    const seeded = toScannerSlice(INSTALLERS_PROFILE);
    // 7 h1 hits for heat pump (35) against 5 for central heating (25).
    const result = detectTrade(zones({ h1: [`${"warmtepomp ".repeat(7)}${"cv ketel ".repeat(5)}`] }), seeded);
    expect(result.tradeId).toBe("heat_pump");
    expect(result.confidence).toBe("narrow");
    expect(result.scores.heat_pump).toBe(35);
    expect(result.scores.central_heating).toBe(25);
  });
});

describe("detectTrade: unreadable survives the full scorer", () => {
  it("a generic contractor that names no trade reads null and unreadable", () => {
    const generic = zones({
      title: "Aannemersbedrijf Jansen | Bouw, verbouw en onderhoud",
      h1: ["Uw aannemer voor elke klus"],
      h2h3: ["Verbouwingen", "Uitbouwen", "Onderhoud"],
      navTexts: ["Home", "Diensten", "Projecten", "Over ons", "Contact"],
      internalPaths: ["/diensten", "/projecten", "/over-ons", "/contact"],
      bodyText: "Wij verzorgen verbouwingen, uitbouwen en onderhoud in heel de regio.",
    });
    const result = detectTrade(generic, toScannerSlice(INSTALLERS_PROFILE));
    expect(result.tradeId).toBeNull();
    expect(result.confidence).toBe("unreadable");
    expect(flat(Object.values(result.scores))).toBe(flat([0, 0, 0, 0, 0, 0]));
  });

  it("a single passing mention stays below the minimum score of the seeded profile", () => {
    const mention = zones({ bodyText: "Voor een nieuwe keuken kunt u ook bij ons terecht.", h2h3: ["Keuken"] });
    const result = detectTrade(mention, toScannerSlice(INSTALLERS_PROFILE));
    expect(result.scores.kitchen).toBe(3);
    expect(result.tradeId).toBeNull();
    expect(result.confidence).toBe("unreadable");
  });
});
