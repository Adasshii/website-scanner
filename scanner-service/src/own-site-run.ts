import type { NicheScanSlice, NicheScanTermMatch } from "../../types/niche-scan-slice";
import type { OwnSiteFacts, OwnSiteHarvestOutcome } from "../../types/own-site";

/**
 * own-site-run.ts: Phase 9, plan 09-09 (D-9-12, D-9-R6). The three seams the
 * full-async route and the page scanner call to run the own-site path, kept out
 * of index.ts and scanner.ts so each can be tested without a browser or a
 * server:
 *
 *   validateNicheSlice     the request-carried slice is untrusted input
 *   collectOwnSiteHarvest  the per-page hook, gated on the slice, never throws
 *   storeOwnSiteFacts      the SECOND, separately caught write of the facts
 *
 * No runtime import: the harvester and the aggregator are passed in by the
 * caller, so this module cannot reach the profile and carries no niche
 * vocabulary (NIC-03, NIC-04). Every function here is written so that a bug in
 * the own-site path costs the facts and never the scan.
 */

/**
 * Caps on the slice (T-9-18, 09-RESEARCH.md Pitfall 10). They bite long before
 * the route's 100kb body limit, which is the point: a copy leak into the slice
 * would otherwise make every bulk scan fail on size. Each list is capped, not
 * only the trade's keyword terms.
 */
export const SLICE_LIMITS = {
  trades: 12,
  /** Per list: keyword terms, quote terms, project terms, certification terms, review hosts. */
  termsPerList: 60,
  stringChars: 80,
  serialisedBytes: 20 * 1024,
} as const;

export type SliceValidation =
  | { ok: true; slice: NicheScanSlice | null }
  | { ok: false; reason: string };

const MATCH_MODES: ReadonlySet<string> = new Set<NicheScanTermMatch>(["substring", "prefix", "word"]);

class SliceViolation extends Error {}

