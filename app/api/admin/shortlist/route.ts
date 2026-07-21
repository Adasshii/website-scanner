import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getShortlist } from "@/lib/triage-candidates";

export const runtime = "nodejs";

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
    console.error("Admin shortlist: failed to create Supabase client:", msg);
    return NextResponse.json({ error: "Database client error", detail: msg }, { status: 500 });
  }

  try {
    const rows = await getShortlist(supabase);
    // Worst-first: gated rows always on top, then lowest score first (TRI-07).
    const sorted = [...rows].sort((a, b) => {
      if (a.triage_score.gated !== b.triage_score.gated) {
        return a.triage_score.gated ? -1 : 1;
      }
      return a.triage_score.score - b.triage_score.score;
    });
    return NextResponse.json({ rows: sorted });
  } catch (e) {
    // Supabase throws plain PostgrestError objects (not `instanceof Error`),
    // so a bare String(e) serializes to "[object Object]". Prefer `.message`
    // when present, falling back to JSON.stringify for anything else.
    const msg =
      e instanceof Error
        ? e.message
        : e && typeof e === "object" && "message" in e
        ? String((e as { message: unknown }).message)
        : JSON.stringify(e);
    console.error("Admin shortlist error:", msg);
    return NextResponse.json({ error: "Failed to fetch shortlist", detail: msg }, { status: 500 });
  }
}
