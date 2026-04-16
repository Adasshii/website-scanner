"use client";

import { useState } from "react";
import { ScoreRing, ScoreRingSmall } from "@/components/scan/score-ring";
import { IssueCard } from "@/components/scan/issue-card";
import { CostEstimateSection } from "@/components/report/cost-estimate";
import { QuickWinsSection } from "@/components/report/quick-wins";
import { WebsitePersonalitySection } from "@/components/report/website-personality";
import { AnnotatedScreenshot } from "@/components/report/annotated-screenshot";
import type {
  ScanScores,
  ScanSummary,
  PageResult,
  Issue,
  IssueCategory,
  IssueSeverity,
  ScanStatus,
  CostEstimate,
  QuickWin,
  ScreenshotInfo,
} from "@/types/scanner";

// ── Types ────────────────────────────────────────────────────────────

interface FullReportProps {
  scanId: string;
  domain: string;
  url: string;
  scores: ScanScores;
  summary: ScanSummary;
  pages: PageResult[];
  scannedAt: string;
  completedAt: string | null;
  status: ScanStatus;
  costEstimate?: CostEstimate | null;
  quickWins?: QuickWin[] | null;
  websitePersonality?: string | null;
  screenshots?: Record<string, ScreenshotInfo> | null;
}

interface GroupedIssue {
  issue: Issue;
  pageCount: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

function selectorToPlainText(selector: string): string {
  const s = selector.split(">").pop()?.trim() ?? selector;
  const tag = s.match(/^([a-z0-9]+)/i)?.[1] ?? "";
  const id = s.match(/#([\w-]+)/)?.[1];
  const classes = Array.from(s.matchAll(/\.([\w-]+)/g)).map((m) => m[1]).slice(0, 2);
  const attr = s.match(/\[([^\]=]+)/)?.[1];

  if (id) return `#${id}`;
  if (classes.length) return `${tag || "element"} .${classes.join(" .")}`;
  if (attr) return `${tag || "element"} [${attr}]`;
  if (tag) return `<${tag}> element`;
  return selector;
}

const severityOrder: Record<IssueSeverity, number> = {
  critical: 0,
  major: 1,
  minor: 2,
  info: 3,
};

const categoryMeta: Record<IssueCategory, { label: string; scoreKey: keyof ScanScores }> = {
  accessibility: { label: "Accessibility", scoreKey: "accessibility" },
  content: { label: "Content", scoreKey: "content" },
  seo: { label: "SEO", scoreKey: "seo" },
  performance: { label: "Performance", scoreKey: "performance" },
  security: { label: "Security", scoreKey: "security" },
};

function groupIssuesByCategory(pages: PageResult[]) {
  const groups: Record<IssueCategory, GroupedIssue[]> = {
    accessibility: [],
    content: [],
    seo: [],
    performance: [],
    security: [],
  };

  // Track issue occurrences across pages
  const issuePageCount = new Map<string, number>();
  const seenInGroup = new Map<string, Issue>();

  for (const page of pages) {
    for (const issue of page.issues || []) {
      issuePageCount.set(issue.id, (issuePageCount.get(issue.id) || 0) + 1);
      if (!seenInGroup.has(issue.id)) {
        seenInGroup.set(issue.id, issue);
      }
    }
  }

  seenInGroup.forEach((issue, id) => {
    const category = issue.category as IssueCategory;
    if (groups[category]) {
      groups[category].push({
        issue,
        pageCount: issuePageCount.get(id) || 1,
      });
    }
  });

  // Sort each group: severity first, then impact descending
  for (const cat of Object.keys(groups) as IssueCategory[]) {
    groups[cat].sort((a, b) => {
      const sevDiff = severityOrder[a.issue.severity] - severityOrder[b.issue.severity];
      if (sevDiff !== 0) return sevDiff;
      return b.issue.impact - a.issue.impact;
    });
  }

  return groups;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatLoadTime(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function scoreColor(score: number) {
  if (score >= 80) return "text-green-600";
  if (score >= 50) return "text-yellow-600";
  return "text-red-600";
}

function statusCodeColor(code: number) {
  if (code >= 200 && code < 300) return "text-green-600";
  if (code >= 300 && code < 400) return "text-yellow-600";
  return "text-red-600";
}

// ── Collapsible section ──────────────────────────────────────────────

function CollapsibleSection({
  title,
  badge,
  defaultOpen,
  children,
}: {
  title: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 sm:p-5 bg-white hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          {title}
          {badge}
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="border-t border-gray-200 p-4 sm:p-5 bg-white">{children}</div>}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

export function FullReport({
  domain,
  scores,
  summary,
  pages,
  scannedAt,
  completedAt,
  status,
  costEstimate,
  quickWins,
  websitePersonality,
  screenshots,
}: FullReportProps) {
  const [copied, setCopied] = useState(false);
  const isMultiPage = pages.length > 1;
  const grouped = groupIssuesByCategory(pages);

  // Technical issues: those with selector or axeRuleId
  const allIssues = pages.flatMap((p) => p.issues || []);
  const seenTech = new Set<string>();
  const technicalIssues = allIssues.filter((issue) => {
    if (seenTech.has(issue.id)) return false;
    seenTech.add(issue.id);
    return issue.selector || issue.axeRuleId;
  });

  // Sort pages worst-first for per-page view
  const sortedPages = [...pages].sort((a, b) => a.scores.overall - b.scores.overall);

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10 sm:py-16">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="text-center mb-10">
        <h1 className="font-display text-2xl sm:text-3xl text-adashi-gulf mb-2">
          Website Report
        </h1>
        <p className="text-gray-500">
          {domain} &middot; {formatDate(scannedAt)}
          {isMultiPage && ` \u00B7 ${pages.length} pages scanned`}
        </p>
        <button
          onClick={handleCopyLink}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-adashi-blue hover:text-adashi-science transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
          </svg>
          {copied ? "Link copied!" : "Copy report link"}
        </button>
      </div>

      {/* ── Cost Estimate (NEW) ──────────────────────────────────── */}
      {costEstimate && <CostEstimateSection costEstimate={costEstimate} />}

      {/* ── Executive Summary ───────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-card p-6 sm:p-8 mb-8">
        <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
          <ScoreRing score={scores.overall} />
          <div className="flex-1 text-center sm:text-left">
            <h2 className="font-display text-xl sm:text-2xl text-adashi-gulf mb-2">
              Overall Score
            </h2>
            <p className="text-gray-600 leading-relaxed">{summary.verdict}</p>
            <div className="mt-3 flex flex-wrap gap-3 justify-center sm:justify-start text-sm text-gray-500">
              {isMultiPage && <span>{summary.totalPages} pages scanned</span>}
              <span>{summary.totalIssues} issues found</span>
              {summary.criticalIssues > 0 && (
                <span className="text-red-600 font-medium">
                  {summary.criticalIssues} critical
                </span>
              )}
              {summary.majorIssues > 0 && (
                <span className="text-orange-600 font-medium">
                  {summary.majorIssues} major
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Website Personality (NEW) ────────────────────────────── */}
      {websitePersonality && <WebsitePersonalitySection personality={websitePersonality} />}

      {/* ── Category Breakdown ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-card p-6 sm:p-8 mb-8">
        <h2 className="font-semibold text-adashi-gulf text-lg mb-6 text-center">
          Category Breakdown
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-6">
          {(Object.keys(categoryMeta) as IssueCategory[]).map((cat) => (
            <div key={cat} className="text-center">
              <ScoreRingSmall score={scores[categoryMeta[cat].scoreKey] ?? 100} label={categoryMeta[cat].label} />
              <p className="text-xs text-gray-400 mt-1">
                {grouped[cat].length} issue{grouped[cat].length !== 1 ? "s" : ""}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Issues by Category ──────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="font-semibold text-adashi-gulf text-lg mb-4">Issues by Category</h2>
        <div className="space-y-3">
          {(Object.keys(categoryMeta) as IssueCategory[]).map((cat) => {
            const items = grouped[cat];
            if (items.length === 0) return null;
            const catScore = scores[categoryMeta[cat].scoreKey] ?? 100;

            return (
              <CollapsibleSection
                key={cat}
                defaultOpen={items.some((g) => g.issue.severity === "critical" || g.issue.severity === "major")}
                title={
                  <span className="font-semibold text-adashi-gulf">
                    {categoryMeta[cat].label}
                  </span>
                }
                badge={
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${scoreColor(catScore)}`}>
                      {catScore}
                    </span>
                    <span className="text-xs text-gray-400">
                      {items.length} issue{items.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                }
              >
                {(() => {
                  const priority = items.filter((g) => g.issue.severity === "critical" || g.issue.severity === "major");
                  const secondary = items.filter((g) => g.issue.severity === "minor" || g.issue.severity === "info");
                  const showAll = priority.length === 0;
                  const visibleItems = showAll ? items : priority;

                  return (
                    <div className="space-y-3">
                      {visibleItems.map((g, i) => (
                        <div key={`${g.issue.id}-${i}`} className="relative">
                          <IssueCard issue={g.issue} />
                          {isMultiPage && g.pageCount > 1 && (
                            <span className="absolute top-3 right-3 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                              found on {g.pageCount} pages
                            </span>
                          )}
                        </div>
                      ))}
                      {!showAll && secondary.length > 0 && (
                        <CollapsibleSection
                          defaultOpen={false}
                          title={
                            <span className="text-sm text-gray-500">
                              {secondary.length} lower-priority issue{secondary.length !== 1 ? "s" : ""}
                            </span>
                          }
                        >
                          <div className="space-y-3 mt-2">
                            {secondary.map((g, i) => (
                              <div key={`sec-${g.issue.id}-${i}`} className="relative">
                                <IssueCard issue={g.issue} />
                                {isMultiPage && g.pageCount > 1 && (
                                  <span className="absolute top-3 right-3 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                    found on {g.pageCount} pages
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </CollapsibleSection>
                      )}
                    </div>
                  );
                })()}
              </CollapsibleSection>
            );
          })}
        </div>
      </div>

      {/* ── Per-Page Findings (multi-page only) ─────────────────── */}
      {isMultiPage && (
        <div className="mb-8">
          <h2 className="font-semibold text-adashi-gulf text-lg mb-4">Page-by-Page Analysis</h2>
          <div className="space-y-3">
            {sortedPages.map((page, i) => {
              const pageUrl = new URL(page.url);
              const displayPath = pageUrl.pathname === "/" ? pageUrl.hostname : `${pageUrl.hostname}${pageUrl.pathname}`;

              return (
                <CollapsibleSection
                  key={page.url}
                  defaultOpen={i === 0}
                  title={
                    <span className="font-medium text-adashi-gulf truncate max-w-[300px] block">
                      {displayPath}
                    </span>
                  }
                  badge={
                    <div className="flex items-center gap-3 text-xs">
                      <span className={statusCodeColor(page.statusCode)}>
                        {page.statusCode}
                      </span>
                      <span className="text-gray-400">{formatLoadTime(page.loadTimeMs)}</span>
                      <span className={`font-bold ${scoreColor(page.scores.overall)}`}>
                        {page.scores.overall}
                      </span>
                    </div>
                  }
                >
                  <div className="space-y-4">
                    {/* Screenshot */}
                    {screenshots?.[page.url] && (
                      <AnnotatedScreenshot
                        screenshotUrl={screenshots[page.url].url}
                        overlays={screenshots[page.url].overlays}
                        pageUrl={page.url}
                      />
                    )}

                    {/* Mini scores */}
                    <div className="flex flex-wrap gap-4 text-sm">
                      {(Object.keys(categoryMeta) as IssueCategory[]).filter((cat) => page.scores[categoryMeta[cat].scoreKey] !== undefined).map((cat) => {
                        const s = page.scores[categoryMeta[cat].scoreKey] ?? 100;
                        return (
                          <span key={cat} className="text-gray-500">
                            {categoryMeta[cat].label}:{" "}
                            <span className={`font-semibold ${scoreColor(s)}`}>{s}</span>
                          </span>
                        );
                      })}
                    </div>

                    {/* Page issues */}
                    {page.issues.length > 0 ? (
                      <div className="space-y-3">
                        {[...page.issues]
                          .sort((a, b) => {
                            const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
                            if (sevDiff !== 0) return sevDiff;
                            return b.impact - a.impact;
                          })
                          .map((issue, j) => (
                            <IssueCard key={`${issue.id}-${j}`} issue={issue} />
                          ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No issues found on this page.</p>
                    )}
                  </div>
                </CollapsibleSection>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Affected Elements ───────────────────────────────────── */}
      {technicalIssues.length > 0 && (
        <div className="mb-8">
          <CollapsibleSection
            defaultOpen={false}
            title={
              <span className="font-semibold text-adashi-gulf">Affected Elements</span>
            }
            badge={
              <span className="text-xs text-gray-400">
                {technicalIssues.length} element{technicalIssues.length !== 1 ? "s" : ""}
              </span>
            }
          >
            <div className="space-y-4">
              {technicalIssues.map((issue, i) => (
                <div key={`tech-${issue.id}-${i}`} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                  <h4 className="font-medium text-adashi-gulf text-sm mb-1">{issue.title}</h4>
                  {issue.selector && (
                    <p className="text-xs text-gray-500">
                      Found on: <span className="font-medium text-gray-700">{selectorToPlainText(issue.selector)}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* ── Quick Wins (NEW) ─────────────────────────────────────── */}
      {quickWins && quickWins.length > 0 && <QuickWinsSection quickWins={quickWins} />}

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <div className="bg-adashi-gulf text-white rounded-2xl p-6 sm:p-8 text-center">
        <h2 className="font-display text-xl sm:text-2xl mb-2">
          Want help fixing these issues?
        </h2>
        <p className="text-adashi-pastel mb-4">
          Book a free strategy call with Adashi and we&apos;ll walk you through the fixes.
        </p>
        <a
          href="https://adashi.io/contact"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-adashi-blue hover:bg-adashi-science text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          Book a free call
        </a>
      </div>

      {/* ── Footer note ─────────────────────────────────────────── */}
      <p className="text-center text-xs text-gray-400 mt-8">
        Report generated by{" "}
        <a href="https://adashi.io" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">
          Adashi
        </a>
        {completedAt && ` on ${formatDate(completedAt)}`}
        {status === "quick_done" && " (quick scan — limited results)"}
      </p>
    </div>
  );
}
