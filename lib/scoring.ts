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
  const verdict = computeVerdict(scores, criticalIssues);

  return {
    totalPages: pages.length,
    totalIssues: allIssues.length,
    criticalIssues,
    majorIssues,
    topIssues,
    verdict,
  };
}

/**
 * The single verdict-threshold source per DRA-06 / D-6-R4. The scanner
 * service imports this rather than holding its own copy — see
 * scanner-service/src/index.ts (@shared-lib/scoring).
 */
export function computeVerdict(scores: ScanScores, criticalCount: number): string {
  if (scores.overall >= 90) {
    return "Great job! Your website is well-built and performs strongly across all categories.";
  }
  if (scores.overall >= 70) {
    const weakest = getWeakestCategory(scores);
    return `Your website is in decent shape, but ${weakest} needs attention to reach its full potential.`;
  }
  if (scores.overall >= 50) {
    return `Your website has several areas for improvement. Addressing the ${criticalCount > 0 ? "critical" : "major"} issues would make a real difference.`;
  }
  return "Your website has significant issues that are likely costing you visitors and search rankings. The good news: most fixes are straightforward.";
}

export function getWeakestCategory(scores: ScanScores): string {
  const categories = [
    { name: "accessibility", score: scores.accessibility },
    { name: "content quality", score: scores.content },
    { name: "SEO", score: scores.seo },
    { name: "performance", score: scores.performance },
  ];
  categories.sort((a, b) => a.score - b.score);
  return categories[0].name;
}
