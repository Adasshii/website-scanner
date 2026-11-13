/**
 * extractOwnSiteFacts(): ENG-01, the pure Node-side parser behind the own-site
 * harvest. Lives in the root Vitest tree, not beside
 * scanner-service/src/own-site-facts.ts: root Vitest picks this file up while
 * scanner-service's own `tsc` build would fail on a vitest import if it sat
 * under src/ (same placement as lib/scanner-design-prompt.test.ts).
 *
 * Every fixture is a literal object. No network, no saved third-party HTML.
 */
import { describe, expect, it } from "vitest";
import {
  MIN_PROJECT_IMAGES,
  MIN_QUOTE_FORM_FIELDS,
  evaluateQuoteReadiness,
  extractOwnSiteFacts,
  extractSocialProof,
  mergeQuoteReadiness,
} from "../scanner-service/src/own-site-facts";
import type { NicheScanSlice } from "../types/niche-scan-slice";
import type { MicrodataItem, OwnSiteHarvest, OwnSiteQuoteReadiness, OwnSiteSocialProof } from "../types/own-site";

const META = { readAt: "2026-11-13T09:00:00.000Z" };

/** The zones the business-fact parser does not read, empty. */
const ZONES = {
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

/** Build a harvest from literal JSON-LD values (stringified) or raw strings. */
function harvestOf(blocks: Array<unknown>): OwnSiteHarvest {
  const jsonLdBlocks = blocks.map((b) => (typeof b === "string" ? b : JSON.stringify(b)));
  return {
    jsonLdBlocks,
    jsonLdBlocksFound: jsonLdBlocks.length,
    microdata: [],
    microdataCount: 0,
    microdataTruncated: false,
    ...ZONES,
  };
}

/** One-line comparison: multi-line vitest diffs corrupt the TAP report the RED gate reads. */
function flat(value: unknown): string {
  return JSON.stringify(value);
}

const NO_BLOCKS: OwnSiteHarvest = {
  jsonLdBlocks: [],
  jsonLdBlocksFound: 0,
  microdata: [],
  microdataCount: 0,
  microdataTruncated: false,
  ...ZONES,
};

describe("extractOwnSiteFacts: address", () => {
  it("reads a PostalAddress inside a Yoast-style @graph as found, from jsonld", () => {
    const facts = extractOwnSiteFacts(
      harvestOf([
        {
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "WebSite", "@id": "https://example.test/#website", name: "Example" },
            {
              "@type": "LocalBusiness",
              "@id": "https://example.test/#business",
              name: "Example Installatie",
              address: {
                "@type": "PostalAddress",
                streetAddress: "Hoofdstraat 12",
                postalCode: "1234 AB",
                addressLocality: "Utrecht",
              },
            },
          ],
        },
      ]),
      META
    );
    const address = facts.business.address;
    expect(address.state).toBe("found");
    if (address.state === "found") {
      expect(address.source).toBe("jsonld");
      expect(address.value.streetAddress).toBe("Hoofdstraat 12");
      expect(address.value.postalCode).toBe("1234 AB");
      expect(address.value.locality).toBe("Utrecht");
    }
  });

  it("resolves an address reference whose target lives in a different block", () => {
    const facts = extractOwnSiteFacts(
      harvestOf([
        {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "LocalBusiness",
              "@id": "https://example.test/#business",
              address: { "@id": "https://example.test/#addr" },
            },
          ],
        },
        {
          "@context": "https://schema.org",
          "@type": "PostalAddress",
          "@id": "https://example.test/#addr",
          streetAddress: "Kerkplein 3",
          addressLocality: "Zwolle",
          postalCode: "8011 AA",
        },
      ]),
      META
    );
    const address = facts.business.address;
    expect(address.state).toBe("found");
    if (address.state === "found") {
      expect(address.value.streetAddress).toBe("Kerkplein 3");
      expect(address.source).toBe("jsonld");
    }
  });

  it("reads a business node out of a top-level array", () => {
    const facts = extractOwnSiteFacts(
      harvestOf([
        [
          { "@type": "BreadcrumbList", itemListElement: [] },
          {
            "@type": "Plumber",
            address: { "@type": "PostalAddress", streetAddress: "Dijk 9", addressLocality: "Delft" },
          },
        ],
      ]),
      META
    );
    expect(facts.business.address.state).toBe("found");
  });

  it("finds the address in a later block when the first block does not carry one", () => {
    const facts = extractOwnSiteFacts(
      harvestOf([
        { "@context": "https://schema.org", "@type": "WebSite", name: "Example" },
        {
          "@context": "https://schema.org",
          "@type": "Electrician",
          address: { "@type": "PostalAddress", streetAddress: "Laan 1", addressLocality: "Breda" },
        },
      ]),
      META
    );
    expect(facts.business.address.state).toBe("found");
    expect(facts.structuredData.jsonLdBlocks).toBe(2);
    expect(facts.structuredData.jsonLdInvalid).toBe(0);
  });

  it("accepts postalCode plus locality, and a plain non-empty string", () => {
    const withPostal = extractOwnSiteFacts(
      harvestOf([
        {
          "@type": "LocalBusiness",
          address: { "@type": "PostalAddress", postalCode: 3511, addressLocality: "Utrecht" },
        },
      ]),
      META
    );
    expect(withPostal.business.address.state).toBe("found");

    const asText = extractOwnSiteFacts(
      harvestOf([{ "@type": "LocalBusiness", address: "Hoofdstraat 12, 1234 AB Utrecht" }]),
      META
    );
    expect(asText.business.address.state).toBe("found");
    if (asText.business.address.state === "found") {
      expect(asText.business.address.value.text).toBe("Hoofdstraat 12, 1234 AB Utrecht");
    }
  });

  it("does not call a postal code with no locality an address", () => {
    const facts = extractOwnSiteFacts(
      harvestOf([
        { "@type": "LocalBusiness", address: { "@type": "PostalAddress", postalCode: "1234 AB" } },
      ]),
      META
    );
    expect(flat(facts.business.address)).toBe(flat({ state: "missing", reason: "not_in_markup" }));
  });
});

describe("extractOwnSiteFacts: missing reasons", () => {
  it("reports no_structured_data when the page has no JSON-LD and no microdata at all", () => {
    const facts = extractOwnSiteFacts(NO_BLOCKS, META);
    expect(flat(facts.business.address)).toBe(flat({ state: "missing", reason: "no_structured_data" }));
  });

  it("reports not_in_markup when structured data exists but carries no address", () => {
    const facts = extractOwnSiteFacts(
      harvestOf([{ "@context": "https://schema.org", "@type": "LocalBusiness", name: "Example" }]),
      META
    );
    expect(flat(facts.business.address)).toBe(flat({ state: "missing", reason: "not_in_markup" }));
  });

  it("keeps the two missing reasons distinct from each other", () => {
    const none = extractOwnSiteFacts(NO_BLOCKS, META).business.address;
    const some = extractOwnSiteFacts(harvestOf([{ "@type": "WebSite" }]), META).business.address;
    expect(flat(none)).not.toBe(flat(some));
  });
});

describe("extractOwnSiteFacts: unreadable", () => {
  it("reads unreadable, never missing, when the only JSON-LD block is invalid", () => {
    const facts = extractOwnSiteFacts(harvestOf(['{"@type": "LocalBusiness", "address": ']), META);
    expect(flat(facts.business.address)).toBe(flat({ state: "unreadable" }));
    expect(facts.structuredData.jsonLdInvalid).toBe(1);
    expect(facts.structuredData.jsonLdBlocks).toBe(1);
  });

  it("still reports found for a value in a valid block when a sibling block is invalid", () => {
    const facts = extractOwnSiteFacts(
      harvestOf([
        "{ not json",
        { "@type": "LocalBusiness", address: { streetAddress: "Laan 5", addressLocality: "Ede" } },
      ]),
      META
    );
    expect(facts.business.address.state).toBe("found");
    expect(facts.structuredData.jsonLdInvalid).toBe(1);
  });

  it("reads unreadable rather than not_in_markup when a block failed and the field is not elsewhere", () => {
    const facts = extractOwnSiteFacts(
      harvestOf(["{ not json", { "@type": "LocalBusiness", name: "Example" }]),
      META
    );
    expect(flat(facts.business.address)).toBe(flat({ state: "unreadable" }));
  });

  it("reads unreadable when the harvest itself failed (null), without throwing", () => {
    const facts = extractOwnSiteFacts(null, META);
    expect(flat(facts.business.address)).toBe(flat({ state: "unreadable" }));
    expect(flat(facts.structuredData)).toBe(flat({ jsonLdBlocks: 0, jsonLdInvalid: 0, microdataItems: 0 }));
  });

  it("returns an unreadable result instead of throwing when the harvest object is poisoned", () => {
    const poisoned = {
      get jsonLdBlocks(): string[] {
        throw new Error("poisoned");
      },
      jsonLdBlocksFound: 1,
      microdata: [],
      microdataCount: 0,
      microdataTruncated: false,
    } as unknown as OwnSiteHarvest;
    const facts = extractOwnSiteFacts(poisoned, META);
    expect(flat(facts.business.address)).toBe(flat({ state: "unreadable" }));
  });
});

