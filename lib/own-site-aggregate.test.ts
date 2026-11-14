/**
 * aggregateOwnSite(): ENG-01, ENG-02, ENG-05 at site level (plan 09-09).
 *
 * Folds the per-page harvests into the one OwnSiteFacts stored in
 * scans.own_site_facts. Lives in the root Vitest tree for the same reason as
 * lib/own-site-facts.test.ts: scanner-service's own tsc build would fail on a
 * vitest import under src/.
 *
 * Every fixture is a literal object. The synthetic slice uses invented terms so
 * a test can tell which trade's terms were applied; one case runs the real
 * seeded profile slice.
 */
import { describe, expect, it } from "vitest";
import { aggregateOwnSite } from "../scanner-service/src/own-site-facts";
import { INSTALLERS_PROFILE, toScannerSlice } from "./niche-profile";
import type { NicheScanSlice } from "../types/niche-scan-slice";
import type { OwnSiteFacts, OwnSiteHarvest, OwnSiteHarvestOutcome } from "../types/own-site";

const READ_AT = "2026-11-14T09:00:00.000Z";
const META = { readAt: READ_AT };

/** One-line comparison: multi-line vitest diffs corrupt the TAP report the RED gate reads. */
function flat(value: unknown): string {
  return JSON.stringify(value);
}

const SLICE: NicheScanSlice = {
  nicheId: "test",
  trades: [
    {
      id: "alpha",
      terms: [{ term: "alpharoof", match: "substring" }],
      tieBreakRank: 1,
      checks: { quoteTerms: ["alphaquote"], projectTerms: ["alphaprojects"], certificationTerms: ["alphacert"] },
    },
    {
      id: "beta",
      terms: [{ term: "betapipe", match: "substring" }],
      tieBreakRank: 2,
      checks: { quoteTerms: ["betaquote"], projectTerms: ["betaprojects"], certificationTerms: ["betacert"] },
    },
  ],
  reviewWidgetHosts: ["reviewhost.test"],
  minTradeScore: 5,
  dominanceRatio: 1.5,
};

const EMPTY: OwnSiteHarvest = {
  jsonLdBlocks: [],
  jsonLdBlocksFound: 0,
  microdata: [],
  microdataCount: 0,
  microdataTruncated: false,
  title: "",
  h1: [],
  h2h3: [],
  navTexts: [],
  internalPaths: [],
  bodyText: "",
  telHrefs: [],
  formSummaries: [],
  imgHints: [],
  widgetHosts: [],
};

function page(zones: Partial<OwnSiteHarvest> = {}, blocks: unknown[] = []): OwnSiteHarvest {
  // A string is a raw block as the page carried it (possibly invalid JSON); anything else is stringified.
  const jsonLdBlocks = blocks.map((b) => (typeof b === "string" ? b : JSON.stringify(b)));
  return { ...EMPTY, jsonLdBlocks, jsonLdBlocksFound: jsonLdBlocks.length, ...zones };
}

const harvested = (harvest: OwnSiteHarvest): OwnSiteHarvestOutcome => ({ state: "harvested", harvest });
const FAILED: OwnSiteHarvestOutcome = { state: "unreadable" };

const business = (extra: Record<string, unknown>) => ({
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Example Installatie",
  ...extra,
});
const withAddress = (street: string) =>
  business({ address: { "@type": "PostalAddress", streetAddress: street, postalCode: "1234 AB", addressLocality: "Utrecht" } });

function aggregate(outcomes: Array<OwnSiteHarvestOutcome | null>, slice: NicheScanSlice = SLICE): OwnSiteFacts {
  return aggregateOwnSite(outcomes, slice, META);
}

describe("aggregateOwnSite: tracer (two pages, one address)", () => {
  it("reads an address published on one of two pages as found, with pagesRead 2 and schemaVersion 1", () => {
    const facts = aggregate([harvested(page()), harvested(page({}, [withAddress("Hoofdstraat 12")]))]);
    expect(facts.business.address.state).toBe("found");
    expect(facts.pagesRead).toBe(2);
    expect(facts.schemaVersion).toBe(1);
    expect(facts.readAt).toBe(READ_AT);
    if (facts.business.address.state === "found") {
      expect(facts.business.address.value.streetAddress).toBe("Hoofdstraat 12");
      expect(facts.business.address.source).toBe("jsonld");
    }
  });
});

