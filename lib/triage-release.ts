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

export interface ReleaseOptions {
  cutoff?: number;
  ceiling?: number;
}

export interface ReleaseCandidate {
  id: string;
  triage_score: TriageScore;
}

/**
 * Selects the worst-N eligible, un-released prospects, worst-first
 * (gated DESC, then score ASC), sliced to `ceiling`.
 *
 * Eligible = gated === true OR score <= cutoff (gated always eligible,
 * D-01), AND domain is not null, AND triage_score is not null, AND
 * scan_released_at is null (D-06 — already-released prospects are never
 * re-selected).
 */
export async function selectWorstN(
  sb: SupabaseClient,
  { cutoff = DEFAULT_CUTOFF, ceiling = RELEASE_CEILING }: ReleaseOptions = {}
): Promise<ReleaseCandidate[]> {
  const { data, error } = await sb
    .from("prospects")
    .select("id, triage_score")
    .not("domain", "is", null)
    .not("triage_score", "is", null)
    .is("scan_released_at", null);
  if (error) throw error;

  const candidates = (data ?? []) as ReleaseCandidate[];

  const eligible = candidates.filter(
    (p) => p.triage_score.gated || p.triage_score.score <= cutoff
  );

  eligible.sort((a, b) => {
    if (a.triage_score.gated !== b.triage_score.gated) {
      return a.triage_score.gated ? -1 : 1; // gated first
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
