/**
 * lib/niche-profile/index.ts — Phase 9, NIC-01..NIC-04 (D-9-09, D-9-12).
 *
 * Assembles the installers profile and exposes the only functions that read
 * it. Engine files never import this module (NIC-04, asserted by
 * isolation.test.ts): the engine receives a typed `NicheScanSlice`, built by
 * `toScannerSlice`, and never the profile itself.
 *
 * Lookups are keyed on `TradeId`, never on an array index, so the order of
 * `profile.trades` is not load-bearing (D-9-07).
 */
import type { NicheScanSlice } from "@/types/niche-scan-slice";
import { COMPETITOR_RULES, OVERTURE_IMPORT_CATEGORIES, TARGET_REGIONS } from "./installers/categories";
import { REVIEW_WIDGET_HOSTS } from "./installers/checks";
import { INSTALLERS_COPY } from "./installers/copy";
import { INSTALLERS_TRADES } from "./installers/trades";
import type { NicheProfile, TradeId, TradeProfile } from "./types";

export const INSTALLERS_PROFILE: NicheProfile = {
  id: "installers",
  country: "NL",
  locales: ["nl", "en"],
  defaultLocale: "nl",
  currency: "EUR",
  overtureCategories: OVERTURE_IMPORT_CATEGORIES,
  regions: TARGET_REGIONS,
  competitor: { ...COMPETITOR_RULES }, // Phase 10 reads; Phase 9 only holds (D-9-23)
  trades: INSTALLERS_TRADES,
  reviewWidgetHosts: REVIEW_WIDGET_HOSTS,
  copy: INSTALLERS_COPY,
  // Seeds from the 53-site prototype (09-RESEARCH.md Pattern 6); confirm against the real list.
  scoring: { minTradeScore: 8, dominanceRatio: 1.5 }, // tunable default
};

const PROFILES: Readonly<Record<NicheProfile["id"], NicheProfile>> = {
  installers: INSTALLERS_PROFILE,
};

export function getNicheProfile(id: NicheProfile["id"]): NicheProfile {
  return PROFILES[id];
}

/** Looks a trade up by id. Never by position (D-9-07). */
export function getTrade(profile: NicheProfile, id: TradeId): TradeProfile | undefined {
  return profile.trades.find((trade) => trade.id === id);
}

/**
 * Builds the request-carried slice field by field from an explicit list.
 * It never spreads a `TradeProfile`: a spread is what would let a future
 * field carrying copy or a job value leak onto Railway (T-9-03).
 */
export function toScannerSlice(profile: NicheProfile): NicheScanSlice {
  return {
    nicheId: profile.id,
    trades: profile.trades.map((trade) => ({
      id: trade.id,
      terms: trade.keywords.map((keyword) => ({ term: keyword.term, match: keyword.match })),
      tieBreakRank: trade.tieBreakRank,
      checks: {
        quoteTerms: [...trade.siteChecks.quoteTerms],
        projectTerms: [...trade.siteChecks.projectTerms],
        certificationTerms: [...trade.siteChecks.certificationTerms],
      },
    })),
    reviewWidgetHosts: [...profile.reviewWidgetHosts],
    minTradeScore: profile.scoring.minTradeScore,
    dominanceRatio: profile.scoring.dominanceRatio,
  };
}

/**
 * The ids of trades whose job value is due a re-check: `recheckAfter` is at
 * or before `now` (D-9-18). Pure over an injected clock, so staleness can be
 * surfaced on a later admin surface and never turns CI red on a calendar day
 * with no code change. Nothing here reads the real current date.
 *
 * Dates are ISO `YYYY-MM-DD` strings, compared as UTC midnight.
 */
export function staleJobValues(profile: NicheProfile, now: Date): TradeId[] {
  return profile.trades
    .filter((trade) => trade.jobValue !== undefined && new Date(trade.jobValue.recheckAfter).getTime() <= now.getTime())
    .map((trade) => trade.id);
}
