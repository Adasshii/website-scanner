import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requeueProspect } from "@/lib/scan-queue";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// D-05, SCAN-04: this is the only path from 'failed' back to 'queued'. It is
// human-triggered, and requeueProspect itself filters on
// scan_status = 'failed' at the database, so this route can never resurrect
// a prospect that is done or in flight.
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const id = body.id;
  if (typeof id !== "string" || id.length === 0 || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "id must be a valid UUID string" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    await requeueProspect(supabase, id);
    return NextResponse.json({ requeued: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Admin requeue-scan error:", msg);
    return NextResponse.json({ error: "Failed to requeue prospect", detail: msg }, { status: 500 });
  }
}
