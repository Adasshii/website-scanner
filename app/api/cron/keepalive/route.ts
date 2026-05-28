import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Cron job: Keep Supabase active to prevent free-tier auto-pause.
 * Runs weekly on Monday at 09:00 UTC via Vercel cron.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from("scans")
    .select("id", { count: "exact", head: true });

  if (error) {
    console.error("Keepalive cron: DB ping failed:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  console.log("Keepalive cron: DB ping successful at", new Date().toISOString());
  return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
}
