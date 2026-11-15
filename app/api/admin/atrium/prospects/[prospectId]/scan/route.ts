import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { errorMessage, isUuid, rejectIfNotAdmin } from "@/lib/atrium-admin";
import { startAtriumScan } from "@/lib/atrium-scan";

export const runtime = "nodejs";
// URL check, robots.txt fetch and the 30-second accept call fit well inside this.
export const maxDuration = 60;

// Route 2 of the Atrium contract (atrium outreach spec, section 4.2).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ prospectId: string }> }
) {
  const denied = rejectIfNotAdmin(request);
  if (denied) return denied;

  const { prospectId } = await params;
  if (!isUuid(prospectId)) return NextResponse.json({ error: "prospectId must be a UUID" }, { status: 400 });

  try {
    const result = await startAtriumScan(createServerClient(), prospectId);
    if (result.kind === "started") return NextResponse.json({ scanId: result.scanId }, { status: 202 });
    if (result.kind === "not_found") return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
    if (result.kind === "not_atrium") return NextResponse.json({ error: "not-atrium" }, { status: 409 });
    if (result.kind === "suppressed") return NextResponse.json({ error: "suppressed" }, { status: 409 });
    if (result.kind === "scan_running") {
      return NextResponse.json({ error: "scan-running", scanId: result.scanId }, { status: 409 });
    }
    if (result.kind === "at_capacity") {
      return NextResponse.json({ error: "at_capacity" }, { status: 503, headers: { "Retry-After": "120" } });
    }
    return NextResponse.json({ error: "Scan service error", detail: result.reason }, { status: 502 });
  } catch (e) {
    const detail = errorMessage(e);
    console.error("Admin atrium start-scan error:", detail);
    return NextResponse.json({ error: "Failed to start scan", detail }, { status: 500 });
  }
}
