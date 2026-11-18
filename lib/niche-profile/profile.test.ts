/**
 * lib/niche-profile/profile.test.ts — Phase 9, plan 09-02 (NIC-01, NIC-02).
 *
 * Pins what the installers profile holds and the shape of what leaves it for
 * the Railway scanner. The seven job values are asserted against a literal
 * table written out in this file, NOT read back off the profile: a number
 * edited in trades.ts without a matching edit here (and in 09-JOB-VALUES.md)
 * fails the build (T-9-04).
 *
 * Pure unit test: no network, no database, no clock. Staleness takes an
 * injected date, so CI never goes red on a calendar day with no code change.
 */
import { describe, expect, it } from "vitest";
import { resolveBbox } from "@/lib/overture-bboxes";
import { EXCLUDED_CATEGORIES } from "@/lib/triage-constants";
import { INSTALLERS_PROFILE, getTrade, staleJobValues, toScannerSlice } from "./index";
import type { JobValue, ProfileCopy, TradeId, TradeProfile } from "./types";

/**
 * The seven approved amounts and the two read dates (09-JOB-VALUES.md: the
 * first six approved by Joshua 2026-11-12, plumbing 2026-11-16), written out
 * here rather than derived from the profile (T-9-04).
 */
const EXPECTED_AMOUNTS: Readonly<Record<TradeId, number>> = {
  heat_pump: 12000,
  solar: 3200,
  bathroom: 7500,
  kitchen: 11000,
  roofing: 5700,
  central_heating: 2100,
  plumbing: 300,
};
const EXPECTED_READ_ON: Readonly<Record<TradeId, string>> = {
  heat_pump: "2026-11-12",
  solar: "2026-11-12",
  bathroom: "2026-11-12",
  kitchen: "2026-11-12",
  roofing: "2026-11-12",
  central_heating: "2026-11-12",
  plumbing: "2026-11-16",
};
const ORIGINAL_SIX: readonly TradeId[] = [
  "heat_pump",
  "solar",
  "bathroom",
  "kitchen",
  "roofing",
  "central_heating",
];
/**
 * Compares two string sets as one line each, so a failure prints a single-line
 * message (a multi-line diff would break the TAP report the RED gate parses).
 */
const asSortedLine = (xs: readonly string[]) => [...xs].sort().join(", ");
const ALL_TRADE_IDS: readonly TradeId[] = [
  "heat_pump",
  "solar",
  "bathroom",
  "kitchen",
  "roofing",
  "central_heating",
  "plumbing",
];

describe("installers profile: identity (NIC-01, NIC-03)", () => {
  it("country is NL and the locales are nl and en with nl as default", () => {
    expect(INSTALLERS_PROFILE.country).toBe("NL");
    expect(INSTALLERS_PROFILE.locales).toContain("nl");
    expect(INSTALLERS_PROFILE.locales).toContain("en");
    expect(INSTALLERS_PROFILE.defaultLocale).toBe("nl");
  });
});

describe("heat pump trade (tracer, NIC-02)", () => {
  it("carries the pre-subsidy invoice total as a published value", () => {
    const trade = getTrade(INSTALLERS_PROFILE, "heat_pump");
    expect(trade?.jobValue?.amountEur).toBe(12000);
    expect(trade?.jobValue?.derivation).toBe("published");
  });

  it("cites Milieu Centraal, read on 2026-11-12", () => {
    const citation = getTrade(INSTALLERS_PROFILE, "heat_pump")?.jobValue?.citation;
    expect(citation?.source).toBe("Milieu Centraal");
    expect(citation?.readOn).toBe("2026-11-12");
  });
});

