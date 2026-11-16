import { describe, expect, it } from "vitest";
import type { AxeResults } from "axe-core";
import type { PageData } from "../types/scanner";
import { analyzeIssues } from "../scanner-service/src/analyzer";

// The axe fallback object the scanner uses when axe fails: it has no url field.
const axe = { violations: [], incomplete: [], passes: [], inapplicable: [] } as unknown as AxeResults;

function baseData(overrides: Partial<PageData> = {}): PageData {
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
    hasViewport: false,
    hasFavicon: false,
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
    hasNav: false,
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

const ids = (h1: string[], url = "https://voorbeeld.nl/") =>
  analyzeIssues(axe, baseData({ h1 }), url).map((i) => i.id);

describe("headline rule", () => {
  it("accepts short real H1s", () => {
    expect(ids(["Loodgieter Utrecht"])).not.toContain("design-unclear-headline");
    expect(ids(["AFR Loodgieters"])).not.toContain("design-unclear-headline");
  });

  it("flags a missing H1", () => {
    expect(ids([])).toContain("design-unclear-headline");
  });

  it.each(["Welkom", "welcome", "Home"])("flags the generic H1 %s", (h1) => {
    expect(ids([h1])).toContain("design-unclear-headline");
  });
});

describe("https rule", () => {
  it("does not flag an https page when axe failed", () => {
    expect(ids(["Loodgieter Utrecht"], "https://loodgieter-utrecht.nl/")).not.toContain("sec-no-https");
  });

  it("flags an http page", () => {
    expect(ids(["Loodgieter Utrecht"], "http://voorbeeld.nl/")).toContain("sec-no-https");
  });
});