describe("extractOwnSiteFacts: empty values and conflicts", () => {
  it("reads an empty-string address as missing, not found", () => {
    const facts = extractOwnSiteFacts(
      harvestOf([{ "@type": "LocalBusiness", address: "" }]),
      META
    );
    expect(flat(facts.business.address)).toBe(flat({ state: "missing", reason: "not_in_markup" }));
  });

  it("reads a PostalAddress whose streetAddress is whitespace only as missing", () => {
    const facts = extractOwnSiteFacts(
      harvestOf([
        { "@type": "LocalBusiness", address: { "@type": "PostalAddress", streetAddress: "   \n\t " } },
      ]),
      META
    );
    expect(flat(facts.business.address)).toBe(flat({ state: "missing", reason: "not_in_markup" }));
  });

  it("takes the first of two LocalBusiness nodes and does not merge the second in", () => {
    const facts = extractOwnSiteFacts(
      harvestOf([
        {
          "@graph": [
            {
              "@type": "LocalBusiness",
              "@id": "#a",
              address: { streetAddress: "Eerste Straat 1", addressLocality: "Leiden" },
            },
            {
              "@type": "LocalBusiness",
              "@id": "#b",
              address: { streetAddress: "Tweede Straat 2", addressLocality: "Haarlem", postalCode: "2000 AA" },
            },
          ],
        },
      ]),
      META
    );
    const address = facts.business.address;
    expect(address.state).toBe("found");
    if (address.state === "found") {
      expect(address.value.streetAddress).toBe("Eerste Straat 1");
      expect(address.value.locality).toBe("Leiden");
      expect(address.value.postalCode).toBeNull();
      expect(JSON.stringify(address.value)).not.toContain("Tweede");
    }
  });

  it("ranks the LocalBusiness family ahead of a plain Organization regardless of node order", () => {
    const facts = extractOwnSiteFacts(
      harvestOf([
        {
          "@graph": [
            {
              "@type": "Organization",
              address: { streetAddress: "Holding Weg 1", addressLocality: "Amsterdam" },
            },
            {
              "@type": "HVACBusiness",
              address: { streetAddress: "Werkplaats 7", addressLocality: "Almere" },
            },
          ],
        },
      ]),
      META
    );
    const address = facts.business.address;
    expect(address.state).toBe("found");
    if (address.state === "found") expect(address.value.streetAddress).toBe("Werkplaats 7");
  });

  it("falls back to a plain Organization when no LocalBusiness-family node has an address", () => {
    const facts = extractOwnSiteFacts(
      harvestOf([
        {
          "@graph": [
            { "@type": "LocalBusiness", name: "No address here" },
            { "@type": "Organization", address: { streetAddress: "Holding Weg 1", addressLocality: "Amsterdam" } },
          ],
        },
      ]),
      META
    );
    expect(facts.business.address.state).toBe("found");
  });

  it("reads a schema.org URL type and a schema: prefixed type the same as a bare one", () => {
    const urlTyped = extractOwnSiteFacts(
      harvestOf([
        { "@type": "https://schema.org/Plumber", address: { streetAddress: "A 1", addressLocality: "B" } },
      ]),
      META
    );
    const prefixed = extractOwnSiteFacts(
      harvestOf([{ "@type": ["schema:Roofingcontractor"], address: { streetAddress: "A 1", addressLocality: "B" } }]),
      META
    );
    expect(urlTyped.business.address.state).toBe("found");
    expect(prefixed.business.address.state).toBe("found");
  });
});

/** Business facts for one LocalBusiness node carrying the given properties. */
function businessOf(props: Record<string, unknown>) {
  return extractOwnSiteFacts(harvestOf([{ "@type": "LocalBusiness", ...props }]), META).business;
}

describe("extractOwnSiteFacts: telephone", () => {
  it("reads a plain string value as found", () => {
    expect(businessOf({ telephone: "+31 30 123 4567" }).telephone.state).toBe("found");
  });

  it("reads an array of strings as found and keeps each number", () => {
    const t = businessOf({ telephone: ["030 123 4567", "06 12345678"] }).telephone;
    expect(t.state).toBe("found");
    if (t.state === "found") expect(t.value.numbers.length).toBe(2);
  });

  it("reads a value nested in contactPoint[].telephone as found", () => {
    const t = businessOf({
      contactPoint: [{ "@type": "ContactPoint", contactType: "sales", telephone: "+31 20 555 0101" }],
    }).telephone;
    expect(t.state).toBe("found");
    if (t.state === "found") expect(t.value.numbers[0]).toBe("+31 20 555 0101");
  });

  it("counts digits after stripping: 9 digits is found", () => {
    expect(businessOf({ telephone: "030-123 456" }).telephone.state).toBe("found");
  });

  it("counts digits after stripping: 8 digits is missing", () => {
    expect(flat(businessOf({ telephone: "030-12 345" }).telephone)).toBe(
      flat({ state: "missing", reason: "not_in_markup" })
    );
  });

  it("reads a blank telephone as missing", () => {
    expect(businessOf({ telephone: "  " }).telephone.state).toBe("missing");
  });
});

describe("extractOwnSiteFacts: opening hours", () => {
  it("reads openingHoursSpecification with dayOfWeek as an array", () => {
    const h = businessOf({
      openingHoursSpecification: [
        { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday"], opens: "08:00", closes: "17:00" },
      ],
    }).openingHours;
    expect(h.state).toBe("found");
    if (h.state === "found") expect(h.value.entries[0].days.join(",")).toBe("monday,tuesday");
  });

  it("reads dayOfWeek given as a single value, including a schema.org URL", () => {
    const h = businessOf({
      openingHoursSpecification: {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "https://schema.org/Friday",
        opens: "09:00",
        closes: "16:00",
      },
    }).openingHours;
    expect(h.state).toBe("found");
    if (h.state === "found") expect(h.value.entries[0].days.join(",")).toBe("friday");
  });

  it("reads an openingHours string with a weekday range and times", () => {
    const h = businessOf({ openingHours: "Mo-Fr 09:00-17:00" }).openingHours;
    expect(h.state).toBe("found");
    if (h.state === "found") {
      expect(h.value.entries[0].days.join(",")).toBe("monday,tuesday,wednesday,thursday,friday");
      expect(h.value.entries[0].opens).toBe("09:00");
      expect(h.value.entries[0].closes).toBe("17:00");
    }
  });

  it("reads an array of openingHours strings with comma separated days", () => {
    const h = businessOf({ openingHours: ["Mo,Tu,We,Th,Fr 09:00-17:00", "Sa 10:00-14:00"] }).openingHours;
    expect(h.state).toBe("found");
    if (h.state === "found") expect(h.value.entries.length).toBe(2);
  });

  it("flags all seven days midnight to 23:59 as found AND looksDefault in one assertion", () => {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const h = businessOf({
      openingHoursSpecification: days.map((d) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: d,
        opens: "00:00",
        closes: "23:59",
      })),
    }).openingHours;
    expect(h.state === "found" && h.value.looksDefault === true).toBe(true);
  });

  it("does not flag ordinary published hours as looksDefault", () => {
    const h = businessOf({ openingHours: "Mo-Su 08:00-18:00" }).openingHours;
    expect(h.state === "found" && h.value.looksDefault === false).toBe(true);
  });

  it("does not flag midnight to 23:59 on fewer than seven days as looksDefault", () => {
    const h = businessOf({
      openingHoursSpecification: [
        { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday"], opens: "00:00", closes: "23:59" },
      ],
    }).openingHours;
    expect(h.state === "found" && h.value.looksDefault === false).toBe(true);
  });

  it("reads a blank openingHours string and an entry with no times as missing", () => {
    expect(businessOf({ openingHours: "   " }).openingHours.state).toBe("missing");
    expect(
      businessOf({ openingHoursSpecification: [{ dayOfWeek: "Monday" }] }).openingHours.state
    ).toBe("missing");
  });
});

