import type { ScanScores, PageResult, ScanSummary, Issue } from "@/types/scanner";

/**
 * Aggregate per-page scores into a single site-wide score.
 * Used by the Next.js API route to compute final scores
 * from the scanner service response.
 */
export function aggregateScores(pages: PageResult[]): ScanScores {
  if (pages.length === 0) {
    return { overall: 0, accessibility: 0, content: 0, seo: 0, performance: 0, security: 0, design: 0 };
  }

  const avg = (key: keyof ScanScores) =>
    Math.round(pages.reduce((sum, p) => sum + (p.scores[key] ?? 0), 0) / pages.length);

  const accessibility = avg("accessibility");
  const content = avg("content");
  const seo = avg("seo");
  const performance = avg("performance");
  const security = avg("security");
  const design = avg("design");

  const overall = Math.round(
    performance * 0.25 +
    seo * 0.25 +
    accessibility * 0.15 +
    content * 0.15 +
    security * 0.10 +
    design * 0.10
  );

  return { overall, accessibility, content, seo, performance, security, design };
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

  if (scores.overall >= 95) {
    verdict = "Excellent work — your website performs strongly across all categories.";
  } else if (scores.overall >= 85) {
    verdict = "Your website is performing well. A few targeted fixes could push it further.";
  } else if (scores.overall >= 70) {
    verdict = "You have a solid foundation. The issues below are worth addressing to improve conversions and reach.";
  } else if (scores.overall >= 50) {
    verdict = `There's clear room to grow. Addressing the ${criticalIssues > 0 ? "critical" : "major"} issues would make a real difference to visitors and search rankings.`;
  } else {
    verdict = "Your website has significant issues that are likely costing you visitors and credibility. The good news: most fixes are straightforward.";
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
