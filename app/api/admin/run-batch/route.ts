import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { armBatch } from "@/lib/scan-queue";
import { BULK_ARM_CEILING } from "@/lib/bulk-scan-constants";

export const runtime = "nodejs";

// D-07: this arming write is what makes the human gate structural. The
// drain (app/api/cron/drain-scan-queue) only claims rows whose scan_status
// is 'queued', so a prospect released by Phase 3 but never armed here is
// never scanned. A pure cron drain would let a mis-set cutoff quietly turn
// into 20 real scans with nobody in the loop.
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { ceiling?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // The server owns the ceiling — BULK_ARM_CEILING, never taken from the
  // request body except as an optional downward clamp (never upward).
  let ceiling = BULK_ARM_CEILING;
  if (body.ceiling !== undefined) {
    const parsed = Number(body.ceiling);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > BULK_ARM_CEILING) {
      return NextResponse.json(
        { error: `ceiling must be a finite number between 1 and ${BULK_ARM_CEILING}` },
        { status: 400 }
      );
    }
    ceiling = parsed;
  }

  try {
    const supabase = createServerClient();
    const armed = await armBatch(supabase, { ceiling });
    return NextResponse.json({ armed: armed.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Admin run-batch error:", msg);
    return NextResponse.json({ error: "Failed to arm batch", detail: msg }, { status: 500 });
  }
}
