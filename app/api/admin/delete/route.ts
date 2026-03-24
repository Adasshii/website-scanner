import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, id } = await request.json();

  if (!type || !id) {
    return NextResponse.json({ error: "type and id are required" }, { status: 400 });
  }

  const supabase = createServerClient();

  if (type === "scan") {
    // Delete related leads and email_events first
    const { data: leads } = await supabase
      .from("leads")
      .select("id")
      .eq("scan_id", id);

    if (leads && leads.length > 0) {
      await supabase.from("leads").delete().eq("scan_id", id);
    }

    await supabase.from("email_events").delete().eq("scan_id", id);
    const { error } = await supabase.from("scans").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (type === "lead") {
    const { error } = await supabase.from("leads").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