describe("toScannerSlice (D-9-12, T-9-03)", () => {
  const slice = toScannerSlice(INSTALLERS_PROFILE);

  it("returns the niche id, the trade entries and the two scoring thresholds", () => {
    expect(slice.nicheId).toBe("installers");
    const heatPump = slice.trades.find((t) => t.id === "heat_pump");
    expect(heatPump).toBeDefined();
    expect(heatPump?.terms.length).toBeGreaterThan(0);
    expect(typeof heatPump?.tieBreakRank).toBe("number");
    expect(heatPump?.checks).toBeDefined();
    expect(Array.isArray(slice.reviewWidgetHosts)).toBe(true);
    expect(typeof slice.minTradeScore).toBe("number");
    expect(typeof slice.dominanceRatio).toBe("number");
  });

  it("shares no object key with ProfileCopy (T-9-03)", () => {
    // Keys, not substrings: short copy keys would collide with unrelated text.
    const collectKeys = (value: unknown, into: Set<string>): Set<string> => {
      if (Array.isArray(value)) {
        for (const item of value) collectKeys(item, into);
      } else if (value !== null && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          into.add(key);
          collectKeys(child, into);
        }
      }
      return into;
    };
    const sliceKeys = collectKeys(slice, new Set());
    expect(sliceKeys.size).toBeGreaterThan(0);
    for (const locale of INSTALLERS_PROFILE.locales) {
      const copyKeys = collectKeys(INSTALLERS_PROFILE.copy[locale], new Set());
      expect(copyKeys.size, locale).toBeGreaterThan(0);
      expect(Array.from(sliceKeys).filter((key) => copyKeys.has(key)), locale).toEqual([]);
    }
  });

  it("carries no job value, no citation and no copy", () => {
    const serialised = JSON.stringify(slice);
    expect(serialised).not.toContain("amountEur");
    expect(serialised).not.toContain("citation");
    expect(serialised).not.toContain("copy");
  });
});

describe("type-level guarantees (NIC-02, D-9-20, D-9-21)", () => {
  // These cases are proven by `npx tsc --noEmit`, not by the runtime. Each
  // expect-error directive below would itself fail to compile ("unused
  // directive") if the type were loosened, so a loosened type breaks the build.
  const baseChecks = { quoteTerms: [], projectTerms: [], certificationTerms: [] };

  it("rejects a trade literal that omits showMoneyLine", () => {
    // @ts-expect-error showMoneyLine is required and independent of jobValue (D-9-21)
    const noSwitch: TradeProfile = {
      id: "solar",
      tieBreakRank: 2,
      keywords: [],
      siteChecks: baseChecks,
      aiQuestions: { nl: [], en: [] },
    };
    expect(noSwitch.id).toBe("solar");
  });

  it("rejects a midpoint-of-range value whose citation has no note", () => {
    // @ts-expect-error a midpoint value must explain itself in citation.note (D-9-20)
    const noNote: JobValue = {
      amountEur: 11000,
      derivation: "midpoint-of-range",
      range: [7000, 15000],
      recheckAfter: "2027-11-12",
      citation: { source: "Homedeal", url: "https://example.test", readOn: "2026-11-12" },
    };
    expect(noNote.amountEur).toBe(11000);
  });

  it("allows a trade with no jobValue (D-9-04) and a trade with a value and no money line (D-9-21)", () => {
    const noValue: TradeProfile = {
      id: "kitchen",
      showMoneyLine: false,
      tieBreakRank: 4,
      keywords: [],
      siteChecks: baseChecks,
      aiQuestions: { nl: [], en: [] },
    };
    expect(noValue.jobValue).toBeUndefined();
    expect(noValue.showMoneyLine).toBe(false);
  });
});

