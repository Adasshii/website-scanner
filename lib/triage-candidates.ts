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
  category: string | null;
  triage_score: TriageScore;
  scan_released_at: string | null;
  scan_status: "queued" | "scanning" | "done" | "failed" | null;
  scan_attempts: number;
  scan_status_reason: string | null;
  latest_scan_id: string | null;
  contact_email_type: string | null;
  /** Derived from contact_email (06-08) — the raw address never leaves this
   * module; a data-minimisation choice, not a security boundary, since the
   * admin payload only needs to know whether a manual draft can be sent. */
  has_contact_email: boolean;
  /** Derived from a follow-up outreach_messages lookup (06-08) — true once
   * any row (any status) exists for the prospect, which is what hides the
   * manual "Generate draft" action in the Shortlist. */
  has_outreach_draft: boolean;
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
 * per slide. Selects category so the UI can call isReleasable() directly
 * without a second query (D-4.1-01/03/04) — excluded/unreachable rows stay
 * visible in the shortlist, they are only barred from release.
 *
 * 06-08: also derives has_contact_email (from contact_email, which is
 * dropped from the returned row) and has_outreach_draft (a follow-up
 * outreach_messages lookup, skipped entirely when no rows come back), so
 * the Shortlist knows when its manual "Generate draft" action can succeed.
 */
export async function getShortlist(sb: SupabaseClient): Promise<ShortlistRow[]> {
  const { data, error } = await sb
    .from("prospects")
    .select(
      "id, domain, category, triage_score, scan_released_at, scan_status, scan_attempts, scan_status_reason, latest_scan_id, contact_email_type, contact_email"
    )
    .not("triage_score", "is", null);
  if (error) throw error;
  const rawRows = (data ?? []) as (ShortlistRow & { contact_email: string | null })[];

  if (rawRows.length === 0) return [];

  // One extra round trip at this project's volume (10-50/week) is the right
  // trade against a view or a denormalised column (D-6-08 discretion note).
  const { data: draftRows, error: draftError } = await sb
    .from("outreach_messages")
    .select("prospect_id")
    .in(
      "prospect_id",
      rawRows.map((r) => r.id)
    );
  if (draftError) throw draftError;
  const draftedIds = new Set((draftRows ?? []).map((r) => r.prospect_id as string));

  return rawRows.map((row) => {
    const { contact_email, ...rest } = row;
    return {
      ...rest,
      has_contact_email: !!contact_email && contact_email.trim().length > 0,
      has_outreach_draft: draftedIds.has(row.id),
    };
  });
}
