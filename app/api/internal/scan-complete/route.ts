import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { sendReportReadyEmail, sendAdminNotificationEmail } from "@/lib/email";

export const runtime = "nodejs";

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
      .select("id, email, domain, scores, summary, status, sales_brief, locale")
      .eq("id", scanId)
      .single();

    if (error || !scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
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
