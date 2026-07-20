// Triage candidate + shortlist queries (D-07: pure reads, never mutate
// lifecycle_state or any prospect field). Mirrors lib/triage-release.ts's
// query conventions but serves two different read-only needs:
//   - getTriageCandidates(): the rows scripts/triage-prospects.ts fetches
//     and scores (D-09: excludes already-released prospects so a re-triage
//     never overwrites a prospect whose full scan has superseded the cheap
//     verdict; excludes no-website null-domain prospects).
//   - getShortlist(): every already-triaged row for the admin shortlist
//     display, so the UI can sort/filter client-side against the cutoff
//     without a server round-trip per slide (D-07 "pure query").
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TriageScore } from "@/types/triage";

export interface TriageCandidate {
  id: string;
  domain: string;
  website_url: string | null;
}

export interface ShortlistRow {
  id: string;
  domain: string;
  triage_score: TriageScore;
  scan_released_at: string | null;
}

/**
 * Eligible-to-triage rows: has a domain (not a no-website prospect) and is
 * not yet released to the scan queue (D-09 — released prospects are never
 * re-triaged; their full scan supersedes the cheap verdict).
 */
export async function getTriageCandidates(
  sb: SupabaseClient,
  { limit }: { limit?: number } = {}
): Promise<TriageCandidate[]> {
  let query = sb
    .from("prospects")
    .select("id, domain, website_url")
    .not("domain", "is", null)
    .is("scan_released_at", null);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TriageCandidate[];
}

/**
 * Every already-triaged row (any triage_score), for the admin shortlist
 * display — the UI sorts/filters worst-first and re-shuffles eligibility
 * against a live cutoff slider client-side (D-03/D-07), no re-query needed
 * per slide.
 */
export async function getShortlist(sb: SupabaseClient): Promise<ShortlistRow[]> {
  const { data, error } = await sb
    .from("prospects")
    .select("id, domain, triage_score, scan_released_at")
    .not("triage_score", "is", null);
  if (error) throw error;
  return (data ?? []) as ShortlistRow[];
}
