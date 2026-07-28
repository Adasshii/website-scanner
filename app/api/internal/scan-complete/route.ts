import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { sendReportReadyEmail, sendAdminNotificationEmail } from "@/lib/email";
import { maybeGenerateDraftForProspectScan } from "@/lib/draft-on-scan-complete";

export const runtime = "nodejs";
// The scanner service aborts its own callback fetch after 10 seconds and
// logs a failure line on its side if this function hasn't responded by
// then — that is a separate budget on the CALLER's side and does not stop
// this function from finishing its own work. Do not read that log line as
// proof a draft failed to generate; maxDuration is this function's own
// (much longer) budget.
export const maxDuration = 60;

/**
 * Called by the scanner service after a full scan completes.
 * Sends the "report ready" email to the user and admin notification.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify the request comes from our scanner service
    const authHeader = request.headers.get("authorization");
    const expectedKey = process.env.SCANNER_API_KEY;

    if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { scanId } = await request.json();

    if (!scanId) {
      return NextResponse.json({ error: "scanId is required" }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data: scan, error } = await supabase
      .from("scans")
      .select("id, email, domain, scores, summary, status, sales_brief, locale, prospect_id, pages")
      .eq("id", scanId)
      .single();

    if (error || !scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    // Prospect branch (D-6-05): must run BEFORE the readiness guard below,
    // since every prospect scan row is inserted with no email address
    // (RESEARCH Pitfall 2) — that guard would otherwise 400 every prospect
    // scan before it ever reached draft generation. Awaited inline, not
    // deferred past the response: Vercel's execution environment can freeze
    // once a response has been returned, unlike the always-on Railway
    // service. Wrapped so a rejected promise can never escape and fail this
    // webhook (T-06-BLAST) — maybeGenerateDraftForProspectScan itself never
    // throws, but this is defense in depth.
    if (scan.prospect_id) {
      const result = await maybeGenerateDraftForProspectScan(supabase, scan).catch((err) => {
        console.error("[draft] unexpected throw from maybeGenerateDraftForProspectScan:", err);
        return { outcome: "failed" as const, reason: "unexpected-throw" };
      });
      return NextResponse.json({ draft: result });
    }

    if (scan.status !== "completed" || !scan.email || !scan.scores || !scan.summary) {
      return NextResponse.json({ error: "Scan not ready or no email" }, { status: 400 });
    }

    // Send report-ready email to the user (in their original locale)
    await sendReportReadyEmail({
      to: scan.email,
      domain: scan.domain,
      scanId: scan.id,
      overallScore: scan.scores.overall,
      totalPages: scan.summary.totalPages,
      totalIssues: scan.summary.totalIssues,
      criticalIssues: scan.summary.criticalIssues,
      locale: scan.locale ?? "en",
    });

    // Send admin notification email
    if (process.env.ADMIN_EMAIL) {
      // Look up the lead to get the lead ID for admin link
      const { data: lead } = await supabase
        .from("leads")
        .select("id")
        .eq("scan_id", scanId)
        .single();

      await sendAdminNotificationEmail({
        leadEmail: scan.email,
        domain: scan.domain,
        scanId: scan.id,
        leadId: lead?.id || scanId,
        overallScore: scan.scores.overall,
        topIssues: scan.summary.topIssues || [],
        salesBrief: scan.sales_brief || "Sales brief not available — AI generation may have been skipped.",
      }).catch((err) => {
        console.error("Admin notification failed:", err);
      });
    }

    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error("scan-complete callback error:", error);
    return NextResponse.json(
      { error: "Failed to send report email" },
      { status: 500 }
    );
  }
}
