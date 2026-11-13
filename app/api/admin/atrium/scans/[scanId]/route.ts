import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { errorMessage, isUuid, rejectIfNotAdmin } from "@/lib/atrium-admin";
import { getAtriumScanStatus } from "@/lib/atrium-scan-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Route 3 of the Atrium contract (atrium outreach spec, section 4.2).
export async function GET(request: NextRequest, { params }: { params: Promise<{ scanId: string }> }) {
  const denied = rejectIfNotAdmin(request);
  if (denied) return denied;

  const { scanId } = await params;
  if (!isUuid(scanId)) return NextResponse.json({ error: "scanId must be a UUID" }, { status: 400 });

  try {
    const body = await getAtriumScanStatus(createServerClient(), scanId);
    if (!body) return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    return NextResponse.json(body);
  } catch (e) {
    const detail = errorMessage(e);
    console.error("Admin atrium scan-status error:", detail);
    return NextResponse.json({ error: "Failed to read scan", detail }, { status: 500 });
  }
}
