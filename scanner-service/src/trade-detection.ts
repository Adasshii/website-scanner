/**
 * trade-detection.ts: Phase 9, ENG-01 / NIC-01 (D-9-05, D-9-06, D-9-07, D-9-08).
 *
 * Decides which trade a business actually does by counting keyword matches in
 * the text of its own site. Contract: no model participates at any step. The
 * trade selects the job value, so a model naming the trade would be a model
 * indirectly choosing a number, and the harvested text is only ever counted.
 *
 * The Dutch words it matches arrive in the slice the request carried. This file
 * holds no trade vocabulary and never reads the Overture category (NIC-03,
 * D-9-05). Pure: no Supabase client, no I/O, no runtime import. Terms are
 * matched as literals with string search; no pattern is ever built from a
 * profile string or from page text, so a hostile term or page cannot make the
 * scanner throw or backtrack (T-9-16). Only the resulting scores and the chosen
 * trade leave this module; the page text is counted in memory (D-9-R5).
 */

/** The slice the request carries. A type-position import, erased at compile time. */
export type TradeSlice = import("../../types/niche-scan-slice").NicheScanSlice;

/** The zones of a harvested page that trade detection reads. OwnSiteHarvest satisfies it. */
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
  /** The winning trade, or null when no trade reached the minimum score. */
  tradeId: string | null;
  confidence: TradeConfidence;
  /** One entry per trade in the slice, zero scores included. */
  scores: Record<string, number>;
  runnerUpId: string | null;
  /** The winner's score minus the runner-up's. */
  margin: number;
}

/** Points per hit, by zone. Measured on 53 homepages (09-RESEARCH.md Pattern 6). */
export const ZONE_WEIGHTS = {
  title: 5, // tunable default
  h1: 5, // tunable default
  nav: 3, // tunable default
  path: 3, // tunable default
  h2h3: 2, // tunable default
  body: 1, // tunable default
} as const;

/** Bounds on what one call will read, so a hostile page is bounded work (T-9-16). */
const MAX_TEXT_CHARS = 20_000; // matches the harvester's body cap
const MAX_ITEMS_PER_ZONE = 200;
const MAX_PAGES = 50;
const MAX_TRADES = 50;
const MAX_TERMS_PER_TRADE = 50;
const MAX_TERM_CHARS = 100;

type MatchMode = TradeSlice["trades"][number]["terms"][number]["match"];

interface PreparedTerm {
  text: string;
  match: MatchMode;
}

/**
 * Lower-case, map every hyphen variant (ASCII hyphen, U+2010 to U+2015) and the
 * underscore to a space, then collapse whitespace. Applied to the zone text and
 * to the profile term alike: Dutch sites write one compound three different ways.
 */
export function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-‐-―_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Letters and digits, Latin range only. Everything else is a word boundary. */
function isWordChar(code: number): boolean {
  if (code >= 48 && code <= 57) return true; // 0-9
  if (code >= 97 && code <= 122) return true; // a-z
  return code >= 0xc0 && code <= 0x24f && code !== 0xd7 && code !== 0xf7; // accented Latin
}

function startsWord(text: string, at: number): boolean {
  return at === 0 || !isWordChar(text.charCodeAt(at - 1));
}

function matchesAt(text: string, at: number, term: PreparedTerm): boolean {
  // prefix: at a word start, any continuation, so a compound built on the term is found.
  if (term.match === "prefix") return startsWord(text, at);
  return false;
}

/**
 * Distinct start positions at which any term matches, so two terms that both
 * match the same word (a stem and a longer stem) count as one hit, not two.
 */
function countHits(text: string, terms: readonly PreparedTerm[]): number {
  const positions = new Set<number>();
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(term.text, from);
      if (at === -1) break;
      from = at + 1;
      if (matchesAt(text, at, term)) positions.add(at);
    }
  }
  return positions.size;
}

function prepareTerms(trade: TradeSlice["trades"][number]): PreparedTerm[] {
  const prepared: PreparedTerm[] = [];
  for (const entry of trade.terms.slice(0, MAX_TERMS_PER_TRADE)) {
    const text = normaliseText(String(entry.term).slice(0, MAX_TERM_CHARS));
    if (text !== "") prepared.push({ text, match: entry.match });
  }
  return prepared;
}

function boundedTexts(items: readonly string[]): string[] {
  return items.slice(0, MAX_ITEMS_PER_ZONE).map((item) => normaliseText(String(item).slice(0, MAX_TEXT_CHARS)));
}

function scoreTrade(pages: readonly TradeZones[], terms: readonly PreparedTerm[]): number {
  let score = 0;
  for (const page of pages) {
    for (const text of boundedTexts(page.h1)) score += countHits(text, terms) * ZONE_WEIGHTS.h1;
  }
  return score;
}

export function detectTrade(zones: TradeZones | readonly TradeZones[], slice: TradeSlice): TradeDetectionResult {
  const pages = (Array.isArray(zones) ? zones : [zones]).slice(0, MAX_PAGES) as readonly TradeZones[];
  const scores: Record<string, number> = {};
  const ranked: Array<{ id: string; score: number }> = [];
  for (const trade of slice.trades.slice(0, MAX_TRADES)) {
    const score = scoreTrade(pages, prepareTerms(trade));
    scores[trade.id] = score;
    ranked.push({ id: trade.id, score });
  }

  let top: { id: string; score: number } | null = null;
  for (const entry of ranked) if (top === null || entry.score > top.score) top = entry;
  let second: { id: string; score: number } | null = null;
  for (const entry of ranked) {
    if (entry !== top && (second === null || entry.score > second.score)) second = entry;
  }

  const readable = top !== null && top.score > 0 && Number.isFinite(slice.minTradeScore) && top.score >= slice.minTradeScore;
  if (top === null || !readable) {
    return { tradeId: null, confidence: "unreadable", scores, runnerUpId: null, margin: 0 };
  }
  const runnerUpScore = second === null ? 0 : second.score;
  return {
    tradeId: top.id,
    confidence: "clear",
    scores,
    runnerUpId: second !== null && runnerUpScore > 0 ? second.id : null,
    margin: top.score - runnerUpScore,
  };
}
