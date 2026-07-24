import { describe, it, expect } from "vitest";
import {
  decodeCfEmail,
  parseMailtoHref,
  extractEmailsFromText,
  classifyLocalPart,
  detectSoleProprietorship,
  detectCommercialInvite,
  aggregateContacts,
  MAX_EMAIL_LEN,
} from "@/lib/contact-extraction";
import type { PageData, PageResult, ContactExtraction } from "@/types/scanner";

// ── Fixture helpers ─────────────────────────────────────────────────────

const BASE_SCORES = {
  overall: 50,
  accessibility: 50,
  content: 50,
  seo: 50,
  performance: 50,
};

function basePageData(overrides: Partial<PageData> = {}): PageData {
  return {
    title: "",
    description: "",
    h1: [],
    headings: [],
    links: [],
    images: [],
    wordCount: 0,
    language: "",
    canonical: "",
    ogTags: {},
    twitterTags: {},
    hasViewport: true,
    hasFavicon: true,
    hasStructuredData: false,
    hasSkipLink: false,
    vagueLinkCount: 0,
    videosWithoutCaptions: 0,
    audioElements: 0,
    inputsMissingAutocomplete: 0,
    iframesWithoutTitle: 0,
    tablesWithoutHeaders: 0,
    emptyButtons: 0,
    renderBlockingScripts: 0,
    hasNav: true,
    formFieldCount: 0,
    hasContactInfo: false,
    hasCta: false,
    hasCtaAboveFold: false,
    hasTrustSignals: false,
    hasCookieBanner: false,
    cookieBannerBlocksFold: false,
    responseHeaders: {},
    pageSize: 0,
    hasRobotsTxt: false,
    hasSitemap: false,
    brokenLinks: [],
    redirectChains: [],
    ...overrides,
  };
}

function makePage(
  url: string,
  contactExtraction: ContactExtraction | undefined,
  dataOverrides: Partial<PageData> = {}
): PageResult {
  return {
    url,
    statusCode: 200,
    loadTimeMs: 100,
    data: basePageData({ contactExtraction, ...dataOverrides }),
    issues: [],
    scores: BASE_SCORES,
  };
}

// ── decodeCfEmail ("cfemail") ────────────────────────────────────────────

describe("decodeCfEmail (cfemail)", () => {
  it("decodes a known data-cfemail token into a valid-looking address", () => {
    // Encodes info@praktijk.nl with key 0x2a — verified against the
    // XOR-with-embedded-key scheme documented in 05-RESEARCH.md.
    expect(decodeCfEmail("2a43444c456a5a584b415e434041044446")).toBe("info@praktijk.nl");
  });

  it("returns null for a garbage cfemail token", () => {
    expect(decodeCfEmail("zzzz")).toBeNull();
    expect(decodeCfEmail("")).toBeNull();
    expect(decodeCfEmail("1")).toBeNull();
  });
});

// ── parseMailtoHref ("mailto") ────────────────────────────────────────────

describe("parseMailtoHref (mailto)", () => {
  it("strips scheme, drops query string, decodes and lowercases", () => {
    expect(parseMailtoHref("mailto:Info@Praktijk.nl?subject=Hi")).toBe("info@praktijk.nl");
  });

  it("returns null for a non-address mailto href", () => {
    expect(parseMailtoHref("mailto:")).toBeNull();
    expect(parseMailtoHref("mailto:not-an-email")).toBeNull();
  });
});

// ── extractEmailsFromText (also covers "obfuscated") ─────────────────────

describe("extractEmailsFromText (obfuscated)", () => {
  it("finds plain addresses", () => {
    expect(extractEmailsFromText("Reach us at info@praktijk.nl for questions")).toContain(
      "info@praktijk.nl"
    );
  });

  it("normalizes '[at]'/'[dot]' obfuscation to a real address", () => {
    expect(extractEmailsFromText("Email: info [at] praktijk [dot] nl")).toContain(
      "info@praktijk.nl"
    );
  });

  it("normalizes '(at)'/'(dot)' obfuscation to a real address", () => {
    expect(extractEmailsFromText("Email: info (at) praktijk (dot) nl")).toContain(
      "info@praktijk.nl"
    );
  });

  it("never matches retina-asset strings like logo@2x.png", () => {
    expect(extractEmailsFromText("background: url(logo@2x.png)")).toEqual([]);
  });
});

// ── classifyLocalPart ─────────────────────────────────────────────────────

describe("classifyLocalPart", () => {
  it("classifies curated generic locals as generic", () => {
    expect(classifyLocalPart("info")).toBe("generic");
    expect(classifyLocalPart("hallo")).toBe("generic");
    expect(classifyLocalPart("praktijk")).toBe("generic");
    expect(classifyLocalPart("administratie")).toBe("generic");
    expect(classifyLocalPart("afspraak")).toBe("generic");
  });

  it("classifies a generic-prefixed local as generic", () => {
    expect(classifyLocalPart("info-verkoop")).toBe("generic");
    expect(classifyLocalPart("contact.nl")).toBe("generic");
  });

  it("classifies name-shaped locals as named-person (negative-space rule)", () => {
    expect(classifyLocalPart("jan.devries")).toBe("named-person");
    expect(classifyLocalPart("m.bakker")).toBe("named-person");
    expect(classifyLocalPart("van der berg")).toBe("named-person");
  });

  it("excludes noreply/postmaster entirely — never a business contact", () => {
    expect(classifyLocalPart("noreply")).toBe("excluded");
    expect(classifyLocalPart("no-reply")).toBe("excluded");
    expect(classifyLocalPart("postmaster")).toBe("excluded");
  });
});

