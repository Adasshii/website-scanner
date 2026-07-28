import { describe, it, expect } from "vitest";
import {
  aggregateScores,
  buildSummary,
  computeVerdict,
  getWeakestCategory,
} from "./scoring";
import type { ScanScores, PageResult, PageData, Issue } from "@/types/scanner";

// ── Fixture helpers ─────────────────────────────────────────────────────
// Style mirrors lib/contact-extraction.test.ts: plain describe/it/expect,
// no mocking framework, base*(overrides) builders.

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

function baseIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "test-issue",
    category: "seo",
    severity: "major",
    title: "Test issue",
    description: "",
    recommendation: "",
    impact: 5,
    ...overrides,
  };
}

function basePage(overrides: Partial<PageResult> = {}): PageResult {
  return {
    url: "https://example.nl/",
    statusCode: 200,
    loadTimeMs: 100,
    data: basePageData(),
    issues: [],
    scores: baseScores(),
    ...overrides,
  };
}

// ── computeVerdict ───────────────────────────────────────────────────────
// Bands under test are the ones currently live in the scanner service:
// 90 / 70 / 50, with sub-50 as the fallback (DRA-06 / D-6-R4).

describe("computeVerdict", () => {
  it("returns the top-band string for overall 92 and does not name a weakest category", () => {
    const verdict = computeVerdict(baseScores({ overall: 92 }), 0);
    expect(verdict).toBe(
      "Great job! Your website is well-built and performs strongly across all categories."
    );
    expect(verdict).not.toMatch(/accessibility|content quality|SEO|weakest/i);
  });

  it("names the weakest category when overall lands in the 70 band", () => {
    const verdict = computeVerdict(
      baseScores({ overall: 75, accessibility: 20, content: 80, seo: 80, performance: 80 }),
      0
    );
    expect(verdict).toContain("accessibility");
  });

  it("returns different strings for overall 60 depending on criticalCount", () => {
    const withCritical = computeVerdict(baseScores({ overall: 60 }), 3);
    const withoutCritical = computeVerdict(baseScores({ overall: 60 }), 0);
    expect(withCritical).not.toBe(withoutCritical);
    expect(withCritical).toContain("critical");
    expect(withoutCritical).toContain("major");
  });

  it("returns the bottom-band string for overall 20", () => {
    const verdict = computeVerdict(baseScores({ overall: 20 }), 0);
    expect(verdict).toBe(
      "Your website has significant issues that are likely costing you visitors and search rankings. The good news: most fixes are straightforward."
    );
  });

  it("lands exactly-90 in the top band (>=, not >)", () => {
    const verdict = computeVerdict(baseScores({ overall: 90 }), 0);
    expect(verdict).toBe(
      "Great job! Your website is well-built and performs strongly across all categories."
    );
  });

  it("lands exactly-70 in the decent-shape band (>=, not >)", () => {
    const verdict = computeVerdict(baseScores({ overall: 70, accessibility: 40 }), 0);
    expect(verdict).toContain("decent shape");
  });

  it("lands exactly-50 in the several-areas-for-improvement band (>=, not >)", () => {
    const verdict = computeVerdict(baseScores({ overall: 50 }), 0);
    expect(verdict).toContain("several areas for improvement");
  });
});

// ── getWeakestCategory ───────────────────────────────────────────────────

describe("getWeakestCategory", () => {
  it("ranks only accessibility, content, seo and performance (not security or design)", () => {
    const scores = baseScores({
      accessibility: 90,
      content: 90,
      seo: 90,
      performance: 30,
      security: 0,
      design: 0,
    });
    expect(getWeakestCategory(scores)).toBe("performance");
  });

  it("returns the lowest-scoring category's display name (accessibility)", () => {
    const scores = baseScores({ accessibility: 20, content: 90, seo: 90, performance: 90 });
    expect(getWeakestCategory(scores)).toBe("accessibility");
  });

  it("returns the 'SEO' display name when seo is weakest", () => {
    const scores = baseScores({ accessibility: 90, content: 90, seo: 10, performance: 90 });
    expect(getWeakestCategory(scores)).toBe("SEO");
  });

  it("returns the 'content quality' display name when content is weakest", () => {
    const scores = baseScores({ accessibility: 90, content: 10, seo: 90, performance: 90 });
    expect(getWeakestCategory(scores)).toBe("content quality");
  });
});

// ── buildSummary routes through computeVerdict ──────────────────────────

describe("buildSummary", () => {
  it("sets summary.verdict to exactly computeVerdict(aggregateScores(pages), summary.criticalIssues)", () => {
    const pages: PageResult[] = [
      basePage({ scores: baseScores({ overall: 80 }) }),
      basePage({
        scores: baseScores({ overall: 60, accessibility: 60, content: 60, seo: 60, performance: 60 }),
        issues: [baseIssue({ severity: "critical" })],
      }),
    ];

    const summary = buildSummary(pages);
    const scores = aggregateScores(pages);

    expect(summary.verdict).toBe(computeVerdict(scores, summary.criticalIssues));
  });
});

// ── aggregateScores weighting (unchanged by this plan) ──────────────────

describe("aggregateScores", () => {
  it("keeps the weighting unchanged: all-100-except-performance-0 yields overall 75", () => {
    const pages: PageResult[] = [
      basePage({
        scores: {
          overall: 100,
          accessibility: 100,
          content: 100,
          seo: 100,
          performance: 0,
          security: 100,
          design: 100,
        },
      }),
    ];
    expect(aggregateScores(pages).overall).toBe(75);
  });
});