describe("extractOwnSiteFacts: service area", () => {
  it("reads areaServed given as plain text", () => {
    const a = businessOf({ areaServed: "Utrecht en omgeving" }).serviceArea;
    expect(a.state).toBe("found");
    if (a.state === "found") expect(a.value.names[0]).toBe("Utrecht en omgeving");
  });

  it("reads an array of City and Place objects and keeps each name", () => {
    const a = businessOf({
      areaServed: [
        { "@type": "City", name: "Utrecht" },
        { "@type": "Place", name: "Amersfoort" },
        { "@type": "AdministrativeArea", name: "Flevoland" },
      ],
    }).serviceArea;
    expect(a.state).toBe("found");
    if (a.state === "found") expect(a.value.names.join("|")).toBe("Utrecht|Amersfoort|Flevoland");
  });

  it("reads a GeoShape carrying a GeoCircle with a midpoint and a radius", () => {
    const a = businessOf({
      areaServed: {
        "@type": "GeoShape",
        geoMidpoint: { "@type": "GeoCoordinates", latitude: 52.09, longitude: 5.12 },
        geoRadius: "25000",
      },
    }).serviceArea;
    expect(a.state).toBe("found");
    if (a.state === "found") {
      expect(a.value.geoShape?.latitude).toBe(52.09);
      expect(a.value.geoShape?.radius).toBe("25000");
    }
  });

  it("also reads the legacy serviceArea property", () => {
    const a = businessOf({ serviceArea: { "@type": "Place", name: "Gelderland" } }).serviceArea;
    expect(a.state).toBe("found");
    if (a.state === "found") expect(a.value.names[0]).toBe("Gelderland");
  });

  it("reads areaServed from a Service node rather than the business node", () => {
    const facts = extractOwnSiteFacts(
      harvestOf([
        {
          "@graph": [
            { "@type": "LocalBusiness", "@id": "#biz", name: "Example" },
            {
              "@type": "Service",
              "@id": "#svc",
              provider: { "@id": "#biz" },
              areaServed: [
                { "@type": "City", name: "Apeldoorn" },
                { "@type": "Place", name: "Deventer" },
              ],
            },
          ],
        },
      ]),
      META
    );
    const a = facts.business.serviceArea;
    expect(a.state).toBe("found");
    if (a.state === "found") expect(a.value.names.join("|")).toBe("Apeldoorn|Deventer");
  });

  it("prefers the business node's own areaServed over a Service node's", () => {
    const facts = extractOwnSiteFacts(
      harvestOf([
        {
          "@graph": [
            { "@type": "Service", areaServed: "Service Stad" },
            { "@type": "LocalBusiness", areaServed: "Bedrijf Stad" },
          ],
        },
      ]),
      META
    );
    const a = facts.business.serviceArea;
    expect(a.state === "found" && a.value.names[0] === "Bedrijf Stad").toBe(true);
  });

  it("reads a blank areaServed and an unnamed Place as missing", () => {
    expect(businessOf({ areaServed: "" }).serviceArea.state).toBe("missing");
    expect(businessOf({ areaServed: { "@type": "Place" } }).serviceArea.state).toBe("missing");
  });
});

describe("extractOwnSiteFacts: certifications", () => {
  it("reads hasCredential with a name", () => {
    const c = businessOf({
      hasCredential: { "@type": "EducationalOccupationalCredential", name: "Erkend installateur" },
    }).certifications;
    expect(c.state).toBe("found");
    if (c.state === "found") expect(c.value.names[0]).toBe("Erkend installateur");
  });

  it("reads hasCertification with a name", () => {
    const c = businessOf({ hasCertification: [{ "@type": "Certification", name: "F-gassen" }] }).certifications;
    expect(c.state).toBe("found");
  });

  it("reads award and memberOf too", () => {
    expect(businessOf({ award: "Installateur van het jaar" }).certifications.state).toBe("found");
    expect(
      businessOf({ memberOf: { "@type": "Organization", name: "Brancheorganisatie" } }).certifications.state
    ).toBe("found");
  });

  it("reads an entry with no name as missing", () => {
    expect(
      businessOf({ hasCredential: { "@type": "EducationalOccupationalCredential" } }).certifications.state
    ).toBe("missing");
    expect(businessOf({ award: "   " }).certifications.state).toBe("missing");
  });
});

describe("extractOwnSiteFacts: per-field independence", () => {
  it("returns exactly one found field and four missing ones for a site that publishes only an address", () => {
    const b = businessOf({ address: { streetAddress: "Laan 1", addressLocality: "Ede" } });
    expect(b.address.state).toBe("found");
    expect(flat(b.telephone)).toBe(flat({ state: "missing", reason: "not_in_markup" }));
    expect(flat(b.openingHours)).toBe(flat({ state: "missing", reason: "not_in_markup" }));
    expect(flat(b.serviceArea)).toBe(flat({ state: "missing", reason: "not_in_markup" }));
    expect(flat(b.certifications)).toBe(flat({ state: "missing", reason: "not_in_markup" }));
  });

  it("keeps all five keys present when every field is missing", () => {
    const b = extractOwnSiteFacts(NO_BLOCKS, META).business;
    expect(Object.keys(b).sort().join(",")).toBe("address,certifications,openingHours,serviceArea,telephone");
    expect(flat(b.telephone)).toBe(flat({ state: "missing", reason: "no_structured_data" }));
  });

  it("keeps all five keys present when every field is unreadable", () => {
    const b = extractOwnSiteFacts(null, META).business;
    expect(Object.keys(b).sort().join(",")).toBe("address,certifications,openingHours,serviceArea,telephone");
    expect(b.serviceArea.state).toBe("unreadable");
  });
});

/** A harvest carrying only microdata items, optionally with JSON-LD blocks too. */
function microdataHarvest(
  items: MicrodataItem[],
  blocks: unknown[] = [],
  extra: Partial<OwnSiteHarvest> = {}
): OwnSiteHarvest {
  return { ...harvestOf(blocks), microdata: items, microdataCount: items.length, ...extra };
}

const SCHEMA = "https://schema.org/";

const BREADCRUMB: MicrodataItem = {
  type: `${SCHEMA}BreadcrumbList`,
  props: { itemListElement: [{ type: `${SCHEMA}ListItem`, props: { name: ["Home"] } }] },
};

const MICRO_BUSINESS: MicrodataItem = {
  type: `${SCHEMA}LocalBusiness`,
  props: {
    name: ["Micro Installatie"],
    telephone: ["+31 40 123 4567"],
    address: [
      {
        type: `${SCHEMA}PostalAddress`,
        props: { streetAddress: ["Microlaan 8"], addressLocality: ["Eindhoven"], postalCode: ["5611 AB"] },
      },
    ],
  },
};

