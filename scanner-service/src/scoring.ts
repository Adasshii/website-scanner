import type { Issue, IssueCategory, ScanScores, PageData } from "../../types/scanner";

/**
 * Compute per-page scores based on issues found and page data.
 * Each category starts at 100 and deductions are subtracted.
 * Pass aiDesignScore (0-100) to blend with the HTML-based design score.
 */
export function scorePage(
  issues: Issue[],
  data: PageData,
  loadTimeMs: number,
  aiDesignScore?: number
): ScanScores {
  const deductions: Record<IssueCategory, number> = {
    accessibility: 0,
    content: 0,
    seo: 0,
    performance: 0,
    security: 0,
    design: 0,
  };

  // Sum up impact deductions per category
  for (const issue of issues) {
    deductions[issue.category] += issue.impact;
  }

  // Performance bonus/penalty based on load time
  if (loadTimeMs > 10_000) {
    deductions.performance += 30;
  } else if (loadTimeMs > 5_000) {
    deductions.performance += 15;
  } else if (loadTimeMs > 3_000) {
    deductions.performance += 8;
  }
  // Fast pages get a small bonus (reduce deductions)
  if (loadTimeMs < 1_500 && deductions.performance > 0) {
    deductions.performance = Math.max(0, deductions.performance - 5);
  }

  // Clamp each score between 0 and 100
  const accessibility = clamp(100 - deductions.accessibility);
  const content = clamp(100 - deductions.content);
  const seo = clamp(100 - deductions.seo);
  const performance = clamp(100 - deductions.performance);
  const security = clamp(100 - deductions.security);

  // Design score: blend HTML checks with AI vision score if available
  const htmlDesignScore = clamp(100 - deductions.design);
  const design = aiDesignScore !== undefined
    ? clamp(htmlDesignScore * 0.4 + aiDesignScore * 0.6)
    : htmlDesignScore;

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

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
