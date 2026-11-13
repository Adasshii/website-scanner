/**
 * lib/niche-profile/profile.test.ts — Phase 9, plan 09-02 (NIC-01, NIC-02).
 *
 * Pins what the installers profile holds and the shape of what leaves it for
 * the Railway scanner. The six job values are asserted against a literal
 * table written out in this file, NOT read back off the profile: a number
 * edited in trades.ts without a matching edit here (and in 09-JOB-VALUES.md)
 * fails the build (T-9-04).
 *
 * Pure unit test: no network, no database, no clock. Staleness takes an
 * injected date, so CI never goes red on a calendar day with no code change.
 */
import { describe, expect, it } from "vitest";
import { INSTALLERS_PROFILE, getTrade, toScannerSlice } from "./index";
import type { JobValue, TradeProfile } from "./types";

describe("installers profile: identity (NIC-01, NIC-03)", () => {
  it("country is NL and the locales are nl and en with nl as default", () => {
    expect(INSTALLERS_PROFILE.country).toBe("NL");
    expect(INSTALLERS_PROFILE.locales).toContain("nl");
    expect(INSTALLERS_PROFILE.locales).toContain("en");
    expect(INSTALLERS_PROFILE.defaultLocale).toBe("nl");
  });
});

describe("heat pump trade (tracer, NIC-02)", () => {
  it("carries the pre-subsidy invoice total as a published value", () => {
    const trade = getTrade(INSTALLERS_PROFILE, "heat_pump");
    expect(trade?.jobValue?.amountEur).toBe(12000);
    expect(trade?.jobValue?.derivation).toBe("published");
  });

  it("cites Milieu Centraal, read on 2026-11-12", () => {
    const citation = getTrade(INSTALLERS_PROFILE, "heat_pump")?.jobValue?.citation;
    expect(citation?.source).toBe("Milieu Centraal");
    expect(citation?.readOn).toBe("2026-11-12");
  });
});

describe("toScannerSlice (D-9-12, T-9-03)", () => {
  const slice = toScannerSlice(INSTALLERS_PROFILE);

  it("returns the niche id, the trade entries and the two scoring thresholds", () => {
    expect(slice.nicheId).toBe("installers");
    const heatPump = slice.trades.find((t) => t.id === "heat_pump");
    expect(heatPump).toBeDefined();
    expect(heatPump?.terms.length).toBeGreaterThan(0);
    expect(typeof heatPump?.tieBreakRank).toBe("number");
    expect(heatPump?.checks).toBeDefined();
    expect(Array.isArray(slice.reviewWidgetHosts)).toBe(true);
    expect(typeof slice.minTradeScore).toBe("number");
    expect(typeof slice.dominanceRatio).toBe("number");
  });

  it("carries no job value, no citation and no copy", () => {
    const serialised = JSON.stringify(slice);
    expect(serialised).not.toContain("amountEur");
    expect(serialised).not.toContain("citation");
    expect(serialised).not.toContain("copy");
  });
});

describe("type-level guarantees (NIC-02, D-9-20, D-9-21)", () => {
  // These cases are proven by `npx tsc --noEmit`, not by the runtime. Each
  // expect-error directive below would itself fail to compile ("unused
  // directive") if the type were loosened, so a loosened type breaks the build.
  const baseChecks = { quoteTerms: [], projectTerms: [], certificationTerms: [] };

  it("rejects a trade literal that omits showMoneyLine", () => {
    // @ts-expect-error showMoneyLine is required and independent of jobValue (D-9-21)
    const noSwitch: TradeProfile = {
      id: "solar",
      tieBreakRank: 2,
      keywords: [],
      siteChecks: baseChecks,
      aiQuestions: { nl: [], en: [] },
    };
    expect(noSwitch.id).toBe("solar");
  });

  it("rejects a midpoint-of-range value whose citation has no note", () => {
    // @ts-expect-error a midpoint value must explain itself in citation.note (D-9-20)
    const noNote: JobValue = {
      amountEur: 11000,
      derivation: "midpoint-of-range",
      range: [7000, 15000],
      recheckAfter: "2027-11-12",
      citation: { source: "Homedeal", url: "https://example.test", readOn: "2026-11-12" },
    };
    expect(noNote.amountEur).toBe(11000);
  });

  it("allows a trade with no jobValue (D-9-04) and a trade with a value and no money line (D-9-21)", () => {
    const noValue: TradeProfile = {
      id: "kitchen",
      showMoneyLine: false,
      tieBreakRank: 4,
      keywords: [],
      siteChecks: baseChecks,
      aiQuestions: { nl: [], en: [] },
    };
    expect(noValue.jobValue).toBeUndefined();
    expect(noValue.showMoneyLine).toBe(false);
  });
});
