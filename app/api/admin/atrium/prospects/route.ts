import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { errorMessage, rejectIfNotAdmin } from "@/lib/atrium-admin";
import { parseRegisterBody, registerAtriumProspect } from "@/lib/atrium-prospects";
import { buildOptOutLine, buildUnsubscribeUrl } from "@/lib/opt-out-link";

export const runtime = "nodejs";

// Route 1 of the Atrium contract (atrium outreach spec, section 4.2).
export async function POST(request: NextRequest) {
  const denied = rejectIfNotAdmin(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = parseRegisterBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await registerAtriumProspect(createServerClient(), parsed.value);
    // Contract problem 1 (resolved): never take over a scanner prospect.
    if (result.kind === "scanner_owned") {
      return NextResponse.json({ error: "scanner-owned" }, { status: 409 });
    }
    // Contract problem 8: an opted-out address or domain is never registered.
    if (result.kind === "suppressed") {
      return NextResponse.json({ error: "suppressed" }, { status: 409 });
    }
    const { prospectId } = result;
    return NextResponse.json({
      prospectId,
      optOutUrl: buildUnsubscribeUrl(prospectId),
      optOutLineNl: buildOptOutLine(prospectId, "nl"),
    });
  } catch (e) {
    const detail = errorMessage(e);
    console.error("Admin atrium register error:", detail);
    return NextResponse.json({ error: "Failed to register prospect", detail }, { status: 500 });
  }
}