describe("aggregateOwnSite: every member is present in every situation", () => {
  const KEYS = ["schemaVersion", "readAt", "pagesRead", "structuredData", "business", "socialProof", "quoteReadiness", "trade"];
  const BUSINESS_KEYS = ["address", "telephone", "openingHours", "serviceArea", "certifications"];

  it("with no pages at all, reads every part as unreadable and claims nothing", () => {
    const facts = aggregate([]);
    expect(Object.keys(facts).sort().join(",")).toBe([...KEYS].sort().join(","));
    expect(Object.keys(facts.business).sort().join(",")).toBe([...BUSINESS_KEYS].sort().join(","));
    expect(facts.pagesRead).toBe(0);
    for (const key of BUSINESS_KEYS) {
      expect((facts.business as unknown as Record<string, { state: string }>)[key].state).toBe("unreadable");
    }
    expect(facts.socialProof.state).toBe("unreadable");
    expect(facts.quoteReadiness.state).toBe("unreadable");
    expect(facts.trade.confidence).toBe("unreadable");
    expect(String(facts.trade.tradeId)).toBe("null");
  });

  it("with every page failed, reads every part as unreadable, never as missing", () => {
    const facts = aggregate([FAILED, null, FAILED]);
    expect(facts.pagesRead).toBe(0);
    for (const key of BUSINESS_KEYS) {
      expect((facts.business as unknown as Record<string, { state: string }>)[key].state).toBe("unreadable");
    }
    expect(facts.socialProof.state).toBe("unreadable");
    expect(facts.quoteReadiness.state).toBe("unreadable");
  });

  it("with healthy empty pages, reads each business field as missing with a reason", () => {
    const facts = aggregate([harvested(page())]);
    for (const key of BUSINESS_KEYS) {
      const field = (facts.business as unknown as Record<string, { state: string; reason?: string }>)[key];
      expect(field.state).toBe("missing");
      expect(field.reason).toBe("no_structured_data");
    }
  });
});

