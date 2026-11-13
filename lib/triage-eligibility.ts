// Single releasability rule (D-4.1-01/03/04, D-9-R1, D-9-14). Both the server
// release path (lib/triage-release.ts selectWorstN) and the admin UI eligible
// counts (app/admin/page.tsx, components/admin/shortlist-table.tsx) MUST call
// isReleasable — a divergent copy re-introduces the mislead Phase 4.1 fixed.
// The scoreable rule lives inside isReleasable; scoreableVerdict is exported
// only so its truth table can be tested directly, never for a caller to decide
// releasability on its own. scoreableFailureReason is the one production caller
// of scoreableVerdict and the one place MIN_MATCH_CONFIDENCE is applied: both
// isReleasable and the marker refresh (lib/scoreability-refresh.ts) go through
// it, so the stored reason can never come from a different rule than the gate.
import type { TriageScore } from "@/types/triage";
import { EXCLUDED_CATEGORIES, MIN_MATCH_CONFIDENCE } from "@/lib/triage-constants";
import { isAggregatorDomain } from "@/lib/domain-normalize";

const EXCLUDED_CATEGORIES_SET = new Set(
  EXCLUDED_CATEGORIES.map((c) => c.toLowerCase())
);

/**
 * true if `category` is a food-service vertical (D-4.1-01/02). null/empty
 * category is never excluded. Case/whitespace-insensitive.
 */
export function isExcludedCategory(category: string | null): boolean {
  if (!category) return false;
  return EXCLUDED_CATEGORIES_SET.has(category.trim().toLowerCase());
}

/**
 * The four values migration 022's prospects_not_scoreable_reason_check allows,
 * character for character. Adding a member here without a migration makes the
 * marker refresh fail at the database.
 */
export type ScoreableFailureReason =
  | "no_own_domain"
  | "no_unique_match"
  | "no_location"
  | "permanently_closed";

export type ScoreableVerdict = { scoreable: true } | { scoreable: false; reason: ScoreableFailureReason };

/** The two prospect_sources columns the rule reads, one entry per source row. */
export interface ScoreableSource {
  raw_confidence: number | null;
  raw_operating_status: string | null;
}

/**
 * Every field the scoreable rule reads. All six are REQUIRED, never optional
 * (T-9-07, 09-RESEARCH.md Pitfall 8): a caller that forgets to select one is a
 * compile error. An optional field that reads as scoreable when absent would
 * let the rule fail open at runtime, which is the one way a business that must
 * never be emailed could reach the queue.
 */
export interface ScoreableRow {
  domain: string | null;
  website_url: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  sources: ScoreableSource[];
}

/** Non-empty text. Anything else, including undefined from an untyped row, is absent. */
function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Can this business be scored at all (ENG-06, D-9-14, D-9-22)? It must have:
 *  1. an own domain: a website that is the business's own, not an aggregator
 *     listing (isAggregatorDomain is the one domain list, D-9-14);
 *  2. exactly one qualifying Overture match: a source whose confidence is at
 *     or above `minConfidence`. The comparison is `>=` and applies no rounding
 *     to the value, which arrives as a JS number from a Postgres numeric
 *     column. A null confidence never qualifies. Zero sources is not one
 *     match, so absent evidence is never read as a pass. A below-limit source
 *     is ignored for every purpose, so [0.5, 0.3] is one match while
 *     [0.5, 0.5] is two and are never merged;
 *  3. a location: address text, or a stored point;
 *  4. not permanently closed, judged on the qualifying source only.
 *
 * The conditions are evaluated in that FIXED order and the first failure is
 * the reported reason. The order is what makes the reason deterministic for a
 * row that fails more than one: a stable reason is what makes the stored
 * marker (prospects.not_scoreable_reason) and the admin display mean the same
 * thing on every refresh.
 *
 * Reads only the fields on ScoreableRow. It never reads the trade, a trade
 * score, or anything the full scan produces: this rule runs BEFORE the full
 * scan, so such a read would be circular (D-9-05, D-9-08). A business whose
 * trade cannot be read is still scoreable.
 *
 * Absence is fail-closed throughout: each check asks for positive evidence
 * (text present, a number present) rather than ruling out null, so an
 * undefined field from an untyped row cannot pass.
 */
export function scoreableVerdict(row: ScoreableRow, minConfidence: number): ScoreableVerdict {
  // 1. Own domain.
  if (!hasText(row.domain) || !hasText(row.website_url) || isAggregatorDomain(row.website_url)) {
    return { scoreable: false, reason: "no_own_domain" };
  }

  // 2. Exactly one qualifying match.
  const qualifying = (row.sources ?? []).filter(
    (s) => typeof s.raw_confidence === "number" && s.raw_confidence >= minConfidence
  );
  if (qualifying.length !== 1) {
    return { scoreable: false, reason: "no_unique_match" };
  }

  // 3. Location: address text or a stored point.
  const hasPoint = typeof row.latitude === "number" && typeof row.longitude === "number";
  if (!hasText(row.address) && !hasPoint) {
    return { scoreable: false, reason: "no_location" };
  }

  // 4. Operating status, over the qualifying source only.
  if (qualifying[0].raw_operating_status === "permanently_closed") {
    return { scoreable: false, reason: "permanently_closed" };
  }

  return { scoreable: true };
}

/**
 * The reason a row is not scoreable at the configured confidence limit, or
 * null when it is (ENG-06, D-9-17). This is the only production caller of
 * scoreableVerdict and the only place MIN_MATCH_CONFIDENCE is applied.
 * isReleasable gates on it, and the marker refresh persists its output
 * verbatim, so the explanation stored on prospects.not_scoreable_reason is by
 * construction the verdict the release gate used and never a second decision.
 */
export function scoreableFailureReason(row: ScoreableRow): ScoreableFailureReason | null {
  const verdict = scoreableVerdict(row, MIN_MATCH_CONFIDENCE);
  return verdict.scoreable ? null : verdict.reason;
}

/**
 * The single releasability predicate. A row is releasable when:
 *  - it is reachable (D-4.1-03 — an unreachable site is short-circuited to
 *    false even though lib/triage-scorer.ts still stores gated===true for
 *    it; the scorer is intentionally unchanged)
 *  - its category is not excluded (D-4.1-01 — food-service is never
 *    releasable, even below the cutoff)
 *  - either the stored `gated` boolean is true (among reachable rows
 *    this can only mean !https — the D-4.1-04 no-HTTPS fast-track, always
 *    eligible and top priority) or its score is at/under `cutoff`
 *  - and it is scoreable (ENG-06, D-9-14): scoreableFailureReason, which is
 *    scoreableVerdict at MIN_MATCH_CONFIDENCE. The fast track does not
 *    override this.
 *
 * Cheap browserless triage still runs on every prospect; this gates the
 * expensive full scan.
 */
export function isReleasable(
  row: { triage_score: TriageScore; category: string | null } & ScoreableRow,
  cutoff: number
): boolean {
  return (
    row.triage_score.reachable &&
    !isExcludedCategory(row.category) &&
    (row.triage_score.gated || row.triage_score.score <= cutoff) &&
    scoreableFailureReason(row) === null
  );
}
