/**
 * lib/outreach-queue.ts — QUE-01/02/03: the data layer behind the admin
 * Outreach tab. Every exported function here addresses exactly one
 * outreach_messages row or one prospect by id (QUE-05, D-6-R1) — there is no
 * bulk variant of anything in this file, and none should ever be added.
 *
 * Two coordination facts for whoever touches this file next:
 *
 * 1. rejectDraft() reuses prospects.lifecycle_state = 'rejected' (declared
 *    in migration 010, unused until this plan). Phase 7 owns the lifecycle
 *    state machine from here on — it must not reintroduce a second reject
 *    flag, and any future generic status-advance sweep it builds must treat
 *    'rejected' as terminal and never overwrite it in a bulk update.
 * 2. This module deliberately performs no send-side work. The outreach
 *    channel is undecided and Phase 8 owns dispatch, suppression-at-send,
 *    and the per-send audit record. approveDraft() writes exactly three
 *    columns and stops there (D-6-16) — do not add a dispatcher here, and
 *    do not import lib/suppression.ts, lib/email.ts, or
 *    lib/scanner-client.ts into this file (grep-gated).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScanScores, ScanSummary, PageResult, IssuesAlt } from "@/types/scanner";
import { selectCitableMetric, type CitableMetric } from "@/lib/draft-metric-selector";
import { localeForCountry, type Locale } from "@/lib/draft-prompt";
import { computeVerdict } from "@/lib/scoring";
import { applyIssuesAlt } from "@/lib/i18n-helpers";
import { generateDraft, buildReportUrl, type DraftDeps } from "@/lib/draft-generator";

// ── Filter + row shape ───────────────────────────────────────────────────

export type OutreachFilter = "pending" | "approved" | "rejected" | "sent";

/** `pending` covers both `draft` and `edited` (D-6-04). `sent` is Phase 8's mark-as-sent terminal. */
const STATUS_GROUPS: Record<OutreachFilter, string[]> = {
  pending: ["draft", "edited"],
  approved: ["approved"],
  rejected: ["rejected"],
  sent: ["sent"],
};

export interface OutreachQueueRow {
  id: string;
  prospectId: string;
  scanId: string;
  status: string;
  draftSubject: string | null;
  draftBody: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  /** Phase 8's Prepare stamp (D-04) — null until the first Prepare, re-stamped on every re-prepare, never cleared by a mark. */
  preparedAt: string | null;
  domain: string;
  country: string;
  contactEmail: string | null;
  locale: Locale;
  overallScore: number;
  verdict: string;
  criticalIssues: number;
  majorIssues: number;
  topIssueTitles: string[];
  citedMetric: CitableMetric | null;
  reportUrl: string;
}

export type OutreachActionResult = { ok: true } | { ok: false; error: string };
export type OutreachCreateResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * The honest constant for a single-tenant tool with no user model: the only
 * actor who can ever call approveDraft() is whoever holds the admin secret,
 * so naming a person here would be a fiction.
 */
export const APPROVED_BY = "admin-secret";

/** ASVS V5 input bounds for applyDraftEdit — operator-supplied free text, single tenant. */
export const MAX_DRAFT_SUBJECT_LENGTH = 200;
export const MAX_DRAFT_BODY_LENGTH = 5000;

interface EmbeddedProspect {
  name: string | null;
  domain: string | null;
  country: string;
  contact_email: string | null;
}

interface EmbeddedScan {
  id: string;
  scores: ScanScores | null;
  summary: ScanSummary | null;
  pages: PageResult[] | null;
  issues_alt?: IssuesAlt | null;
}

interface RawOutreachRow {
  id: string;
  prospect_id: string;
  scan_id: string;
  draft_subject: string | null;
  draft_body: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  prepared_at: string | null;
  prospects: EmbeddedProspect | null;
  scans: EmbeddedScan | null;
}

/**
 * The same top-3-issue-title resolution lib/draft-generator.ts's
 * generateDraft() uses internally — that helper is private to that module
 * (not exported), so it is duplicated here rather than exporting a second
 * entry point from a module whose only declared job in this phase is
 * turning a scan into a draft. Resolves through lib/i18n-helpers.ts's
 * applyIssuesAlt() first (RESEARCH Pitfall 7), so the evidence pane never
 * quotes the wrong locale's issue titles.
 */
function localizedTopIssueTitles(
  pages: PageResult[],
  summary: ScanSummary | null,
  issuesAlt: IssuesAlt | null | undefined,
  locale: Locale
): string[] {
  if (!summary) return [];
  const localizedPages = applyIssuesAlt(pages, issuesAlt ?? null, locale);
  const titleById = new Map<string, string>();
  for (const page of localizedPages) {
    for (const issue of page.issues) {
      titleById.set(issue.id, issue.title);
    }
  }
  return summary.topIssues.slice(0, 3).map((issue) => titleById.get(issue.id) ?? issue.title);
}

