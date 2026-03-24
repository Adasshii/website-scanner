import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServerClient();

  // Fetch lead
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Fetch associated scan with all new fields
  const { data: scan } = await supabase
    .from("scans")
    .select("id, url, domain, status, scores, summary, pages, screenshots, cost_estimate, quick_wins, website_personality, sales_brief, created_at, completed_at")
    .eq("id", lead.scan_id)
    .single();

  // Fetch email events for this scan
  const { data: emailEvents } = await supabase
    .from("email_events")
    .select("*")
    .eq("scan_id", lead.scan_id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    lead,
    scan: scan || null,
    emailEvents: emailEvents || [],
  });
}
