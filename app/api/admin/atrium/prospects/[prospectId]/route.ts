import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { errorMessage, isUuid, rejectIfNotAdmin } from "@/lib/atrium-admin";
import { releaseAtriumProspect } from "@/lib/atrium-prospects";

export const runtime = "nodejs";

// Route 5 of the Atrium contract (atrium outreach spec, section 4.2). The
// bulk release-prospects route cannot do this: it releases the worst N.
//
// HARD PRECONDITION: Atrium calls this only for a lead it never emailed
// (Plan B enforces it). The scanner cannot know about Atrium's sends, so it
// cannot check this itself. Deleting an emailed lead would break the opt-out
// link in that email, because the link resolves the prospect row.
//
// Idempotent: an id that no longer exists returns 204, so a retry after a
// lost response is safe.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ prospectId: string }> }
) {
  const denied = rejectIfNotAdmin(request);
  if (denied) return denied;

  const { prospectId } = await params;
  if (!isUuid(prospectId)) return NextResponse.json({ error: "prospectId must be a UUID" }, { status: 400 });

  try {
    const result = await releaseAtriumProspect(createServerClient(), prospectId);
    if (result === "not_atrium") return NextResponse.json({ error: "not-atrium" }, { status: 409 });
    // "released" and "not_found" both mean the row is gone.
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const detail = errorMessage(e);
    console.error("Admin atrium release error:", detail);
    return NextResponse.json({ error: "Failed to release prospect", detail }, { status: 500 });
  }
}
