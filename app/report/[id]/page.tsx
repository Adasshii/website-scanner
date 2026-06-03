import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createServerClient } from "@/lib/supabase";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { FullReport } from "@/components/report/full-report";
import type { ScanScores, ScanSummary, PageResult, CostEstimate, QuickWin, ScreenshotInfo } from "@/types/scanner";

interface ScanData {
  id: string;
  url: string;
  domain: string;
  status: string;
  scores: ScanScores | null;
  summary: ScanSummary | null;
  pages: PageResult[];
  created_at: string;
  completed_at: string | null;
  cost_estimate: CostEstimate | null;
  quick_wins: QuickWin[] | null;
  website_personality: string | null;
  visitor_experience: string | null;
  screenshots: Record<string, ScreenshotInfo> | null;
  homepage_screenshot_url: string | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("metadata");
  const supabase = createServerClient();
  const { data: scan } = await supabase
    .from("scans")
    .select("domain, scores")
    .eq("id", id)
    .single();

  if (!scan?.scores) {
    return { title: t("reportFallbackTitle") };
  }

  const scores = scan.scores as ScanScores;
  return {
    title: t("reportTitle", { domain: scan.domain, overall: scores.overall }),
    description: t("reportDescription", {
      domain: scan.domain,
      accessibility: scores.accessibility,
      seo: scores.seo,
      content: scores.content,
      performance: scores.performance,
    }),
    openGraph: {
      title: t("reportOgTitle", { domain: scan.domain, overall: scores.overall }),
      description: t("reportOgDescription"),
    },
  };
}

export default async function ReportPage({
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

  if (error || !scan) {
    notFound();
  }

  const scanData = scan as ScanData;

  if (scanData.status === "scanning" || scanData.status === "pending" || scanData.status === "processing") {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">{t("reportInProgress")}</p>
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
          <p className="text-gray-500">{t("reportUnavailable")}</p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50/30">
      <Header />
      <main className="flex-1">
        <FullReport
          domain={scanData.domain}
          url={scanData.url}
          scores={scanData.scores}
          summary={scanData.summary}
          pages={scanData.pages || []}
          scannedAt={scanData.created_at}
          completedAt={scanData.completed_at}
          status={scanData.status as "quick_done" | "completed"}
          costEstimate={scanData.cost_estimate}
          quickWins={scanData.quick_wins}
          websitePersonality={scanData.website_personality}
          visitorExperience={scanData.visitor_experience}
          screenshots={scanData.screenshots}
          screenshotUrl={scanData.homepage_screenshot_url ?? null}
        />
      </main>
      <Footer />
    </div>
  );
}
