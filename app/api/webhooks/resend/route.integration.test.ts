/**
 * Integration suite for POST /api/webhooks/resend — CMP-07 auto-suppression
 * on Svix-verified email.bounced / email.complained events, asserted against
 * a real Postgres with migrations 001-015 applied.
 *
 * PRECONDITION: a local Supabase stack, NOT production:
 *   supabase start
 *   supabase db reset   # applies supabase/migrations/*, including 001-015
 *   npx vitest run "app/api/webhooks/resend/route.integration.test.ts"
 *
 * The client is pointed at the local stack via the env vars set below — the
 * fixed local-dev URL and demo service-role JWT `supabase start` always
 * prints for a fresh local project. These are Supabase's published local-only
 * defaults (see CLI output), not a real secret, and are never valid against a
 * hosted/production project.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { Webhook } from "svix";
import { createServerClient } from "@/lib/supabase";
import { POST } from "./route";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
process.env.RESEND_WEBHOOK_SECRET = "whsec_dGVzdC1yZXNlbmQtd2ViaG9vay1zZWNyZXQtMDItMDU=";

const DOMAIN_PREFIX = "test-webhook-suppress-";
let sb: SupabaseClient;
let counter = 0;

beforeAll(() => {
  sb = createServerClient();
});

afterEach(async () => {
  const { error: suppressionsError } = await sb
    .from("suppressions")
    .delete()
    .like("email", `%@${DOMAIN_PREFIX}%`);
  if (suppressionsError) throw suppressionsError;

  const { error: eventsError } = await sb
    .from("email_events")
    .delete()
    .like("email", `%@${DOMAIN_PREFIX}%`);
  if (eventsError) throw eventsError;
});

async function seedEmailEvent(): Promise<{ email: string; resendEmailId: string }> {
  counter += 1;
  const domain = `${DOMAIN_PREFIX}${counter}.example`;
  const email = `contact@${domain}`;
  const resendEmailId = `re_test_${counter}_${randomUUID()}`;

  const { error } = await sb.from("email_events").insert({
    email,
    email_type: "report_ready",
    resend_email_id: resendEmailId,
    status: "sent",
  });
  if (error) throw error;

  return { email, resendEmailId };
}

/** Signs a body with the same svix secret the route verifies against. */
function signedHeaders(body: string): Record<string, string> {
  const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET!);
  const svixId = `msg_test_${randomUUID()}`;
  const timestamp = new Date();
  const signature = wh.sign(svixId, timestamp, body);
  return {
    "svix-id": svixId,
    "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "svix-signature": signature,
    "content-type": "application/json",
  };
}

function postEvent(type: string, resendEmailId: string) {
  const body = JSON.stringify({ type, data: { email_id: resendEmailId } });
  const request = new NextRequest("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers: signedHeaders(body),
    body,
  });
  return POST(request);
}

async function activeSuppression(
  email: string
): Promise<{ id: string; domain: string | null; reason: string } | null> {
  const { data, error } = await sb
    .from("suppressions")
    .select("id, domain, reason")
    .eq("email", email.toLowerCase())
    .is("lifted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

describe("POST /api/webhooks/resend — auto-suppress", () => {
  it("CMP-07/D-05: a Svix-verified email.bounced event writes an active domain-wide suppression", async () => {
    const { email, resendEmailId } = await seedEmailEvent();

    const response = await postEvent("email.bounced", resendEmailId);

    expect(response.status).toBe(200);
    const suppression = await activeSuppression(email);
    expect(suppression).not.toBeNull();
    expect(suppression?.reason).toBe("bounced");
    expect(suppression?.domain).toBe(email.split("@")[1]);
  });

  it("CMP-07/D-05: a Svix-verified email.complained event writes an active domain-wide suppression", async () => {
    const { email, resendEmailId } = await seedEmailEvent();

    const response = await postEvent("email.complained", resendEmailId);

    expect(response.status).toBe(200);
    const suppression = await activeSuppression(email);
    expect(suppression).not.toBeNull();
    expect(suppression?.reason).toBe("complained");
    expect(suppression?.domain).toBe(email.split("@")[1]);
  });

  it("does not suppress on a non-bounce/complaint event (e.g. email.opened)", async () => {
    const { email, resendEmailId } = await seedEmailEvent();

    const response = await postEvent("email.opened", resendEmailId);

    expect(response.status).toBe(200);
    expect(await activeSuppression(email)).toBeNull();
  });

  it("fails closed: an unsigned/invalid request is rejected and writes nothing", async () => {
    const { email, resendEmailId } = await seedEmailEvent();
    const body = JSON.stringify({ type: "email.bounced", data: { email_id: resendEmailId } });
    const request = new NextRequest("http://localhost/api/webhooks/resend", {
      method: "POST",
      headers: {
        "svix-id": "msg_forged",
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": "v1,forged-signature",
        "content-type": "application/json",
      },
      body,
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await activeSuppression(email)).toBeNull();
  });
});
