// Local-only trigger for the queue drain (app/api/cron/drain-scan-queue),
// whose 10-minute Vercel Cron cadence is not available on the Hobby plan
// (see .planning/quick/260806-ntm-.../260806-ntm-CONTEXT.md). This file
// ships inside the production bundle but is dead code there — the guard
// below is the first statement of the handler and returns a bare 404
// before auth, body parsing, or any DB/child-process work (T-ntm-01). The
// second lock (x-admin-secret) mirrors app/api/admin/run-batch/route.ts
// verbatim, kept literal per-handler rather than factored into a shared
// helper (matches the existing project convention). Invoking the cron
// GET handler directly, rather than re-calling reconcileInFlightScans /
// claimNextScanBatch / dispatchClaimedProspects here, is deliberate: that
// route's reconcile-before-claim ordering is load-bearing (SCAN-03) and
// duplicating it would create a drift hazard this task is forbidden from
// introducing.
import { NextRequest, NextResponse } from "next/server";
import { GET as drainScanQueue } from "@/app/api/cron/drain-scan-queue/route";
import { acquirePipelineLock, releasePipelineLock } from "@/lib/pipeline-run";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse(null, { status: 404 });
  }

  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!acquirePipelineLock()) {
    return NextResponse.json(
      { error: "A pipeline run is already in progress" },
      { status: 409 }
    );
  }

  try {
    if (!process.env.CRON_SECRET) {
      return NextResponse.json(
        {
          error: "CRON_SECRET is not set in this local environment",
          detail: "Set CRON_SECRET in .env.local to use the Drain button.",
        },
        { status: 500 }
      );
    }

    const cronRequest = new NextRequest("http://localhost/api/cron/drain-scan-queue", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const result = await drainScanQueue(cronRequest);
    const body = await result.json();
    return NextResponse.json(body, { status: result.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin/pipeline/drain] error:", msg);
    return NextResponse.json({ error: "Drain failed", detail: msg }, { status: 500 });
  } finally {
    releasePipelineLock();
  }
}
