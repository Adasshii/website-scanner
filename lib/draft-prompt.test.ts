import { describe, it, expect } from "vitest";
import {
  COUNTRY_LOCALE_MAP,
  localeForCountry,
  TONE_BRIEF,
  ARTICLE_14_NOTICE_EN,
  ARTICLE_14_NOTICE_NL,
  appendArticle14Notice,
  buildDraftPrompt,
  buildDraftSubject,
  type DraftPromptInput,
} from "@/lib/draft-prompt";
import type { CitableMetric } from "@/lib/draft-metric-selector";

// ── Fixture helpers ─────────────────────────────────────────────────────
// Style mirrors lib/scanner-design-prompt.test.ts: toContain + indexOf
// ordering assertions, no snapshot testing.

function baseMetric(overrides: Partial<CitableMetric> = {}): CitableMetric {
  return {
    source: "critical-issues",
    displayValue: "3",
    displayText: "The scan found 3 critical issue(s) on your site",
    ...overrides,
  };
}

function baseInput(overrides: Partial<DraftPromptInput> = {}): DraftPromptInput {
  return {
    businessName: "Praktijk Jansen",
    domain: "praktijkjansen.nl",
    locale: "en",
    metric: baseMetric(),
    verdict: "Your website has several areas for improvement.",
    topIssueTitles: ["Missing alt text", "Slow load time", "No HTTPS"],
    reportUrl: "https://scan.adashi.io/report/abc123",
    ...overrides,
  };
}

describe("COUNTRY_LOCALE_MAP / localeForCountry", () => {
  it("maps NL to nl", () => {
    expect(COUNTRY_LOCALE_MAP.NL).toBe("nl");
    expect(localeForCountry("NL")).toBe("nl");
  });

  it("defaults BE, null, and an unmapped code to en", () => {
    expect(localeForCountry("BE")).toBe("en");
    expect(localeForCountry(null)).toBe("en");
    expect(localeForCountry("XX")).toBe("en");
  });

  it("is case-insensitive on lowercase input", () => {
    expect(localeForCountry("nl")).toBe("nl");
  });
});

describe("ARTICLE_14_NOTICE_EN / ARTICLE_14_NOTICE_NL", () => {
  it("are both non-empty and differ from each other", () => {
    expect(ARTICLE_14_NOTICE_EN.length).toBeGreaterThan(0);
    expect(ARTICLE_14_NOTICE_NL.length).toBeGreaterThan(0);
    expect(ARTICLE_14_NOTICE_EN).not.toBe(ARTICLE_14_NOTICE_NL);
  });

  it("each mentions the controller, legal basis, source, retention, and objection right", () => {
    for (const notice of [ARTICLE_14_NOTICE_EN, ARTICLE_14_NOTICE_NL]) {
      expect(notice).toMatch(/Adashi/);
      expect(notice.toLowerCase()).toMatch(/legitimate interest|gerechtvaardigd belang/);
      expect(notice.toLowerCase()).toMatch(/website/);
      expect(notice.toLowerCase()).toMatch(/retain|bewaren|bewaartermijn|retention/);
      expect(notice.toLowerCase()).toMatch(/object|bezwaar/);
    }
  });
});

describe("appendArticle14Notice", () => {
  it("returns a string starting with body and ending with the locale's notice", () => {
    const result = appendArticle14Notice("Hi there.", "en");
    expect(result.startsWith("Hi there.")).toBe(true);
    expect(result.endsWith(ARTICLE_14_NOTICE_EN)).toBe(true);
  });

  it("uses the Dutch notice for locale nl", () => {
    const result = appendArticle14Notice("Hallo.", "nl");
    expect(result.endsWith(ARTICLE_14_NOTICE_NL)).toBe(true);
  });

  it("is idempotent: calling it twice equals calling it once", () => {
    const once = appendArticle14Notice("Hi there.", "en");
    const twice = appendArticle14Notice(once, "en");
    expect(twice).toBe(once);
  });
});

describe("buildDraftPrompt", () => {
  it("contains the tone brief, the metric's displayText and displayValue, and the report URL", () => {
    const input = baseInput();
    const prompt = buildDraftPrompt(input);
    expect(prompt).toContain(TONE_BRIEF);
    expect(prompt).toContain(input.metric.displayText);
    expect(prompt).toContain(input.metric.displayValue);
    expect(prompt).toContain(input.reportUrl);
  });

  it("contains the Dutch language directive for locale nl but not for locale en", () => {
    const nlPrompt = buildDraftPrompt(baseInput({ locale: "nl" }));
    const enPrompt = buildDraftPrompt(baseInput({ locale: "en" }));
    expect(nlPrompt).toMatch(/Dutch/);
    expect(enPrompt).not.toMatch(/Dutch/);
  });

  it("does not contain either Article 14 notice string — the notice is appended by code, not requested from the model", () => {
    const prompt = buildDraftPrompt(baseInput());
    expect(prompt).not.toContain(ARTICLE_14_NOTICE_EN);
    expect(prompt).not.toContain(ARTICLE_14_NOTICE_NL);
  });

  it("places the reproduce-exactly instruction after the metric is introduced, not before it", () => {
    const input = baseInput();
    const prompt = buildDraftPrompt(input);
    const metricIntroIndex = prompt.indexOf(input.metric.displayText);
    const reproduceIndex = prompt.search(/reproduce/i);
    expect(metricIntroIndex).toBeGreaterThan(-1);
    expect(reproduceIndex).toBeGreaterThan(-1);
    expect(reproduceIndex).toBeGreaterThan(metricIntroIndex);
  });
});

describe("buildDraftSubject", () => {
  it("contains the domain and differs between en and nl", () => {
    const en = buildDraftSubject("praktijkjansen.nl", "en");
    const nl = buildDraftSubject("praktijkjansen.nl", "nl");
    expect(en).toContain("praktijkjansen.nl");
    expect(nl).toContain("praktijkjansen.nl");
    expect(en).not.toBe(nl);
  });
});
