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

/**
 * Hits counted per page in the zones where repetition is cheap, so a page that
 * repeats one word fifty times cannot outrank a page that says what it does in
 * its title. Applied per page, then summed across pages.
 */
export const ZONE_HIT_CAPS = {
  h2h3: 5, // tunable default
  body: 10, // tunable default
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

/** One page's zones after normalisation. Nav and link paths are held apart: they are unioned, not summed. */
interface PreparedPage {
  title: string;
  h1: string[];
  h2h3: string[];
  body: string;
}

interface PreparedSite {
  pages: PreparedPage[];
  /** Distinct normalised nav texts across every page. */
  nav: string[];
  /** Distinct normalised internal link paths across every page. */
  paths: string[];
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

function endsWord(text: string, end: number): boolean {
  return end >= text.length || !isWordChar(text.charCodeAt(end));
}

/**
 * The three modes, each added for a measured failure and none interchangeable:
 *   substring  anywhere in a word: long unique stems.
 *   prefix     at a word start, any continuation: Dutch compounds put the head
 *              word last, so a short stem sits at the front of a longer word.
 *   word       the whole term between boundaries: abbreviations a loose match
 *              would collide with. A multi-word term is ONE unit, so two words
 *              of it that sit apart in the text do not match.
 */
function matchesAt(text: string, at: number, term: PreparedTerm): boolean {
  if (term.match === "substring") return true;
  if (term.match === "prefix") return startsWord(text, at);
  if (term.match === "word") return startsWord(text, at) && endsWord(text, at + term.text.length);
  return false;
}

/**
 * Distinct start positions at which any term matches, so two terms that both
 * match the same word (a stem and a longer stem) count as one hit, not two.
 * Stops as soon as `limit` positions are found.
 */
function countHits(text: string, terms: readonly PreparedTerm[], limit: number): number {
  const positions = new Set<number>();
  for (const term of terms) {
    let from = 0;
    while (positions.size < limit) {
      const at = text.indexOf(term.text, from);
      if (at === -1) break;
      from = at + 1;
      if (matchesAt(text, at, term)) positions.add(at);
    }
  }
  return Math.min(positions.size, limit);
}

/** Hits over several texts that share one cap, the cap applying to the sum. */
function countHitsCapped(texts: readonly string[], terms: readonly PreparedTerm[], cap: number): number {
  let total = 0;
  for (const text of texts) {
    if (total >= cap) break;
    total += countHits(text, terms, cap - total);
  }
  return total;
}

function prepareTerms(trade: TradeSlice["trades"][number]): PreparedTerm[] {
  const prepared: PreparedTerm[] = [];
  for (const entry of trade.terms.slice(0, MAX_TERMS_PER_TRADE)) {
    const text = normaliseText(String(entry.term).slice(0, MAX_TERM_CHARS));
    if (text !== "") prepared.push({ text, match: entry.match });
  }
  return prepared;
}

function normaliseBounded(text: string): string {
  return normaliseText(String(text).slice(0, MAX_TEXT_CHARS));
}

function normaliseItems(items: readonly string[]): string[] {
  return items.slice(0, MAX_ITEMS_PER_ZONE).map(normaliseBounded);
}

/**
 * Normalises every page once, ahead of the per-trade loop. Nav text and internal
 * link paths are collected as a DISTINCT UNION across pages, while title, h1,
 * h2/h3 and body stay per page to be summed. The split is deliberate and is the
 * one part a later reader will be tempted to simplify: the same nav is on every
 * page, so summing it would multiply one keyword by the page count (a nav naming
 * one trade on a 7-page scan would count seven times and bury the real signal),
 * whereas the other four zones genuinely differ from page to page.
 */
function prepareSite(pages: readonly TradeZones[]): PreparedSite {
  const nav = new Set<string>();
  const paths = new Set<string>();
  const prepared: PreparedPage[] = [];
  for (const page of pages) {
    prepared.push({
      title: normaliseBounded(page.title),
      h1: normaliseItems(page.h1),
      h2h3: normaliseItems(page.h2h3),
      body: normaliseBounded(page.bodyText),
    });
    for (const text of normaliseItems(page.navTexts)) nav.add(text);
    for (const text of normaliseItems(page.internalPaths)) paths.add(text);
  }
  return { pages: prepared, nav: Array.from(nav), paths: Array.from(paths) };
}

function scoreTrade(site: PreparedSite, terms: readonly PreparedTerm[]): number {
  let score = 0;
  for (const page of site.pages) {
    score += countHits(page.title, terms, Infinity) * ZONE_WEIGHTS.title;
    for (const text of page.h1) score += countHits(text, terms, Infinity) * ZONE_WEIGHTS.h1;
    score += countHitsCapped(page.h2h3, terms, ZONE_HIT_CAPS.h2h3) * ZONE_WEIGHTS.h2h3;
    score += countHits(page.body, terms, ZONE_HIT_CAPS.body) * ZONE_WEIGHTS.body;
  }
  for (const text of site.nav) score += countHits(text, terms, Infinity) * ZONE_WEIGHTS.nav;
  for (const text of site.paths) score += countHits(text, terms, Infinity) * ZONE_WEIGHTS.path;
  return score;
}

export function detectTrade(zones: TradeZones | readonly TradeZones[], slice: TradeSlice): TradeDetectionResult {
  const pages = (Array.isArray(zones) ? zones : [zones]).slice(0, MAX_PAGES) as readonly TradeZones[];
  const site = prepareSite(pages);
  const scores: Record<string, number> = {};
  const ranked: Array<{ id: string; score: number }> = [];
  for (const trade of slice.trades.slice(0, MAX_TRADES)) {
    const score = scoreTrade(site, prepareTerms(trade));
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
