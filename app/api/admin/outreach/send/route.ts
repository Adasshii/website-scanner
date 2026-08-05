import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { evaluateSendGates } from "@/lib/send-gate";

export const runtime = "nodejs";

type SendActionBody = { id?: unknown; action?: unknown };

/**
 * POST /api/admin/outreach/send — the only route that can reach the send
 * gate. `action: "prepare"` runs every gate in lib/send-gate.ts and, on
 * success, stamps outreach_messages.prepared_at. A gate refusal is a state
 * conflict (409), not a malformed request (400): the request itself was
 * well-formed, the state it addresses just refuses to proceed.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SendActionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messageId = body.id;
  const action = body.action;
  if (typeof messageId !== "string" || !messageId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (action !== "prepare") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  let supabase: ReturnType<typeof createServerClient>;
  try {
    supabase = createServerClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Admin outreach send: failed to create Supabase client:", msg);
    return NextResponse.json({ error: "Database client error", detail: msg }, { status: 500 });
  }

  try {
    const result = await evaluateSendGates(supabase, messageId);
    if (!result.ok) {
      return NextResponse.json({ ok: false, refusal: result.refusal, detail: result.detail }, { status: 409 });
    }

    const { error: stampError } = await supabase
      .from("outreach_messages")
      .update({ prepared_at: new Date().toISOString() })
      .eq("id", messageId);
    if (stampError) throw stampError;

    return NextResponse.json({ ok: true, refusal: null }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Admin outreach send error:", msg);
    return NextResponse.json({ error: "Failed to prepare send", detail: msg }, { status: 500 });
  }
}
