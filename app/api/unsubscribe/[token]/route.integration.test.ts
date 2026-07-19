/**
 * Integration suite for GET/POST /api/unsubscribe/[token] — write-before-success,
 * idempotent double-click, RFC 8058 one-click POST, and fail-closed rejection
 * of forged tokens, asserted against a real Postgres with migrations 001-015
 * applied.
 *
 * PRECONDITION: a local Supabase stack, NOT production:
 *   supabase start
 *   supabase db reset   # applies supabase/migrations/*, including 001-015
 *   npx vitest run "app/api/unsubscribe/[token]/route.integration.test.ts"
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
import { createServerClient } from "@/lib/supabase";
import { signUnsubscribeToken } from "@/lib/unsubscribe-token";
import { GET, POST } from "./route";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
process.env.UNSUBSCRIBE_TOKEN_SECRET = "test-unsubscribe-secret-02-04";

const DOMAIN_PREFIX = "test-unsub-";
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

  const { error: prospectsError } = await sb
    .from("prospects")
    .delete()
    .like("domain", `${DOMAIN_PREFIX}%`);
  if (prospectsError) throw prospectsError;
});

async function seedProspect(): Promise<{ id: string; email: string }> {
  counter += 1;
  const domain = `${DOMAIN_PREFIX}${counter}.example`;
  const email = `contact@${domain}`;

  const { data, error } = await sb
    .from("prospects")
    .insert({
      domain,
      name: `Test Unsub Business ${counter}`,
      country: "NL",
      contact_email: email,
      lifecycle_state: "new",
    })
    .select("id")
    .single();
  if (error) throw error;

  return { id: data.id as string, email };
}

function callGet(token: string) {
  const request = new NextRequest(`http://localhost/api/unsubscribe/${token}`);
  return GET(request, { params: Promise.resolve({ token }) });
}

function callPost(token: string) {
  const request = new NextRequest(`http://localhost/api/unsubscribe/${token}`, { method: "POST" });
  return POST(request, { params: Promise.resolve({ token }) });
}

async function activeSuppressionCount(email: string): Promise<number> {
  const { data, error } = await sb
    .from("suppressions")
    .select("id")
    .eq("email", email.toLowerCase())
    .is("lifted_at", null);
  if (error) throw error;
  return data?.length ?? 0;
}

describe("GET/POST /api/unsubscribe/[token]", () => {
  it("CMP-04: GET verifies, writes the suppression, and returns 200 only after the write", async () => {
    const prospect = await seedProspect();
    const token = signUnsubscribeToken(prospect.id);

    expect(await activeSuppressionCount(prospect.email)).toBe(0);

    const response = await callGet(token);

    expect(response.status).toBe(200);
    expect(await activeSuppressionCount(prospect.email)).toBe(1);
  });

  it("CMP-04: clicking the link twice succeeds both times and leaves exactly one active suppression row", async () => {
    const prospect = await seedProspect();
    const token = signUnsubscribeToken(prospect.id);

    const first = await callGet(token);
    const second = await callGet(token);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await activeSuppressionCount(prospect.email)).toBe(1);
  });

  it("Pitfall 4: POST one-click returns a non-redirect 2xx and writes the suppression", async () => {
    const prospect = await seedProspect();
    const token = signUnsubscribeToken(prospect.id);

    const response = await callPost(token);

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    expect(await activeSuppressionCount(prospect.email)).toBe(1);
  });

  it("fails closed: a tampered token returns 400 and writes nothing", async () => {
    const prospect = await seedProspect();
    const token = signUnsubscribeToken(prospect.id);
    const tampered = `${token.slice(0, -1)}${token.slice(-1) === "a" ? "b" : "a"}`;

    const response = await callGet(tampered);

    expect(response.status).toBe(400);
    expect(await activeSuppressionCount(prospect.email)).toBe(0);
  });
});
