"use client";

import { useEffect, useRef } from "react";
import { ScoreRing, ScoreRingSmall } from "@/components/scan/score-ring";
import { IssueCard } from "@/components/scan/issue-card";
import { EmailGate } from "@/components/scan/email-gate";
import { BlurredSection } from "@/components/scan/blurred-section";
import type { ScanScores, ScanSummary, Issue, ScanStatus, CostEstimate, QuickWin } from "@/types/scanner";
import { useRouter } from "next/navigation";

interface ScanResultsProps {
  scanId: string;
  domain: string;
  scores: ScanScores;
  summary: ScanSummary;
  issues: Issue[];
  scannedAt: string;
  status: ScanStatus;
  designAnalysisPending?: boolean;
  costEstimate?: CostEstimate | null;
  quickWins?: QuickWin[] | null;
  websitePersonality?: string | null;
}

export function ScanResults({ scanId, domain, scores, summary, issues, scannedAt, status, designAnalysisPending, costEstimate, quickWins, websitePersonality }: ScanResultsProps) {
  const router = useRouter();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  useEffect(() => {
    if (!designAnalysisPending) return;

    pollRef.current = setInterval(async () => {
      pollCountRef.current += 1;
      try {
        const res = await fetch(`/api/scan/${scanId}/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.designReady || pollCountRef.current >= 24) {
          clearInterval(pollRef.current!);
          if (data.designReady) router.refresh();
        }
      } catch { /* ignore network errors */ }
    }, 5000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [designAnalysisPending, scanId, router]);
  const sortedIssues = [...issues].sort((a, b) => b.impact - a.impact);

  // Quick scan: show top 5 issues. Full scan (completed): show all (up to 10)
  const isQuickDone = status === "quick_done" || status === "processing";
  const maxIssues = isQuickDone ? 5 : 10;
  const topIssues = sortedIssues.slice(0, maxIssues);
  const teaserIssues = sortedIssues.slice(maxIssues, maxIssues + 3);

  const scanFailed = issues.some((i) => i.id === "scan-error");

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10 sm:py-16">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="font-display text-2xl sm:text-3xl text-adashi-gulf mb-2">
          Scan Results
        </h1>
        <p className="text-gray-500">
          <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{domain}</a> &middot; Scanned {new Date(scannedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Scan failure notice */}
      {scanFailed && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 mb-8 flex gap-3">
          <span className="text-orange-500 text-xl leading-none">&#9888;</span>
          <div>
            <p className="font-semibold text-orange-800 mb-1">We couldn&apos;t fully scan this website</p>
            <p className="text-orange-700 text-sm leading-relaxed">
              Our scanner wasn&apos;t able to load <strong>{domain}</strong>. This usually happens with very heavy websites, sites that block automated tools, or pages that require a login. The scores below reflect what we could measure before the error occurred.
            </p>
          </div>
        </div>
      )}

      {/* Overall Score */}
      <div className="bg-white rounded-2xl shadow-card p-6 sm:p-8 mb-8">
        <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
          <ScoreRing score={scores.overall} />
          <div className="flex-1 text-center sm:text-left">
            <h2 className="font-display text-xl sm:text-2xl text-adashi-gulf mb-2">
              Overall Score
            </h2>
            <span
              className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${
                scores.overall >= 80
                  ? "bg-green-100 text-green-700"
                  : scores.overall >= 60
                    ? "bg-orange-100 text-orange-700"
                    : "bg-red-100 text-red-700"
              }`}
            >
              {scores.overall >= 80
                ? "Good"
                : scores.overall >= 60
                  ? "Needs improvement"
                  : "Poor"}
            </span>
            <p className="text-gray-600 leading-relaxed">{summary.verdict}</p>
            <div className="mt-3 flex flex-wrap gap-3 justify-center sm:justify-start text-sm text-gray-500">
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

      {/* Category Scores */}
      <div className="bg-white rounded-2xl shadow-card p-6 sm:p-8 mb-8">
        <h2 className="font-semibold text-adashi-gulf text-lg mb-6 text-center">
          Category Breakdown
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-6">
          <ScoreRingSmall score={scores.accessibility} label="Usability" />
          <ScoreRingSmall score={scores.content} label="Content" />
          <ScoreRingSmall score={scores.seo} label="SEO" />
          <ScoreRingSmall score={scores.performance} label="Performance" />
          <ScoreRingSmall score={scores.security ?? 0} label="Security" />
          <ScoreRingSmall score={scores.design ?? 0} label="Design" pending={designAnalysisPending} />
        </div>
      </div>

      {/* Top 3 Issues Highlight */}
      {isQuickDone && sortedIssues.length > 0 && (
        <div className="bg-white rounded-2xl shadow-card p-6 sm:p-8 mb-8">
          <h2 className="font-semibold text-adashi-gulf text-lg mb-4 text-center">
            Your 3 biggest issues
          </h2>
          <div className="space-y-3">
            {sortedIssues.slice(0, 3).map((issue, i) => (
              <div key={`${issue.id}-${i}`} className="flex items-center gap-3">
                <span
                  className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    issue.severity === "critical"
                      ? "bg-red-100 text-red-700 border-red-200"
                      : issue.severity === "major"
                        ? "bg-orange-100 text-orange-700 border-orange-200"
                        : issue.severity === "minor"
                          ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                          : "bg-blue-100 text-blue-700 border-blue-200"
                  }`}
                >
                  {issue.severity}
                </span>
                <span className="flex-1 text-sm text-adashi-gulf font-medium truncate">{issue.title}</span>
                <span className="text-sm text-red-500 font-medium whitespace-nowrap">-{issue.impact} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Issues */}
      {topIssues.length > 0 && (
        <div className="mb-8">
          <h2 className="font-semibold text-adashi-gulf text-lg mb-4">
            Top Issues
            {isQuickDone && (
              <span className="text-sm font-normal text-gray-400 ml-2">
                (showing {topIssues.length} of {sortedIssues.length})
              </span>
            )}
          </h2>
          <div className="space-y-3">
            {topIssues.map((issue, i) => (
              <IssueCard key={`${issue.id}-${i}`} issue={issue} />
            ))}
          </div>
        </div>
      )}

      {/* Premium tease sections — only visible on quick_done */}
      {isQuickDone && (
        <div className="space-y-4 mb-4">

          {/* Cost estimate tease */}
          {costEstimate && (
            <div className="bg-white rounded-2xl shadow-card p-6 sm:p-8">
              <div className="flex items-start gap-4 mb-5">
                <div className="flex-shrink-0 w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Revenue impact</p>
                  <h3 className="font-display text-lg sm:text-xl text-adashi-gulf leading-snug">
                    Your site may be losing up to{" "}
                    <span className="text-red-500">{costEstimate.totalLostPercent}%</span>{" "}
                    of potential customers
                  </h3>
                </div>
              </div>
              <div className="relative">
                <div className="blur-sm pointer-events-none select-none space-y-2.5" aria-hidden="true">
                  {costEstimate.factors.slice(0, 3).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-2.5 bg-red-100 rounded-full" style={{ width: `${70 - i * 18}%` }} />
                      <span className="text-sm text-gray-300 w-12">–{8 - i * 2}%</span>
                    </div>
                  ))}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex items-center gap-1.5 bg-white/95 border border-gray-200 px-3 py-1.5 rounded-full shadow-sm">
                    <svg className="w-3.5 h-3.5 text-adashi-gulf" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span className="text-xs font-medium text-adashi-gulf">Full breakdown below</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick wins tease */}
          {quickWins && quickWins.length > 0 && (
            <div className="bg-white rounded-2xl shadow-card p-6 sm:p-8">
              <div className="flex items-center gap-4 mb-5">
                <div className="flex-shrink-0 w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Quick wins</p>
                  <h3 className="font-semibold text-adashi-gulf">
                    {quickWins.length} actionable fixes identified
                  </h3>
                </div>
              </div>
              <div className="space-y-2">
                {quickWins.map((win, i) => (
                  <div key={i} className="border border-gray-100 rounded-xl p-3 flex items-center gap-3">
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-lg whitespace-nowrap flex-shrink-0">
                      {win.estimatedTime}
                    </span>
                    <p className="flex-1 text-sm font-medium text-adashi-gulf blur-sm select-none" aria-hidden="true">
                      {win.title}
                    </p>
                    <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Website personality tease */}
          {websitePersonality && (
            <div className="bg-white rounded-2xl shadow-card p-6 sm:p-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-shrink-0 w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Website personality</p>
                  <h3 className="font-semibold text-adashi-gulf">How visitors perceive {domain}</h3>
                </div>
              </div>
              <div className="relative overflow-hidden">
                <p className="text-gray-600 leading-relaxed text-sm">
                  {websitePersonality.slice(0, 120)}
                </p>
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent" />
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Full assessment unlocked with your report</span>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Email Gate + Blurred Section (only for quick_done status) */}
      {isQuickDone && (
        <div className="space-y-6 mb-8">
          <EmailGate
            scanId={scanId}
            onFullScanComplete={() => router.refresh()}
          />
          <BlurredSection issues={teaserIssues} />
        </div>
      )}

      {/* CTA */}
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
    </div>
  );
}
