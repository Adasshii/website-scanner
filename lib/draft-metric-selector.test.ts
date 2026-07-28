import { describe, it, expect } from "vitest";
import { selectCitableMetric } from "@/lib/draft-metric-selector";
import type { ScanScores, ScanSummary, PageResult, PageData } from "@/types/scanner";

// ── Fixture helpers ─────────────────────────────────────────────────────
// Style mirrors lib/contact-extraction.test.ts / lib/scoring.test.ts: plain
// describe/it/expect, no mocking framework, base*(overrides) builders.

function baseScores(overrides: Partial<ScanScores> = {}): ScanScores {
  return {
    overall: 80,
    accessibility: 80,
    content: 80,
    seo: 80,
    performance: 80,
    security: 80,
    design: 80,
    ...overrides,
  };
}

function baseSummary(overrides: Partial<ScanSummary> = {}): ScanSummary {
  return {
    totalPages: 1,
    totalIssues: 0,
    criticalIssues: 0,
    majorIssues: 0,
    topIssues: [],
    verdict: "",
    ...overrides,
  };
}

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

function basePage(dataOverrides: Partial<PageData> = {}): PageResult {
  return {
    url: "https://praktijkjansen.nl/",
    statusCode: 200,
    loadTimeMs: 100,
    data: basePageData(dataOverrides),
    issues: [],
    scores: baseScores(),
  };
}

describe("selectCitableMetric", () => {
  it("selects LCP when at or above the degraded threshold, formatted for en", () => {
    const pages = [basePage({ coreWebVitals: { lcp: 4300, cls: 0, fcp: 0, tbt: 0, si: 0 } })];
    const result = selectCitableMetric(baseScores(), baseSummary(), pages, "en");
    expect(result?.source).toBe("lcp");
    expect(result?.displayValue).toBe("4.3");
  });

  it("selects LCP with a Dutch comma decimal for nl, differing from the en form", () => {
    const pages = [basePage({ coreWebVitals: { lcp: 4300, cls: 0, fcp: 0, tbt: 0, si: 0 } })];
    const en = selectCitableMetric(baseScores(), baseSummary(), pages, "en");
    const nl = selectCitableMetric(baseScores(), baseSummary(), pages, "nl");
    expect(nl?.displayValue).toBe("4,3");
    expect(nl?.displayValue).not.toBe(en?.displayValue);
  });

  it("falls through past a healthy LCP even though CWV data is present", () => {
    const pages = [basePage({ coreWebVitals: { lcp: 1800, cls: 0, fcp: 0, tbt: 0, si: 0 } })];
    const result = selectCitableMetric(baseScores(), baseSummary({ criticalIssues: 2 }), pages, "en");
    expect(result?.source).toBe("critical-issues");
    expect(result?.displayValue).toBe("2");
  });

  it("selects critical issue count when no usable CWV data exists", () => {
    const pages = [basePage()];
    const result = selectCitableMetric(baseScores(), baseSummary({ criticalIssues: 3 }), pages, "en");
    expect(result?.source).toBe("critical-issues");
    expect(result?.displayValue).toBe("3");
  });

  it("falls through to the lowest category score when there are no critical issues", () => {
    const pages = [basePage()];
    const result = selectCitableMetric(
      baseScores({ seo: 31, accessibility: 80, content: 80, performance: 80, security: 80, design: 80 }),
      baseSummary({ criticalIssues: 0 }),
      pages,
      "en"
    );
    expect(result?.source).toBe("category-score");
    expect(result?.displayValue).toBe("31");
  });

  it("displayText differs between en and nl for every branch and always contains displayValue", () => {
    const cwvPages = [basePage({ coreWebVitals: { lcp: 4300, cls: 0, fcp: 0, tbt: 0, si: 0 } })];
    const enLcp = selectCitableMetric(baseScores(), baseSummary(), cwvPages, "en")!;
    const nlLcp = selectCitableMetric(baseScores(), baseSummary(), cwvPages, "nl")!;
    expect(enLcp.displayText).not.toBe(nlLcp.displayText);
    expect(enLcp.displayText).toContain(enLcp.displayValue);
    expect(nlLcp.displayText).toContain(nlLcp.displayValue);

    const plainPages = [basePage()];
    const enCritical = selectCitableMetric(baseScores(), baseSummary({ criticalIssues: 5 }), plainPages, "en")!;
    const nlCritical = selectCitableMetric(baseScores(), baseSummary({ criticalIssues: 5 }), plainPages, "nl")!;
    expect(enCritical.displayText).not.toBe(nlCritical.displayText);
    expect(enCritical.displayText).toContain(enCritical.displayValue);
    expect(nlCritical.displayText).toContain(nlCritical.displayValue);

    const enCategory = selectCitableMetric(
      baseScores({ seo: 31 }),
      baseSummary({ criticalIssues: 0 }),
      plainPages,
      "en"
    )!;
    const nlCategory = selectCitableMetric(
      baseScores({ seo: 31 }),
      baseSummary({ criticalIssues: 0 }),
      plainPages,
      "nl"
    )!;
    expect(enCategory.displayText).not.toBe(nlCategory.displayText);
    expect(enCategory.displayText).toContain(enCategory.displayValue);
    expect(nlCategory.displayText).toContain(nlCategory.displayValue);
  });

  it("never mutates its inputs", () => {
    const scores = baseScores();
    const summary = baseSummary({ criticalIssues: 1 });
    const pages = [basePage()];
    const scoresSnapshot = { ...scores };
    const summarySnapshot = { ...summary };
    selectCitableMetric(scores, summary, pages, "en");
    expect(scores).toEqual(scoresSnapshot);
    expect(summary).toEqual(summarySnapshot);
  });

  it("returns null when there are no scores", () => {
    expect(selectCitableMetric(null, baseSummary(), [basePage()], "en")).toBeNull();
    expect(selectCitableMetric(undefined, baseSummary(), [basePage()], "en")).toBeNull();
  });
});
