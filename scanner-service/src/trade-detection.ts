/**
 * trade-detection.ts: Phase 9, ENG-01 / NIC-01 (D-9-05, D-9-06, D-9-07, D-9-08).
 *
 * Skeleton, so the first test run fails on an assertion and not on an import.
 */

/** The zones of a harvested page that trade detection reads. */
export interface TradeZones {
  title: string;
  h1: readonly string[];
  h2h3: readonly string[];
  navTexts: readonly string[];
  internalPaths: readonly string[];
  bodyText: string;
}

export type TradeConfidence = "clear" | "narrow" | "unreadable";

export interface TradeDetectionResult {
  tradeId: string | null;
  confidence: TradeConfidence;
  scores: Record<string, number>;
  runnerUpId: string | null;
  margin: number;
}

export type TradeSlice = import("../../types/niche-scan-slice").NicheScanSlice;

export function normaliseText(text: string): string {
  return text;
}

export function detectTrade(_zones: TradeZones | readonly TradeZones[], _slice: TradeSlice): TradeDetectionResult {
  return { tradeId: null, confidence: "unreadable", scores: {}, runnerUpId: null, margin: 0 };
}