describe("extractOwnSiteFacts: microdata fallback", () => {
  it("reads a microdata-only page, with source microdata", () => {
    const facts = extractOwnSiteFacts(microdataHarvest([MICRO_BUSINESS]), META);
    const address = facts.business.address;
    expect(address.state).toBe("found");
    if (address.state === "found") {
      expect(address.source).toBe("microdata");
      expect(address.value.streetAddress).toBe("Microlaan 8");
    }
    const phone = facts.business.telephone;
    expect(phone.state === "found" && phone.source === "microdata").toBe(true);
    expect(facts.structuredData.microdataItems).toBe(1);
  });

  it("reads the business when the first itemscope root is a breadcrumb", () => {
    const facts = extractOwnSiteFacts(microdataHarvest([BREADCRUMB, MICRO_BUSINESS]), META);
    const address = facts.business.address;
    expect(address.state === "found" && address.value.streetAddress === "Microlaan 8").toBe(true);
  });

  it("reads missing, not found, when the only microdata item is a breadcrumb", () => {
    const facts = extractOwnSiteFacts(microdataHarvest([BREADCRUMB]), META);
    expect(flat(facts.business.address)).toBe(flat({ state: "missing", reason: "not_in_markup" }));
  });

  it("lets JSON-LD win over microdata that disagrees, and records which one produced the value", () => {
    const facts = extractOwnSiteFacts(
      microdataHarvest(
        [MICRO_BUSINESS],
        [{ "@type": "LocalBusiness", address: { streetAddress: "Jsonlaan 1", addressLocality: "Breda" } }]
      ),
      META
    );
    const address = facts.business.address;
    expect(address.state === "found" && address.source === "jsonld").toBe(true);
    expect(address.state === "found" && address.value.streetAddress === "Jsonlaan 1").toBe(true);
  });

  it("falls back to microdata for a field JSON-LD leaves out", () => {
    const facts = extractOwnSiteFacts(
      microdataHarvest(
        [MICRO_BUSINESS],
        [{ "@type": "LocalBusiness", address: { streetAddress: "Jsonlaan 1", addressLocality: "Breda" } }]
      ),
      META
    );
    const phone = facts.business.telephone;
    expect(phone.state === "found" && phone.source === "microdata").toBe(true);
  });

  it("reads unreadable, not missing, when a microdata cap cut the walk short", () => {
    const facts = extractOwnSiteFacts(microdataHarvest([BREADCRUMB], [], { microdataTruncated: true }), META);
    expect(facts.business.address.state).toBe("unreadable");
  });

  it("does not let a __proto__ property in microdata smuggle an address in through inheritance", () => {
    // If the converter assigned this key onto a plain object it would become the
    // node's prototype, and node.address would then be read off the prototype.
    const hostile: MicrodataItem = {
      type: `${SCHEMA}LocalBusiness`,
      props: JSON.parse(
        '{"__proto__": [{"type": "x", "props": {"address": ["Erfgoed 1, Utrecht"]}}], "name": ["Hostile"]}'
      ),
    };
    const facts = extractOwnSiteFacts(microdataHarvest([hostile]), META);
    expect(facts.business.address.state).toBe("missing");
    expect(({} as Record<string, unknown>)["address"]).toBeUndefined();
  });
});

describe("extractOwnSiteFacts: hostile structure", () => {
  it("terminates on a cyclic @id reference graph", () => {
    const facts = extractOwnSiteFacts(
      harvestOf([
        {
          "@graph": [
            { "@type": "LocalBusiness", "@id": "#a", address: { "@id": "#b" }, areaServed: { "@id": "#b" } },
            { "@type": "PostalAddress", "@id": "#b", location: { "@id": "#a" }, geo: { "@id": "#b" } },
            { "@id": "#c", sameAs: { "@id": "#d" } },
            { "@id": "#d", sameAs: { "@id": "#c" } },
          ],
        },
      ]),
      META
    );
    expect(facts.business.address.state).toBe("missing");
  });

  it("reads a reference that points back at itself as no value", () => {
    const facts = extractOwnSiteFacts(
      harvestOf([{ "@type": "LocalBusiness", "@id": "#a", address: { "@id": "#a" } }]),
      META
    );
    expect(facts.business.address.state).toBe("missing");
  });

  it("walks no deeper than 6 levels and holds no more than 5,000 nodes", () => {
    let deep: unknown = { "@type": "Plumber", address: { streetAddress: "Te Diep 1", addressLocality: "X" } };
    for (let i = 0; i < 30; i++) deep = { "@type": "Thing", child: deep };
    expect(extractOwnSiteFacts(harvestOf([deep]), META).business.address.state).toBe("missing");

    // 12,000 tiny nodes stay under the 200,000 character block cap, so the pool
    // cap (5,000) is what stops the walk. The business node after them is never reached.
    const filler = Array.from({ length: 12_000 }, () => ({ "@type": "T" }));
    const late = { "@type": "Plumber", address: { streetAddress: "Te Laat 1", addressLocality: "X" } };
    const raw = JSON.stringify({ "@graph": [...filler, late] });
    expect(raw.length).toBeLessThan(200_000);
    const facts = extractOwnSiteFacts(harvestOf([raw]), META);
    expect(facts.business.address.state).toBe("missing");
    const early = JSON.stringify({ "@graph": [late, ...filler] });
    expect(extractOwnSiteFacts(harvestOf([early]), META).business.address.state).toBe("found");
  });

  it("reads a block at the 200,000 character cap as unreadable even when the text happens to parse", () => {
    // Valid JSON, padded to exactly the cap: the harvester cuts at this length, so
    // a block this long may have been cut off and must not be trusted as complete.
    const core = '{"@type":"Plumber","address":{"streetAddress":"Kapweg 1","addressLocality":"X"},"pad":""}';
    const padded = core.replace('"pad":""', `"pad":"${"p".repeat(200_000 - core.length)}"`);
    expect(padded.length).toBe(200_000);
    const facts = extractOwnSiteFacts(harvestOf([padded]), META);
    expect(facts.business.address.state).toBe("unreadable");
    expect(facts.structuredData.jsonLdInvalid).toBe(1);

    const justUnder = core.replace('"pad":""', `"pad":"${"p".repeat(199_999 - core.length)}"`);
    expect(justUnder.length).toBe(199_999);
    expect(extractOwnSiteFacts(harvestOf([justUnder]), META).business.address.state).toBe("found");
  });

  it("reads unreadable when the page held more blocks than the harvester kept", () => {
    const facts = extractOwnSiteFacts(
      { ...harvestOf([{ "@type": "WebSite" }]), jsonLdBlocksFound: 25 },
      META
    );
    expect(facts.business.address.state).toBe("unreadable");
  });

  it("applies its own block cap to a harvest that exceeds it", () => {
    const blocks = Array.from({ length: 30 }, () => ({ "@type": "WebSite" }));
    const facts = extractOwnSiteFacts(harvestOf(blocks), META);
    expect(facts.structuredData.jsonLdBlocks).toBe(20);
    expect(facts.business.address.state).toBe("unreadable");
  });
});

describe("extractOwnSiteFacts: stored shape", () => {
  it("carries the schema version, the injected readAt and the page count", () => {
    const facts = extractOwnSiteFacts(NO_BLOCKS, { readAt: "2026-01-02T03:04:05.000Z", pagesRead: 3 });
    expect(facts.schemaVersion).toBe(1);
    expect(facts.readAt).toBe("2026-01-02T03:04:05.000Z");
    expect(facts.pagesRead).toBe(3);
  });
});

// ── Social proof (ENG-02) ────────────────────────────────────────────────

/**
 * A slice built by hand. The widget host list lives here and in the real
 * profile, never in the scanner: the host-list case below proves the extractor
 * reads it from the slice by handing it a slice that lacks a host.
 */
function sliceWith(reviewWidgetHosts: string[]): NicheScanSlice {
  return {
    nicheId: "test-niche",
    trades: [
      {
        id: "test_trade",
        terms: [],
        tieBreakRank: 1,
        checks: { quoteTerms: [], projectTerms: [], certificationTerms: [] },
      },
    ],
    reviewWidgetHosts,
    minTradeScore: 8,
    dominanceRatio: 1.5,
  };
}

const SLICE = sliceWith(["klantenvertellen", "trustpilot", "trustindex", "kiyoh", "feedbackcompany"]);

/** One page: JSON-LD values plus any zone overrides. */
function page(blocks: Array<unknown> = [], zones: Partial<OwnSiteHarvest> = {}): OwnSiteHarvest {
  return { ...harvestOf(blocks), ...zones };
}

type ReadSocialProof = Extract<OwnSiteSocialProof, { state: "read" }>;

/** Narrow a social-proof result. Callers assert state first so a failure names the state. */
function readOf(proof: OwnSiteSocialProof): ReadSocialProof {
  if (proof.state !== "read") throw new Error(`expected state "read", got "${proof.state}"`);
  return proof;
}

const BUSINESS = { "@type": "LocalBusiness", "@id": "https://example.test/#biz", name: "Example Installatie" };

