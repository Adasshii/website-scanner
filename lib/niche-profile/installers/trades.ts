/**
 * lib/niche-profile/installers/trades.ts — Phase 9, D-9-03 / D-9-18 / D-9-21.
 *
 * The installer trades with their approved job values, citations and keyword
 * terms. The numbers are copied from 09-JOB-VALUES.md (approved by Joshua on
 * 2026-11-12) and never re-derived here; when a number changes, that file
 * changes first and this one follows. The test asserts each amount against a
 * literal table, so an edit here without a matching edit there fails the build.
 *
 * Tracer state: heat pump only. The remaining trades land in the next commit.
 */
import type { TradeProfile } from "../types";

// Re-check twelve months after the read date (09-JOB-VALUES.md "What is still owed").
const RECHECK_AFTER = "2027-11-12"; // tunable default
const READ_ON = "2026-11-12";

export const INSTALLERS_TRADES: readonly TradeProfile[] = [
  {
    id: "heat_pump",
    // D-9-02: the value is what the customer pays the installer, so the
    // pre-subsidy invoice total. The ISDE subsidy is claimed back separately.
    jobValue: {
      amountEur: 12000,
      derivation: "published",
      recheckAfter: RECHECK_AFTER,
      citation: {
        source: "Milieu Centraal",
        url: "https://www.milieucentraal.nl/energie-besparen/duurzaam-verwarmen-en-koelen/welke-warmtepompen-zijn-er/",
        readOn: READ_ON,
        note:
          "all-electric air-to-water heat pump, 8 kW, energy label A+++, including VAT and installation, before the ISDE subsidy",
      },
    },
    showMoneyLine: true,
    tieBreakRank: 1, // heat pump outranks central heating on an exact tie (09-RESEARCH.md A7)
    keywords: [
      { term: "warmtepomp", match: "substring" },
      { term: "lucht water", match: "substring" },
      { term: "bodem water", match: "substring" },
      { term: "hybride warmtepomp", match: "substring" },
    ],
    siteChecks: { quoteTerms: [], projectTerms: [], certificationTerms: [] }, // moved to checks.ts in Task 2
    aiQuestions: { nl: [], en: [] }, // D-9-24: nothing in Phase 9 fires a question
  },
];
