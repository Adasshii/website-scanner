/**
 * Route 1: POST /api/admin/atrium/prospects. PRECONDITION: local Supabase
 * with migrations up to 021 applied (Task 2).
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token";
import { cleanupProspectsByDomainPrefix, seedProspect, useLocalSupabase } from "@/tests/helpers/prospect-fixtures";
import { POST } from "./route";

// eslint-disable-next-line react-hooks/rules-of-hooks
useLocalSupabase();
process.env.ADMIN_SECRET = "test-admin-secret-atrium";
process.env.UNSUBSCRIBE_TOKEN_SECRET = "test-unsubscribe-secret-atrium";

const PREFIX = "test-atrium-reg-";
let sb: SupabaseClient;

beforeAll(() => {
  sb = createServerClient();
});

afterEach(async () => {
  const { error } = await sb.from("suppressions").delete().like("email", `%@${PREFIX}%`);
  if (error) throw error;
  await cleanupProspectsByDomainPrefix(sb, PREFIX);
});

function freshDomain() {
  return `${PREFIX}${crypto.randomUUID().slice(0, 8)}.nl`;
}

async function suppress(email: string, domain: string) {
  const { error } = await sb
    .from("suppressions")
    .insert({ email, domain, reason: "unsubscribe", source: "unsubscribe_link" });
  if (error) throw error;
}

function validBody(domain: string) {
  return {
    name: "Bakkerij Test",
    website: `https://www.${domain}/contact`,
    country: "NL",
    contactEmail: `Info@${domain}`,
    contactEmailType: "generic",
  };
}

function post(body: unknown, secret: string | null = "test-admin-secret-atrium") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-admin-secret"] = secret;
  return POST(
    new NextRequest("http://localhost/api/admin/atrium/prospects", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

describe("POST /api/admin/atrium/prospects", () => {
  it("returns 401 without the admin secret", async () => {
    expect((await post(validBody(freshDomain()), null)).status).toBe(401);
    expect((await post(validBody(freshDomain()), "wrong")).status).toBe(401);
  });

  it("returns 400 for a body that breaks the contract", async () => {
    const domain = freshDomain();
    const cases: unknown[] = [
      "not json",
      { ...validBody(domain), name: "" },
      { ...validBody(domain), website: "" },
      { ...validBody(domain), country: "BE" },
      { ...validBody(domain), contactEmailType: "named-person" },
      { ...validBody(domain), contactEmail: "no-at-sign" },
      { ...validBody(domain), contactEmail: "info@other-domain.nl" },
      { ...validBody(domain), website: "https://www.facebook.com/bakkerij" },
    ];
    for (const body of cases) {
      const res = await post(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(typeof (await res.json()).error).toBe("string");
    }
  });

  it("creates an Atrium prospect and returns the scanner's own opt-out link", async () => {
    const domain = freshDomain();
    const res = await post(validBody(domain));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(Object.keys(json).sort()).toEqual(["optOutLineNl", "optOutUrl", "prospectId"]);
    expect(json.optOutUrl.startsWith("https://scan.adashi.io/api/unsubscribe/")).toBe(true);
    expect(json.optOutLineNl).toBe(`Afmelden: ${json.optOutUrl}`);
    const token = json.optOutUrl.split("/api/unsubscribe/")[1];
    expect(verifyUnsubscribeToken(token)).toEqual({ prospectId: json.prospectId });

    const { data, error } = await sb
      .from("prospects")
      .select("domain, name, country, owner, website_url, contact_email, contact_email_type, lifecycle_state")
      .eq("id", json.prospectId)
      .single();
    if (error) throw error;
    expect(data).toEqual({
      domain,
      name: "Bakkerij Test",
      country: "NL",
      owner: "atrium",
      website_url: `https://www.${domain}/contact`,
      contact_email: `info@${domain}`,
      contact_email_type: "generic",
      lifecycle_state: "new",
    });
  });

  it("returns the same prospect id for the same domain and keeps the newest address", async () => {
    const domain = freshDomain();
    const first = await (await post(validBody(domain))).json();
    const second = await (
      await post({ ...validBody(domain), website: `http://${domain}`, contactEmail: `hallo@${domain}` })
    ).json();

    expect(second.prospectId).toBe(first.prospectId);
    const { data } = await sb.from("prospects").select("contact_email").eq("id", first.prospectId).single();
    expect(data!.contact_email).toBe(`hallo@${domain}`);
  });

  it("returns 409 scanner-owned for a domain the scanner owns and changes nothing (Contract problem 1)", async () => {
    const domain = freshDomain();
    const scannerId = await seedProspect(sb, { domain, owner: "scanner", contactEmail: `sales@${domain}` });
    const { data: before, error: beforeError } = await sb.from("prospects").select("*").eq("id", scannerId).single();
    if (beforeError) throw beforeError;

    const res = await post(validBody(domain));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "scanner-owned" });
    const { data: after, error: afterError } = await sb.from("prospects").select("*").eq("id", scannerId).single();
    if (afterError) throw afterError;
    expect(after).toEqual(before);
    const { data: rows } = await sb.from("prospects").select("id").eq("domain", domain);
    expect(rows).toHaveLength(1);
  });

  it("returns 409 suppressed when the address opted out, and writes nothing", async () => {
    const domain = freshDomain();
    await suppress(`info@${domain}`, domain);

    const res = await post(validBody(domain));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "suppressed" });
    const { data } = await sb.from("prospects").select("id").eq("domain", domain);
    expect(data).toHaveLength(0);
  });

  it("returns 409 suppressed when another address on the same domain opted out", async () => {
    const domain = freshDomain();
    await suppress(`sales@${domain}`, domain);

    const res = await post(validBody(domain));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "suppressed" });
  });
});
