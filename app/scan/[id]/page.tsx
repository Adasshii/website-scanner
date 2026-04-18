import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ScanResults } from "@/components/scan/scan-results";
import type { ScanScores, Issue, ScanSummary } from "@/types/scanner";

interface ScanData {
  id: string;
  url: string;
  domain: string;
  status: string;
  scores: ScanScores | null;
  summary: ScanSummary | null;
  pages: Array<{ issues: Issue[]; scores: ScanScores }>;
  created_at: string;
  design_ai_analyzed_at: string | null;
}

export default async function ScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  // If still scanning or processing, show loading
  if (scanData.status === "scanning" || scanData.status === "pending" || scanData.status === "processing") {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">Scan in progress...</p>
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
          <p className="text-gray-500">Scan failed. Please try again.</p>
        </main>
        <Footer />
      </div>
    );
  }

  // Collect all issues from all pages
  const allIssues: Issue[] = scanData.pages?.flatMap(
    (p: { issues: Issue[] }) => p.issues || []
  ) || [];

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
          scores={scanData.scores}
          summary={scanData.summary}
          issues={allIssues}
          scannedAt={scanData.created_at}
          status={scanData.status as "quick_done" | "completed"}
          designAnalysisPending={designAnalysisPending}
        />
      </main>
      <Footer />
    </div>
  );
}
