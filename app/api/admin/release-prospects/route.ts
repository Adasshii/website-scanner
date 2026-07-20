import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { releaseWorstN } from "@/lib/triage-release";
import { DEFAULT_CUTOFF, RELEASE_CEILING } from "@/lib/triage-constants";

export const runtime = "nodejs";

// D-11: the admin-triggered release action. Reuses the exact x-admin-secret
// gate every other app/api/admin/* route uses (V4 Access Control) — no new
// or weaker auth path for this route.
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { cutoff?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // V5 Input Validation: reject malformed cutoff before any DB call.
  let cutoff = DEFAULT_CUTOFF;
  if (body.cutoff !== undefined) {
    const parsed = Number(body.cutoff);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      return NextResponse.json(
        { error: "cutoff must be a finite number between 0 and 100" },
        { status: 400 }
      );
    }
    cutoff = parsed;
  }

  try {
    const supabase = createServerClient();
    // TRI-09: the ceiling is always the RELEASE_CEILING constant — never
    // taken from the request body, so it cannot be client-overridden.
    const released = await releaseWorstN(supabase, { cutoff, ceiling: RELEASE_CEILING });
    return NextResponse.json({ released: released.length, ids: released.map((r) => r.id) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Admin release-prospects error:", msg);
    return NextResponse.json({ error: "Failed to release prospects", detail: msg }, { status: 500 });
  }
}