describe("aggregateOwnSite: merging a business field across pages", () => {
  it("states not_in_markup when any page had markup that left the field out", () => {
    const facts = aggregate([harvested(page()), harvested(page({}, [business({ name: "x" })]))]);
    const address = facts.business.address;
    expect(address.state).toBe("missing");
    if (address.state === "missing") expect(address.reason).toBe("not_in_markup");
  });

  it("a found value beats a missing page and a failed page", () => {
    const facts = aggregate([FAILED, harvested(page()), harvested(page({}, [withAddress("Dorpsweg 3")]))]);
    expect(facts.business.address.state).toBe("found");
  });

  it("a failed page turns an absence into unreadable: the failed page may have held it", () => {
    const facts = aggregate([harvested(page()), FAILED]);
    expect(facts.business.address.state).toBe("unreadable");
    expect(facts.business.telephone.state).toBe("unreadable");
  });

  it("a page whose own extraction read unreadable turns an absence into unreadable", () => {
    const broken = page({}, ["{ this is not json"]);
    const facts = aggregate([harvested(page()), harvested(broken)]);
    expect(facts.business.address.state).toBe("unreadable");
  });

  it("picks the same address whichever page comes first", () => {
    const a = harvested(page({}, [withAddress("Aaa 1")]));
    const b = harvested(page({}, [withAddress("Zzz 9")]));
    const forward = aggregate([a, b]);
    const backward = aggregate([b, a]);
    expect(flat(forward.business.address)).toBe(flat(backward.business.address));
    if (forward.business.address.state === "found") expect(forward.business.address.value.streetAddress).toBe("Aaa 1");
  });

  it("prefers markup from JSON-LD over microdata when the two pages disagree", () => {
    const micro = harvested({
      ...EMPTY,
      microdataCount: 1,
      microdata: [
        {
          type: "https://schema.org/LocalBusiness",
          props: {
            address: [
              { type: "https://schema.org/PostalAddress", props: { streetAddress: ["Aaa microdata 1"], postalCode: ["1111 AA"], addressLocality: ["Utrecht"] } },
            ],
          },
        },
      ],
    });
    const jsonld = harvested(page({}, [withAddress("Zzz jsonld 9")]));
    for (const order of [[micro, jsonld], [jsonld, micro]]) {
      const facts = aggregate(order);
      expect(facts.business.address.state).toBe("found");
      if (facts.business.address.state === "found") {
        expect(facts.business.address.source).toBe("jsonld");
        expect(facts.business.address.value.streetAddress).toBe("Zzz jsonld 9");
      }
    }
  });

  it("counts only the pages whose harvest succeeded as read, and sums the structured data counts", () => {
    const facts = aggregate([
      harvested(page({}, [withAddress("A 1"), business({ name: "second" })])),
      FAILED,
      harvested(page({}, [business({ name: "third" }), "{ broken"])),
      null,
    ]);
    expect(facts.pagesRead).toBe(2);
    expect(facts.structuredData.jsonLdBlocks).toBe(4);
    expect(facts.structuredData.jsonLdInvalid).toBe(1);
  });

  it("sums the microdata items across pages", () => {
    const item = { type: "https://schema.org/LocalBusiness", props: { name: ["Example"] } };
    const one = aggregate([harvested({ ...EMPTY, microdataCount: 1, microdata: [item] })]);
    const two = aggregate([harvested({ ...EMPTY, microdataCount: 1, microdata: [item] }), harvested({ ...EMPTY, microdataCount: 1, microdata: [item] })]);
    expect(one.structuredData.microdataItems).toBeGreaterThan(0);
    expect(two.structuredData.microdataItems).toBe(one.structuredData.microdataItems * 2);
  });

  it("only an outcome whose state says harvested is read: an unreadable one that carries a harvest is still a failed page", () => {
    const odd = { state: "unreadable", harvest: page({}, [withAddress("Hoofdstraat 12")]) } as unknown as OwnSiteHarvestOutcome;
    const facts = aggregate([odd]);
    expect(facts.pagesRead).toBe(0);
    expect(facts.business.address.state).toBe("unreadable");
  });
});

describe("aggregateOwnSite: the trade", () => {
  it("reads the trade across pages and keeps the whole score map, zero scores included", () => {
    const facts = aggregate([
      harvested(page({ title: "alpharoof experts", h1: ["alpharoof"] })),
      harvested(page({ h2h3: ["alpharoof"] })),
    ]);
    expect(facts.trade.tradeId).toBe("alpha");
    expect(facts.trade.confidence).toBe("clear");
    expect(facts.trade.scores.alpha).toBe(12);
    expect(facts.trade.scores.beta).toBe(0);
    expect(Object.keys(facts.trade.scores).sort().join(",")).toBe("alpha,beta");
    expect(facts.trade.margin).toBe(12);
    expect(String(facts.trade.runnerUpId)).toBe("null");
  });

  it("names the runner-up and the margin when a second trade also scored", () => {
    const facts = aggregate([harvested(page({ title: "alpharoof", h1: ["alpharoof"], h2h3: ["betapipe"] }))]);
    expect(facts.trade.tradeId).toBe("alpha");
    expect(facts.trade.runnerUpId).toBe("beta");
    expect(facts.trade.scores.beta).toBe(2);
    expect(facts.trade.margin).toBe(8);
  });

  it("a failed page among the pages does not stop the trade being read from the others", () => {
    const facts = aggregate([FAILED, null, harvested(page({ title: "alpharoof", h1: ["alpharoof"] }))]);
    expect(facts.trade.tradeId).toBe("alpha");
    expect(facts.trade.confidence).toBe("clear");
  });

  it("a site that names no trade reads an unreadable trade and still gets every other part", () => {
    const facts = aggregate([harvested(page({}, [withAddress("Hoofdstraat 12")]))]);
    expect(facts.trade.confidence).toBe("unreadable");
    expect(String(facts.trade.tradeId)).toBe("null");
    expect(facts.business.address.state).toBe("found");
    expect(facts.quoteReadiness.state).toBe("evaluated");
  });

  it("runs on the real seeded slice: a roofing site reads as roofing", () => {
    const real = toScannerSlice(INSTALLERS_PROFILE);
    const facts = aggregate(
      [harvested(page({ title: "Dakdekker in Utrecht", h1: ["Uw dakdekker"], h2h3: ["Dakbedekking", "Dakreparatie"] }))],
      real
    );
    expect(facts.trade.tradeId).toBe("roofing");
    expect(Object.keys(facts.trade.scores).length).toBe(real.trades.length);
  });

  it("a detector that throws costs only the trade: the business facts and the other parts are still stored", () => {
    const hostile = { ...SLICE, trades: null } as unknown as NicheScanSlice;
    const facts = aggregate([harvested(page({}, [withAddress("Hoofdstraat 12")]))], hostile);
    expect(facts.trade.confidence).toBe("unreadable");
    expect(facts.business.address.state).toBe("found");
    expect(facts.pagesRead).toBe(1);
  });
});

