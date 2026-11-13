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
import { extractOwnSiteFacts } from "../scanner-service/src/own-site-facts";
import type { OwnSiteHarvest } from "../types/own-site";

const META = { readAt: "2026-11-13T09:00:00.000Z" };

/** Build a harvest from literal JSON-LD values (stringified) or raw strings. */
function harvestOf(blocks: Array<unknown>): OwnSiteHarvest {
  const jsonLdBlocks = blocks.map((b) => (typeof b === "string" ? b : JSON.stringify(b)));
  return { jsonLdBlocks, jsonLdBlocksFound: jsonLdBlocks.length, microdata: [], microdataCount: 0 };
}

/** One-line comparison: multi-line vitest diffs corrupt the TAP report the RED gate reads. */
function flat(value: unknown): string {
  return JSON.stringify(value);
}

const NO_BLOCKS: OwnSiteHarvest = { jsonLdBlocks: [], jsonLdBlocksFound: 0, microdata: [], microdataCount: 0 };

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

describe("extractOwnSiteFacts: stored shape", () => {
  it("carries the schema version, the injected readAt and the page count", () => {
    const facts = extractOwnSiteFacts(NO_BLOCKS, { readAt: "2026-01-02T03:04:05.000Z", pagesRead: 3 });
    expect(facts.schemaVersion).toBe(1);
    expect(facts.readAt).toBe("2026-01-02T03:04:05.000Z");
    expect(facts.pagesRead).toBe(3);
  });
});
