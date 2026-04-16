"use client";

import { ScoreRing, ScoreRingSmall } from "@/components/scan/score-ring";
import { IssueCard } from "@/components/scan/issue-card";
import { EmailGate } from "@/components/scan/email-gate";
import { BlurredSection } from "@/components/scan/blurred-section";
import type { ScanScores, ScanSummary, Issue, ScanStatus } from "@/types/scanner";
import { useRouter } from "next/navigation";

interface ScanResultsProps {
  scanId: string;
  domain: string;
  scores: ScanScores;
  summary: ScanSummary;
  issues: Issue[];
  scannedAt: string;
  status: ScanStatus;
}

export function ScanResults({ scanId, domain, scores, summary, issues, scannedAt, status }: ScanResultsProps) {
  const router = useRouter();
  const sortedIssues = [...issues].sort((a, b) => b.impact - a.impact);

  // Quick scan: show top 5 issues. Full scan (completed): show all (up to 10)
  const isQuickDone = status === "quick_done" || status === "processing";
  const maxIssues = isQuickDone ? 5 : 10;
  const topIssues = sortedIssues.slice(0, maxIssues);
  const teaserIssues = sortedIssues.slice(maxIssues, maxIssues + 3);

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
        <div className={`grid gap-6 ${scores.security !== undefined ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"}`}>
          <ScoreRingSmall score={scores.accessibility} label="Accessibility" />
          <ScoreRingSmall score={scores.content} label="Content" />
          <ScoreRingSmall score={scores.seo} label="SEO" />
          <ScoreRingSmall score={scores.performance} label="Performance" />
          {scores.security !== undefined && (
            <ScoreRingSmall score={scores.security} label="Security" />
          )}
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
