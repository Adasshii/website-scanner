"use client";

import { useState } from "react";
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
  screenshotUrl?: string | null;
}

interface GroupedIssue {
  issue: Issue;
  pageCount: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

function barColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

function scoreTextColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-500";
}

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
  accessibility: { label: "Usability", scoreKey: "accessibility" },
  content: { label: "Content", scoreKey: "content" },
  seo: { label: "SEO", scoreKey: "seo" },
  performance: { label: "Performance", scoreKey: "performance" },
  security: { label: "Security", scoreKey: "security" },
  design: { label: "Design", scoreKey: "design" },
};

function groupIssuesByCategory(pages: PageResult[]) {
  const groups: Record<IssueCategory, GroupedIssue[]> = {
    accessibility: [],
    content: [],
    seo: [],
    performance: [],
    security: [],
    design: [],
  };

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
  screenshotUrl,
}: FullReportProps) {
  const [copied, setCopied] = useState(false);
  const isMultiPage = pages.length > 1;
  const grouped = groupIssuesByCategory(pages);

  const allIssues = pages.flatMap((p) => p.issues || []);
  const seenTech = new Set<string>();
  const technicalIssues = allIssues.filter((issue) => {
    if (seenTech.has(issue.id)) return false;
    seenTech.add(issue.id);
    return issue.selector || issue.axeRuleId;
  });

  const sortedPages = [...pages].sort((a, b) => a.scores.overall - b.scores.overall);

  const grade = scores.overall >= 80 ? "Good" : scores.overall >= 60 ? "Needs improvement" : "Poor";
  const gradeBadgeClass = scores.overall >= 80
    ? "bg-green-100 text-green-700"
    : scores.overall >= 60
      ? "bg-orange-100 text-orange-700"
      : "bg-red-100 text-red-700";

  const categories = [
    { label: "Usability", score: scores.accessibility },
    { label: "Content", score: scores.content },
    { label: "SEO", score: scores.seo },
    { label: "Performance", score: scores.performance },
    { label: "Security", score: scores.security ?? 0 },
    { label: "Design", score: scores.design ?? 0 },
  ];

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-16">

      {/* Header */}
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

      {/* Two-column layout at lg+ */}
      <div className="lg:flex lg:gap-8 lg:items-start">

        {/* Sidebar — hidden below lg, sticky */}
        <aside className="hidden lg:block lg:w-72 lg:flex-shrink-0 lg:sticky lg:top-8">
          <div className="bg-white rounded-2xl shadow-card p-6 mb-4">
            <div className="text-center mb-4">
              <div className={`font-display text-7xl font-bold leading-none ${scoreTextColor(scores.overall)}`}>
                {scores.overall}
              </div>
              <div className="text-gray-400 text-sm mt-1">/100</div>
              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mt-2 ${gradeBadgeClass}`}>
                {grade}
              </span>
            </div>

            <hr className="border-gray-100 mb-4" />

            <div className="space-y-3">
              {categories.map(({ label, score }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 flex-shrink-0" style={{ width: "72px" }}>{label}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor(score)}`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <span className={`text-xs font-semibold flex-shrink-0 text-right ${scoreTextColor(score)}`} style={{ width: "28px" }}>
                    {score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Main content column */}
        <div className="flex-1 min-w-0">

          {/* Score + verdict strip */}
          <div className="bg-white rounded-2xl shadow-card p-4 mb-6 flex items-start gap-4">
            <div className="flex-shrink-0 text-center">
              <div className={`font-display text-4xl font-bold leading-none ${scoreTextColor(scores.overall)}`}>
                {scores.overall}
              </div>
              <div className="text-gray-400 text-xs">/100</div>
            </div>
            <div className="flex-1 min-w-0">
              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-1 ${gradeBadgeClass}`}>
                {grade}
              </span>
              <p className="text-gray-600 text-sm leading-relaxed mb-1">{summary.verdict}</p>
              <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                <span>{summary.totalIssues} issues found</span>
                {summary.criticalIssues > 0 && (
                  <span className="text-red-600 font-medium">{summary.criticalIssues} critical</span>
                )}
                {summary.majorIssues > 0 && (
                  <span className="text-orange-600 font-medium">{summary.majorIssues} major</span>
                )}
              </div>
            </div>
          </div>

          {/* Screenshot hero */}
          {screenshotUrl && (
            <div className="bg-white rounded-2xl shadow-card overflow-hidden mb-6">
              <div className="relative">
                <img
                  src={screenshotUrl}
                  alt={`Screenshot of ${domain}`}
                  className="w-full object-cover object-top"
                  style={{ maxHeight: "260px" }}
                />
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent" />
              </div>
              <div className="px-4 py-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                <a
                  href={`https://${domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-500 hover:underline truncate"
                >
                  {domain}
                </a>
              </div>
            </div>
          )}

          {/* Cost estimate */}
          {costEstimate && <CostEstimateSection costEstimate={costEstimate} />}

          {/* Quick wins */}
          {quickWins && quickWins.length > 0 && <QuickWinsSection quickWins={quickWins} />}

          {/* Website personality */}
          {websitePersonality && <WebsitePersonalitySection personality={websitePersonality} />}

          {/* Issues by category */}
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

          {/* Per-page findings (multi-page only) */}
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
                        {screenshots?.[page.url] && (
                          <AnnotatedScreenshot
                            screenshotUrl={screenshots[page.url].url}
                            overlays={screenshots[page.url].overlays}
                            pageUrl={page.url}
                          />
                        )}

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

          {/* Affected elements */}
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

          {/* CTA */}
          <div className="bg-adashi-gulf text-white rounded-2xl p-6 sm:p-8 text-center mb-8">
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

          <p className="text-center text-xs text-gray-400 mt-8">
            Report generated by{" "}
            <a href="https://adashi.io" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">
              Adashi
            </a>
            {completedAt && ` on ${formatDate(completedAt)}`}
            {status === "quick_done" && " (quick scan — limited results)"}
          </p>

        </div>
      </div>
    </div>
  );
}