describe("extractSocialProof: whether reviews are shown", () => {
  it("reads a known review widget host as reviews shown, and names the host", () => {
    const proof = extractSocialProof([page([], { widgetHosts: ["widget.klantenvertellen.nl", "cdn.example.test"] })], SLICE);
    expect(proof.state).toBe("read");
    const p = readOf(proof);
    expect(String(p.shown)).toBe("true");
    expect(p.evidence.join("|")).toContain("widget host: widget.klantenvertellen.nl");
    expect(flat(p.widgetHosts)).toBe('["widget.klantenvertellen.nl"]');
  });

  it("reads the host list from the slice it was handed, not from a list of its own", () => {
    const withoutHost = sliceWith(["acme-reviews"]);
    const absent = readOf(extractSocialProof([page([], { widgetHosts: ["widget.klantenvertellen.nl"] })], withoutHost));
    expect(String(absent.shown)).toBe("false");
    const present = readOf(extractSocialProof([page([], { widgetHosts: ["cdn.acme-reviews.example"] })], withoutHost));
    expect(String(present.shown)).toBe("true");
  });

  it("matches a slice host fragment against the hostname without case sensitivity and ignores a blank fragment", () => {
    const slice = sliceWith(["", "  ", "TrustPilot"]);
    const p = readOf(extractSocialProof([page([], { widgetHosts: ["widget.trustpilot.com", "cdn.example.test"] })], slice));
    expect(String(p.shown)).toBe("true");
    expect(flat(p.widgetHosts)).toBe('["widget.trustpilot.com"]');
    const none = readOf(extractSocialProof([page([], { widgetHosts: ["cdn.example.test"] })], slice));
    expect(String(none.shown)).toBe("false");
  });

  it("reads an AggregateRating node in the markup as marked up and shown", () => {
    const proof = extractSocialProof(
      [page([{ "@graph": [BUSINESS, { "@type": "AggregateRating", ratingValue: 4.8, reviewCount: 12 }] }])],
      SLICE
    );
    expect(proof.state).toBe("read");
    const p = readOf(proof);
    expect(String(p.markedUp)).toBe("true");
    expect(String(p.shown)).toBe("true");
    expect(p.evidence.join("|")).toContain("markup: AggregateRating");
  });

  it("reads a Review node in the markup as marked up and shown", () => {
    const p = readOf(
      extractSocialProof([page([{ "@graph": [BUSINESS, { "@type": "Review", datePublished: "2026-03-01" }] }])], SLICE)
    );
    expect(String(p.markedUp)).toBe("true");
    expect(String(p.shown)).toBe("true");
    expect(p.evidence.join("|")).toContain("markup: Review");
  });

  it("reads a review word in a heading as shown, and quotes the heading", () => {
    const p = readOf(extractSocialProof([page([], { h2h3: ["Onze reviews", "Over ons"] })], SLICE));
    expect(String(p.shown)).toBe("true");
    expect(p.evidence.join("|")).toContain("heading: Onze reviews");
    expect(String(p.markedUp)).toBe("false");
  });

  it("reads a rating pattern in the visible text as shown", () => {
    const p = readOf(extractSocialProof([page([], { bodyText: "Wij scoren gemiddeld 4,8/5 bij onze klanten." })], SLICE));
    expect(String(p.shown)).toBe("true");
    expect(p.evidence.join("|")).toContain("visible text: 4,8/5");
  });

  it("does not read a plain sentence that happens to hold a number and a review word far apart as a rating", () => {
    const p = readOf(extractSocialProof([page([], { bodyText: "Bel ons op 06 12345678. Vraag naar onze werkwijze." })], SLICE));
    expect(String(p.shown)).toBe("false");
  });

  it("reports no reviews at all as shown false, markedUp false, count missing and recency missing", () => {
    const proof = extractSocialProof([page([])], SLICE);
    expect(proof.state).toBe("read");
    const p = readOf(proof);
    expect(String(p.shown)).toBe("false");
    expect(String(p.markedUp)).toBe("false");
    expect(p.count.state).toBe("missing");
    expect(p.recency.state).toBe("missing");
    expect(flat(p.evidence)).toBe("[]");
    expect(flat(p.widgetHosts)).toBe("[]");
  });

  it("tells a site with markup that leaves reviews out apart from a site with no markup", () => {
    const noMarkup = readOf(extractSocialProof([page([])], SLICE));
    const noReviews = readOf(extractSocialProof([page([BUSINESS])], SLICE));
    expect(JSON.stringify(noMarkup.count)).toBe('{"state":"missing","reason":"no_structured_data"}');
    expect(JSON.stringify(noReviews.count)).toBe('{"state":"missing","reason":"not_in_markup"}');
  });
});

describe("extractSocialProof: could not tell is not not-there", () => {
  it("reads count unreadable, not missing, when the only JSON-LD block does not parse", () => {
    const proof = extractSocialProof([page(["{ this is not json"])], SLICE);
    expect(proof.state).toBe("read");
    const p = readOf(proof);
    expect(p.count.state).toBe("unreadable");
    expect(p.recency.state).toBe("unreadable");
  });

  it("reads shown and markedUp as null, not false, when a block did not parse and nothing else showed reviews", () => {
    const p = readOf(extractSocialProof([page(["{ this is not json"])], SLICE));
    expect(String(p.shown)).toBe("null");
    expect(String(p.markedUp)).toBe("null");
  });

  it("keeps a found signal true even when another block did not parse", () => {
    const p = readOf(
      extractSocialProof([page(["{ nope", { "@type": "AggregateRating", ratingValue: 5, reviewCount: 9 }])], SLICE)
    );
    expect(String(p.shown)).toBe("true");
    expect(String(p.markedUp)).toBe("true");
  });

  it("reads a page that failed to harvest as could not tell for every absence, and keeps what another page found", () => {
    const p = readOf(extractSocialProof([null, page([BUSINESS])], SLICE));
    expect(String(p.shown)).toBe("null");
    expect(p.count.state).toBe("unreadable");
    const found = readOf(extractSocialProof([null, page([], { widgetHosts: ["widget.trustpilot.com"] })], SLICE));
    expect(String(found.shown)).toBe("true");
  });

  it("reads the whole result unreadable when no page could be read", () => {
    expect(extractSocialProof([null, null], SLICE).state).toBe("unreadable");
    expect(extractSocialProof([], SLICE).state).toBe("unreadable");
  });
});

describe("extractSocialProof: the count", () => {
  const rated = (rating: Record<string, unknown>): unknown => ({
    "@graph": [{ ...BUSINESS, aggregateRating: { "@type": "AggregateRating", ratingValue: 4.6, ...rating } }],
  });

  it("trusts reviewCount before ratingCount when the two disagree", () => {
    const p = readOf(extractSocialProof([page([rated({ reviewCount: 42, ratingCount: 7 })])], SLICE));
    expect(p.count.state).toBe("found");
    expect(JSON.stringify(p.count)).toBe('{"state":"found","value":42,"source":"jsonld"}');
  });

  it("trusts reviewCount even when it is the smaller of the two, so the order is a rule and not a maximum", () => {
    const p = readOf(extractSocialProof([page([rated({ reviewCount: 7, ratingCount: 42 })])], SLICE));
    expect(JSON.stringify(p.count)).toBe('{"state":"found","value":7,"source":"jsonld"}');
  });

  it("does not depend on which of the two keys the site wrote first", () => {
    const p = readOf(extractSocialProof([page([rated({ ratingCount: 7, reviewCount: 42 })])], SLICE));
    expect(JSON.stringify(p.count)).toBe('{"state":"found","value":42,"source":"jsonld"}');
  });

  it("falls back to ratingCount when reviewCount is absent", () => {
    const p = readOf(extractSocialProof([page([rated({ ratingCount: 7 })])], SLICE));
    expect(JSON.stringify(p.count)).toBe('{"state":"found","value":7,"source":"jsonld"}');
  });

  it("reads a count the site wrote as a numeric string, and a count of zero", () => {
    const text = readOf(extractSocialProof([page([rated({ reviewCount: "1250" })])], SLICE));
    expect(JSON.stringify(text.count)).toBe('{"state":"found","value":1250,"source":"jsonld"}');
    const zero = readOf(extractSocialProof([page([rated({ reviewCount: 0 })])], SLICE));
    expect(JSON.stringify(zero.count)).toBe('{"state":"found","value":0,"source":"jsonld"}');
  });

  it("does not read a negative, fractional or non-numeric count", () => {
    for (const bad of [-3, 4.5, "many", "", null]) {
      const p = readOf(extractSocialProof([page([rated({ reviewCount: bad })])], SLICE));
      expect(p.count.state).toBe("missing");
    }
  });

  it("reads the count off a microdata AggregateRating when there is no JSON-LD, recording microdata as the source", () => {
    const item: MicrodataItem = {
      type: "https://schema.org/LocalBusiness",
      props: {
        aggregateRating: [
          { type: "https://schema.org/AggregateRating", props: { ratingValue: ["4.8"], reviewCount: ["31"] } },
        ],
      },
    };
    const p = readOf(extractSocialProof([{ ...page([]), microdata: [item], microdataCount: 2 }], SLICE));
    expect(JSON.stringify(p.count)).toBe('{"state":"found","value":31,"source":"microdata"}');
  });

  it("does not count a rating that belongs to a product rather than the business", () => {
    const p = readOf(
      extractSocialProof(
        [page([{ "@graph": [BUSINESS, { "@type": "Product", name: "Boiler", aggregateRating: { reviewCount: 99 } }] }])],
        SLICE
      )
    );
    expect(p.count.state).toBe("missing");
    expect(String(p.markedUp)).toBe("true");
  });

  it("reads a count phrase from the visible text when no markup carries one, recording visible_text", () => {
    const p = readOf(extractSocialProof([page([], { bodyText: "Al 128 beoordelingen van tevreden klanten." })], SLICE));
    expect(JSON.stringify(p.count)).toBe('{"state":"found","value":128,"source":"visible_text"}');
  });

  it("lets markup win over a visible text phrase", () => {
    const p = readOf(
      extractSocialProof([page([rated({ reviewCount: 42 })], { bodyText: "Al 128 beoordelingen van klanten." })], SLICE)
    );
    expect(JSON.stringify(p.count)).toBe('{"state":"found","value":42,"source":"jsonld"}');
  });

  it("resolves two pages that disagree to the larger count, whichever page comes first", () => {
    const a = page([rated({ reviewCount: 40 })]);
    const b = page([rated({ reviewCount: 44 })]);
    const forward = readOf(extractSocialProof([a, b], SLICE));
    const backward = readOf(extractSocialProof([b, a], SLICE));
    expect(JSON.stringify(forward.count)).toBe('{"state":"found","value":44,"source":"jsonld"}');
    expect(flat(forward.count)).toBe(flat(backward.count));
  });
});

