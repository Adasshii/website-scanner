/**
 * lib/draft-on-scan-complete.ts — D-6-05: the eligibility gate that decides
 * whether a completed prospect scan produces an automatic outreach draft.
 * Sits between app/api/internal/scan-complete/route.ts (which fetches the
 * scan row) and lib/draft-generator.ts's generateDraft() (which turns an
 * eligible scan into copy) — this module never calls Gemini itself and never
 * reimplements generation.
 *
 * Runs BEFORE the existing public-lead email-readiness guard in the route:
 * every prospect scan row is inserted by lib/bulk-scan-dispatch.ts WITHOUT an
 * email address (RESEARCH Pitfall 2), so a branch appended after that guard
 * would never run for a prospect scan, and the failure would be silent
 * (D-6-05 already treats "no draft row" as the normal failure signal).
 *
 * Gate order (each a distinct skip reason, for logging):
 *   1. scan.prospect_id is nullish -> not our branch, a public-lead scan.
 *   2. scan.status isn't 'completed', or scores/summary is missing.
 *   3. the prospect row can't be loaded.
 *   4. contact_email is nullish/empty (D-6-07).
 *   5. contact_email_type is 'named-person' (D-6-06) — manual generate
 *      (built in 06-08) is the entry point for these and bypasses this gate.
 *   6. lifecycle_state is 'rejected' (D-6-15, threat T-06-REJ) — READ here on
 *      every scan-complete, not just written once at reject time, or a
 *      re-scan silently resurrects a prospect Joshua already killed. This is
 *      an editorial gate, not a compliance one: this module must not import
 *      or call anything from lib/suppression.ts.
 *   7. an outreach_messages row already exists for this prospect_id — skip
 *      rather than insert or overwrite. Regenerate (06-06) is the deliberate
 *      overwrite path.
 *
 * Deliberately absent: any score-threshold comparison. Triage's configurable
 * cutoff and the Phase 4.1 releasability predicate already decided who was
 * worth a full scan (D-6-08) — a second threshold here would mean two places
 * to tune and two places to get wrong. Do not add one.
 *
 * Never throws: every outcome, including a Supabase error, resolves to a
 * DraftHookResult so a draft failure can never fail the scan-complete
 * webhook.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScanScores, ScanSummary, PageResult, IssuesAlt } from "@/types/scanner";
import { generateDraft, type DraftDeps } from "@/lib/draft-generator";

/** The subset of an already-fetched scans row this helper needs. */
export interface ScanCompleteRow {
  id: string;
  prospect_id: string | null;
  status: string;
  scores: ScanScores | null;
  summary: ScanSummary | null;
  pages: PageResult[] | null;
  issues_alt?: IssuesAlt | null;
}

export type DraftHookResult =
  | { outcome: "skipped"; reason: string }
  | { outcome: "created"; id: string }
  | { outcome: "failed"; reason: string };

export async function maybeGenerateDraftForProspectScan(
  sb: SupabaseClient,
  scan: ScanCompleteRow,
  deps: DraftDeps = {}
): Promise<DraftHookResult> {
  try {
    // Gate 1: null prospect_id means this is a public-lead scan, not ours.
    if (!scan.prospect_id) {
      return { outcome: "skipped", reason: "not-a-prospect-scan" };
    }

    // Gate 2: deliberately does NOT require scan.email — prospect scan rows
    // are inserted without one (RESEARCH Pitfall 2); requiring it here would
    // make this whole branch dead code.
    if (scan.status !== "completed" || !scan.scores || !scan.summary) {
      return { outcome: "skipped", reason: "scan-not-ready" };
    }

    const { data: prospect, error: prospectError } = await sb
      .from("prospects")
      .select("name, domain, country, contact_email, contact_email_type, lifecycle_state")
      .eq("id", scan.prospect_id)
      .single();

    // Gate 3: prospect row missing or unreadable.
    if (prospectError || !prospect) {
      console.error(`[draft] prospect ${scan.prospect_id} not found for scan ${scan.id}:`, prospectError);
      return { outcome: "skipped", reason: "prospect-not-found" };
    }

    // Gate 4 (D-6-07): no usable contact email, no draft, no queue row.
    if (!prospect.contact_email) {
      return { outcome: "skipped", reason: "no-contact-email" };
    }

    // Gate 5 (D-6-06): named-person prospects stay manual-generate only.
    if (prospect.contact_email_type === "named-person") {
      return { outcome: "skipped", reason: "named-person-only" };
    }

    // Gate 6 (D-6-15, T-06-REJ): read the reject flag on EVERY scan-complete,
    // not merely at the moment it was set, or a later re-scan of the same
    // domain silently resurrects a prospect Joshua already killed.
    if (prospect.lifecycle_state === "rejected") {
      return { outcome: "skipped", reason: "prospect-rejected" };
    }

    // Gate 7: never clobber an existing draft/edited/approved row, and never
    // double-queue the same prospect. Regenerate (06-06) is the overwrite path.
    const { data: existing, error: existingError } = await sb
      .from("outreach_messages")
      .select("id")
      .eq("prospect_id", scan.prospect_id)
      .limit(1);
    if (existingError) throw existingError;
    if (existing && existing.length > 0) {
      return { outcome: "skipped", reason: "already-drafted" };
    }

    const draft = await generateDraft(
      {
        prospect: {
          name: prospect.name,
          domain: prospect.domain ?? "",
          country: prospect.country,
          contact_email: prospect.contact_email,
        },
        scan: {
          id: scan.id,
          scores: scan.scores,
          summary: scan.summary,
          pages: scan.pages ?? [],
          issues_alt: scan.issues_alt,
        },
      },
      deps
    );

    if (!draft) {
      return { outcome: "failed", reason: "generation-failed" };
    }

    const { data: inserted, error: insertError } = await sb
      .from("outreach_messages")
      .insert({
        prospect_id: scan.prospect_id,
        scan_id: scan.id,
        draft_subject: draft.subject,
        draft_body: draft.body,
        status: "draft",
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      console.error(`[draft] insert failed for scan ${scan.id}:`, insertError);
      return { outcome: "failed", reason: "insert-failed" };
    }

    console.log(`[draft] created outreach_messages row ${inserted.id} for prospect ${scan.prospect_id}`);
    return { outcome: "created", id: inserted.id };
  } catch (err) {
    console.error(`[draft] unexpected error for scan ${scan.id}:`, err instanceof Error ? err.message : err);
    return { outcome: "failed", reason: "unexpected-error" };
  }
}