// ── listOutreachDrafts (QUE-01, D-6-03, D-6-04) ─────────────────────────

/**
 * One query against outreach_messages with embedded prospect/scan rows
 * through the existing foreign keys. Every field the evidence pane needs is
 * derived here, not read from a stored copy: computeVerdict() (06-01) and
 * selectCitableMetric() (06-03) run fresh against the scan's own scores, so
 * the pane can never drift from the one verdict function or the one number
 * the draft was told to cite.
 */
export async function listOutreachDrafts(
  sb: SupabaseClient,
  filter: OutreachFilter = "pending"
): Promise<OutreachQueueRow[]> {
  const { data, error } = await sb
    .from("outreach_messages")
    .select(
      `id, prospect_id, scan_id, draft_subject, draft_body, status, approved_by, approved_at, created_at, prepared_at,
       prospects ( name, domain, country, contact_email ),
       scans ( id, scores, summary, pages, issues_alt )`
    )
    .in("status", STATUS_GROUPS[filter]);
  if (error) throw error;

  const rows = (data ?? []) as unknown as RawOutreachRow[];

  const mapped: OutreachQueueRow[] = [];
  for (const row of rows) {
    const prospect = row.prospects;
    const scan = row.scans;
    if (!prospect || !scan || !scan.scores) continue;

    const locale = localeForCountry(prospect.country);
    const pages = scan.pages ?? [];

    mapped.push({
      id: row.id,
      prospectId: row.prospect_id,
      scanId: row.scan_id,
      status: row.status,
      draftSubject: row.draft_subject,
      draftBody: row.draft_body,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      createdAt: row.created_at,
      preparedAt: row.prepared_at,
      domain: prospect.domain ?? "",
      country: prospect.country,
      contactEmail: prospect.contact_email,
      locale,
      overallScore: scan.scores.overall,
      verdict: computeVerdict(scan.scores, scan.summary?.criticalIssues ?? 0),
      criticalIssues: scan.summary?.criticalIssues ?? 0,
      majorIssues: scan.summary?.majorIssues ?? 0,
      topIssueTitles: localizedTopIssueTitles(pages, scan.summary, scan.issues_alt, locale),
      citedMetric: selectCitableMetric(scan.scores, scan.summary, pages, locale),
      reportUrl: buildReportUrl(scan.id),
    });
  }

  // Worst score first (D-6-04), sorted in JS over the real numeric score —
  // matches how the shortlist route already sorts, avoiding the jsonb ->>
  // text-comparison trap that bit Phase 3.
  return mapped.sort((a, b) => a.overallScore - b.overallScore);
}

// ── applyDraftEdit (QUE-02, D-6-13) ─────────────────────────────────────

export interface DraftEditPatch {
  subject: string;
  body: string;
}

/**
 * Overwrites in place; does not retain the previous text anywhere.
 * Capturing the AI-vs-human delta is REF-02, already deferred to v2 (D-6-13).
 */
