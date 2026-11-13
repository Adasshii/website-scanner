/**
 * types/niche-scan-slice.ts — Phase 9, D-9-12 / D-9-13.
 *
 * The only shape of the niche profile that crosses to the Railway scanner.
 * It carries what trade detection and the own-site checks need and nothing
 * else: no job value, no citation, no prospect-facing copy (T-9-03).
 *
 * Type-only, and under types/ on purpose: scanner-service/Dockerfile already
 * copies types/ and scanner-service/tsconfig.json already includes it, which
 * is what lets D-9-13 hold with no Dockerfile or tsconfig edit.
 */

/** How a keyword term matches normalised text. */
export type NicheScanTermMatch = "substring" | "prefix" | "word";

export interface NicheScanSlice {
  /** Which niche this slice was built from, e.g. "installers". */
  nicheId: string;
  trades: Array<{
    /** Trade id, e.g. "heat_pump". */
    id: string;
    /** Keyword terms that decide the trade. */
    terms: Array<{ term: string; match: NicheScanTermMatch }>;
    /** Lower wins an exact score tie. */
    tieBreakRank: number;
    /** Per-trade terms for the quote, project and certification checks. */
    checks: {
      quoteTerms: string[];
      projectTerms: string[];
      certificationTerms: string[];
    };
  }>;
  /** Hostname fragments of review-widget platforms. */
  reviewWidgetHosts: string[];
  /** Minimum score for a trade to be set at all. */
  minTradeScore: number;
  /** Margin ratio below which a winning trade is marked narrow. */
  dominanceRatio: number;
}
