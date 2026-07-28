/**
 * lib/draft-metric-selector.ts — D-6-11: picks the strongest citable metric
 * from a completed scan, so the number a draft cites is chosen by code and
 * never by the model (DRA-02). Pure module: no Supabase client, no fetch, no
 * environment reads. Mirrors the pure-aggregation style of
 * lib/contact-extraction.ts.
 *
 * Priority order, in this exact sequence:
 *   1. Largest Contentful Paint from `pages[0].data.coreWebVitals.lcp`, when
 *      present and at or above the degraded threshold (2500ms). Rendered as
 *      seconds with one fractional digit via Intl.NumberFormat, so the
 *      Dutch form uses a comma separator.
 *   2. `summary.criticalIssues`, when greater than zero.
 *   3. The lowest of the six category scores in `scores`.
 *   4. Otherwise null — no draft is possible without evidence.
 */
import type { ScanScores, ScanSummary, PageResult } from "@/types/scanner";

export type CitableMetricSource = "lcp" | "critical-issues" | "category-score";
type Locale = "en" | "nl";

export interface CitableMetric {
  /**
   * The bare numeral the model must reproduce character for character —
   * never the full phrase. ponytail: a single-digit count (e.g. "3") is a
   * weak substring guard on its own; the per-message human review gate
   * (QUE-01) is the real control, not this token match.
   */
  displayValue: string;
  /** Human sentence naming what the number is, in the resolved locale. */
  displayText: string;
  source: CitableMetricSource;
}

/** LCP at or above this threshold is degraded enough to cite (RESEARCH Pitfall 5). */
const LCP_DEGRADED_THRESHOLD_MS = 2500;

const LCP_TEXT: Record<Locale, (value: string) => string> = {
  en: (value) => `Your homepage takes ${value} seconds to become usable (Largest Contentful Paint)`,
  nl: (value) => `Uw homepage doet ${value} seconden over de belangrijkste laadtijd (Largest Contentful Paint)`,
};

const CRITICAL_ISSUES_TEXT: Record<Locale, (value: string) => string> = {
  en: (value) => `The scan found ${value} critical issue(s) on your site`,
  nl: (value) => `De scan vond ${value} kritiek(e) probleem/problemen op uw site`,
};

type CategoryKey = "accessibility" | "content" | "seo" | "performance" | "security" | "design";

const CATEGORY_NAMES: Record<Locale, Record<CategoryKey, string>> = {
  en: {
    accessibility: "accessibility",
    content: "content quality",
    seo: "SEO",
    performance: "performance",
    security: "security",
    design: "design",
  },
  nl: {
    accessibility: "toegankelijkheid",
    content: "content",
    seo: "SEO",
    performance: "performance",
    security: "beveiliging",
    design: "design",
  },
};

const CATEGORY_SCORE_TEXT: Record<Locale, (categoryName: string, value: string) => string> = {
  en: (categoryName, value) => `Your ${categoryName} score is ${value} out of 100`,
  nl: (categoryName, value) => `Uw score voor ${categoryName} is ${value} van de 100`,
};

function formatLcpSeconds(lcpMs: number, locale: Locale): string {
  const seconds = lcpMs / 1000;
  return new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(seconds);
}

export function selectCitableMetric(
  scores: ScanScores | null | undefined,
  summary: ScanSummary | null | undefined,
  pages: PageResult[],
  locale: Locale
): CitableMetric | null {
  if (!scores) return null;

  const lcp = pages[0]?.data?.coreWebVitals?.lcp;
  if (typeof lcp === "number" && lcp >= LCP_DEGRADED_THRESHOLD_MS) {
    const displayValue = formatLcpSeconds(lcp, locale);
    return { source: "lcp", displayValue, displayText: LCP_TEXT[locale](displayValue) };
  }

  const criticalIssues = summary?.criticalIssues ?? 0;
  if (criticalIssues > 0) {
    const displayValue = String(criticalIssues);
    return {
      source: "critical-issues",
      displayValue,
      displayText: CRITICAL_ISSUES_TEXT[locale](displayValue),
    };
  }

  // Only compare categories actually present — security/design are optional
  // on scans predating those categories (types/scanner.ts), and defaulting
  // an absent value to 0 would falsely flag a legacy scan as its worst score.
  const categoryScores: Array<{ key: CategoryKey; value: number }> = [
    { key: "accessibility", value: scores.accessibility },
    { key: "content", value: scores.content },
    { key: "seo", value: scores.seo },
    { key: "performance", value: scores.performance },
  ];
  if (typeof scores.security === "number") categoryScores.push({ key: "security", value: scores.security });
  if (typeof scores.design === "number") categoryScores.push({ key: "design", value: scores.design });

  const lowest = [...categoryScores].sort((a, b) => a.value - b.value)[0];
  const displayValue = String(Math.round(lowest.value));
  return {
    source: "category-score",
    displayValue,
    displayText: CATEGORY_SCORE_TEXT[locale](CATEGORY_NAMES[locale][lowest.key], displayValue),
  };
}
