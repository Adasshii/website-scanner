import type { ScanScores, PageResult, ScanSummary, Issue } from "@/types/scanner";
import { SCORE_WEIGHTS } from "@/types/scanner";

/**
 * Aggregate per-page scores into a single site-wide score.
 * Used by the Next.js API route to compute final scores
 * from the scanner service response.
 */
export function aggregateScores(pages: PageResult[]): ScanScores {
  if (pages.length === 0) {
    return { overall: 0, accessibility: 0, content: 0, seo: 0, performance: 0, security: 0 };
  }

  const avg = (key: keyof ScanScores) =>
    Math.round(pages.reduce((sum, p) => sum + (p.scores[key] ?? 0), 0) / pages.length);

  const accessibility = avg("accessibility");
  const content = avg("content");
  const seo = avg("seo");
  const performance = avg("performance");
  const security = avg("security");

  const overall = Math.round(
    accessibility * SCORE_WEIGHTS.accessibility +
    content * SCORE_WEIGHTS.content +
    seo * SCORE_WEIGHTS.seo +
    performance * SCORE_WEIGHTS.performance +
    security * SCORE_WEIGHTS.security
  );

  return { overall, accessibility, content, seo, performance, security };
}

/**
 * Build a human-readable summary from scan results.
 */
export function buildSummary(pages: PageResult[]): ScanSummary {
  const allIssues = pages.flatMap((p) => p.issues);
  const criticalIssues = allIssues.filter((i) => i.severity === "critical").length;
  const majorIssues = allIssues.filter((i) => i.severity === "major").length;

  // Deduplicate and take top 10 by impact
  const seen = new Set<string>();
  const topIssues: Issue[] = [];
  const sorted = [...allIssues].sort((a, b) => b.impact - a.impact);
  for (const issue of sorted) {
    if (!seen.has(issue.id) && topIssues.length < 10) {
      seen.add(issue.id);
      topIssues.push(issue);
    }
  }

  const scores = aggregateScores(pages);
  let verdict: string;

  if (scores.overall >= 90) {
    verdict = "Great job! Your website is well-built and performs strongly across all categories.";
  } else if (scores.overall >= 70) {
    verdict = `Your website is in decent shape, but there's room to improve. Focus on the top issues below.`;
  } else if (scores.overall >= 50) {
    verdict = `Your website has several areas for improvement. Addressing the ${criticalIssues > 0 ? "critical" : "major"} issues would make a real difference.`;
  } else {
    verdict = "Your website has significant issues that are likely costing you visitors and search rankings. The good news: most fixes are straightforward.";
  }

  return {
    totalPages: pages.length,
    totalIssues: allIssues.length,
    criticalIssues,
    majorIssues,
    topIssues,
    verdict,
  };
}