describe("extractSocialProof: how recent", () => {
  it("takes the newest datePublished among the business's reviews", () => {
    const p = readOf(
      extractSocialProof(
        [
          page([
            {
              "@graph": [
                { ...BUSINESS, review: [{ "@type": "Review", datePublished: "2026-01-15" }, { "@type": "Review", datePublished: "2026-09-02" }] },
              ],
            },
          ]),
        ],
        SLICE
      )
    );
    expect(JSON.stringify(p.recency)).toBe('{"state":"found","value":"2026-09-02","source":"jsonld"}');
  });

  it("reads a standalone Review node that reviews the business", () => {
    const p = readOf(
      extractSocialProof(
        [page([{ "@graph": [BUSINESS, { "@type": "Review", itemReviewed: { "@id": "https://example.test/#biz" }, datePublished: "2026-05-05" }] }])],
        SLICE
      )
    );
    expect(JSON.stringify(p.recency)).toBe('{"state":"found","value":"2026-05-05","source":"jsonld"}');
  });

  it("does not claim a review that names no business, or names a product, for the business's recency", () => {
    const noItem = readOf(
      extractSocialProof([page([{ "@graph": [BUSINESS, { "@type": "Review", datePublished: "2026-05-05" }] }])], SLICE)
    );
    expect(noItem.recency.state).toBe("missing");
    const product = readOf(
      extractSocialProof(
        [
          page([
            {
              "@graph": [
                BUSINESS,
                { "@type": "Product", "@id": "https://example.test/#boiler", name: "Boiler" },
                { "@type": "Review", itemReviewed: { "@id": "https://example.test/#boiler" }, datePublished: "2026-06-06" },
              ],
            },
          ]),
        ],
        SLICE
      )
    );
    expect(product.recency.state).toBe("missing");
  });

  it("ignores a review date that is not a date", () => {
    const p = readOf(
      extractSocialProof([page([{ "@graph": [{ ...BUSINESS, review: [{ "@type": "Review", datePublished: "last week" }] }] }])], SLICE)
    );
    expect(p.recency.state).toBe("missing");
  });
});

describe("extractSocialProof: stored host list", () => {
  it("stores one entry when two pages carry the same host, and keeps the list sorted", () => {
    const first = page([], { widgetHosts: ["widget.trustpilot.com", "widget.klantenvertellen.nl"] });
    const second = page([], { widgetHosts: ["widget.klantenvertellen.nl"] });
    const p = readOf(extractSocialProof([first, second], SLICE));
    expect(p.widgetHosts.length).toBe(2);
    expect(flat(p.widgetHosts)).toBe('["widget.klantenvertellen.nl","widget.trustpilot.com"]');
  });

  it("stores the same host list whatever order the pages arrive in", () => {
    const first = page([], { widgetHosts: ["widget.trustpilot.com"] });
    const second = page([], { widgetHosts: ["widget.kiyoh.com", "widget.klantenvertellen.nl"] });
    const forward = readOf(extractSocialProof([first, second], SLICE));
    const backward = readOf(extractSocialProof([second, first], SLICE));
    expect(flat(forward.widgetHosts)).toBe(flat(backward.widgetHosts));
    expect(flat(forward.widgetHosts)).toBe('["widget.kiyoh.com","widget.klantenvertellen.nl","widget.trustpilot.com"]');
  });
});

// ── Quote readiness (ENG-05) ─────────────────────────────────────────────

/** The per-trade terms. Dutch because the profile's are; the scanner holds none of its own. */
const CHECKS = {
  quoteTerms: ["offerte", "prijsopgave", "afspraak", "vrijblijvend"],
  projectTerms: ["projecten", "portfolio", "realisaties", "referenties", "ons werk"],
  certificationTerms: ["installq", "techniek nederland", "f-gas"],
};

type EvaluatedQuoteReadiness = Extract<OwnSiteQuoteReadiness, { state: "evaluated" }>;

function evaluatedOf(result: OwnSiteQuoteReadiness): EvaluatedQuoteReadiness {
  if (result.state !== "evaluated") throw new Error(`expected state "evaluated", got "${result.state}"`);
  return result;
}

function evaluate(zones: Partial<OwnSiteHarvest>, checks = CHECKS): EvaluatedQuoteReadiness {
  const result = evaluateQuoteReadiness(page([], zones), checks);
  expect(result.state).toBe("evaluated");
  return evaluatedOf(result);
}

const images = (n: number): OwnSiteHarvest["imgHints"] =>
  Array.from({ length: n }, (_, i) => ({ alt: `foto ${i}`, file: `foto-${i}.jpg` }));

describe("evaluateQuoteReadiness: quote form", () => {
  it("passes a form with exactly 2 fillable fields and names the form", () => {
    const q = evaluate({ formSummaries: [{ fieldCount: MIN_QUOTE_FORM_FIELDS, submitLabel: "Verstuur" }] });
    expect(String(q.quoteForm.passed)).toBe("true");
    expect(q.quoteForm.evidence).toBe("form with 2 fillable fields");
  });

  it("fails a form with exactly 1 fillable field, which is a newsletter signup", () => {
    const q = evaluate({ formSummaries: [{ fieldCount: MIN_QUOTE_FORM_FIELDS - 1, submitLabel: "Aanmelden" }] });
    expect(String(q.quoteForm.passed)).toBe("false");
    expect(q.quoteForm.evidence).toBe("");
  });

  it("states the threshold as 2", () => {
    expect(MIN_QUOTE_FORM_FIELDS).toBe(2);
  });

  it("passes with no form when a nav link names a quote term", () => {
    const q = evaluate({ navTexts: ["Home", "Offerte aanvragen"] });
    expect(String(q.quoteForm.passed)).toBe("true");
    expect(q.quoteForm.evidence).toBe('link text: "Offerte aanvragen"');
  });

  it("passes when an internal link path names a quote term", () => {
    const q = evaluate({ internalPaths: ["/over-ons", "/gratis-offerte-aanvragen"] });
    expect(String(q.quoteForm.passed)).toBe("true");
    expect(q.quoteForm.evidence).toBe("link path: /gratis-offerte-aanvragen");
  });

  it("reads a quote term at the start of a compound word", () => {
    const q = evaluate({ navTexts: ["Offerteaanvraag"] });
    expect(String(q.quoteForm.passed)).toBe("true");
  });

  it("passes a one-field form whose button names a quote term", () => {
    const q = evaluate({ formSummaries: [{ fieldCount: 1, submitLabel: "Vraag vrijblijvend offerte aan" }] });
    expect(String(q.quoteForm.passed)).toBe("true");
    expect(q.quoteForm.evidence).toBe('button text: "Vraag vrijblijvend offerte aan"');
  });

  it("does not read a quote word that only appears in the running text as a way to ask", () => {
    const q = evaluate({ bodyText: "Wij maken graag een offerte voor u. Bel ons." });
    expect(String(q.quoteForm.passed)).toBe("false");
  });
});

