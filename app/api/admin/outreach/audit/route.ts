import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getSendAudit } from "@/lib/send-audit";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/outreach/audit?prospectId= — the CMP-12 read: every stored
 * fact about every send to a given prospect, from lib/send-audit.ts's
 * getSendAudit() alone. This handler is read-only: it contains no insert,
 * update, or delete, and it resolves nothing beyond validating the query
 * param and forwarding it.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prospectId = request.nextUrl.searchParams.get("prospectId");
  if (!prospectId || !UUID_PATTERN.test(prospectId)) {
    return NextResponse.json({ error: "prospectId is required and must be a UUID" }, { status: 400 });
  }

  let supabase: ReturnType<typeof createServerClient>;
  try {
    supabase = createServerClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Admin outreach audit: failed to create Supabase client:", msg);
    return NextResponse.json({ error: "Database client error", detail: msg }, { status: 500 });
  }

  try {
    const entries = await getSendAudit(supabase, prospectId);
    return NextResponse.json({ entries }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Admin outreach audit error:", msg);
    return NextResponse.json({ error: "Failed to fetch send audit", detail: msg }, { status: 500 });
  }
}
