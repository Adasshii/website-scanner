// Route 3 of the Atrium contract: what a scan says, in the contract's shape.
// Problems come from scans.pages[].issues[], not summary.topIssues: the
// full-async path in scanner-service overwrites topIssues with the first 10
// issues in page order, unsorted and not deduplicated.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Issue, IssuesAlt, PageResult, ScanScores } from "@/types/scanner";
import { buildReportUrl } from "@/lib/draft-generator";

export type AtriumScanStatus = "queued" | "running" | "done" | "failed";

export interface AtriumProblem {
  key: string;
  title: string;
  detail: string;
}

export function mapScanStatus(status: string): AtriumScanStatus {
  if (status === "completed") return "done";
  if (status === "failed") return "failed";
  if (status === "pending") return "queued";
  return "running"; // scanning, quick_done, processing
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, major: 1 };

export function deriveProblems(pages: PageResult[] | null, issuesAlt: IssuesAlt | null): AtriumProblem[] {
  const byId = new Map<string, Issue>();
  for (const p of pages ?? []) {
    for (const found of p.issues ?? []) {
      if (!(found.severity in SEVERITY_RANK)) continue;
      const kept = byId.get(found.id);
      if (!kept || found.impact > kept.impact) byId.set(found.id, found);
    }
  }

  // fullScanBulk sends no locale, so the service writes Dutch into issues_alt.
  // Typed explicitly: without it, strict mode infers `{}` for the empty
  // branch and the lookups below lose their field types.
  const dutch: IssuesAlt["byId"] = issuesAlt?.locale === "nl" ? issuesAlt.byId : {};

  return Array.from(byId.values())
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.impact - a.impact || a.id.localeCompare(b.id)
    )
    .map((found) => {
      const nl: IssuesAlt["byId"][string] = dutch[found.id] ?? {};
      return {
        key: found.id,
        title: nl.title ?? found.title,
        detail: nl.whyItMatters ?? nl.description ?? found.whyItMatters ?? found.description,
      };
    });
}

export interface AtriumScanStatusBody {
  status: AtriumScanStatus;
  score?: number;
  problems?: AtriumProblem[];
  reportUrl?: string;
}

/**
 * null when the scan does not exist or is not a scan of an Atrium prospect.
 * Public scans and scanner-owned scans stay invisible to this route.
 */
export async function getAtriumScanStatus(sb: SupabaseClient, scanId: string): Promise<AtriumScanStatusBody | null> {
  const { data: scan, error } = await sb
    .from("scans")
    .select("id, status, scores, pages, issues_alt, prospect_id")
    .eq("id", scanId)
    .maybeSingle();
  if (error) throw error;
  if (!scan || !scan.prospect_id) return null;

  const { data: prospect, error: prospectError } = await sb
    .from("prospects")
    .select("owner")
    .eq("id", scan.prospect_id)
    .maybeSingle();
  if (prospectError) throw prospectError;
  if (!prospect || prospect.owner !== "atrium") return null;

  const status = mapScanStatus(scan.status as string);
  if (status !== "done") return { status };

  const scores = scan.scores as ScanScores | null;
  // A completed scan always carries scores. If one does not, it cannot be
  // used for an email, so report it as failed rather than break the shape.
  if (!scores) return { status: "failed" };

  return {
    status,
    score: scores.overall,
    problems: deriveProblems(scan.pages as PageResult[] | null, scan.issues_alt as IssuesAlt | null),
    reportUrl: buildReportUrl(scan.id as string),
  };
}