describe("all seven trades (NIC-01, NIC-02, D-9-03)", () => {
  it("holds every TradeId exactly once, asserted exhaustively", () => {
    const ids = INSTALLERS_PROFILE.trades.map((t) => t.id);
    expect(ids).toHaveLength(7);
    expect(asSortedLine(ids)).toBe(asSortedLine(ALL_TRADE_IDS));
    expect(new Set(ids).size).toBe(7);
  });

  it("carries the seven approved amounts from the literal table", () => {
    for (const id of ALL_TRADE_IDS) {
      expect(getTrade(INSTALLERS_PROFILE, id)?.jobValue?.amountEur, id).toBe(EXPECTED_AMOUNTS[id]);
    }
  });

  it("every value carries an https citation read on its approved date and a later recheck date", () => {
    for (const id of ALL_TRADE_IDS) {
      const value = getTrade(INSTALLERS_PROFILE, id)?.jobValue;
      expect(value, id).toBeDefined();
      expect(value?.citation.url.startsWith("https://"), id).toBe(true);
      expect(value?.citation.readOn, id).toBe(EXPECTED_READ_ON[id]);
      expect(value!.recheckAfter > value!.citation.readOn, id).toBe(true);
    }
  });

  it("kitchen is the midpoint of 7000 to 15000 and its citation says midpoint", () => {
    const value = getTrade(INSTALLERS_PROFILE, "kitchen")?.jobValue;
    expect(value?.derivation).toBe("midpoint-of-range");
    if (value?.derivation !== "midpoint-of-range") throw new Error("kitchen must be a midpoint value");
    expect(value.range).toEqual([7000, 15000]);
    expect(value.citation.note).toContain("midpoint");
    expect(value.citation.note).toContain("05/01/2026");
  });

  it("central heating has a value AND shows no money line (D-9-21)", () => {
    const trade = getTrade(INSTALLERS_PROFILE, "central_heating");
    // One assertion on purpose: "has a value" and "shows a money line" are independent fields,
    // so both must hold at once. A value that is present and a money line that is off.
    expect(trade?.jobValue !== undefined && trade?.showMoneyLine === false).toBe(true);
    expect(trade?.jobValue?.amountEur).toBe(2100);
  });

  it("plumbing has a value AND shows no money line (D-9-21)", () => {
    const trade = getTrade(INSTALLERS_PROFILE, "plumbing");
    // Same shape as the central heating case: two independent fields, both must hold at once.
    expect(trade?.jobValue !== undefined && trade?.showMoneyLine === false).toBe(true);
    expect(trade?.jobValue?.amountEur).toBe(300);
  });

  it("exactly two trades show no money line, central heating and plumbing, so a third cannot appear unnoticed", () => {
    const noMoneyLine = INSTALLERS_PROFILE.trades.filter((t) => !t.showMoneyLine).map((t) => t.id);
    expect(asSortedLine(noMoneyLine)).toBe(asSortedLine(["central_heating", "plumbing"]));
  });

  it("every other trade shows its money line", () => {
    for (const id of ALL_TRADE_IDS.filter((t) => t !== "central_heating" && t !== "plumbing")) {
      expect(getTrade(INSTALLERS_PROFILE, id)?.showMoneyLine, id).toBe(true);
    }
  });

  it("plumbing cites Homedeal read on 2026-11-16, carries no pageUpdated, and records all three conflicting figures", () => {
    const citation = getTrade(INSTALLERS_PROFILE, "plumbing")?.jobValue?.citation;
    expect(citation?.source).toBe("Homedeal");
    expect(citation?.url.startsWith("https://")).toBe(true);
    expect(citation?.readOn).toBe("2026-11-16");
    expect(citation?.pageUpdated).toBeUndefined();
    const note = citation?.note ?? "";
    // Header average with its min and max, the body range, and the FAQ range.
    for (const figure of ["300", "150", "500", "200 to 400", "300 to 500", "30/12/2025"]) {
      expect(note, figure).toContain(figure);
    }
    expect(note).toContain("disagrees with itself");
  });

  it("solar carries the copy obligation naming the 8-panel basis (D-9-20)", () => {
    const obligation = getTrade(INSTALLERS_PROFILE, "solar")?.copyObligation;
    expect(obligation).toBeTruthy();
    expect(obligation).toMatch(/8/);
    expect(obligation).toMatch(/panel/i);
  });

  it("heat pump outranks central heating on an exact tie (tieBreakRank)", () => {
    const heatPump = getTrade(INSTALLERS_PROFILE, "heat_pump")!.tieBreakRank;
    const centralHeating = getTrade(INSTALLERS_PROFILE, "central_heating")!.tieBreakRank;
    expect(heatPump).toBeLessThan(centralHeating);
    const ranks = INSTALLERS_PROFILE.trades.map((t) => t.tieBreakRank);
    expect(new Set(ranks).size).toBe(ranks.length);
    expect(ranks).toHaveLength(7);
  });

  it("plumbing ranks 7, appended so none of the existing six is renumbered", () => {
    expect(getTrade(INSTALLERS_PROFILE, "plumbing")!.tieBreakRank).toBe(7);
    const expectedRanks: Readonly<Record<string, number>> = {
      heat_pump: 1,
      solar: 2,
      bathroom: 3,
      kitchen: 4,
      roofing: 5,
      central_heating: 6,
    };
    for (const [id, rank] of Object.entries(expectedRanks)) {
      expect(getTrade(INSTALLERS_PROFILE, id as TradeId)!.tieBreakRank, id).toBe(rank);
    }
  });
});

