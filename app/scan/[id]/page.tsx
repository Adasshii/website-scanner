import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createServerClient } from "@/lib/supabase";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ScanResults } from "@/components/scan/scan-results";
import { pickLocalizedScan } from "@/lib/i18n-helpers";
import type { ScanScores, Issue, ScanSummary, CostEstimate, QuickWin, AiContentAlt, IssuesAlt, PageResult } from "@/types/scanner";

interface ScanData {
  id: string;
  url: string;
  domain: string;
  status: string;
  scores: ScanScores | null;
  summary: ScanSummary | null;
  pages: PageResult[];
  created_at: string;
  design_ai_analyzed_at: string | null;
  cost_estimate: CostEstimate | null;
  quick_wins: QuickWin[] | null;
  website_personality: string | null;
  visitor_experience: string | null;
  homepage_screenshot_url: string | null;
  screenshots: Record<string, { url: string }> | null;
  locale: string | null;
  ai_content_alt: AiContentAlt | null;
  issues_alt: IssuesAlt | null;
}

export default async function ScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("common.errors");

  const supabase = createServerClient();
  const { data: scan, error } = await supabase
    .from("scans")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error(`Scan page: DB error for id=${id}:`, error.message, error.code);
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">{t("dbError", { code: error.code ?? "" })}</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (!scan) {
    notFound();
  }

  const scanData = scan as ScanData;

  // If still scanning or processing, show loading
  if (scanData.status === "scanning" || scanData.status === "pending" || scanData.status === "processing") {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">{t("scanInProgress")}</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (!scanData.scores || !scanData.summary) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">{t("scanFailed")}</p>
        </main>
        <Footer />
      </div>
    );
  }

  // Swap AI content to the visitor's current locale when alt content is available.
  const currentLocale = await getLocale();
  const localized = pickLocalizedScan(scanData, currentLocale);

  // Collect all issues from all pages (after alt-locale overrides applied).
  const allIssues: Issue[] = localized.pages.flatMap((p) => p.issues || []);

  // Design analysis is pending when quick_done and background job hasn't finished yet
  const designAnalysisPending =
    scanData.status === "quick_done" &&
    scanData.design_ai_analyzed_at === null &&
    !allIssues.some((i) => i.id === "scan-error");

  return (
    <div className="min-h-screen flex flex-col bg-gray-50/30">
      <Header />
      <main className="flex-1">
        <ScanResults
          scanId={scanData.id}
          domain={scanData.domain}
          scanUrl={scanData.url}
          scores={scanData.scores}
          summary={localized.summary!}
          issues={allIssues}
          scannedAt={scanData.created_at}
          status={scanData.status as "quick_done" | "completed"}
          designAnalysisPending={designAnalysisPending}
          costEstimate={localized.cost_estimate}
          quickWins={localized.quick_wins}
          websitePersonality={localized.website_personality}
          visitorExperience={localized.visitor_experience}
          scanLocale={scanData.locale ?? "en"}
          needsReScanNotice={localized.needsReScanNotice}
          screenshotUrl={
            scanData.homepage_screenshot_url ??
            (scanData.screenshots ? Object.values(scanData.screenshots)[0]?.url ?? null : null)
          }
        />
      </main>
      <Footer />
    </div>
  );
}
