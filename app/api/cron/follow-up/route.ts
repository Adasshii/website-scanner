import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { sendFollowUpEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron job: Send follow-up emails 3 days after report delivery.
 * Runs daily at 10:00 UTC via Vercel cron.
 *
 * Guardrails:
 * - Max 1 follow-up per lead (checked via existing follow_up email_event)
 * - Skip leads who booked an appointment via Fillout (booked_at IS NOT NULL)
 * - Do NOT skip leads who merely opened/clicked the report email
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Find report_ready emails that were delivered 3+ days ago
    const { data: candidates } = await supabase
      .from("email_events")
      .select("scan_id, email")
      .eq("email_type", "report_ready")
      .in("status", ["delivered", "opened", "clicked"])
      .lte("created_at", threeDaysAgo);

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ sent: 0, message: "No follow-ups needed" });
    }

    // Filter out those that already received a follow-up
    const scanIds = candidates.map((c) => c.scan_id).filter(Boolean);
    const { data: existingFollowUps } = await supabase
      .from("email_events")
      .select("scan_id")
      .eq("email_type", "follow_up")
      .in("scan_id", scanIds);

    const alreadySent = new Set((existingFollowUps || []).map((e) => e.scan_id));
    const notYetSent = candidates.filter(
      (c) => c.scan_id && !alreadySent.has(c.scan_id)
    );

    // Filter out leads who already booked an appointment via Fillout
    const notYetSentScanIds = notYetSent.map((c) => c.scan_id).filter(Boolean) as string[];
    let bookedScanIds = new Set<string>();

    if (notYetSentScanIds.length > 0) {
      const { data: bookedLeads } = await supabase
        .from("leads")
        .select("scan_id")
        .in("scan_id", notYetSentScanIds)
        .not("booked_at", "is", null);

      bookedScanIds = new Set((bookedLeads || []).map((l) => l.scan_id));
    }

    const toSend = notYetSent.filter(
      (c) => c.scan_id && !bookedScanIds.has(c.scan_id)
    );

    // Limit to 20 per run to avoid timeouts
    const batch = toSend.slice(0, 20);
    let sentCount = 0;

    for (const candidate of batch) {
      // Fetch the scan's quick wins and domain
      const { data: scan } = await supabase
        .from("scans")
        .select("domain, quick_wins")
        .eq("id", candidate.scan_id)
        .single();

      if (!scan?.quick_wins || scan.quick_wins.length === 0) continue;

      await sendFollowUpEmail({
        to: candidate.email,
        domain: scan.domain,
        scanId: candidate.scan_id!,
        topQuickWin: scan.quick_wins[0],
      });

      sentCount++;
    }

    return NextResponse.json({
      sent: sentCount,
      candidates: toSend.length,
      message: `Sent ${sentCount} follow-up emails`,
    });
  } catch (error) {
    console.error("[cron/follow-up] Error:", error);
    return NextResponse.json(
      { error: "Follow-up cron failed" },
      { status: 500 }
    );
  }
}
