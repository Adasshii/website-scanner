import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { attributeBookingToProspect, type BookingAttribution } from "@/lib/booking-attribution";

export const runtime = "nodejs";

/**
 * Fillout webhook: marks leads as "booked" when they submit an appointment form.
 * This prevents the follow-up cron from emailing leads who already booked.
 *
 * Fillout webhook URL (set in Fillout dashboard):
 *   https://scan.adashi.io/api/webhooks/fillout?secret=YOUR_FILLOUT_WEBHOOK_SECRET
 */
export async function POST(request: NextRequest) {
  // Verify secret via query parameter
  const secret = request.nextUrl.searchParams.get("secret");
  if (!process.env.FILLOUT_WEBHOOK_SECRET || secret !== process.env.FILLOUT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();

    // Fillout webhook payload structure:
    // { formId, submissionId, questions: [{ id, name, type, value }, ...] }
    const questions: Array<{ id: string; name: string; type: string; value: unknown }> =
      payload.questions || [];

    // Find the email field — look for type "EmailAddress" or field name containing "email"
    const emailField = questions.find(
      (q) =>
        q.type === "EmailAddress" ||
        (typeof q.name === "string" && q.name.toLowerCase().includes("email"))
    );

    const email = typeof emailField?.value === "string" ? emailField.value.trim().toLowerCase() : null;

    if (!email) {
      console.warn("[webhook/fillout] No email found in submission:", payload.submissionId);
      return NextResponse.json({ received: true, matched: false, reason: "no_email" });
    }

    // Mark all matching leads as booked
    const supabase = createServerClient();
    const now = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from("leads")
      .update({ booked_at: now })
      .eq("email", email)
      .is("booked_at", null)
      .select("id, email, domain");

    if (error) {
      console.error("[webhook/fillout] Failed to update leads:", error);
      return NextResponse.json({ error: "Database update failed" }, { status: 500 });
    }

    const matchCount = updated?.length || 0;
    console.log(`[webhook/fillout] Marked ${matchCount} lead(s) as booked for ${email}`);

    // D-7-09: prospect attribution is a guarded post-step. The leads path
    // above has already run and returned exactly as it did before this
    // change; a failure here is logged and swallowed, never allowed to turn
    // this 200 into a 500 (which would make Fillout retry a submission that
    // already landed).
    let attribution: BookingAttribution = { outcome: "no_match", prospectId: null, matchMethod: null };
    try {
      attribution = await attributeBookingToProspect(supabase, email, now);
    } catch (attributionError) {
      console.error("[webhook/fillout] Prospect attribution failed (non-fatal):", attributionError);
      attribution = { outcome: "failed", prospectId: null, matchMethod: null };
    }
    console.log(
      `[webhook/fillout] Prospect attribution outcome=${attribution.outcome} prospectId=${attribution.prospectId ?? "none"}`
    );

    return NextResponse.json({
      received: true,
      matched: matchCount > 0,
      leadsUpdated: matchCount,
      prospectAttribution: attribution.outcome,
    });
  } catch (error) {
    console.error("[webhook/fillout] Webhook processing failed:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 400 });
  }
}
