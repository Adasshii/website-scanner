// Release mechanism (TRI-08 cutoff + TRI-09 ceiling, enforced independently).
// D-05/D-06: selects the worst-ranked eligible, un-released prospects up to
// the hard ceiling and marks scan_released_at — never more than the
// ceiling, no matter how permissive the cutoff, and never re-releases an
// already-released prospect.
//
// Ceiling enforcement deliberately happens in JS with real numbers
// (RESEARCH.md §"Cutoff & ceiling query", Pitfall 5) rather than a
// Postgres jsonb ->> text-comparison filter/order/limit, which can
// silently misorder unpadded numeric scores ('9' > '10' as text).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TriageScore } from "@/types/triage";
import { DEFAULT_CUTOFF, RELEASE_CEILING } from "@/lib/triage-constants";
import { isReleasable, type ScoreableRow, type ScoreableSource } from "@/lib/triage-eligibility";

export interface ReleaseOptions {
  cutoff?: number;
  ceiling?: number;
}

export interface ReleaseCandidate extends ScoreableRow {
  id: string;
  triage_score: TriageScore;
  category: string | null;
  /** The stored scoreable marker (migration 022). Informational: isReleasable
   * recomputes from the fields above and never trusts this column, so a stale
   * marker cannot release or block anyone. */
  not_scoreable_reason: string | null;
}

// Everything isReleasable reads, in one place. The prospect_sources embed works
// because prospect_sources.prospect_id references prospects(id) (migration 011).
const RELEASE_SELECT =
  "id, triage_score, category, domain, website_url, address, latitude, longitude, not_scoreable_reason, prospect_sources(raw_confidence, raw_operating_status)";

type ReleaseRow = Omit<ReleaseCandidate, "sources"> & {
  prospect_sources: ScoreableSource[] | null;
};

/**
 * Selects the worst-N eligible, un-released prospects, worst-first
 * (gated DESC, then score ASC), sliced to `ceiling`.
 *
 * Eligible = isReleasable(row, cutoff) — the single releasability rule
 * (D-4.1-01/03/04, ENG-06): unreachable, excluded-category and not-scoreable
 * rows are never eligible, no-HTTPS reachable scoreable rows are always
 * eligible (gated fast-track).
 * Also requires domain is not null, triage_score is not null, and
 * scan_released_at is null (D-06 — already-released prospects are never
 * re-selected).
 */
export async function selectWorstN(
  sb: SupabaseClient,
  { cutoff = DEFAULT_CUTOFF, ceiling = RELEASE_CEILING }: ReleaseOptions = {}
): Promise<ReleaseCandidate[]> {
  const { data, error } = await sb
    .from("prospects")
    .select(RELEASE_SELECT)
    .not("domain", "is", null)
    .not("triage_score", "is", null)
    .is("scan_released_at", null);
  if (error) throw error;

  // Map the embed to the `sources` field the predicate expects. A missing
  // embed becomes an empty list, which is not one match: it fails closed.
  const candidates: ReleaseCandidate[] = ((data ?? []) as unknown as ReleaseRow[]).map(
    ({ prospect_sources, ...row }) => ({ ...row, sources: prospect_sources ?? [] })
  );

  const eligible = candidates.filter((p) => isReleasable(p, cutoff));

  // Post-filter, the eligible set is reachable-only (D-4.1-03), so
  // gated===true among these rows means no-HTTPS (D-4.1-04) and still
  // sorts first — the worst-first thesis, unaffected by the gate split.
  eligible.sort((a, b) => {
    if (a.triage_score.gated !== b.triage_score.gated) {
      return a.triage_score.gated ? -1 : 1; // gated (no-https) first
    }
    return a.triage_score.score - b.triage_score.score; // then worst (lowest) first
  });

  // TRI-09: the ceiling is enforced here, in JS, with real-number ordering
  // — the single place this invariant holds, independent of the cutoff.
  return eligible.slice(0, ceiling);
}

/**
 * Releases at most `ceiling` of the worst-ranked eligible, un-released
 * prospects by marking scan_released_at (D-08 — the single Phase 3 -> 4
 * state change). Returns the released rows so the caller can report a
 * count + ids. A run with zero eligible prospects releases nothing and
 * throws nothing.
 */
export async function releaseWorstN(
  sb: SupabaseClient,
  options: ReleaseOptions = {}
): Promise<ReleaseCandidate[]> {
  const worstN = await selectWorstN(sb, options);
  if (worstN.length === 0) return [];

  const ids = worstN.map((p) => p.id);
  // Never call the upsert method — prospects.country is NOT NULL with no
  // default (migration 010); an upsert INSERT tuple would violate it even
  // though this only intends to update one column on existing rows
  // (Pitfall 3). Use update+eq exclusively.
  const { error } = await sb
    .from("prospects")
    .update({ scan_released_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;

  return worstN;
}
