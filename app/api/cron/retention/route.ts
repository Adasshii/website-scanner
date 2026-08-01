import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { runRetention } from "@/lib/retention";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron job: the retention job's scheduled entry point (CMP-13/14/15).
 * Runs monthly via Vercel cron (D-7-20) — data expiry does not need day
 * resolution, and keeping this off the existing crons means a retention
 * failure can never take out the scan drain.
 *
 * The handler reads only the `authorization` header. Mode and window come
 * from lib/retention-constants.ts — this route passes no options to
 * runRetention(). A caller-chosen mode would turn "holds the cron secret"
 * into "can trigger a destructive pass on demand", which is a materially
 * larger capability than triggering the scheduled job.
 *
 * Vercel Hobby platform behaviours (07-RESEARCH.md § Priority Open
 * Question), invisible from the code below: scheduling precision is
 * per-hour with up to 59 minutes of drift, and delivery is best-effort and
 * may duplicate or skip an invocation. This job is written to be idempotent
 * by construction rather than locked — re-running a pass against rows it
 * already processed selects nothing further, since a processed row's clock
 * no longer sits before the cutoff.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServerClient();
    const result = await runRetention(supabase);

    // Aggregate counts, mode, window and cutoff only — no domain, email,
    // URL or row id, matching the aggregate-only convention
    // app/api/cron/drain-scan-queue/route.ts records at its own line 44.
    console.log(
      `[cron/retention] mode=${result.mode} months=${result.months} cutoff=${result.cutoff} ` +
        `candidates=${result.candidates} expiring=${result.expiring}`
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("[cron/retention] Error:", error);
    return NextResponse.json({ error: "Retention cron failed" }, { status: 500 });
  }
}
