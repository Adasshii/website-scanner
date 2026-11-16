import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateDraft,
  defaultLlmGenerate,
  buildReportUrl,
  type DraftInput,
} from "@/lib/draft-generator";
import { ARTICLE_14_NOTICE_EN, ARTICLE_14_NOTICE_NL, buildDraftSubject } from "@/lib/draft-prompt";
import type { ScanScores, ScanSummary, PageResult, PageData } from "@/types/scanner";

// Controllable per-test — configured via mockCreate.mockResolvedValueOnce(...)
// (or mockRejectedValue / a never-resolving promise) in each defaultLlmGenerate
// test below. vi.hoisted so it exists before the hoisted vi.mock factory runs.
// The APIError / RateLimitError statics are here because defaultLlmGenerate
// classifies thrown errors with instanceof, never by message text.
const { mockCreate, MockAPIError, MockRateLimitError } = vi.hoisted(() => {
  class MockAPIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  class MockRateLimitError extends MockAPIError {
    constructor(message: string) {
      super(429, message);
    }
  }
  return { mockCreate: vi.fn(), MockAPIError, MockRateLimitError };
});
vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    static APIError = MockAPIError;
    static RateLimitError = MockRateLimitError;
    beta = { messages: { create: mockCreate } };
  }
  return { default: MockAnthropic };
});

// ── Fixture helpers ─────────────────────────────────────────────────────
// Style mirrors lib/draft-metric-selector.test.ts / lib/contact-extraction.test.ts:
// plain describe/it/expect, no mocking framework beyond a console.error spy,
// base*(overrides) builders. Every test injects deps.generate — none ever
// construct the real Claude client or read ANTHROPIC_API_KEY.

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

  it("runs with no network access and no ANTHROPIC_API_KEY present in the environment", () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
  });
});

// ── defaultLlmGenerate: the four failure shapes must be distinguishable ──
// (2026-07-28 fix, refusal branch added with the Claude move) — the
// DraftDeps.generate seam bypasses this function entirely (every test above
// injects its own `generate`), so this is the only way to unit-test its
// no-key / thrown / timeout / refusal log lines directly.
describe("defaultLlmGenerate", () => {
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.useRealTimers();
    vi.restoreAllMocks();
    mockCreate.mockReset();
  });

  it("logs the missing-key reason specifically and returns null, without calling the SDK", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await defaultLlmGenerate("prompt");
    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("ANTHROPIC_API_KEY is not set"));
  });

  it("logs the thrown error's message (not silently swallowed) and returns null", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-a-real-secret";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreate.mockRejectedValueOnce(new Error("quota exceeded"));
    const result = await defaultLlmGenerate("prompt");
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Claude call threw: quota exceeded"));
  });

  it("classifies a typed rate-limit error by instanceof and still returns null", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-a-real-secret";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreate.mockRejectedValueOnce(new MockRateLimitError("slow down"));
    const result = await defaultLlmGenerate("prompt");
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("(rate limited): slow down"));
  });

  it("logs that it timed out, and after how long, when the call never resolves", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-a-real-secret";
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreate.mockReturnValueOnce(new Promise(() => {})); // never resolves
    const pending = defaultLlmGenerate("prompt");
    await vi.advanceTimersByTimeAsync(45000);
    const result = await pending;
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("timed out after 45000ms"));
  });

  it("logs a distinct refusal line, never the empty-content or threw line, and returns null", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-a-real-secret";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreate.mockResolvedValueOnce({ stop_reason: "refusal", content: [] });
    const result = await defaultLlmGenerate("prompt");
    expect(result).toBeNull();
    const lines = errorSpy.mock.calls.map((c) => String(c[0]));
    const draftLine = lines.find((l) => l.startsWith("[draft]"));
    expect(draftLine).toContain("refused");
    expect(draftLine).not.toContain("threw");
    expect(draftLine).not.toContain("timed out");
    expect(draftLine).not.toContain("empty");
  });

  it("returns the text block's text when a thinking block comes first (never indexes block 0)", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-a-real-secret";
    mockCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [
        { type: "thinking", thinking: "considering the pitch", signature: "sig" },
        { type: "text", text: "  SUBJECT: Hi\nBODY: Hello there  " },
      ],
    });
    const result = await defaultLlmGenerate("prompt");
    expect(result).toBe("SUBJECT: Hi\nBODY: Hello there");
  });

  it("sends one user message with the pinned model and effort and none of the rejected parameters", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-a-real-secret";
    mockCreate.mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] });
    await defaultLlmGenerate("write the draft");
    const args = mockCreate.mock.calls[0][0];
    expect(args.model).toBe("claude-sonnet-5-5");
    expect(args.output_config).toEqual({ effort: "medium" });
    expect(args.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "write the draft" }] },
    ]);
    for (const banned of ["temperature", "top_p", "top_k", "thinking"]) {
      expect(args).not.toHaveProperty(banned);
    }
  });
});
