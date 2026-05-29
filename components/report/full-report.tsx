"use client";

import { useState } from "react";
import { BusinessReport } from "@/components/report/business-report";
import { TechnicalReport } from "@/components/report/technical-report";
import type {
  ScanScores,
  ScanSummary,
  PageResult,
  ScanStatus,
  CostEstimate,
  QuickWin,
  ScreenshotInfo,
} from "@/types/scanner";

// ── Types ─────────────────────────────────────────────────────────────

interface FullReportProps {
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
  visitorExperience?: string | null;
  screenshots?: Record<string, ScreenshotInfo> | null;
  screenshotUrl?: string | null;
}

// ── Sidebar helpers ───────────────────────────────────────────────────

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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Main component ────────────────────────────────────────────────────

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
  visitorExperience,
  screenshots,
  screenshotUrl,
}: FullReportProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"business" | "technical">("business");

  const isMultiPage = pages.length > 1;

  const gradeBadgeClass = scores.overall >= 85
    ? "bg-green-100 text-green-700"
    : scores.overall >= 70
      ? "bg-blue-100 text-blue-700"
      : scores.overall >= 50
        ? "bg-orange-100 text-orange-700"
        : "bg-red-100 text-red-700";

  const grade = scores.overall >= 95
    ? "Excellent"
    : scores.overall >= 85
      ? "Performing well"
      : scores.overall >= 70
        ? "Solid foundation"
        : scores.overall >= 50
          ? "Room to grow"
          : "Needs significant work";

  const categories = [
    { label: "Accessibility", score: scores.accessibility },
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
    <article className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-16">

      {/* Header */}
      <header data-section="report-header" className="text-center mb-8">
        <h1 className="font-display text-2xl sm:text-3xl text-adashi-gulf mb-2">
          Website Report
        </h1>
        <p className="text-gray-500">
          {domain} &middot; {formatDate(scannedAt)}
          {isMultiPage && ` · ${pages.length} pages scanned`}
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
      </header>

      {/* Two-column layout at lg+ */}
      <div className="lg:flex lg:gap-8 lg:items-start">

        {/* Sidebar — hidden below lg, sticky */}
        <aside data-section="sidebar" className="hidden lg:block lg:w-72 lg:flex-shrink-0 lg:sticky lg:top-8">
          <div data-section="score-card" className="bg-white rounded-2xl shadow-card p-6 mb-4">
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
        <main className="flex-1 min-w-0">

          {/* Tab switcher */}
          <nav data-section="tab-switcher" className="flex gap-2 mb-8">
            <button
              onClick={() => setActiveTab("business")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === "business"
                  ? "bg-adashi-gulf text-white"
                  : "text-gray-500 hover:text-adashi-gulf"
              }`}
            >
              Business Overview
            </button>
            <button
              onClick={() => setActiveTab("technical")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === "technical"
                  ? "bg-adashi-gulf text-white"
                  : "text-gray-500 hover:text-adashi-gulf"
              }`}
            >
              Technical Details
            </button>
          </nav>

          {activeTab === "business" ? (
            <BusinessReport
              domain={domain}
              scores={scores}
              summary={summary}
              screenshotUrl={screenshotUrl}
              costEstimate={costEstimate}
              quickWins={quickWins}
              websitePersonality={websitePersonality}
              visitorExperience={visitorExperience}
            />
          ) : (
            <TechnicalReport
              scores={scores}
              pages={pages}
              screenshots={screenshots}
            />
          )}

          <p className="text-center text-xs text-gray-400 mt-8">
            Report generated by{" "}
            <a href="https://adashi.io" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">
              Adashi
            </a>
            {completedAt && ` on ${formatDate(completedAt)}`}
            {status === "quick_done" && " (quick scan — limited results)"}
          </p>

        </main>
      </div>
    </article>
  );
}