export async function applyDraftEdit(
  sb: SupabaseClient,
  id: string,
  patch: DraftEditPatch
): Promise<OutreachActionResult> {
  const subject = patch.subject.trim();
  const body = patch.body.trim();

  if (!body) return { ok: false, error: "body must not be empty" };
  if (!subject) return { ok: false, error: "subject must not be empty" };
  if (subject.length > MAX_DRAFT_SUBJECT_LENGTH) {
    return { ok: false, error: `subject exceeds ${MAX_DRAFT_SUBJECT_LENGTH} characters` };
  }
  if (body.length > MAX_DRAFT_BODY_LENGTH) {
    return { ok: false, error: `body exceeds ${MAX_DRAFT_BODY_LENGTH} characters` };
  }

  const { error } = await sb
    .from("outreach_messages")
    .update({ draft_subject: subject, draft_body: body, status: "edited" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── approveDraft (QUE-02, D-6-16) ───────────────────────────────────────

/**
 * Writes exactly three columns: status, approved_by, approved_at. Approved
 * is not contacted — advancing the prospect's lifecycle_state here would
 * contradict TRK-02 and pre-empt Phase 7, which owns that state machine.
 * No dispatcher, no send queue: the channel is undecided and Phase 8 owns
 * dispatch (D-6-16, D-6-R2).
 */
export async function approveDraft(sb: SupabaseClient, id: string): Promise<OutreachActionResult> {
  const { error } = await sb
    .from("outreach_messages")
    .update({ status: "approved", approved_by: APPROVED_BY, approved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── rejectDraft (QUE-03, D-6-15) ────────────────────────────────────────

/**
 * An editorial decision, explicitly not suppression (D-6-15): sets the
 * message status to 'rejected' AND the owning prospect's lifecycle_state to
 * 'rejected', a value lib/draft-on-scan-complete.ts's gate 6 reads on every
 * later scan-complete so a re-scan never resurrects a prospect Joshua
 * already killed. This module must never write to the compliance
 * suppression table — those entries are hard to reverse by design.
 */
export async function rejectDraft(sb: SupabaseClient, id: string): Promise<OutreachActionResult> {
  const { data: message, error: fetchError } = await sb
    .from("outreach_messages")
    .select("prospect_id")
    .eq("id", id)
    .single();
  if (fetchError || !message) return { ok: false, error: fetchError?.message ?? "message not found" };

  const { error: statusError } = await sb.from("outreach_messages").update({ status: "rejected" }).eq("id", id);
  if (statusError) return { ok: false, error: statusError.message };

  const { error: prospectError } = await sb
    .from("prospects")
    .update({ lifecycle_state: "rejected" })
    .eq("id", message.prospect_id as string);
  if (prospectError) return { ok: false, error: prospectError.message };

  return { ok: true };
}

// ── regenerateDraft (QUE-02, D-6-14) ────────────────────────────────────

/**
 * A fresh generateDraft() call overwrites draft_subject/draft_body and
 * resets status back to 'draft'. On a null result the row is left
 * completely untouched, so a model failure never destroys existing text —
 * this is also the recovery path for a failed scan-complete generation
 * (D-6-05). The "confirm before overwriting an edited draft" prompt is a UI
 * concern for 06-07, not this module.
 */
export async function regenerateDraft(
  sb: SupabaseClient,
  id: string,
  deps: DraftDeps = {}
): Promise<OutreachActionResult> {
  const { data, error: fetchError } = await sb
    .from("outreach_messages")
    .select(
      `id, prospect_id, scan_id,
       prospects ( name, domain, country, contact_email ),
       scans ( id, scores, summary, pages, issues_alt )`
    )
    .eq("id", id)
    .single();
  if (fetchError || !data) return { ok: false, error: fetchError?.message ?? "message not found" };

  const row = data as unknown as { prospects: EmbeddedProspect | null; scans: EmbeddedScan | null };
  const prospect = row.prospects;
  const scan = row.scans;
  if (!prospect || !scan) return { ok: false, error: "prospect or scan not found for this draft" };

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
  // Null result: leave the row completely unchanged. A model failure must
  // never destroy existing draft text.
  if (!draft) return { ok: false, error: "generation failed, existing draft left unchanged" };

  const { error: updateError } = await sb
    .from("outreach_messages")
    .update({ draft_subject: draft.subject, draft_body: draft.body, status: "draft" })
    .eq("id", id);
  if (updateError) return { ok: false, error: updateError.message };
  return { ok: true };
}

// ── generateDraftForProspect (D-6-06, D-6-14) ───────────────────────────

/**
 * The manual entry point: clears a named-person prospect by judgement
 * (D-6-06) and recovers a prospect whose automatic generation silently
 * failed (RESEARCH open question 1). Deliberately does NOT check
 * contact_email_type — that is the whole point of this function existing.
 * It DOES check lifecycle_state: a rejected prospect stays rejected unless
 * Joshua explicitly regenerates via this path (D-6-14).
 */
export async function generateDraftForProspect(
  sb: SupabaseClient,
  prospectId: string,
  deps: DraftDeps = {}
): Promise<OutreachCreateResult> {
  const { data: prospect, error: prospectError } = await sb
    .from("prospects")
    .select("id, name, domain, country, contact_email, lifecycle_state, latest_scan_id")
    .eq("id", prospectId)
    .single();
  if (prospectError || !prospect) return { ok: false, error: prospectError?.message ?? "prospect not found" };

  const { data: existing, error: existingError } = await sb
    .from("outreach_messages")
    .select("id")
    .eq("prospect_id", prospectId)
    .limit(1);
  if (existingError) return { ok: false, error: existingError.message };
  if (existing && existing.length > 0) {
    return { ok: false, error: "a draft already exists for this prospect" };
  }

  if (prospect.lifecycle_state === "rejected") {
    return { ok: false, error: "prospect is rejected" };
  }
  if (!prospect.contact_email) {
    return { ok: false, error: "prospect has no contact email" };
  }
  if (!prospect.latest_scan_id) {
    return { ok: false, error: "prospect has no completed scan" };
  }

  const { data: scan, error: scanError } = await sb
    .from("scans")
    .select("id, status, scores, summary, pages, issues_alt")
    .eq("id", prospect.latest_scan_id)
    .single();
  if (scanError || !scan || scan.status !== "completed" || !scan.scores || !scan.summary) {
    return { ok: false, error: "prospect has no completed scan" };
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
  if (!draft) return { ok: false, error: "generation failed" };

  const { data: inserted, error: insertError } = await sb
    .from("outreach_messages")
    .insert({
      prospect_id: prospectId,
      scan_id: scan.id,
      draft_subject: draft.subject,
      draft_body: draft.body,
      status: "draft",
    })
    .select("id")
    .single();
  if (insertError || !inserted) return { ok: false, error: insertError?.message ?? "insert failed" };

  return { ok: true, id: inserted.id as string };
}