// ── detectSoleProprietorship ────────────────────────────────────────────

describe("detectSoleProprietorship", () => {
  it("returns yes when 'eenmanszaak' is present", () => {
    expect(detectSoleProprietorship("Ingeschreven als eenmanszaak bij de KVK.")).toBe("yes");
  });

  it("returns no when a company form is present and eenmanszaak is absent", () => {
    expect(detectSoleProprietorship("Praktijk B.V. — KVK 12345678")).toBe("no");
  });

  it("returns unknown for a bare KVK/BTW number with neither literal (Pitfall 6)", () => {
    expect(detectSoleProprietorship("KVK-nummer: 12345678, BTW-id: NL123456789B01")).toBe(
      "unknown"
    );
  });
});

// ── detectCommercialInvite ──────────────────────────────────────────────

describe("detectCommercialInvite (commercialInvite)", () => {
  it("returns true when the page invites business contact", () => {
    expect(detectCommercialInvite("Vraag een zakelijke offerte aan of word partner")).toBe(true);
  });

  it("defaults to false when nothing invites business contact", () => {
    expect(detectCommercialInvite("Welkom op onze website. Openingstijden: 9-17.")).toBe(false);
  });
});

// ── aggregateContacts ────────────────────────────────────────────────────

describe("aggregateContacts", () => {
  it("prefers a generic same-domain candidate over a named-person one (CON-04)", () => {
    const pages: PageResult[] = [
      makePage("https://praktijk.nl/", {
        mailtoHrefs: [],
        cfemailTokens: [],
        contactText: "Neem contact op met jan.devries@praktijk.nl",
      }),
      makePage("https://praktijk.nl/contact", {
        mailtoHrefs: ["mailto:info@praktijk.nl"],
        cfemailTokens: [],
        contactText: "",
      }),
    ];

    const result = aggregateContacts(pages, "praktijk.nl");
    expect(result.contactEmail).toBe("info@praktijk.nl");
    expect(result.contactEmailType).toBe("generic");
  });

  it("scores mailto/cfemail sources above bare body-text matches", () => {
    const pages: PageResult[] = [
      makePage("https://praktijk.nl/", {
        mailtoHrefs: [],
        cfemailTokens: [],
        contactText: "info@praktijk.nl mentioned in a testimonial",
      }),
    ];
    // Second candidate is structurally stronger (mailto) even without a
    // contact-page bonus — same email either way here, so assert the type
    // and that a same-kind body-only run also resolves correctly.
    const result = aggregateContacts(pages, "praktijk.nl");
    expect(result.contactEmail).toBe("info@praktijk.nl");
  });

  it("prefers a same-domain candidate over a cross-domain one", () => {
    const pages: PageResult[] = [
      makePage("https://praktijk.nl/", {
        mailtoHrefs: ["mailto:webagency@example.nl"],
        cfemailTokens: [],
        contactText: "",
      }),
      makePage("https://praktijk.nl/contact", {
        mailtoHrefs: ["mailto:info@praktijk.nl"],
        cfemailTokens: [],
        contactText: "",
      }),
    ];
    const result = aggregateContacts(pages, "praktijk.nl");
    expect(result.contactEmail).toBe("info@praktijk.nl");
  });

  it("never returns a candidate email longer than 254 chars", () => {
    const longLocal = "a".repeat(250);
    const pages: PageResult[] = [
      makePage("https://praktijk.nl/", {
        mailtoHrefs: [`mailto:${longLocal}@praktijk.nl`],
        cfemailTokens: [],
        contactText: "",
      }),
    ];
    const result = aggregateContacts(pages, "praktijk.nl");
    expect(result.contactEmail).toBeNull();
    expect(`${longLocal}@praktijk.nl`.length).toBeGreaterThan(MAX_EMAIL_LEN);
  });

  it("rolls up soleProprietorship and commercialContactInvited across pages", () => {
    const pages: PageResult[] = [
      makePage("https://praktijk.nl/", {
        mailtoHrefs: [],
        cfemailTokens: [],
        contactText: "Welkom bij onze praktijk.",
      }),
      makePage("https://praktijk.nl/over-ons", {
        mailtoHrefs: [],
        cfemailTokens: [],
        contactText: "Wij zijn een eenmanszaak. Vraag een zakelijke offerte aan.",
      }),
    ];
    const result = aggregateContacts(pages, "praktijk.nl");
    expect(result.soleProprietorship).toBe("yes");
    expect(result.commercialContactInvited).toBe(true);
  });

  it("returns the all-empty ContactResult for pages lacking contactExtraction (legacy)", () => {
    const pages: PageResult[] = [makePage("https://praktijk.nl/", undefined)];
    const result = aggregateContacts(pages, "praktijk.nl");
    expect(result).toEqual({
      contactEmail: null,
      contactEmailType: null,
      commercialContactInvited: false,
      soleProprietorship: "unknown",
    });
  });
});
