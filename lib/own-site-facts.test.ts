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
  return { jsonLdBlocks, jsonLdBlocksFound: jsonLdBlocks.length };
}

/** One-line comparison: multi-line vitest diffs corrupt the TAP report the RED gate reads. */
function flat(value: unknown): string {
  return JSON.stringify(value);
}

const NO_BLOCKS: OwnSiteHarvest = { jsonLdBlocks: [], jsonLdBlocksFound: 0 };

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

describe("extractOwnSiteFacts: stored shape", () => {
  it("carries the schema version, the injected readAt and the page count", () => {
    const facts = extractOwnSiteFacts(NO_BLOCKS, { readAt: "2026-01-02T03:04:05.000Z", pagesRead: 3 });
    expect(facts.schemaVersion).toBe(1);
    expect(facts.readAt).toBe("2026-01-02T03:04:05.000Z");
    expect(facts.pagesRead).toBe(3);
  });
});
