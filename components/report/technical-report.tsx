"use client";

import { useState, useCallback } from "react";
import { IssueCard } from "@/components/scan/issue-card";
import { BrowserFrameScreenshot } from "@/components/report/browser-frame-screenshot";
import type {
  ScanScores,
  PageResult,
  Issue,
  IssueCategory,
  IssueSeverity,
  ScreenshotInfo,
} from "@/types/scanner";

// ── Types ─────────────────────────────────────────────────────────────

interface TechnicalReportProps {
  scores: ScanScores;
  pages: PageResult[];
  screenshots?: Record<string, ScreenshotInfo> | null;
}

interface GroupedIssue {
  issue: Issue;
  pageCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────

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

function formatLoadTime(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
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
  accessibility: { label: "Accessibility", scoreKey: "accessibility" },
  content: { label: "Content", scoreKey: "content" },
  seo: { label: "SEO", scoreKey: "seo" },
  performance: { label: "Performance", scoreKey: "performance" },
  security: { label: "Security", scoreKey: "security" },
  design: { label: "UX & Conversion", scoreKey: "design" },
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

// ── Collapsible Section ───────────────────────────────────────────────

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

// ── Main component ────────────────────────────────────────────────────

export function TechnicalReport({
  scores,
  pages,
  screenshots,
}: TechnicalReportProps) {
  const [copied, setCopied] = useState(false);
  const isMultiPage = pages.length > 1;

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);
  const grouped = groupIssuesByCategory(pages);

  const allIssues = pages.flatMap((p) => p.issues || []);
  const seenTech = new Set<string>();
  const technicalIssues = allIssues.filter((issue) => {
    if (seenTech.has(issue.id)) return false;
    seenTech.add(issue.id);
    return issue.selector || issue.axeRuleId;
  });

  const sortedPages = [...pages].sort((a, b) => a.scores.overall - b.scores.overall);

  return (
    <div>
      {/* Annotated screenshot: shown for single-page scans (multi-page shows per-page below) */}
      {!isMultiPage && (() => {
        const firstPage = pages[0];
        const shot = screenshots?.[firstPage?.url];
        if (!shot) return null;
        return (
          <section data-section="page-screenshot" className="mb-6">
            <BrowserFrameScreenshot
              screenshotUrl={shot.url}
              overlays={shot.overlays}
              pageUrl={firstPage.url}
              scrollHint={0}
            />
          </section>
        );
      })()}

      {/* Issues by category */}
      <section data-section="issues-by-category" className="mb-8">
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
      </section>

      {/* Per-page findings (multi-page only) */}
      {isMultiPage && (
        <section data-section="page-analysis" className="mb-8">
          <h2 className="font-semibold text-adashi-gulf text-lg mb-4">Page-by-Page Analysis</h2>
          <div className="space-y-3">
            {sortedPages.map((page, i) => {
              const pageUrl = new URL(page.url);
              const displayPath = pageUrl.pathname === "/" ? pageUrl.hostname : `${pageUrl.hostname}${pageUrl.pathname}`;

              // For pages after the first, skip the header zone (top 200px in page coords)
              // and focus on where the unique body-level issues are.
              const HEADER_ZONE = 200;
              const pageOverlays = screenshots?.[page.url]?.overlays ?? [];
              const bodyOverlays = i === 0
                ? pageOverlays
                : pageOverlays.filter((o) => o.rect.y > HEADER_ZONE);
              const scrollHint = bodyOverlays.length > 0
                ? Math.max(0, Math.min(...bodyOverlays.map((o) => o.rect.y)) - 50)
                : 0;

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
                      <BrowserFrameScreenshot
                        screenshotUrl={screenshots[page.url].url}
                        overlays={screenshots[page.url].overlays}
                        pageUrl={page.url}
                        scrollHint={scrollHint}
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
        </section>
      )}

      {/* Affected elements */}
      {technicalIssues.length > 0 && (
        <section data-section="affected-elements" className="mb-8">
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
        </section>
      )}

      {/* Share CTA */}
      <div data-section="technical-share" className="flex flex-col sm:flex-row items-center gap-3 mt-2 mb-4">
        <button
          onClick={handleShare}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-adashi-blue text-adashi-blue font-semibold text-sm hover:bg-adashi-blue/5 transition-colors"
        >
          {copied ? (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
              </svg>
              Share this report
            </>
          )}
        </button>
        <span className="text-xs text-gray-400">
          Share with your team or decision-makers — the link works for anyone.
        </span>
      </div>
    </div>
  );
}
