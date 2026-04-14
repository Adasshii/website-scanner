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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <ScoreRingSmall score={scores.accessibility} label="Accessibility" />
          <ScoreRingSmall score={scores.content} label="Content" />
          <ScoreRingSmall score={scores.seo} label="SEO" />
          <ScoreRingSmall score={scores.performance} label="Performance" />
        </div>
      </div>

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
          <BlurredSection />
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