describe("aggregateOwnSite: which checks the quote readiness uses", () => {
  const certOf = (facts: OwnSiteFacts): boolean => {
    if (facts.quoteReadiness.state !== "evaluated") throw new Error("expected evaluated");
    return facts.quoteReadiness.certifications.passed;
  };
  const roof = { title: "alpharoof", h1: ["alpharoof"] };

  it("a detected trade uses ITS terms: its own certification passes, another trade's does not", () => {
    const own = aggregate([harvested(page({ ...roof, bodyText: "we hold alphacert" }))]);
    const other = aggregate([harvested(page({ ...roof, bodyText: "we hold betacert" }))]);
    expect(own.trade.tradeId).toBe("alpha");
    expect(String(certOf(own))).toBe("true");
    expect(other.trade.tradeId).toBe("alpha");
    expect(String(certOf(other))).toBe("false");
  });

  it("with the trade unreadable, the terms of every trade in the slice apply", () => {
    const a = aggregate([harvested(page({ bodyText: "we hold alphacert" }))]);
    const b = aggregate([harvested(page({ bodyText: "we hold betacert" }))]);
    const none = aggregate([harvested(page({ bodyText: "we hold nothing" }))]);
    expect(a.trade.confidence).toBe("unreadable");
    expect(String(certOf(a))).toBe("true");
    expect(String(certOf(b))).toBe("true");
    expect(String(certOf(none))).toBe("false");
  });

  it("with the trade unreadable, the evidence does not depend on the order the slice lists its trades", () => {
    const both = harvested(page({ bodyText: "we hold betacert and alphacert" }));
    const forward = aggregate([both], SLICE);
    const reversed = aggregate([both], { ...SLICE, trades: [...SLICE.trades].reverse() });
    if (forward.quoteReadiness.state !== "evaluated" || reversed.quoteReadiness.state !== "evaluated") throw new Error("expected evaluated");
    expect(forward.quoteReadiness.certifications.evidence).toBe(reversed.quoteReadiness.certifications.evidence);
    expect(forward.quoteReadiness.certifications.evidence).toContain("alphacert");
  });

  it("with the trade unreadable, quote and project terms of every trade also apply", () => {
    const facts = aggregate([
      harvested(page({ navTexts: ["betaquote"], internalPaths: ["/alphaprojects"], imgHints: Array.from({ length: 3 }, () => ({ alt: "", file: "" })) })),
    ]);
    if (facts.quoteReadiness.state !== "evaluated") throw new Error("expected evaluated");
    expect(String(facts.quoteReadiness.quoteForm.passed)).toBe("true");
    expect(String(facts.quoteReadiness.projectPhotos.passed)).toBe("true");
  });

  it("merges across pages: a tap-to-call link on one page passes for the site", () => {
    const facts = aggregate([harvested(page()), harvested(page({ telHrefs: ["tel:+31201234567"] }))]);
    if (facts.quoteReadiness.state !== "evaluated") throw new Error("expected evaluated");
    expect(String(facts.quoteReadiness.tapToCall.passed)).toBe("true");
  });

  it("a failed page with an unproven check reads the whole quote readiness as unreadable", () => {
    const facts = aggregate([harvested(page({ telHrefs: ["tel:+31201234567"] })), FAILED]);
    expect(facts.quoteReadiness.state).toBe("unreadable");
  });
});

