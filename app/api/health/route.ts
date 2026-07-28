import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

const REQUIRED_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_SECRET",
  "SCANNER_SERVICE_URL",
  "SCANNER_API_KEY",
  "RESEND_API_KEY",
  "GEMINI_API_KEY",
];

export async function GET() {
  const env: Record<string, boolean> = {};
  for (const v of REQUIRED_VARS) {
    env[v] = !!process.env[v];
  }

  let db: { ok: boolean; error?: string } = { ok: false };
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from("scans").select("id", { count: "exact", head: true });
    db = error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    db = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const missingVars = REQUIRED_VARS.filter((v) => !env[v]);
  const status = !db.ok ? "down" : missingVars.length > 0 ? "degraded" : "ok";

  return NextResponse.json({ status, env, db }, { status: status === "down" ? 503 : 200 });
}