describe("keyword terms carry the measured corrections (D-9-06)", () => {
  const terms = (id: TradeId) => getTrade(INSTALLERS_PROFILE, id)!.keywords;

  it("central heating never carries a bare cv term", () => {
    expect(terms("central_heating").some((k) => k.term === "cv")).toBe(false);
    expect(terms("central_heating").map((k) => k.term)).toContain("cv ketel");
  });

  it("solar uses the stem zonnepane, which covers the singular and the vowel-changed plural", () => {
    expect(terms("solar")).toContainEqual({ term: "zonnepane", match: "substring" });
  });

  it("roofing matches dak by prefix so Dutch compounds are found", () => {
    expect(terms("roofing")).toContainEqual({ term: "dak", match: "prefix" });
  });

  it("plumbing carries the full word for a plumber and never the bare metal-name stem", () => {
    expect(terms("plumbing")).toContainEqual({ term: "loodgieter", match: "substring" });
    // A bare "lood" term would take a genuine zinc and lead roofer (loodwerk, loodslabben).
    expect(terms("plumbing").some((k) => k.term.trim().toLowerCase() === "lood")).toBe(false);
    expect(terms("plumbing")).toHaveLength(4);
  });

  it("every trade has at least one term", () => {
    for (const id of ALL_TRADE_IDS) expect(terms(id).length, id).toBeGreaterThan(0);
  });
});

describe("certification and review seeds (ENG-05, ENG-02)", () => {
  it("carries no chamber-of-commerce, bare recognised or ISO term for any trade", () => {
    const banned = new Set(["kvk", "erkend", "iso", "stek"]);
    for (const trade of INSTALLERS_PROFILE.trades) {
      for (const term of trade.siteChecks.certificationTerms) expect(banned.has(term), `${trade.id}: ${term}`).toBe(false);
    }
  });

  it("energy trades carry installq, the other four only generic terms", () => {
    for (const id of ["heat_pump", "solar", "central_heating"] as const) {
      expect(getTrade(INSTALLERS_PROFILE, id)!.siteChecks.certificationTerms, id).toContain("installq");
    }
    for (const id of ["roofing", "bathroom", "kitchen", "plumbing"] as const) {
      expect(asSortedLine(getTrade(INSTALLERS_PROFILE, id)!.siteChecks.certificationTerms), id).toBe(
        asSortedLine(["keurmerk", "gecertificeerd", "gecertificeerde"])
      );
    }
  });

  it("lists the five review widget hosts", () => {
    expect(asSortedLine(INSTALLERS_PROFILE.reviewWidgetHosts)).toBe(
      asSortedLine(["feedbackcompany", "kiyoh", "klantenvertellen", "trustindex", "trustpilot"])
    );
  });
});

