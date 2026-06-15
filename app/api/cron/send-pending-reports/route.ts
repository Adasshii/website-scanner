import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { sendReportReadyEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Safety-net cron: send report-ready emails for completed scans
 * that never triggered the callback (e.g. Railway restart, network timeout).
 *
 * Runs hourly. Only processes scans completed in the last 24 hours
 * to avoid spamming old leads.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    // Find completed scans with an email but no report_ready event
    const { data: completedScans } = await supabase
      .from("scans")
      .select("id, email, domain, scores, summary, locale")
      .eq("status", "completed")
      .not("email", "is", null)
      .not("scores", "is", null)
      .not("summary", "is", null)
      .gte("completed_at", oneDayAgo);

    if (!completedScans || completedScans.length === 0) {
      return NextResponse.json({ sent: 0, message: "No pending reports" });
    }

    // Filter out scans that already have a report_ready email event
    const scanIds = completedScans.map((s) => s.id);
    const { data: existingEvents } = await supabase
      .from("email_events")
      .select("scan_id")
      .eq("email_type", "report_ready")
      .in("scan_id", scanIds);

    const alreadySent = new Set((existingEvents || []).map((e) => e.scan_id));
    const pending = completedScans.filter((s) => !alreadySent.has(s.id));

    if (pending.length === 0) {
      return NextResponse.json({ sent: 0, message: "All reports already sent" });
    }

    // Limit to 10 per run to stay within maxDuration
    const batch = pending.slice(0, 10);
    let sentCount = 0;

    for (const scan of batch) {
      if (!scan.email || !scan.scores || !scan.summary) continue;

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

      sentCount++;
    }

    return NextResponse.json({
      sent: sentCount,
      pending: pending.length,
      message: `Sent ${sentCount} pending report emails`,
    });
  } catch (error) {
    console.error("[cron/send-pending-reports] Error:", error);
    return NextResponse.json(
      { error: "Pending reports cron failed" },
      { status: 500 }
    );
  }
}
