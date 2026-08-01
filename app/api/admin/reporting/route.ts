import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getReportingData } from "@/lib/reporting-aggregates";

export const runtime = "nodejs";

function serializeError(e: unknown): string {
  // Supabase throws plain PostgrestError objects (not `instanceof Error`), so
  // a bare String(e) serializes to "[object Object]". Prefer `.message` when
  // present, falling back to JSON.stringify for anything else.
  return e instanceof Error
    ? e.message
    : e && typeof e === "object" && "message" in e
    ? String((e as { message: unknown }).message)
    : JSON.stringify(e);
}

/**
 * GET /api/admin/reporting — read-only funnel + sent-gate payload for the
 * 5th admin tab (D-7-11). Guarded even though it is read-only: it returns
 * prospect counts (T-07-01).
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase: ReturnType<typeof createServerClient>;
  try {
    supabase = createServerClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Admin reporting: failed to create Supabase client:", msg);
    return NextResponse.json({ error: "Database client error", detail: msg }, { status: 500 });
  }

  try {
    const payload = await getReportingData(supabase);
    return NextResponse.json(payload);
  } catch (e) {
    const msg = serializeError(e);
    console.error("Admin reporting error:", msg);
    return NextResponse.json({ error: "Failed to fetch reporting data", detail: msg }, { status: 500 });
  }
}