describe("empty aiQuestions, ordering, and slice per trade (D-9-24, D-9-07)", () => {
  it("every trade has empty aiQuestions in both locales and the profile loads", () => {
    for (const trade of INSTALLERS_PROFILE.trades) {
      expect(trade.aiQuestions.nl, trade.id).toEqual([]);
      expect(trade.aiQuestions.en, trade.id).toEqual([]);
    }
  });

  it("lookup by TradeId does not depend on array order", () => {
    const reversed = { ...INSTALLERS_PROFILE, trades: [...INSTALLERS_PROFILE.trades].reverse() };
    for (const id of ALL_TRADE_IDS) {
      expect(getTrade(reversed, id)?.jobValue?.amountEur, id).toBe(EXPECTED_AMOUNTS[id]);
    }
  });

  it("the scanner slice has one entry per trade and still no job value, citation or copy", () => {
    const slice = toScannerSlice(INSTALLERS_PROFILE);
    expect(asSortedLine(slice.trades.map((t) => t.id))).toBe(asSortedLine(ALL_TRADE_IDS));
    const serialised = JSON.stringify(slice);
    for (const banned of ["amountEur", "citation", "copy", "showMoneyLine", "copyObligation", "recheckAfter"]) {
      expect(serialised, banned).not.toContain(banned);
    }
    expect(slice.reviewWidgetHosts.length).toBe(5);
  });
});

describe("categories, regions and competitor rules (D-9-11, D-9-23)", () => {
  it("holds the eight confirmed Overture import categories", () => {
    expect(asSortedLine(INSTALLERS_PROFILE.overtureCategories)).toBe(
      asSortedLine([
        "roofing",
        "hvac_service",
        "plumbing",
        "electrician",
        "energy_company",
        "building_contractor",
        "building_or_construction_service",
        "contractor",
      ])
    );
  });

  it("positive categories and EXCLUDED_CATEGORIES have an empty lower-cased intersection", () => {
    const excluded = new Set(EXCLUDED_CATEGORIES.map((c) => c.toLowerCase()));
    const overlap = INSTALLERS_PROFILE.overtureCategories.filter((c) => excluded.has(c.toLowerCase()));
    expect(overlap).toEqual([]);
  });

  it("holds all twelve provinces, never the fryslan alias, and each resolves through resolveBbox", () => {
    expect(asSortedLine(INSTALLERS_PROFILE.regions)).toBe(
      asSortedLine([
        "noord-holland",
        "zuid-holland",
        "utrecht",
        "noord-brabant",
        "groningen",
        "friesland",
        "drenthe",
        "overijssel",
        "flevoland",
        "gelderland",
        "limburg",
        "zeeland",
      ])
    );
    expect(INSTALLERS_PROFILE.regions).not.toContain("fryslan");
    for (const region of INSTALLERS_PROFILE.regions) {
      expect(() => resolveBbox(INSTALLERS_PROFILE.country, region), region).not.toThrow();
    }
  });

  it("the competitor radius is the 25 km tunable default", () => {
    expect(INSTALLERS_PROFILE.competitor.radiusKm).toBe(25);
    expect(INSTALLERS_PROFILE.competitor.maxCompetitors).toBe(3);
  });
});

describe("copy (D-9-10)", () => {
  it("both locales carry a money line template with an amount placeholder", () => {
    for (const locale of INSTALLERS_PROFILE.locales) {
      expect(INSTALLERS_PROFILE.copy[locale].moneyLine.line, locale).toContain("{amount}");
    }
  });

  it("both locales carry all four social-proof states, each non-empty (settled decision 4)", () => {
    const states = ["noneHereOthersDo", "noneHereNoneThere", "visibleNotReadable", "visibleAndReadable"] as const;
    for (const locale of INSTALLERS_PROFILE.locales) {
      const proof = INSTALLERS_PROFILE.copy[locale].socialProof;
      for (const state of states) {
        expect(typeof proof[state], `${locale}.${state}`).toBe("string");
        expect(proof[state].length, `${locale}.${state}`).toBeGreaterThan(0);
      }
      expect(proof.noneHereOthersDo, locale).toContain("{count}");
      expect(proof.noneHereNoneThere, locale).toContain("{count}");
      expect(proof.visibleAndReadable, locale).toContain("{n}");
    }
  });

  it("rejects a social-proof literal that omits a state", () => {
    // @ts-expect-error a missing social-proof state is a build error (settled decision 4)
    const missingState: ProfileCopy["socialProof"] = {
      heading: "h",
      frame: "f",
      noneHereOthersDo: "a",
      noneHereNoneThere: "b",
      visibleNotReadable: "c",
    };
    expect(missingState.heading).toBe("h");
  });

  it("both locales carry the same set of Adashi-fixes keys", () => {
    expect(asSortedLine(Object.keys(INSTALLERS_PROFILE.copy.nl.adashiFixes))).toBe(
      asSortedLine(Object.keys(INSTALLERS_PROFILE.copy.en.adashiFixes))
    );
    expect(Object.keys(INSTALLERS_PROFILE.copy.nl.adashiFixes).length).toBeGreaterThan(0);
  });
});