describe("evaluateQuoteReadiness: tap-to-call", () => {
  it("passes on a tel link and names it", () => {
    const q = evaluate({ telHrefs: ["tel:+31401234567"] });
    expect(String(q.tapToCall.passed)).toBe("true");
    expect(q.tapToCall.evidence).toBe("tel link: tel:+31401234567");
  });

  it("fails when the site only has a mailto link", () => {
    const q = evaluate({ telHrefs: [], internalPaths: ["/contact"], bodyText: "mail ons: info@example.test" });
    expect(String(q.tapToCall.passed)).toBe("false");
    expect(q.tapToCall.evidence).toBe("");
  });

  it("fails when the phone number is only in the body text with no tel link", () => {
    const q = evaluate({ bodyText: "Bel 040 123 4567 voor een afspraak." });
    expect(String(q.tapToCall.passed)).toBe("false");
  });

  it("ignores a harvested href that is not the telephone scheme", () => {
    const q = evaluate({ telHrefs: ["mailto:info@example.test", "  "] });
    expect(String(q.tapToCall.passed)).toBe("false");
  });
});

describe("evaluateQuoteReadiness: project photos", () => {
  it("passes a project term in the nav with enough images", () => {
    const q = evaluate({ navTexts: ["Projecten"], imgHints: images(MIN_PROJECT_IMAGES) });
    expect(String(q.projectPhotos.passed)).toBe("true");
    expect(q.projectPhotos.evidence).toBe('"projecten" in nav, 3 images');
  });

  it("passes a project term in an internal link path", () => {
    const q = evaluate({ internalPaths: ["/realisaties/dakrenovatie"], imgHints: images(5) });
    expect(String(q.projectPhotos.passed)).toBe("true");
    expect(q.projectPhotos.evidence).toBe('"realisaties" in link path, 5 images');
  });

  it("passes a multi-word project term in a heading", () => {
    const q = evaluate({ h2h3: ["Ons werk"], imgHints: images(4) });
    expect(String(q.projectPhotos.passed)).toBe("true");
    expect(q.projectPhotos.evidence).toBe('"ons werk" in heading, 4 images');
  });

  it("fails a project term with no images", () => {
    const q = evaluate({ navTexts: ["Projecten"], imgHints: [] });
    expect(String(q.projectPhotos.passed)).toBe("false");
    expect(q.projectPhotos.evidence).toBe("");
  });

  it("fails a project term with fewer images than the minimum", () => {
    const q = evaluate({ navTexts: ["Projecten"], imgHints: images(MIN_PROJECT_IMAGES - 1) });
    expect(String(q.projectPhotos.passed)).toBe("false");
  });

  it("fails many images with no project term anywhere", () => {
    const q = evaluate({ navTexts: ["Home", "Contact"], imgHints: images(20) });
    expect(String(q.projectPhotos.passed)).toBe("false");
  });
});

describe("evaluateQuoteReadiness: certifications", () => {
  it("passes a scheme name as whole words in the visible text", () => {
    const q = evaluate({ bodyText: "Wij zijn InstallQ erkend en werken veilig." });
    expect(String(q.certifications.passed)).toBe("true");
    expect(q.certifications.evidence).toBe('"installq" in visible text');
  });

  it("passes a multi-word scheme name across a hyphen or a space", () => {
    const q = evaluate({ bodyText: "Lid van Techniek-Nederland sinds 2012." });
    expect(String(q.certifications.passed)).toBe("true");
    expect(q.certifications.evidence).toBe('"techniek nederland" in visible text');
  });

  it("passes a scheme name that only appears in an image alt attribute", () => {
    const q = evaluate({ imgHints: [{ alt: "InstallQ erkend installateur", file: "badge.png" }] });
    expect(String(q.certifications.passed)).toBe("true");
    expect(q.certifications.evidence).toBe('"installq" in image alt');
  });

  it("passes a scheme name that only appears in an image file name", () => {
    const q = evaluate({ imgHints: [{ alt: "", file: "installq-logo.png" }] });
    expect(String(q.certifications.passed)).toBe("true");
    expect(q.certifications.evidence).toBe('"installq" in image file name');
  });

  it("fails a scheme name that only appears where a class attribute or script body would carry it", () => {
    // A class attribute is never harvested, so the only places the name can sit are
    // the raw JSON-LD block, a script host and similar. None of them is read.
    const q = evaluate({
      jsonLdBlocks: ['{"@type":"WebPage","description":"installq"}'],
      widgetHosts: ["installq.example.test"],
    });
    expect(String(q.certifications.passed)).toBe("false");
    expect(q.certifications.evidence).toBe("");
  });

  it("does not match a short term inside a longer word", () => {
    const q = evaluate({ bodyText: "Een stekker en een stekdoos." }, { ...CHECKS, certificationTerms: ["stek"] });
    expect(String(q.certifications.passed)).toBe("false");
    const whole = evaluate({ bodyText: "Wij zijn STEK gecertificeerd." }, { ...CHECKS, certificationTerms: ["stek"] });
    expect(String(whole.certifications.passed)).toBe("true");
  });

  it("never passes on the chamber-of-commerce number, the bare word recognised or the standard acronym alone", () => {
    const q = evaluate({ bodyText: "KvK 12345678. Erkend bedrijf. ISO 9001. Gecertificeerd.", h2h3: ["Erkend"] });
    expect(String(q.certifications.passed)).toBe("false");
  });

  it("passes nothing term-based when the slice carries no terms", () => {
    const empty = { quoteTerms: [], projectTerms: [], certificationTerms: [] };
    const q = evaluate(
      { bodyText: "InstallQ offerte projecten", navTexts: ["Offerte", "Projecten"], imgHints: images(9) },
      empty
    );
    expect(String(q.certifications.passed)).toBe("false");
    expect(String(q.projectPhotos.passed)).toBe("false");
    expect(String(q.quoteForm.passed)).toBe("false");
  });
});

describe("evaluateQuoteReadiness: terms are literals, never patterns", () => {
  const hostile = ["(a+)+$", ".*", "[", "\\", "a{999999}", "(?<=x)", "^", "*"];

  it("neither throws nor matches arbitrary text for a term full of regex metacharacters", () => {
    // "a" runs are the classic catastrophic-backtracking input. The other zones carry a
    // different letter because "(a+)+$" reduces to the literal word "a", which would
    // legitimately start a word that begins with "a".
    const text = `${"a".repeat(5000)}!`;
    const other = `${"b".repeat(5000)}!`;
    for (const term of hostile) {
      const checks = { quoteTerms: [term], projectTerms: [term], certificationTerms: [term] };
      const q = evaluate({ bodyText: text, navTexts: [other], internalPaths: [other], h2h3: [other], imgHints: images(5) }, checks);
      expect(String(q.certifications.passed)).toBe("false");
      expect(String(q.quoteForm.passed)).toBe("false");
      expect(String(q.projectPhotos.passed)).toBe("false");
    }
  });

  it("still finds a term that really is the text, punctuation and all", () => {
    const q = evaluate({ bodyText: "Gecertificeerd F-gas installateur." });
    expect(String(q.certifications.passed)).toBe("true");
    expect(q.certifications.evidence).toBe('"f-gas" in visible text');
  });

  it("bounds a slice that carries thousands of terms", () => {
    const many = Array.from({ length: 5000 }, (_, i) => `term${i}`);
    const q = evaluate({ bodyText: "term4999 hier" }, { quoteTerms: many, projectTerms: many, certificationTerms: many });
    expect(String(q.certifications.passed)).toBe("false");
  });
});

