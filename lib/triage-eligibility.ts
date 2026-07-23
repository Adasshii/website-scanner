// Single releasability rule (D-4.1-01/03/04). Both the server release path
// (lib/triage-release.ts selectWorstN) and the admin UI eligible count MUST
// call isReleasable — a divergent copy re-introduces the mislead this phase
// fixes.
import type { TriageScore } from "@/types/triage";
import { EXCLUDED_CATEGORIES } from "@/lib/triage-constants";

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
 * The single releasability predicate. A row is releasable when:
 *  - it is reachable (D-4.1-03 — an unreachable site is short-circuited to
 *    false even though lib/triage-scorer.ts still stores gated===true for
 *    it; the scorer is intentionally unchanged)
 *  - its category is not excluded (D-4.1-01 — food-service is never
 *    releasable, even below the cutoff)
 *  - and either the stored `gated` boolean is true (among reachable rows
 *    this can only mean !https — the D-4.1-04 no-HTTPS fast-track, always
 *    eligible and top priority) or its score is at/under `cutoff`.
 */
export function isReleasable(
  row: { triage_score: TriageScore; category: string | null },
  cutoff: number
): boolean {
  return (
    row.triage_score.reachable &&
    !isExcludedCategory(row.category) &&
    (row.triage_score.gated || row.triage_score.score <= cutoff)
  );
}