describe("aggregateOwnSite: social proof", () => {
  it("reads a review widget host named by the slice across pages", () => {
    const facts = aggregate([harvested(page()), harvested(page({ widgetHosts: ["widget.reviewhost.test"] }))]);
    if (facts.socialProof.state !== "read") throw new Error("expected read");
    expect(String(facts.socialProof.shown)).toBe("true");
    expect(flat(facts.socialProof.widgetHosts)).toBe(flat(["widget.reviewhost.test"]));
  });

  it("a failed page makes an unfound signal null (could not tell), never false", () => {
    const facts = aggregate([harvested(page()), FAILED]);
    if (facts.socialProof.state !== "read") throw new Error("expected read");
    expect(String(facts.socialProof.shown)).toBe("null");
    expect(String(facts.socialProof.markedUp)).toBe("null");
    expect(facts.socialProof.count.state).toBe("unreadable");
  });

  it("with every page read in full and nothing found, the signal is false and the count is missing", () => {
    const facts = aggregate([harvested(page()), harvested(page())]);
    if (facts.socialProof.state !== "read") throw new Error("expected read");
    expect(String(facts.socialProof.shown)).toBe("false");
    expect(facts.socialProof.count.state).toBe("missing");
  });
});

describe("aggregateOwnSite: what is stored", () => {
  it("never stores the harvested text: a distinctive body, heading and title string is absent from the value", () => {
    const facts = aggregate([
      harvested(
        page({
          title: "TITLE-MARKER alpharoof",
          h1: ["H1-MARKER alpharoof"],
          h2h3: ["H2-MARKER"],
          navTexts: ["NAV-MARKER"],
          bodyText: "BODY-MARKER lorem ipsum",
        })
      ),
    ]);
    const stored = JSON.stringify(facts);
    for (const marker of ["TITLE-MARKER", "H1-MARKER", "H2-MARKER", "NAV-MARKER", "BODY-MARKER"]) {
      expect(stored.includes(marker), marker).toBe(false);
    }
  });

  it("stores the same value whichever order the pages arrived in", () => {
    const pages = [
      harvested(page({ title: "alpharoof", h1: ["alpharoof"], telHrefs: ["tel:+31201234567"] }, [withAddress("Hoofdstraat 12")])),
      harvested(page({ h2h3: ["alpharoof"], widgetHosts: ["x.reviewhost.test"], navTexts: ["alphaquote"] })),
      FAILED,
      harvested(page({}, [business({ name: "other" })])),
    ];
    const forward = flat(aggregate(pages));
    const backward = flat(aggregate([...pages].reverse()));
    const rotated = flat(aggregate([pages[2], pages[0], pages[3], pages[1]]));
    expect(backward).toBe(forward);
    expect(rotated).toBe(forward);
  });

  it("is JSON-serialisable and round-trips unchanged, as a jsonb column requires", () => {
    const facts = aggregate([harvested(page({ title: "alpharoof", h1: ["alpharoof"] }, [withAddress("Hoofdstraat 12")]))]);
    expect(flat(JSON.parse(JSON.stringify(facts)))).toBe(flat(facts));
  });
});

describe("aggregateOwnSite: never throws", () => {
  it("an outcome that throws when read yields an all-unreadable result, not an exception", () => {
    const booby = {
      get state(): string {
        throw new Error("boom");
      },
    } as unknown as OwnSiteHarvestOutcome;
    const facts = aggregate([booby]);
    expect(facts.pagesRead).toBe(0);
    expect(facts.business.address.state).toBe("unreadable");
    expect(facts.socialProof.state).toBe("unreadable");
    expect(facts.quoteReadiness.state).toBe("unreadable");
    expect(facts.trade.confidence).toBe("unreadable");
    expect(facts.readAt).toBe(READ_AT);
  });

  it("a harvest of the wrong shape does not throw", () => {
    const wrong = harvested({ ...EMPTY, h1: null } as unknown as OwnSiteHarvest);
    const facts = aggregate([wrong]);
    expect(facts.schemaVersion).toBe(1);
  });
});
