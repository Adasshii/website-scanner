import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { createServerClient } from "@/lib/supabase";
import { normalizeDomain } from "@/lib/domain-normalize";
import { writeSuppression } from "@/lib/suppression";

export const runtime = "nodejs";

const RESEND_EVENT_MAP: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.delivery_delayed": "sent", // keep as sent, don't downgrade
};

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook/resend] RESEND_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  try {
    // Get raw body and headers for signature verification
    const body = await request.text();
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
    }

    // Verify the webhook signature
    const wh = new Webhook(webhookSecret);
    const payload = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as { type: string; data: { email_id: string } };

    const eventType = payload.type;
    const resendEmailId = payload.data?.email_id;

    if (!resendEmailId) {
      return NextResponse.json({ error: "Missing email_id in payload" }, { status: 400 });
    }

    const newStatus = RESEND_EVENT_MAP[eventType];
    if (!newStatus) {
      // Unknown event type — acknowledge but don't process
      return NextResponse.json({ received: true, skipped: true });
    }

    // Update the email_events row
    const supabase = createServerClient();
    const { data: updated, error } = await supabase
      .from("email_events")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("resend_email_id", resendEmailId)
      .select("email")
      .maybeSingle(); // read the recipient back — payload never carries it (Pitfall 2)

    if (error) {
      console.error("[webhook/resend] Failed to update email event:", error);
    }

    // CMP-07/D-05: hard bounce and spam complaint both suppress domain-wide,
    // one rule one code path. Wrapped so a failure here never changes the
    // webhook's existing 200 acknowledgement behaviour (T-02-19).
    if (updated?.email && (newStatus === "bounced" || newStatus === "complained")) {
      try {
        const domain = normalizeDomain(updated.email);
        await writeSuppression(supabase, {
          email: updated.email.toLowerCase(),
          domain,
          reason: newStatus,
          source: "resend_webhook",
        });
      } catch (suppressError) {
        console.error("[webhook/resend] auto-suppress failed", suppressError);
      }
    }

    return NextResponse.json({ received: true, status: newStatus });
  } catch (error) {
    console.error("[webhook/resend] Webhook processing failed:", error);
    return NextResponse.json({ error: "Webhook verification failed" }, { status: 400 });
  }
}