describe("evaluateQuoteReadiness: evidence and failure", () => {
  it("gives every passing check a non-empty evidence string and every failing check an empty one", () => {
    const q = evaluate({
      formSummaries: [{ fieldCount: 3, submitLabel: "Verstuur" }],
      telHrefs: ["tel:0401234567"],
      navTexts: ["Projecten"],
      imgHints: images(4),
      bodyText: "InstallQ erkend",
    });
    for (const check of [q.quoteForm, q.tapToCall, q.projectPhotos, q.certifications]) {
      expect(String(check.passed)).toBe("true");
      expect(check.evidence.length > 0).toBe(true);
    }
    const none = evaluate({});
    for (const check of [none.quoteForm, none.tapToCall, none.projectPhotos, none.certifications]) {
      expect(String(check.passed)).toBe("false");
      expect(check.evidence).toBe("");
    }
  });

  it("reads a page whose harvest failed as unreadable, not as four false booleans", () => {
    const result = evaluateQuoteReadiness(null, CHECKS);
    expect(result.state).toBe("unreadable");
    expect(flat(result)).toBe('{"state":"unreadable"}');
  });

  it("reads a page as unreadable when evaluating it throws", () => {
    const interrupted = {
      ...page([]),
      get formSummaries(): OwnSiteHarvest["formSummaries"] {
        throw new Error("page closed mid-read");
      },
    } as OwnSiteHarvest;
    expect(evaluateQuoteReadiness(interrupted, CHECKS).state).toBe("unreadable");
  });

  it("reads a harvest whose zones are the wrong shape as unreadable rather than guessing", () => {
    const broken = { ...page([]), telHrefs: "tel:123" } as unknown as OwnSiteHarvest;
    expect(evaluateQuoteReadiness(broken, CHECKS).state).toBe("unreadable");
  });
});

describe("mergeQuoteReadiness: one result for the whole site", () => {
  const withTel = evaluateQuoteReadiness(page([], { telHrefs: ["tel:0401234567"] }), CHECKS);
  const withForm = evaluateQuoteReadiness(page([], { formSummaries: [{ fieldCount: 4, submitLabel: "Stuur" }] }), CHECKS);
  const everything = evaluateQuoteReadiness(
    page([], {
      formSummaries: [{ fieldCount: 4, submitLabel: "Stuur" }],
      telHrefs: ["tel:0401234567"],
      navTexts: ["Projecten"],
      imgHints: images(4),
      bodyText: "InstallQ",
    }),
    CHECKS
  );
  const unreadable: OwnSiteQuoteReadiness = { state: "unreadable" };

  it("passes a check when any page passes it, and fails it when every page was read and none did", () => {
    const merged = evaluatedOf(mergeQuoteReadiness([withTel, withForm]));
    expect(String(merged.tapToCall.passed)).toBe("true");
    expect(String(merged.quoteForm.passed)).toBe("true");
    expect(String(merged.certifications.passed)).toBe("false");
    expect(merged.certifications.evidence).toBe("");
  });

  it("reads the whole site as unreadable when a page failed and a check is still unproven", () => {
    expect(mergeQuoteReadiness([withTel, unreadable]).state).toBe("unreadable");
  });

  it("keeps the result when a page failed but every check was already proven on another page", () => {
    expect(mergeQuoteReadiness([everything, unreadable]).state).toBe("evaluated");
  });

  it("reads unreadable for no pages and for only failed pages", () => {
    expect(mergeQuoteReadiness([]).state).toBe("unreadable");
    expect(mergeQuoteReadiness([unreadable, unreadable]).state).toBe("unreadable");
  });

  it("stores the same result whatever order the pages arrive in (merge, evidence and all)", () => {
    const other = evaluateQuoteReadiness(page([], { telHrefs: ["tel:0507654321"] }), CHECKS);
    const forward = mergeQuoteReadiness([withTel, other, withForm]);
    const backward = mergeQuoteReadiness([withForm, other, withTel]);
    expect(flat(forward)).toBe(flat(backward));
    expect(evaluatedOf(forward).tapToCall.evidence).toBe("tel link: tel:0401234567");
  });
});

// ── The three-state contract across both groups ──────────────────────────

/** Every situation a field has to survive: no markup, markup without the field, markup that will not parse. */
const SITUATIONS: Array<{ name: string; harvest: OwnSiteHarvest; countState: string; countReason: string }> = [
  { name: "structured data absent entirely", harvest: page([]), countState: "missing", countReason: "no_structured_data" },
  { name: "structured data present without the field", harvest: page([BUSINESS]), countState: "missing", countReason: "not_in_markup" },
  { name: "structured data present but unparseable", harvest: page(["{ not json"]), countState: "unreadable", countReason: "" },
];

describe("three-state contract: every key is present in every situation", () => {
  const SOCIAL_KEYS = ["count", "evidence", "markedUp", "recency", "shown", "state", "widgetHosts"];
  const FIELD_STATE_MEMBERS = ["count", "recency"] as const;

  for (const situation of SITUATIONS) {
    it(`socialProof carries all of its keys with ${situation.name}`, () => {
      const p = readOf(extractSocialProof([situation.harvest], SLICE));
      expect(Object.keys(p).sort().join(",")).toBe(SOCIAL_KEYS.join(","));
      for (const member of FIELD_STATE_MEMBERS) {
        expect(["found", "missing", "unreadable"].includes(p[member].state)).toBe(true);
        expect(p[member].state).toBe(situation.countState);
        const reason = p[member].state === "missing" ? (p[member] as { reason: string }).reason : "";
        expect(reason).toBe(situation.countReason);
      }
    });

    it(`quoteReadiness carries all four checks, each with a boolean and a string, with ${situation.name}`, () => {
      const q = evaluatedOf(evaluateQuoteReadiness(situation.harvest, CHECKS));
      expect(Object.keys(q).sort().join(",")).toBe("certifications,projectPhotos,quoteForm,state,tapToCall");
      for (const check of [q.quoteForm, q.tapToCall, q.projectPhotos, q.certifications]) {
        expect(typeof check.passed).toBe("boolean");
        expect(typeof check.evidence).toBe("string");
      }
    });
  }

  it("keeps the unreadable representation to a single state key, not four false booleans", () => {
    expect(Object.keys(evaluateQuoteReadiness(null, CHECKS)).join(",")).toBe("state");
    expect(Object.keys(extractSocialProof([null], SLICE)).join(",")).toBe("state");
  });
});

describe("stored shape is stable across page order", () => {
  const rated = (n: number, date: string): unknown => ({
    "@graph": [
      { ...BUSINESS, aggregateRating: { "@type": "AggregateRating", reviewCount: n }, review: [{ "@type": "Review", datePublished: date }] },
    ],
  });
  const pages: OwnSiteHarvest[] = [
    page([rated(40, "2026-02-01")], { widgetHosts: ["widget.trustpilot.com"], h2h3: ["Reviews"] }),
    page([rated(44, "2026-08-09")], { widgetHosts: ["widget.klantenvertellen.nl", "widget.trustpilot.com"], bodyText: "9/10" }),
    page([], { widgetHosts: ["widget.kiyoh.com"], bodyText: "Al 128 beoordelingen" }),
  ];
  const orderings: number[][] = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];

  it("gives deeply equal social proof for every ordering of the same pages", () => {
    const results = orderings.map((order) => flat(extractSocialProof(order.map((i) => pages[i]), SLICE)));
    expect(new Set(results).size).toBe(1);
    // And it is not the trivial answer: all three pages contributed.
    const p = readOf(extractSocialProof(pages, SLICE));
    expect(p.widgetHosts.length).toBe(3);
    expect(JSON.stringify(p.count)).toBe('{"state":"found","value":44,"source":"jsonld"}');
    expect(JSON.stringify(p.recency)).toBe('{"state":"found","value":"2026-08-09","source":"jsonld"}');
  });

  it("gives deeply equal quote readiness for every ordering of the same pages", () => {
    const perPage = pages.map((p, i) =>
      evaluateQuoteReadiness({ ...p, telHrefs: [`tel:0${i}0000000`], navTexts: i === 1 ? ["Projecten"] : [] }, CHECKS)
    );
    const results = orderings.map((order) => flat(mergeQuoteReadiness(order.map((i) => perPage[i]))));
    expect(new Set(results).size).toBe(1);
  });
});
