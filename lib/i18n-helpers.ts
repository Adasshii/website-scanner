import { useTranslations } from "next-intl";
import type { AiContentAlt, IssuesAlt, PageResult, Issue, ScanSummary, CostEstimate, QuickWin } from "@/types/scanner";

/**
 * Resolve a numeric score to a grade label using the common.grade.* namespace.
 * Hook variant for use inside components.
 */
export function useGradeLabel() {
  const t = useTranslations("common.grade");
  return (score: number): string => {
    if (score >= 95) return t("excellent");
    if (score >= 85) return t("performingWell");
    if (score >= 70) return t("solidFoundation");
    if (score >= 50) return t("roomToGrow");
    return t("needsWork");
  };
}

/**
 * Resolve a numeric score to a locale-aware date format.
 */
export function useFormatDate() {
  const t = useTranslations("common.locale");
  const tag = t("tag");
  return (dateStr: string): string =>
    new Date(dateStr).toLocaleDateString(tag, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
}

// ── Bilingual scan rendering ──────────────────────────────────────────

/**
 * Result of `pickLocalizedScan` — only the fields that the report/scan
 * components actually consume from the scan row. We don't return the full
 * row to avoid widening the type and to make the override semantics
 * explicit at the call site.
 */
export interface LocalizedScanContent {
  /** Resolved per-page list with alt-locale issue overrides applied. */
  pages: PageResult[];
  /** Resolved scan summary (verdict + topIssues swapped if alt used). */
  summary: ScanSummary | null;
  /** AI fields swapped to alt locale when available. */
  cost_estimate: CostEstimate | null;
  quick_wins: QuickWin[] | null;
  website_personality: string | null;
  visitor_experience: string | null;
  /** True when current visitor locale differs from the scan's stored locale
   *  AND no alt-locale content is available (legacy scan). UI uses this to
   *  show a "re-scan in {language}" notice. */
  needsReScanNotice: boolean;
}

interface ScanLike {
  locale?: string | null;
  summary: ScanSummary | null;
  pages?: PageResult[] | null;
  cost_estimate: CostEstimate | null;
  quick_wins: QuickWin[] | null;
  website_personality: string | null;
  visitor_experience: string | null;
  ai_content_alt?: AiContentAlt | null;
  issues_alt?: IssuesAlt | null;
}

/**
 * Apply per-issue alt-locale overrides to a list of pages. Issue fields
 * (title, description, recommendation, whyItMatters) are swapped where an
 * override exists; everything else (severity, impact, selector, etc.) is
 * untouched.
 */
export function applyIssuesAlt(
  pages: PageResult[],
  issuesAlt: IssuesAlt | null | undefined,
  currentLocale: string,
): PageResult[] {
  if (!issuesAlt || issuesAlt.locale !== currentLocale) return pages;
  const overrides = issuesAlt.byId;
  return pages.map((page) => ({
    ...page,
    issues: page.issues.map((issue: Issue) => {
      const ov = overrides[issue.id];
      if (!ov) return issue;
      return {
        ...issue,
        ...(ov.title ? { title: ov.title } : {}),
        ...(ov.description ? { description: ov.description } : {}),
        ...(ov.recommendation ? { recommendation: ov.recommendation } : {}),
        ...(ov.whyItMatters ? { whyItMatters: ov.whyItMatters } : {}),
      };
    }),
  }));
}

/**
 * Resolve the scan's AI content for the currently-active UI locale.
 *
 * - If the current locale matches the scan's stored primary locale, returns
 *   the primary columns as-is.
 * - If the alt-locale matches the current locale, swaps in the alt content.
 * - If neither matches (legacy scan with no alt content), returns the
 *   primary columns and flags `needsReScanNotice` so the UI can prompt the
 *   user to re-run the scan in their language.
 */
export function pickLocalizedScan(
  scan: ScanLike,
  currentLocale: string,
): LocalizedScanContent {
  const pages = scan.pages ?? [];
  const primaryLocale = scan.locale ?? "en";

  if (currentLocale === primaryLocale) {
    return {
      pages,
      summary: scan.summary,
      cost_estimate: scan.cost_estimate,
      quick_wins: scan.quick_wins,
      website_personality: scan.website_personality,
      visitor_experience: scan.visitor_experience,
      needsReScanNotice: false,
    };
  }

  const alt = scan.ai_content_alt;
  if (alt && alt.locale === currentLocale) {
    return {
      pages: applyIssuesAlt(pages, scan.issues_alt ?? null, currentLocale),
      summary: scan.summary
        ? { ...scan.summary, verdict: alt.executiveSummary }
        : scan.summary,
      cost_estimate: alt.costEstimate ?? scan.cost_estimate,
      quick_wins: alt.quickWins ?? scan.quick_wins,
      website_personality: alt.websitePersonality ?? scan.website_personality,
      visitor_experience: alt.visitorExperience ?? scan.visitor_experience,
      needsReScanNotice: false,
    };
  }

  // Legacy scan: no alt content for the requested locale. Render primary
  // and let the UI show a re-scan affordance.
  return {
    pages,
    summary: scan.summary,
    cost_estimate: scan.cost_estimate,
    quick_wins: scan.quick_wins,
    website_personality: scan.website_personality,
    visitor_experience: scan.visitor_experience,
    needsReScanNotice: true,
  };
}
