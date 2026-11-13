// Route 3 of the Atrium contract: what a scan says, in the contract's shape.
// Problems come from scans.pages[].issues[], not summary.topIssues: the
// full-async path in scanner-service overwrites topIssues with the first 10
// issues in page order, unsorted and not deduplicated.
import type { Issue, IssuesAlt, PageResult } from "@/types/scanner";

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