function violation(message: string): never {
  throw new SliceViolation(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkedString(value: unknown, at: string): string {
  if (typeof value !== "string") violation(`${at} is not a string`);
  if (value.length > SLICE_LIMITS.stringChars) violation(`${at} is over ${SLICE_LIMITS.stringChars} characters`);
  return value;
}

function checkedNumber(value: unknown, at: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) violation(`${at} is not a finite number`);
  return value;
}

function checkedList(value: unknown, at: string): unknown[] {
  if (!Array.isArray(value)) violation(`${at} is not a list`);
  if (value.length > SLICE_LIMITS.termsPerList) {
    violation(`${at} is over ${SLICE_LIMITS.termsPerList} entries (${value.length})`);
  }
  return value;
}

function checkedStrings(value: unknown, at: string): string[] {
  return checkedList(value, at).map((entry, i) => checkedString(entry, `${at}[${i}]`));
}

/**
 * Validate the request's `nicheSlice` as untrusted input, the way the route
 * already treats `source` and `userAgent`. An absent slice is valid and means no
 * own-site work. Any violation yields `{ ok: false, reason }`, never an
 * exception, and the caller ignores the slice and proceeds with the scan: the
 * slice is an enhancement, and refusing a whole scan over a malformed one would
 * turn a cosmetic fault into a lost prospect.
 *
 * The returned slice is rebuilt field by field, so a key the engine does not
 * know about never reaches it. The reason names a field and a limit and never
 * echoes the offending content.
 */
export function validateNicheSlice(raw: unknown): SliceValidation {
  if (raw === undefined || raw === null) return { ok: true, slice: null };
  try {
    if (!isRecord(raw)) violation("nicheSlice is not an object");
    const bytes = Buffer.byteLength(JSON.stringify(raw), "utf8");
    if (bytes > SLICE_LIMITS.serialisedBytes) {
      violation(`nicheSlice is over ${SLICE_LIMITS.serialisedBytes} bytes serialised (${bytes})`);
    }
    if (!Array.isArray(raw.trades)) violation("trades is not a list");
    if (raw.trades.length > SLICE_LIMITS.trades) {
      violation(`trades is over ${SLICE_LIMITS.trades} entries (${raw.trades.length})`);
    }

    const trades = raw.trades.map((entry: unknown, i): NicheScanSlice["trades"][number] => {
      const at = `trades[${i}]`;
      if (!isRecord(entry)) violation(`${at} is not an object`);
      if (!isRecord(entry.checks)) violation(`${at}.checks is not an object`);
      const terms = checkedList(entry.terms, `${at}.terms`).map((t, j) => {
        if (!isRecord(t)) violation(`${at}.terms[${j}] is not an object`);
        const match = checkedString(t.match, `${at}.terms[${j}].match`);
        if (!MATCH_MODES.has(match)) violation(`${at}.terms[${j}].match is not a known mode`);
        return { term: checkedString(t.term, `${at}.terms[${j}].term`), match: match as NicheScanTermMatch };
      });
      return {
        id: checkedString(entry.id, `${at}.id`),
        terms,
        tieBreakRank: checkedNumber(entry.tieBreakRank, `${at}.tieBreakRank`),
        checks: {
          quoteTerms: checkedStrings(entry.checks.quoteTerms, `${at}.checks.quoteTerms`),
          projectTerms: checkedStrings(entry.checks.projectTerms, `${at}.checks.projectTerms`),
          certificationTerms: checkedStrings(entry.checks.certificationTerms, `${at}.checks.certificationTerms`),
        },
      };
    });

    return {
      ok: true,
      slice: {
        nicheId: checkedString(raw.nicheId, "nicheId"),
        trades,
        reviewWidgetHosts: checkedStrings(raw.reviewWidgetHosts, "reviewWidgetHosts"),
        minTradeScore: checkedNumber(raw.minTradeScore, "minTradeScore"),
        dominanceRatio: checkedNumber(raw.dominanceRatio, "dominanceRatio"),
      },
    };
  } catch (err) {
    return { ok: false, reason: err instanceof SliceViolation ? err.message : "nicheSlice could not be read" };
  }
}

/**
 * The per-page hook. With no slice there is no own-site work at all: the
 * harvester is not called and the page is not touched, so a public scan is
 * byte-identical to one before this phase. A harvester that throws costs this
 * page's harvest ("unreadable"), never the page or the scan.
 *
 * The harvester is passed in so the caller names it and a test can stand in
 * for it. P is the page type, which this module never needs to know.
 */
export async function collectOwnSiteHarvest<P>(
  page: P,
  slice: NicheScanSlice | null | undefined,
  harvest: (page: P, slice: NicheScanSlice) => Promise<OwnSiteHarvestOutcome | null>
): Promise<OwnSiteHarvestOutcome | null> {
  if (!slice) return null;
  try {
    return await harvest(page, slice);
  } catch (err) {
    console.error(`[own-site] harvest threw: ${err instanceof Error ? err.message : String(err)}`);
    return { state: "unreadable" };
  }
}

export type OwnSiteStoreResult = "skipped" | "stored" | "failed";

export interface OwnSiteStoreDeps {
  aggregate: (
    outcomes: ReadonlyArray<OwnSiteHarvestOutcome | null | undefined>,
    slice: NicheScanSlice,
    meta: { readAt: string }
  ) => OwnSiteFacts;
  /** Issues the second update. Resolves with the `{ error }` shape a Supabase update returns. */
  write: (scanId: string, facts: OwnSiteFacts) => PromiseLike<{ error: { message?: string } | null }>;
  now?: () => string;
  /** How long the write may take before the scan moves on. Default 15 seconds. */
  timeoutMs?: number;
  log?: (line: string) => void;
}

export const OWN_SITE_WRITE_TIMEOUT_MS = 15_000;

const TIMED_OUT = Symbol("timed-out");

/**
 * Aggregate the harvests and write `scans.own_site_facts` in a SECOND update,
 * after the unchanged completed-scan update (D-9-R6, T-9-19). It NEVER throws
 * and never rejects: aggregation that throws, a write that returns an error (the
 * shape a not-yet-applied migration produces), a write that throws, and a write
 * that hangs all resolve to "failed" after one log line, so the caller still
 * reaches the report-email callback.
 *
 * The write is bounded by a deadline because the caller awaits it: a hung
 * database call must not hold the report email back, and must not outlive the
 * scan's own fifteen-minute failure timer.
 *
 * With no slice it returns "skipped" before calling either dependency, which is
 * what keeps the public scan path free of own-site work.
 */
export async function storeOwnSiteFacts(
  args: {
    scanId: string;
    slice: NicheScanSlice | null | undefined;
    outcomes: ReadonlyArray<OwnSiteHarvestOutcome | null | undefined>;
  },
  deps: OwnSiteStoreDeps
): Promise<OwnSiteStoreResult> {
  if (!args.slice) return "skipped";
  const log = deps.log ?? ((line: string) => console.error(line));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const readAt = (deps.now ?? (() => new Date().toISOString()))();
    const facts = deps.aggregate(args.outcomes, args.slice, { readAt });
    const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), deps.timeoutMs ?? OWN_SITE_WRITE_TIMEOUT_MS);
    });
    const result = await Promise.race([Promise.resolve(deps.write(args.scanId, facts)), deadline]);
    if (result === TIMED_OUT) {
      log(`[own-site] own_site_facts write timed out for scan ${args.scanId}; the scan is unaffected`);
      return "failed";
    }
    if (result.error) {
      log(`[own-site] own_site_facts write failed for scan ${args.scanId}: ${result.error.message ?? "unknown error"}; the scan is unaffected`);
      return "failed";
    }
    return "stored";
  } catch (err) {
    log(`[own-site] own_site_facts not stored for scan ${args.scanId}: ${err instanceof Error ? err.message : String(err)}; the scan is unaffected`);
    return "failed";
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