describe("copy: the approved report document carried whole (D-9-10)", () => {
  const nl = INSTALLERS_PROFILE.copy.nl;
  const en = INSTALLERS_PROFILE.copy.en;

  /** Every key path in a value, array indices written as `[]`. */
  const keyPaths = (value: unknown, prefix = ""): string[] => {
    if (Array.isArray(value)) return value.flatMap((item) => keyPaths(item, `${prefix}[]`));
    if (value !== null && typeof value === "object") {
      return Object.entries(value).flatMap(([key, child]) => {
        const path = prefix === "" ? key : `${prefix}.${key}`;
        const below = keyPaths(child, path);
        return below.length === 0 ? [path] : below;
      });
    }
    return [prefix];
  };

  /** Every brace token in every string of a value. */
  const placeholders = (value: unknown, into: Set<string>): Set<string> => {
    if (typeof value === "string") {
      for (const match of Array.from(value.matchAll(/\{([A-Za-z_]+)\}/g))) into.add(match[1]);
    } else if (Array.isArray(value)) {
      for (const item of value) placeholders(item, into);
    } else if (value !== null && typeof value === "object") {
      for (const child of Object.values(value)) placeholders(child, into);
    }
    return into;
  };

  it("both locales carry the same deep key set", () => {
    expect(keyPaths(nl).sort()).toEqual(keyPaths(en).sort());
    expect(keyPaths(nl).length).toBeGreaterThan(40);
  });

  it("each locale's placeholder set equals the approved set, nothing invented and nothing dropped", () => {
    const shared = [
      "score",
      "gap",
      "count",
      "withProof",
      "withData",
      "rank",
      "seconds",
      "citation",
      "date",
      "question",
      "hits",
      "others",
      "amount",
      "source",
      "n",
      "counsel_wording",
    ];
    expect(Array.from(placeholders(nl, new Set())).sort()).toEqual([...shared, "bedrijf", "plaats"].sort());
    expect(Array.from(placeholders(en, new Set())).sort()).toEqual([...shared, "business", "city"].sort());
  });

  it("each section carries its own placeholders", () => {
    for (const [locale, copy] of [["nl", nl], ["en", en]] as const) {
      const name = locale === "nl" ? "{bedrijf}" : "{business}";
      expect(copy.header.eyebrow, locale).toContain(locale === "nl" ? "{plaats}" : "{city}");
      expect(copy.header.eyebrow, locale).toContain(name);
      expect(copy.header.scoreLine, locale).toContain("{score}");
      expect(copy.header.scoreLine, locale).toContain("{gap}");
      expect(copy.competitors.frame, locale).toContain("{count}");
      for (const token of ["{count}", "{withProof}", "{withData}", "{rank}"]) {
        expect(copy.competitors.standing, locale).toContain(token);
      }
      expect(copy.websiteOnPhone.loadTimeLine, locale).toContain("{seconds}");
      expect(copy.websiteOnPhone.citationLine, locale).toContain("{citation}");
      expect(copy.aiVisibility.frame, locale).toContain("{date}");
      expect(copy.aiVisibility.perQuestionLine, locale).toContain("{question}");
      expect(copy.aiVisibility.perQuestionLine, locale).toContain("{hits}");
      expect(copy.aiVisibility.othersNamedLine, locale).toContain("{others}");
      expect(copy.moneyLine.provenance, locale).toContain("{source}");
      expect(copy.moneyLine.provenance, locale).toContain("{date}");
      expect(copy.footer.provenance, locale).toContain(name);
      expect(copy.footer.provenance, locale).toContain("{date}");
      expect(copy.footer.article14, locale).toContain("{counsel_wording}");
    }
  });

  it("Article 14 keeps the placeholder and no legal sentence of its own (counsel's wording is a named gap)", () => {
    expect(nl.footer.article14).toBe("Juridische tekst volgens artikel 14 AVG: {counsel_wording}");
    expect(en.footer.article14).toBe("Article 14 GDPR wording: {counsel_wording}");
  });

  it("adashiFixes has exactly the five keys in both locales, each non-empty", () => {
    const keys = ["aiVisibility", "businessFacts", "quoteRequest", "socialProof", "websiteOnPhone"];
    for (const [locale, copy] of [["nl", nl], ["en", en]] as const) {
      expect(Object.keys(copy.adashiFixes).sort(), locale).toEqual(keys);
      for (const key of keys) {
        expect(copy.adashiFixes[key as keyof typeof copy.adashiFixes].length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("tips carries one line per section in both locales, and the two locales agree (D-9-10)", () => {
    const keys = ["aiVisibility", "businessFacts", "quoteRequest", "socialProof", "websiteOnPhone"];
    for (const [locale, copy] of [["nl", nl], ["en", en]] as const) {
      expect(Object.keys(copy.tips).sort(), locale).toEqual(keys);
      for (const key of keys) {
        expect(copy.tips[key as keyof typeof copy.tips]?.length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("a tip is its own sentence, never a copy of that section's Adashi fix line", () => {
    for (const [locale, copy] of [["nl", nl], ["en", en]] as const) {
      for (const key of Object.keys(copy.tips) as (keyof typeof copy.tips)[]) {
        expect(copy.tips[key], `${locale}.${key}`).not.toBe(copy.adashiFixes[key]);
      }
    }
  });

  it("the five values that predate the document keep their bytes", () => {
    expect(nl.moneyLine.line).toBe("Eén extra klus is ongeveer {amount} euro waard.");
    expect(en.moneyLine.line).toBe("One extra job is worth about {amount} euros.");
    expect(nl.socialProof.noneHereOthersDo).toBe(
      "{count} installateurs bij jou in de buurt tonen hun reviews op hun eigen site. Jij niet."
    );
    expect(en.adashiFixes.quoteRequest).toBe(
      "Adashi puts a quote form and a tap-to-call number where a customer looks for them."
    );
  });

  it("the money line never promises a payback and no copy string carries an em-dash", () => {
    for (const copy of [nl, en]) {
      expect(JSON.stringify(copy)).not.toContain("\u2014");
    }
    expect(JSON.stringify(nl.moneyLine)).not.toContain("betaalt zich terug");
    expect(JSON.stringify(en.moneyLine)).not.toContain("pays for itself");
  });
});

describe("staleJobValues is a pure function over an injected clock (D-9-18)", () => {
  it("returns nothing the day after the read date", () => {
    expect(staleJobValues(INSTALLERS_PROFILE, new Date("2026-11-13"))).toEqual([]);
  });

  it("returns all seven trade ids long after the recheck date", () => {
    expect(asSortedLine(staleJobValues(INSTALLERS_PROFILE, new Date("2030-01-01")))).toBe(
      asSortedLine(ALL_TRADE_IDS)
    );
  });

  it("treats the recheck date itself as stale (at or before now)", () => {
    // Plumbing was read four days later, so on 2027-11-12 it is not yet stale. Named, not counted.
    expect(asSortedLine(staleJobValues(INSTALLERS_PROFILE, new Date("2027-11-12")))).toBe(
      asSortedLine(ORIGINAL_SIX)
    );
    expect(staleJobValues(INSTALLERS_PROFILE, new Date("2027-11-12"))).not.toContain("plumbing");
  });
});
