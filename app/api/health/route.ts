import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Must be evaluated per request, never prerendered. This handler takes no
 * request argument and calls no dynamic functions, so Next.js would otherwise
 * statically optimize it at build time — freezing the env snapshot and the DB
 * ping into the build output. A health check that reports build-time state is
 * actively misleading: it answers "was this set when we built" when the caller
 * is asking "can the running app see this now". Found 2026-07-30, when a
 * prerendered /api/health reported GEMINI_API_KEY absent and could not
 * distinguish a genuinely unset variable from a stale build snapshot.
 */
export const dynamic = "force-dynamic";

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

  // no-store as well as force-dynamic: the CDN was serving this from cache with a
  // climbing age, so a caller polling after a config change kept reading a stale answer.
  return NextResponse.json(
    { status, env, db },
    {
      status: status === "down" ? 503 : 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
