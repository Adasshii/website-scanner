import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  listOutreachDrafts,
  applyDraftEdit,
  approveDraft,
  rejectDraft,
  regenerateDraft,
  generateDraftForProspect,
  type OutreachFilter,
} from "@/lib/outreach-queue";

export const runtime = "nodejs";

const KNOWN_FILTERS: OutreachFilter[] = ["pending", "approved", "rejected", "sent"];

function serializeError(e: unknown): string {
  // Supabase throws plain PostgrestError objects (not `instanceof Error`), so
  // a bare String(e) serializes to "[object Object]". Prefer `.message` when
  // present, falling back to JSON.stringify for anything else.
  return e instanceof Error
    ? e.message
    : e && typeof e === "object" && "message" in e
    ? String((e as { message: unknown }).message)
    : JSON.stringify(e);
}

/**
 * GET /api/admin/outreach?status=pending|approved|rejected|sent — defaults
 * to pending (D-6-04) when the param is absent or unrecognised. `sent`
 * joined the other three in Phase 8 (08-02) alongside OutreachFilter.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requested = request.nextUrl.searchParams.get("status");
  const filter: OutreachFilter = KNOWN_FILTERS.includes(requested as OutreachFilter)
    ? (requested as OutreachFilter)
    : "pending";

  let supabase: ReturnType<typeof createServerClient>;
  try {
    supabase = createServerClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Admin outreach: failed to create Supabase client:", msg);
    return NextResponse.json({ error: "Database client error", detail: msg }, { status: 500 });
  }

  try {
    const rows = await listOutreachDrafts(supabase, filter);
    return NextResponse.json({ rows });
  } catch (e) {
    const msg = serializeError(e);
    console.error("Admin outreach error:", msg);
    return NextResponse.json({ error: "Failed to fetch drafts", detail: msg }, { status: 500 });
  }
}

type PatchAction = "edit" | "approve" | "reject" | "regenerate";
const KNOWN_ACTIONS: PatchAction[] = ["edit", "approve", "reject", "regenerate"];

/**
 * PATCH /api/admin/outreach — body carries a single message id and one
 * action. Every action addresses exactly one record; there is no bulk
 * variant (QUE-05, D-6-R1) — do not add one.
 */
export async function PATCH(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: unknown; action?: unknown; subject?: unknown; body?: unknown };
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
  if (typeof action !== "string" || !KNOWN_ACTIONS.includes(action as PatchAction)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  let supabase: ReturnType<typeof createServerClient>;
  try {
    supabase = createServerClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Admin outreach: failed to create Supabase client:", msg);
    return NextResponse.json({ error: "Database client error", detail: msg }, { status: 500 });
  }

  try {
    switch (action as PatchAction) {
      case "edit": {
        if (typeof body.subject !== "string" || typeof body.body !== "string") {
          return NextResponse.json({ error: "subject and body are required for edit" }, { status: 400 });
        }
        const result = await applyDraftEdit(supabase, messageId, { subject: body.subject, body: body.body });
        return NextResponse.json(result, { status: result.ok ? 200 : 400 });
      }
      case "approve": {
        const result = await approveDraft(supabase, messageId);
        return NextResponse.json(result, { status: result.ok ? 200 : 400 });
      }
      case "reject": {
        const result = await rejectDraft(supabase, messageId);
        return NextResponse.json(result, { status: result.ok ? 200 : 400 });
      }
      case "regenerate": {
        const result = await regenerateDraft(supabase, messageId);
        return NextResponse.json(result, { status: result.ok ? 200 : 400 });
      }
    }
  } catch (e) {
    const msg = serializeError(e);
    console.error("Admin outreach PATCH error:", msg);
    return NextResponse.json({ error: "Failed to update draft", detail: msg }, { status: 500 });
  }
}

/**
 * POST /api/admin/outreach — body carries a single prospect id and calls
 * generateDraftForProspect(). The manual generate entry point the Shortlist
 * calls in 06-08 (named-person rows, and recovery from a silently failed
 * automatic generation).
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { prospectId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prospectId = body.prospectId;
  if (typeof prospectId !== "string" || !prospectId) {
    return NextResponse.json({ error: "prospectId is required" }, { status: 400 });
  }

  let supabase: ReturnType<typeof createServerClient>;
  try {
    supabase = createServerClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Admin outreach: failed to create Supabase client:", msg);
    return NextResponse.json({ error: "Database client error", detail: msg }, { status: 500 });
  }

  try {
    const result = await generateDraftForProspect(supabase, prospectId);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    const msg = serializeError(e);
    console.error("Admin outreach POST error:", msg);
    return NextResponse.json({ error: "Failed to generate draft", detail: msg }, { status: 500 });
  }
}
