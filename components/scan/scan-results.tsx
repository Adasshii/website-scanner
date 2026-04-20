"use client";

import { useEffect, useRef } from "react";
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
  screenshotUrl?: string | null;
}

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

export function ScanResults({
  scanId,
  domain,
  scores,
  summary,
  issues,
  scannedAt,
  status,
  designAnalysisPending,
  costEstimate,
  quickWins,
  websitePersonality,
  screenshotUrl,
}: ScanResultsProps) {
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

  // Always show all 3 tease cards — use static placeholders when AI data is null
  const quickWinsData = quickWins ?? [
    { title: "High-impact fix ready to implement on your site", estimatedTime: "~5 min", needsDeveloper: false, description: "", expectedImpact: "" },
    { title: "Improvement identified across multiple pages", estimatedTime: "~30 min", needsDeveloper: false, description: "", expectedImpact: "" },
    { title: "Structural change that compounds over time", estimatedTime: "Varies", needsDeveloper: true, description: "", expectedImpact: "" },
  ];
  const personalityText = websitePersonality ??
    "Unlock your report to see how visitors perceive your site. We analyse tone, trust signals, clarity, and whether your first impression matches your audience's expectations.";

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
    { label: "Design", score: scores.design ?? 0, pending: designAnalysisPending },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-16">

      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="font-display text-2xl sm:text-3xl text-adashi-gulf mb-2">
          Scan Results
        </h1>
        <p className="text-gray-500">
          <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{domain}</a>
          {" "}&middot;{" "}
          Scanned {new Date(scannedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {/* Two-column layout at lg+ */}
      <div className="lg:flex lg:gap-8 lg:items-start">

        {/* Sidebar — hidden below lg, sticky */}
        <aside className="hidden lg:block lg:w-72 lg:flex-shrink-0 lg:sticky lg:top-8">

          {/* Score card */}
          <div className="bg-white rounded-2xl shadow-card p-6 mb-4">
            {/* Large score */}
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

            {/* Category bars */}
            <div className="space-y-3">
              {categories.map(({ label, score, pending }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 flex-shrink-0" style={{ width: "72px" }}>{label}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor(score)} ${pending ? "animate-pulse" : ""}`}
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

          {/* Sidebar CTA — only shown when in quick_done state */}
          {isQuickDone && (
            <div className="bg-adashi-gulf rounded-2xl p-5 text-center">
              <p className="text-white text-sm font-medium leading-snug mb-3">
                Unlock your full breakdown and all quick wins
              </p>
              <a
                href="#email-gate"
                className="inline-block bg-adashi-blue hover:bg-adashi-science text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors w-full"
              >
                Get my full report
              </a>
            </div>
          )}
        </aside>

        {/* Main content column */}
        <div className="flex-1 min-w-0">

          {/* Score + verdict strip — visible on all screen sizes */}
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

          {/* Scan failure notice */}
          {scanFailed && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 mb-8 flex gap-3">
              <span className="text-orange-500 text-xl leading-none">&#9888;</span>
              <div>
                <p className="font-semibold text-orange-800 mb-1">We couldn&apos;t fully scan this website</p>
                <p className="text-orange-700 text-sm leading-relaxed">
                  Our scanner wasn&apos;t able to load <strong>{domain}</strong>. This usually happens with very heavy websites,
                  sites that block automated tools, or pages that require a login. The scores below reflect what we could measure
                  before the error occurred.
                </p>
              </div>
            </div>
          )}

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

          {/* Revenue Impact */}
          {isQuickDone && costEstimate && (
            <div className="bg-white rounded-2xl shadow-card p-6 sm:p-8 mb-6">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">Revenue impact</p>
              <div className="flex items-end gap-4 mb-2">
                <span className="font-display text-3xl sm:text-4xl font-bold text-red-500 leading-none">
                  {costEstimate.totalLostPercent}%
                </span>
                <span className="text-gray-500 text-sm pb-2 leading-snug">
                  of potential<br />customers lost
                </span>
              </div>
              <p className="text-sm text-gray-400 mb-6">
                Estimated based on your performance, SEO, and usability scores.
              </p>
              <div className="relative">
                <div className="blur-[3px] pointer-events-none select-none space-y-3" aria-hidden="true">
                  {(costEstimate.factors.length > 0 ? costEstimate.factors : [{}, {}, {}]).slice(0, 3).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-3 bg-red-100 rounded-full" style={{ width: `${68 - i * 16}%` }} />
                      <span className="text-sm font-medium text-gray-400 w-12">
                        -{(costEstimate.totalLostPercent * (0.5 - i * 0.13)).toFixed(0)}%
                      </span>
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

          {/* Top Issues */}
          {topIssues.length > 0 && (
            <div className="mb-6">
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

          {/* Quick Wins + Personality teasers */}
          {isQuickDone && (
            <div className="space-y-4 mb-4">

              {/* Quick wins tease */}
              <div className="bg-white rounded-2xl shadow-card p-6 sm:p-8">
                <div className="flex items-center gap-4 mb-5">
                  <div className="flex-shrink-0 w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Quick wins</p>
                    <h3 className="font-semibold text-adashi-gulf">{quickWinsData.length} actionable fixes identified</h3>
                  </div>
                </div>
                <div className="space-y-2">
                  {quickWinsData.map((win, i) => (
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

              {/* Website personality tease */}
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
                <div className="relative overflow-hidden" style={{ maxHeight: "4.5rem" }}>
                  <p className="text-gray-600 leading-relaxed text-sm">{personalityText.slice(0, 180)}</p>
                  <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white to-transparent" />
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>Full assessment unlocked with your report</span>
                </div>
              </div>

            </div>
          )}

          {/* Blurred section — shown before the email gate so the lock is visible first */}
          {isQuickDone && (
            <div className="mb-6">
              <BlurredSection issues={teaserIssues} />
            </div>
          )}

          {/* Email gate + CTA — combined after the locked section */}
          {isQuickDone && (
            <div id="email-gate" className="space-y-4 mb-8">
              <EmailGate
                scanId={scanId}
                onFullScanComplete={() => router.refresh()}
              />
              <div className="bg-adashi-gulf text-white rounded-2xl p-6 sm:p-8 text-center">
                <h2 className="font-display text-xl sm:text-2xl mb-2">Want help fixing these issues?</h2>
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
          )}

        </div>
      </div>
    </div>
  );
}
