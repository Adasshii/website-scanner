import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { errorMessage, rejectIfNotAdmin } from "@/lib/atrium-admin";
import { listSuppressionsSince } from "@/lib/atrium-suppressions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Route 4 of the Atrium contract (atrium outreach spec, section 4.2).
export async function GET(request: NextRequest) {
  const denied = rejectIfNotAdmin(request);
  if (denied) return denied;

  const since = request.nextUrl.searchParams.get("since");
  if (!since || Number.isNaN(Date.parse(since))) {
    return NextResponse.json({ error: "since must be an ISO time" }, { status: 400 });
  }

  try {
    return NextResponse.json(await listSuppressionsSince(createServerClient(), since));
  } catch (e) {
    const detail = errorMessage(e);
    console.error("Admin atrium suppressions error:", detail);
    return NextResponse.json({ error: "Failed to read suppressions", detail }, { status: 500 });
  }
}
