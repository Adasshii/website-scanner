import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateDraft,
  defaultGeminiGenerate,
  buildReportUrl,
  type DraftInput,
} from "@/lib/draft-generator";
import { ARTICLE_14_NOTICE_EN, ARTICLE_14_NOTICE_NL, buildDraftSubject } from "@/lib/draft-prompt";
import type { ScanScores, ScanSummary, PageResult, PageData } from "@/types/scanner";

// Controllable per-test — configured via mockGetGenerativeModel.mockReturnValueOnce(...)
// in each defaultGeminiGenerate test below. vi.hoisted so it exists before the
// hoisted vi.mock factory runs.
const { mockGetGenerativeModel } = vi.hoisted(() => ({
  mockGetGenerativeModel: vi.fn(),
}));
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel = mockGetGenerativeModel;
  },
}));

// ── Fixture helpers ─────────────────────────────────────────────────────
// Style mirrors lib/draft-metric-selector.test.ts / lib/contact-extraction.test.ts:
// plain describe/it/expect, no mocking framework beyond a console.error spy,
// base*(overrides) builders. Every test injects deps.generate — none ever
// construct the real Gemini client or read GEMINI_API_KEY.

function baseScores(overrides: Partial<ScanScores> = {}): ScanScores {
  return {
    overall: 60,
    accessibility: 60,
    content: 60,
    seo: 60,
    performance: 60,
    security: 60,
    design: 60,
    ...overrides,
  };
}

function baseSummary(overrides: Partial<ScanSummary> = {}): ScanSummary {
  return {
    totalPages: 1,
    totalIssues: 2,
    criticalIssues: 2,
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

function baseProspect(overrides: Partial<DraftInput["prospect"]> = {}): DraftInput["prospect"] {
  return {
    name: "Praktijk Jansen",
    domain: "praktijkjansen.nl",
    country: "NL",
    contact_email: "info@praktijkjansen.nl",
    ...overrides,
  };
}

function baseScan(overrides: Partial<DraftInput["scan"]> = {}): DraftInput["scan"] {
  return {
    id: "scan-123",
    scores: baseScores({ seo: 31 }),
    summary: baseSummary({ criticalIssues: 2 }),
    pages: [basePage()],
    issues_alt: null,
    ...overrides,
  };
}

describe("generateDraft", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a draft ending with the Article 14 notice when the metric is reproduced verbatim", async () => {
    const generate = async () => "This pitch cites 2 critical issues found on the site.";
    const result = await generateDraft(
      { prospect: baseProspect({ country: "NL" }), scan: baseScan() },
      { generate }
    );
    expect(result).not.toBeNull();
    expect(result!.body.endsWith(ARTICLE_14_NOTICE_NL)).toBe(true);
  });

  it("returns null and logs an error when the body omits the displayValue", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const generate = async () => "This pitch mentions nothing numeric at all.";
    const result = await generateDraft(
      { prospect: baseProspect(), scan: baseScan() },
      { generate }
    );
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns null when the model rounds the cited number instead of reproducing it verbatim", async () => {
    const pages = [basePage({ coreWebVitals: { lcp: 4300, cls: 0, fcp: 0, tbt: 0, si: 0 } })];
    const generate = async () => "Your homepage takes 4 seconds to become usable.";
    const result = await generateDraft(
      { prospect: baseProspect({ country: "US" }), scan: baseScan({ pages }) },
      { generate }
    );
    expect(result).toBeNull();
  });

  it("returns null without throwing when generate resolves null (simulating a timeout)", async () => {
    const generate = async () => null;
    const result = await generateDraft(
      { prospect: baseProspect(), scan: baseScan() },
      { generate }
    );
    expect(result).toBeNull();
  });

  it("returns null without throwing when generate throws", async () => {
    const generate = async () => {
      throw new Error("boom");
    };
    await expect(
      generateDraft({ prospect: baseProspect(), scan: baseScan() }, { generate })
    ).resolves.toBeNull();
  });

  it("keeps the report URL exactly once when the model already included it", async () => {
    const scan = baseScan();
    const reportUrl = buildReportUrl(scan.id);
    const generate = async () => `2 critical issues found. See the proof: ${reportUrl}`;
    const result = await generateDraft({ prospect: baseProspect(), scan }, { generate });
    const occurrences = result!.body.split(reportUrl).length - 1;
    expect(occurrences).toBe(1);
  });

  it("appends the report URL on its own line when the model omitted it", async () => {
    const scan = baseScan();
    const reportUrl = buildReportUrl(scan.id);
    const generate = async () => "2 critical issues found, worth a look.";
    const result = await generateDraft({ prospect: baseProspect(), scan }, { generate });
    expect(result!.body).toContain(`\n\n${reportUrl}`);
  });

  it("ends with the Dutch notice for NL and the English notice for an unmapped country", async () => {
    const scan = baseScan();
    const generate = async () => "2 critical issues found on the site.";
    const nlResult = await generateDraft(
      { prospect: baseProspect({ country: "NL" }), scan },
      { generate }
    );
    const usResult = await generateDraft(
      { prospect: baseProspect({ country: "US" }), scan },
      { generate }
    );
    expect(nlResult!.body.endsWith(ARTICLE_14_NOTICE_NL)).toBe(true);
    expect(usResult!.body.endsWith(ARTICLE_14_NOTICE_EN)).toBe(true);
  });

  it("uses the model-authored subject when the response follows the SUBJECT/BODY contract", async () => {
    const scan = baseScan();
    const generate = async () =>
      "SUBJECT: Your site loads slowly\nBODY:\n2 critical issues found on the site.";
    const result = await generateDraft(
      { prospect: baseProspect({ country: "NL", domain: "praktijkjansen.nl" }), scan },
      { generate }
    );
    expect(result!.subject).toBe("Your site loads slowly");
  });

  it("falls back to buildDraftSubject when the model ignores the SUBJECT/BODY contract", async () => {
    const scan = baseScan();
    const generate = async () => "2 critical issues found. Subject: Ignore This Fake Subject";
    const result = await generateDraft(
      { prospect: baseProspect({ country: "NL", domain: "praktijkjansen.nl" }), scan },
      { generate }
    );
    expect(result!.subject).toBe(buildDraftSubject("praktijkjansen.nl", "nl"));
  });

  it("runs with no network access and no GEMINI_API_KEY present in the environment", () => {
    expect(process.env.GEMINI_API_KEY).toBeUndefined();
  });
});

