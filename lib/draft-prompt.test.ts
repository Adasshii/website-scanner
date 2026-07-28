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
  parseDraftResponse,
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

// ── Post-review revision (2026-07-28): Joshua judged the pitch weak. ────
// Change A: rewritten ROLE/STRUCTURE/TONE/HARD LIMITS/EXAMPLE/OUTPUT
// CONTRACT prompt shape.

describe("buildDraftPrompt — rewritten pitch (Change A)", () => {
  it("contains the ROLE, STRUCTURE, TONE, HARD LIMITS, REQUIRED FIGURE, REPORT LINK, EXAMPLE and OUTPUT CONTRACT sections", () => {
    const prompt = buildDraftPrompt(baseInput());
    expect(prompt).toContain("ROLE");
    expect(prompt).toContain("STRUCTURE");
    expect(prompt).toContain("TONE");
    expect(prompt).toContain("HARD LIMITS");
    expect(prompt).toContain("Body is 70 to 120 words.");
    expect(prompt).toContain("REQUIRED FIGURE");
    expect(prompt).toContain("REPORT LINK");
    expect(prompt).toContain("EXAMPLE");
    expect(prompt).toContain("OUTPUT CONTRACT");
  });

  it("selects the nl example for locale nl and the en example otherwise, with real literal values and no unfilled placeholder tokens", () => {
    const nlPrompt = buildDraftPrompt(baseInput({ locale: "nl" }));
    const enPrompt = buildDraftPrompt(baseInput({ locale: "en" }));
    expect(nlPrompt).toContain("Fysio Van Dijk");
    expect(enPrompt).toContain("Van Dijk Physio");
    expect(nlPrompt).not.toContain("Van Dijk Physio");
    expect(enPrompt).not.toContain("Fysio Van Dijk");
    expect(nlPrompt).not.toMatch(/\{[a-zA-Z]/);
    expect(enPrompt).not.toMatch(/\{[a-zA-Z]/);
  });

  it("ends the output contract with the SUBJECT/BODY response shape instruction", () => {
    const prompt = buildDraftPrompt(baseInput());
    expect(prompt).toMatch(/SUBJECT:[\s\S]*BODY:/);
  });
});

// Change C: the prompt names one finding, never a joined list.

describe("buildDraftPrompt — single finding (Change C)", () => {
  it("names only the first topIssueTitle in the finding line", () => {
    const prompt = buildDraftPrompt(
      baseInput({ topIssueTitles: ["Missing alt text", "Slow load time", "No HTTPS"] })
    );
    expect(prompt).toContain("The finding to write about: Missing alt text.");
    expect(prompt).not.toContain("Slow load time");
    expect(prompt).not.toContain("No HTTPS");
  });

  it("omits the finding sentence entirely when topIssueTitles is empty, rather than emitting a placeholder", () => {
    const prompt = buildDraftPrompt(baseInput({ topIssueTitles: [] }));
    expect(prompt).not.toContain("The finding to write about");
    expect(prompt).not.toContain("(none listed)");
  });
});

// Change B: the model authors the subject line; parseDraftResponse parses
// it, with a buildDraftSubject() fallback.

describe("parseDraftResponse", () => {
  it("parses SUBJECT and BODY labels case-insensitively, trimming whitespace", () => {
    const raw = "subject:  Your site is slow\nbody:\n  Hi there.\n  More text.  ";
    const result = parseDraftResponse(raw, "example.com", "en");
    expect(result.subject).toBe("Your site is slow");
    expect(result.body).toBe("Hi there.\n  More text.");
  });

  it("falls back to buildDraftSubject when the subject is missing, empty, or implausibly long", () => {
    const domain = "example.com";
    const fallback = buildDraftSubject(domain, "en");
    expect(parseDraftResponse("BODY:\nJust a body.", domain, "en").subject).toBe(fallback);
    expect(parseDraftResponse("SUBJECT:   \nBODY:\nJust a body.", domain, "en").subject).toBe(fallback);
    const longSubject = "S".repeat(130);
    expect(
      parseDraftResponse(`SUBJECT: ${longSubject}\nBODY:\nJust a body.`, domain, "en").subject
    ).toBe(fallback);
  });

  it("treats the entire raw response as the body when no BODY label is present, using the fallback subject", () => {
    const raw = "Just a plain response with no labels at all, mentioning colons: like this.";
    const result = parseDraftResponse(raw, "example.com", "nl");
    expect(result.body).toBe(raw);
    expect(result.subject).toBe(buildDraftSubject("example.com", "nl"));
  });

  it("strips a parsed subject line out of the body when no BODY label is found", () => {
    const raw = "SUBJECT: Something\nJust prose with no body label.";
    const result = parseDraftResponse(raw, "example.com", "en");
    expect(result.body).toBe("Just prose with no body label.");
    expect(result.subject).toBe(buildDraftSubject("example.com", "en"));
  });

  it("never throws and never returns an empty subject", () => {
    expect(() => parseDraftResponse("", "example.com", "en")).not.toThrow();
    expect(parseDraftResponse("", "example.com", "en").subject.length).toBeGreaterThan(0);
  });
});
