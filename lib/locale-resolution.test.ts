// Unit tests for the visitor-locale resolution chain (QUICK-260730-oiy). No
// Supabase — `lookupProspectLocale` is always injected as a vi.fn(). Covers
// reportScanIdFromPathname, resolveVisitorLocale's four-signal precedence
// and fail-open behavior, and Task 1's first-match parseAcceptLanguage.
// Task 2 adds real q-value negotiation cases for parseAcceptLanguage below.
import { describe, expect, it, vi } from "vitest";
import {
  parseAcceptLanguage,
  reportScanIdFromPathname,
  resolveVisitorLocale,
} from "./locale-resolution";

describe("reportScanIdFromPathname", () => {
  it("extracts the scan id from /report/<id>", () => {
    expect(reportScanIdFromPathname("/report/8f3a-uuid")).toBe("8f3a-uuid");
  });

  it("returns null for /report (no id)", () => {
    expect(reportScanIdFromPathname("/report")).toBeNull();
  });

  it("returns null for /reports/x", () => {
    expect(reportScanIdFromPathname("/reports/x")).toBeNull();
  });

  it("returns null for /report/x/y", () => {
    expect(reportScanIdFromPathname("/report/x/y")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(reportScanIdFromPathname("")).toBeNull();
  });

  it("returns null for null", () => {
    expect(reportScanIdFromPathname(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(reportScanIdFromPathname(undefined)).toBeNull();
  });

  it("treats a single trailing slash as the same page", () => {
    expect(reportScanIdFromPathname("/report/8f3a-uuid/")).toBe("8f3a-uuid");
  });
});

describe("resolveVisitorLocale", () => {
  it("REQUIRED TEST 1: Dutch prospect, no cookie, resolves nl", async () => {
    const lookupProspectLocale = vi.fn().mockResolvedValue("nl");
    const locale = await resolveVisitorLocale({
      cookieLocale: null,
      pathname: "/report/dutch-scan-id",
      acceptLanguage: null,
      lookupProspectLocale,
    });
    expect(locale).toBe("nl");
  });

  it("REQUIRED TEST 2: English prospect, no cookie, resolves en", async () => {
    const lookupProspectLocale = vi.fn().mockResolvedValue("en");
    const locale = await resolveVisitorLocale({
      cookieLocale: null,
      pathname: "/report/gb-scan-id",
      acceptLanguage: null,
      lookupProspectLocale,
    });
    expect(locale).toBe("en");
  });

  it("REQUIRED TEST 3a: cookie toggle wins over a Dutch prospect, lookup never called", async () => {
    const lookupProspectLocale = vi.fn().mockResolvedValue("nl");
    const locale = await resolveVisitorLocale({
      cookieLocale: "en",
      pathname: "/report/dutch-scan-id",
      acceptLanguage: null,
      lookupProspectLocale,
    });
    expect(locale).toBe("en");
    expect(lookupProspectLocale).not.toHaveBeenCalled();
  });

  it("REQUIRED TEST 3b: cookie toggle wins over an English prospect", async () => {
    const lookupProspectLocale = vi.fn().mockResolvedValue("en");
    const locale = await resolveVisitorLocale({
      cookieLocale: "nl",
      pathname: "/report/gb-scan-id",
      acceptLanguage: null,
      lookupProspectLocale,
    });
    expect(locale).toBe("nl");
  });

  it("ignores a garbage cookie value and continues the chain", async () => {
    const lookupProspectLocale = vi.fn().mockResolvedValue("nl");
    const locale = await resolveVisitorLocale({
      cookieLocale: "de",
      pathname: "/report/dutch-scan-id",
      acceptLanguage: null,
      lookupProspectLocale,
    });
    expect(locale).toBe("nl");
  });

  it("ignores an empty-string cookie value", async () => {
    const lookupProspectLocale = vi.fn().mockResolvedValue("nl");
    const locale = await resolveVisitorLocale({
      cookieLocale: "",
      pathname: "/report/dutch-scan-id",
      acceptLanguage: null,
      lookupProspectLocale,
    });
    expect(locale).toBe("nl");
  });

  it("ignores an undefined cookie value", async () => {
    const lookupProspectLocale = vi.fn().mockResolvedValue("nl");
    const locale = await resolveVisitorLocale({
      cookieLocale: undefined,
      pathname: "/report/dutch-scan-id",
      acceptLanguage: null,
      lookupProspectLocale,
    });
    expect(locale).toBe("nl");
  });

  it("falls to Accept-Language on a non-report pathname, lookup never called", async () => {
    const lookupProspectLocale = vi.fn().mockResolvedValue("en");
    const locale = await resolveVisitorLocale({
      cookieLocale: null,
      pathname: "/scan/abc",
      acceptLanguage: "nl-NL",
      lookupProspectLocale,
    });
    expect(locale).toBe("nl");
    expect(lookupProspectLocale).not.toHaveBeenCalled();
  });

  it("falls to defaultLocale with no cookie, no pathname, no Accept-Language", async () => {
    const lookupProspectLocale = vi.fn().mockResolvedValue(null);
    const locale = await resolveVisitorLocale({
      cookieLocale: null,
      pathname: null,
      acceptLanguage: null,
      lookupProspectLocale,
    });
    expect(locale).toBe("en");
  });

  it("fails open to Accept-Language then default when lookup resolves null", async () => {
    const lookupProspectLocale = vi.fn().mockResolvedValue(null);
    const locale = await resolveVisitorLocale({
      cookieLocale: null,
      pathname: "/report/unknown-scan-id",
      acceptLanguage: null,
      lookupProspectLocale,
    });
    expect(locale).toBe("en");
  });

  it("fails open to the next signal when lookup rejects, never rejects itself", async () => {
    const lookupProspectLocale = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(
      resolveVisitorLocale({
        cookieLocale: null,
        pathname: "/report/error-scan-id",
        acceptLanguage: "nl-NL",
        lookupProspectLocale,
      }),
    ).resolves.toBe("nl");
  });
});

describe("parseAcceptLanguage (Task 1 baseline)", () => {
  it("returns the first supported tag present", () => {
    expect(parseAcceptLanguage("nl-NL,en-US")).toBe("nl");
  });

  it("returns null for null", () => {
    expect(parseAcceptLanguage(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseAcceptLanguage(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseAcceptLanguage("")).toBeNull();
  });
});

describe("parseAcceptLanguage (Task 2: q-value negotiation)", () => {
  it("picks the highest-q supported tag among several", () => {
    expect(parseAcceptLanguage("nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7")).toBe(
      "nl",
    );
  });

  it("picks en when en has the higher q", () => {
    expect(parseAcceptLanguage("en-US,en;q=0.9,nl;q=0.8")).toBe("en");
  });

  it("highest q wins regardless of position", () => {
    expect(parseAcceptLanguage("en;q=0.3,nl;q=0.9")).toBe("nl");
  });

  it("a missing q defaults to 1.0, beating an explicit lower q", () => {
    expect(parseAcceptLanguage("nl;q=0.5,en")).toBe("en");
  });

  it("equal q-values break on document order", () => {
    expect(parseAcceptLanguage("nl;q=0.8,en;q=0.8")).toBe("nl");
  });

  it("q=0 means not acceptable, so the other tag wins", () => {
    expect(parseAcceptLanguage("nl;q=0,en;q=0.5")).toBe("en");
  });

  it("q=0 alone returns null", () => {
    expect(parseAcceptLanguage("nl;q=0")).toBeNull();
  });

  it("skips unsupported tags", () => {
    expect(parseAcceptLanguage("de-DE,fr;q=0.9,nl;q=0.5")).toBe("nl");
  });

  it("returns null when nothing is supported", () => {
    expect(parseAcceptLanguage("de,fr")).toBeNull();
  });

  it("ignores a bare wildcard", () => {
    expect(parseAcceptLanguage("*")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(parseAcceptLanguage("NL-nl")).toBe("nl");
  });

  it("never throws on malformed input: semicolons only", () => {
    expect(parseAcceptLanguage(";;;")).toBeNull();
  });

  it("never throws on malformed input: empty q value", () => {
    expect(parseAcceptLanguage("nl;q=")).toBeNull();
  });

  it("never throws on malformed input: non-numeric q value", () => {
    expect(parseAcceptLanguage("nl;q=abc")).toBeNull();
  });

  it("never throws on malformed input: commas only", () => {
    expect(parseAcceptLanguage(",,")).toBeNull();
  });

  it("never throws on malformed input: whitespace only", () => {
    expect(parseAcceptLanguage("   ")).toBeNull();
  });

  it("never throws on a 10000-character junk string", () => {
    const junk = "x".repeat(10000);
    expect(() => parseAcceptLanguage(junk)).not.toThrow();
    expect(parseAcceptLanguage(junk)).toBeNull();
  });

  it("tolerates surrounding and internal whitespace", () => {
    expect(parseAcceptLanguage(" nl-NL , en ; q=0.8 ")).toBe("nl");
  });
});
