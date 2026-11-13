// RED skeleton for plan 09-02 Task 1: exports exist so the tracer test fails on
// its planned assertions rather than at import. Replaced in the GREEN commit.
import type { NicheScanSlice } from "@/types/niche-scan-slice";
import type { NicheProfile, TradeId, TradeProfile } from "./types";

export const INSTALLERS_PROFILE = {
  id: "installers",
  country: "",
  locales: [],
  defaultLocale: "nl",
  currency: "EUR",
  overtureCategories: [],
  regions: [],
  competitor: { radiusKm: 0, maxCompetitors: 0 },
  trades: [],
  copy: {
    nl: { moneyLine: "", adashiFixes: {}, socialProof: "" },
    en: { moneyLine: "", adashiFixes: {}, socialProof: "" },
  },
  scoring: { minTradeScore: 0, dominanceRatio: 0 },
} satisfies NicheProfile as NicheProfile;

export function getTrade(profile: NicheProfile, id: TradeId): TradeProfile | undefined {
  return profile.trades.find((t) => t.id === id);
}

export function toScannerSlice(profile: NicheProfile): NicheScanSlice {
  return {
    nicheId: profile.id,
    trades: [],
    reviewWidgetHosts: [],
    minTradeScore: 0,
    dominanceRatio: 0,
  };
}