// ── defaultGeminiGenerate: the three failure shapes must be distinguishable ──
// (2026-07-28 fix) — the DraftDeps.generate seam bypasses this function
// entirely (every test above injects its own `generate`), so this is the
// only way to unit-test its no-key / thrown / timeout log lines directly.
describe("defaultGeminiGenerate", () => {
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("logs the missing-key reason specifically and returns null, without calling the SDK", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await defaultGeminiGenerate("prompt");
    expect(result).toBeNull();
    expect(mockGetGenerativeModel).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("GEMINI_API_KEY is not set"));
  });

  it("logs the thrown error's message (not silently swallowed) and returns null", async () => {
    process.env.GEMINI_API_KEY = "test-key-not-a-real-secret";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetGenerativeModel.mockReturnValueOnce({
      generateContent: vi.fn().mockRejectedValue(new Error("quota exceeded")),
    });
    const result = await defaultGeminiGenerate("prompt");
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Gemini call threw: quota exceeded"));
  });

  it("logs that it timed out, and after how long, when the call never resolves", async () => {
    process.env.GEMINI_API_KEY = "test-key-not-a-real-secret";
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetGenerativeModel.mockReturnValueOnce({
      generateContent: vi.fn().mockReturnValue(new Promise(() => {})), // never resolves
    });
    const pending = defaultGeminiGenerate("prompt");
    await vi.advanceTimersByTimeAsync(45000);
    const result = await pending;
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("timed out after 45000ms"));
  });
});
