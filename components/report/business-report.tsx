"use client";

import { useTranslations } from "next-intl";
import { BenchmarkSection } from "@/components/report/benchmark";
import { CostEstimateSection } from "@/components/report/cost-estimate";
import { QuickWinsSection } from "@/components/report/quick-wins";
import { WebsitePersonalitySection } from "@/components/report/website-personality";
import { useGradeLabel } from "@/lib/i18n-helpers";
import type {
  ScanScores,
  ScanSummary,
  CostEstimate,
  QuickWin,
} from "@/types/scanner";

interface BusinessReportProps {
  domain: string;
  scores: ScanScores;
  summary: ScanSummary;
  screenshotUrl?: string | null;
  costEstimate?: CostEstimate | null;
  quickWins?: QuickWin[] | null;
  websitePersonality?: string | null;
  visitorExperience?: string | null;
}

function scoreTextColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-500";
}

function gradeBadgeClass(score: number): string {
  if (score >= 85) return "bg-green-100 text-green-700";
  if (score >= 70) return "bg-blue-100 text-blue-700";
  if (score >= 50) return "bg-orange-100 text-orange-700";
  return "bg-red-100 text-red-700";
}

function VisitorExperienceSection({ text }: { text: string }) {
  const t = useTranslations("scanResults.visitorExperience");
  const paragraphs = text.split(/\n\n+/).filter(Boolean);

  return (
    <section data-section="visitor-experience" className="bg-white rounded-2xl shadow-card p-5 sm:p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-4 h-4 text-adashi-blue flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <h2 className="font-semibold text-adashi-gulf text-base">{t("heading")}</h2>
      </div>
      <div className="space-y-4">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-sm text-gray-600 leading-relaxed">{p}</p>
        ))}
      </div>
    </section>
  );
}

export function BusinessReport({
  domain,
  scores,
  summary,
  screenshotUrl,
  costEstimate,
  quickWins,
  websitePersonality,
  visitorExperience,
}: BusinessReportProps) {
  const t = useTranslations("scanResults");
  const tBiz = useTranslations("businessReport");
  const tCta = useTranslations("common.ctaBlock");
  const gradeLabel = useGradeLabel();
  const badgeClass = gradeBadgeClass(scores.overall);
  const grade = gradeLabel(scores.overall);

  return (
    <div>
      {/* Score + verdict strip */}
      <div data-section="score-strip" className="bg-white rounded-2xl shadow-card p-4 mb-6 flex items-start gap-4">
        <div className="flex-shrink-0 text-center">
          <div className={`font-display text-4xl font-bold leading-none ${scoreTextColor(scores.overall)}`}>
            {scores.overall}
          </div>
          <div className="text-gray-400 text-xs">/100</div>
        </div>
        <div className="flex-1 min-w-0">
          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-1 ${badgeClass}`}>
            {grade}
          </span>
          <p className="text-gray-600 text-sm leading-relaxed mb-1">{summary.verdict}</p>
          <div className="flex flex-wrap gap-2 text-xs text-gray-500">
            <span>{t("issuesFound", { count: summary.totalIssues })}</span>
            {summary.criticalIssues > 0 && (
              <span className="text-red-600 font-medium">
                {tBiz("criticalImmediate", { count: summary.criticalIssues })}
              </span>
            )}
            {summary.majorIssues > 0 && (
              <span className="text-orange-600 font-medium">
                {tBiz("majorWorthFixing", { count: summary.majorIssues })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* How you compare */}
      <BenchmarkSection scores={scores} />

      {/* Adashi context */}
      <p className="text-xs text-gray-400 leading-relaxed mb-4">{t("adashiContext")}</p>

      {/* Screenshot hero */}
      {screenshotUrl && (
        <section data-section="screenshot-hero" className="bg-white rounded-2xl shadow-card overflow-hidden mb-6">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
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
        </section>
      )}

      {visitorExperience && <VisitorExperienceSection text={visitorExperience} />}

      {costEstimate && (
        <section data-section="revenue-impact">
          <CostEstimateSection costEstimate={costEstimate} />
        </section>
      )}

      {quickWins && quickWins.length > 0 && (
        <section data-section="quick-wins">
          <QuickWinsSection quickWins={quickWins} />
        </section>
      )}

      {websitePersonality && (
        <section data-section="website-personality">
          <WebsitePersonalitySection personality={websitePersonality} />
        </section>
      )}

      {/* Social proof */}
      <div data-section="social-proof" className="flex items-center justify-center gap-2 py-3 mb-4 text-center">
        <svg className="w-4 h-4 text-adashi-blue flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        <p
          className="text-sm text-gray-500"
          dangerouslySetInnerHTML={{
            __html: tBiz.raw("socialProof").toString().replace("<strong>", '<span class="font-semibold text-adashi-gulf">').replace("</strong>", "</span>"),
          }}
        />
      </div>

      {/* CTA */}
      <div data-section="cta" className="bg-adashi-gulf text-white rounded-2xl p-6 sm:p-8 text-center">
        <h2 className="font-display text-xl sm:text-2xl mb-2">{tCta("heading")}</h2>
        <p className="text-adashi-pastel mb-4">{tCta("subheading")}</p>
        <a
          href="https://adashi.io/contact"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-adashi-blue hover:bg-adashi-science text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          {tCta("button")}
        </a>
      </div>
    </div>
  );
}
