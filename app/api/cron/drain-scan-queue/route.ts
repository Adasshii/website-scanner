import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { claimNextScanBatch, reconcileInFlightScans } from "@/lib/scan-queue";
import { dispatchClaimedProspects } from "@/lib/bulk-scan-dispatch";
import { BULK_BATCH_SIZE } from "@/lib/bulk-scan-constants";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron job: the paced drain tick for the bulk scan queue (Phase 4).
 * Runs every 10 minutes via Vercel cron.
 *
 * Takes no input at all — the batch size comes from BULK_BATCH_SIZE, never
 * from the request, and the claim_next_scan_batch RPC also clamps its own
 * argument (defence in depth). Order matters: reconcile before claim, so
 * capacity freed by finished scans is visible before new work is claimed
 * (SCAN-03).
 *
 * full-async dispatch is fire-and-forget: this route never awaits a scan
 * finishing, so a tick's duration is bounded by robots pre-flights and
 * dispatch spacing, not by scan time (Pitfall 4).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServerClient();

    const reconciled = await reconcileInFlightScans(supabase);
    const claimed = await claimNextScanBatch(supabase, BULK_BATCH_SIZE);
    const outcomes = claimed.length > 0 ? await dispatchClaimedProspects(supabase, claimed) : [];

    const dispatched = outcomes.filter((o) => o.dispatched).length;
    const refused = outcomes.filter((o) => !o.dispatched && o.reason === "at_capacity").length;
    const skipped = outcomes.filter((o) => !o.dispatched && o.reason !== "at_capacity").length;

    // Aggregate counts only (T-04-15) — no prospect domains, URLs or ids.
    return NextResponse.json({
      reconciled: reconciled.done.length + reconciled.failed.length,
      claimed: claimed.length,
      dispatched,
      refused,
      skipped,
    });
  } catch (error) {
    console.error("[cron/drain-scan-queue] Error:", error);
    return NextResponse.json({ error: "Drain cron failed" }, { status: 500 });
  }
}
