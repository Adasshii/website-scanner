/**
 * Integration suite for POST /api/webhooks/fillout — TRK-04's booking
 * attribution guarded post-step (lib/booking-attribution.ts), asserted
 * through the real HTTP handler against a real local Postgres (migrations
 * 001-019 applied).
 *
 * PRECONDITION: a local Supabase stack, NOT production:
 *   supabase start
 *   supabase db reset   # applies supabase/migrations/*, including 019
 *   npx vitest run "app/api/webhooks/fillout/route.integration.test.ts"
 *
 * This repo's .env.local points at remote production Supabase — the two env
 * overrides below (module scope, before any client is constructed) are what
 * keep this suite off it.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@/lib/supabase";
import { attributeBookingToProspect } from "@/lib/booking-attribution";
import { POST } from "./route";

// Task 2 / D-7-09: the attribution module is mocked so the "leads first,
// prospects after, in a try/catch" guarantee can be tested by injecting a
// failure rather than by reading the try block. The default implementation
// delegates to the real matcher, so every Task 1 test above keeps exercising
// real attribution logic — only the failure-injection describe below
// overrides it, per-call, with mockRejectedValueOnce/mockImplementationOnce.
vi.mock("@/lib/booking-attribution", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/booking-attribution")>();
  return {
    ...actual,
    attributeBookingToProspect: vi.fn(actual.attributeBookingToProspect),
  };
});

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
process.env.FILLOUT_WEBHOOK_SECRET = "test-fillout-secret";

const DOMAIN_PREFIX = "test-fillout-attr-";
const WEBHOOK_URL = `http://localhost/api/webhooks/fillout?secret=${process.env.FILLOUT_WEBHOOK_SECRET}`;

let sb: SupabaseClient;
let counter = 0;
let createdProspectIds: string[] = [];
let createdScanIds: string[] = [];

beforeAll(() => {
  sb = createServerClient();
});

afterEach(async () => {
  // Children before parents. prospects -> outreach_messages cascades
  // (migration 012), so deleting tracked prospects by id is sufficient for
  // those; scans -> leads also cascades, but leads is deleted explicitly
  // first to match this repo's established convention.
  if (createdScanIds.length > 0) {
    const { error } = await sb.from("leads").delete().in("scan_id", createdScanIds);
    if (error) throw error;
    const { error: scanError } = await sb.from("scans").delete().in("id", createdScanIds);
    if (scanError) throw scanError;
  }
  if (createdProspectIds.length > 0) {
    const { error } = await sb.from("prospects").delete().in("id", createdProspectIds);
    if (error) throw error;
  }

  // Defensive: this project's shared local Supabase has previously left
  // stray fixture rows behind after an interrupted run (STATE.md). Catch
  // anything not tracked above by prefix, plus the one literal aggregator
  // domain this suite uses.
  const { error: staleProspects } = await sb
    .from("prospects")
    .delete()
    .or(`domain.like.%${DOMAIN_PREFIX}%,domain.eq.tripadvisor.com`);
  if (staleProspects) throw staleProspects;
  const { error: staleLeads } = await sb.from("leads").delete().like("domain", `%${DOMAIN_PREFIX}%`);
  if (staleLeads) throw staleLeads;

  createdProspectIds = [];
  createdScanIds = [];
});

function fixtureDomain(): string {
  counter += 1;
  return `${DOMAIN_PREFIX}${counter}.test`;
}

async function seedProspect(opts: {
  contactEmail?: string | null;
  domain?: string | null;
  country?: string;
}): Promise<string> {
  const { data, error } = await sb
    .from("prospects")
    .insert({
      domain: opts.domain ?? null,
      contact_email: opts.contactEmail ?? null,
      country: opts.country ?? "NL",
      name: "Fixture Prospect",
    })
    .select("id")
    .single();
  if (error) throw error;
  createdProspectIds.push(data.id);
  return data.id as string;
}

async function seedOutreach(prospectId: string, status: "sent" | "draft"): Promise<void> {
  const { error } = await sb.from("outreach_messages").insert({ prospect_id: prospectId, status });
  if (error) throw error;
}

async function seedLead(email: string, domain: string): Promise<void> {
  const { data: scan, error: scanError } = await sb
    .from("scans")
    .insert({ url: `https://${domain}`, domain, type: "quick", ip_hash: "test-hash" })
    .select("id")
    .single();
  if (scanError) throw scanError;
  createdScanIds.push(scan.id);

  const { error: leadError } = await sb
    .from("leads")
    .insert({ scan_id: scan.id, email, domain, consented_at: new Date().toISOString() });
  if (leadError) throw leadError;
}

async function getProspect(
  id: string
): Promise<{ booked_at: string | null; booked_match_method: string | null }> {
  const { data, error } = await sb
    .from("prospects")
    .select("booked_at, booked_match_method")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

async function getLead(email: string): Promise<{ booked_at: string | null } | null> {
  const { data, error } = await sb.from("leads").select("booked_at").eq("email", email).maybeSingle();
  if (error) throw error;
  return data;
}

function postBooking(email: string) {
  const body = JSON.stringify({
    formId: "test-form",
    submissionId: `sub-${randomUUID()}`,
    questions: [{ id: "q1", name: "Email", type: "EmailAddress", value: email }],
  });
  const request = new NextRequest(WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  return POST(request);
}

describe("POST /api/webhooks/fillout — booking attribution (TRK-04)", () => {
  it("email-exact: a booking email matching contact_email attributes with matchMethod 'email'", async () => {
    const domain = fixtureDomain();
    const email = `info@${domain}`;
    const prospectId = await seedProspect({ contactEmail: email, domain });
    await seedOutreach(prospectId, "sent");

    const res = await postBooking(email);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.prospectAttribution).toBe("attributed");
    const prospect = await getProspect(prospectId);
    expect(prospect.booked_at).not.toBeNull();
    expect(prospect.booked_match_method).toBe("email");
  });

  it("case: an uppercase booking email attributes identically to the lowercased contact_email", async () => {
    const domain = fixtureDomain();
    const email = `info@${domain}`;
    const prospectId = await seedProspect({ contactEmail: email, domain });
    await seedOutreach(prospectId, "sent");

    const res = await postBooking(email.toUpperCase());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.prospectAttribution).toBe("attributed");
    const prospect = await getProspect(prospectId);
    expect(prospect.booked_at).not.toBeNull();
    expect(prospect.booked_match_method).toBe("email");
  });

  it("domain fallback: a booking email with no contact_email match but a matching domain attributes via matchMethod 'domain'", async () => {
    const domain = fixtureDomain();
    const contactEmail = `info@${domain}`;
    const prospectId = await seedProspect({ contactEmail, domain });
    await seedOutreach(prospectId, "sent");

    const bookingEmail = `jan@${domain}`;
    const res = await postBooking(bookingEmail);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.prospectAttribution).toBe("attributed");
    const prospect = await getProspect(prospectId);
    expect(prospect.booked_at).not.toBeNull();
    expect(prospect.booked_match_method).toBe("domain");
  });

  it("aggregator screen: a booking from an AGGREGATOR_DOMAINS domain is never attributed via domain fallback", async () => {
    const prospectId = await seedProspect({
      contactEmail: "someone-else@example.test",
      domain: "tripadvisor.com",
    });
    await seedOutreach(prospectId, "sent");

    const res = await postBooking("booker@tripadvisor.com");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.prospectAttribution).toBe("no_match");
    const prospect = await getProspect(prospectId);
    expect(prospect.booked_at).toBeNull();
  });

  it("no match: a booking email matching neither contact_email nor domain leaves every seeded prospect unbooked", async () => {
    const domain = fixtureDomain();
    const prospectId = await seedProspect({ contactEmail: `info@${domain}`, domain });
    await seedOutreach(prospectId, "sent");

    const res = await postBooking(`unrelated-${randomUUID()}@nowhere-else.test`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.prospectAttribution).toBe("no_match");
    const prospect = await getProspect(prospectId);
    expect(prospect.booked_at).toBeNull();
  });

  it("D-7-08 contact gate: an exact-email match with only a draft outreach row is not attributed", async () => {
    const domain = fixtureDomain();
    const email = `info@${domain}`;
    const prospectId = await seedProspect({ contactEmail: email, domain });
    await seedOutreach(prospectId, "draft");

    const res = await postBooking(email);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.prospectAttribution).toBe("no_sent_outreach");
    const prospect = await getProspect(prospectId);
    expect(prospect.booked_at).toBeNull();
  });

  it("D-7-08 first-write-wins: posting the same booking twice leaves booked_at at the first timestamp", async () => {
    const domain = fixtureDomain();
    const email = `info@${domain}`;
    const prospectId = await seedProspect({ contactEmail: email, domain });
    await seedOutreach(prospectId, "sent");

    const first = await postBooking(email);
    const firstBody = await first.json();
    expect(firstBody.prospectAttribution).toBe("attributed");
    const afterFirst = await getProspect(prospectId);
    expect(afterFirst.booked_at).not.toBeNull();

    const second = await postBooking(email);
    const secondBody = await second.json();
    expect(second.status).toBe(200);
    expect(secondBody.prospectAttribution).toBe("already_booked");

    const afterSecond = await getProspect(prospectId);
    expect(afterSecond.booked_at).toBe(afterFirst.booked_at);
  });

  it("ambiguous: two prospects sharing a contact_email, both with a sent outreach row, leaves both unbooked", async () => {
    const sharedEmail = `shared-${randomUUID()}@ambiguous.test`;
    const prospectA = await seedProspect({ contactEmail: sharedEmail, domain: null });
    const prospectB = await seedProspect({ contactEmail: sharedEmail, domain: null });
    await seedOutreach(prospectA, "sent");
    await seedOutreach(prospectB, "sent");

    const res = await postBooking(sharedEmail);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.prospectAttribution).toBe("ambiguous");
    expect((await getProspect(prospectA)).booked_at).toBeNull();
    expect((await getProspect(prospectB)).booked_at).toBeNull();
  });

  it("ambiguous resolved by the gate: only one of two same-email prospects owns a sent outreach row, so it alone attributes", async () => {
    const sharedEmail = `shared-${randomUUID()}@ambiguous.test`;
    const prospectA = await seedProspect({ contactEmail: sharedEmail, domain: null });
    const prospectB = await seedProspect({ contactEmail: sharedEmail, domain: null });
    await seedOutreach(prospectA, "sent");
    await seedOutreach(prospectB, "draft");

    const res = await postBooking(sharedEmail);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.prospectAttribution).toBe("attributed");
    const a = await getProspect(prospectA);
    const b = await getProspect(prospectB);
    expect(a.booked_at).not.toBeNull();
    expect(a.booked_match_method).toBe("email");
    expect(b.booked_at).toBeNull();
  });

  // 07-09 (closing 07-REVIEW.md WR-01): the previous .limit(2) candidate cap
  // could never reach 3 candidates. These cases prove the post-gate set,
  // not a query limit, decides the outcome now that the cap is removed.

  it("3 candidates, 1 gated: a booking attributes to the sole sent-gated prospect even though the capped query would have missed it", async () => {
    const sharedEmail = `shared3-${randomUUID()}@ambiguous.test`;
    const prospectA = await seedProspect({ contactEmail: sharedEmail, domain: null });
    const prospectB = await seedProspect({ contactEmail: sharedEmail, domain: null });
    const prospectC = await seedProspect({ contactEmail: sharedEmail, domain: null });
    // Neither A nor B (the two rows a .limit(2) query would have returned,
    // in insertion order) has any sent outreach — only C, the third
    // candidate, does.
    await seedOutreach(prospectA, "draft");
    await seedOutreach(prospectB, "draft");
    await seedOutreach(prospectC, "sent");

    const res = await postBooking(sharedEmail);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.prospectAttribution).toBe("attributed");
    const a = await getProspect(prospectA);
    const b = await getProspect(prospectB);
    const c = await getProspect(prospectC);
    expect(c.booked_at).not.toBeNull();
    expect(c.booked_match_method).toBe("email");
    expect(a.booked_at).toBeNull();
    expect(b.booked_at).toBeNull();
  });

  it("3 candidates, 2 gated: ambiguous, no booked_at written to any of the three", async () => {
    const sharedEmail = `shared3-${randomUUID()}@ambiguous.test`;
    const prospectA = await seedProspect({ contactEmail: sharedEmail, domain: null });
    const prospectB = await seedProspect({ contactEmail: sharedEmail, domain: null });
    const prospectC = await seedProspect({ contactEmail: sharedEmail, domain: null });
    await seedOutreach(prospectA, "sent");
    await seedOutreach(prospectB, "sent");
    await seedOutreach(prospectC, "draft");

    const res = await postBooking(sharedEmail);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.prospectAttribution).toBe("ambiguous");
    expect((await getProspect(prospectA)).booked_at).toBeNull();
    expect((await getProspect(prospectB)).booked_at).toBeNull();
    expect((await getProspect(prospectC)).booked_at).toBeNull();
  });

  it("3 candidates, 0 gated: no_sent_outreach, no booked_at written to any of the three", async () => {
    const sharedEmail = `shared3-${randomUUID()}@ambiguous.test`;
    const prospectA = await seedProspect({ contactEmail: sharedEmail, domain: null });
    const prospectB = await seedProspect({ contactEmail: sharedEmail, domain: null });
    const prospectC = await seedProspect({ contactEmail: sharedEmail, domain: null });
    await seedOutreach(prospectA, "draft");
    await seedOutreach(prospectB, "draft");
    await seedOutreach(prospectC, "draft");

    const res = await postBooking(sharedEmail);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.prospectAttribution).toBe("no_sent_outreach");
    expect((await getProspect(prospectA)).booked_at).toBeNull();
    expect((await getProspect(prospectB)).booked_at).toBeNull();
    expect((await getProspect(prospectC)).booked_at).toBeNull();
  });

  it("step 1 never falls through to step 2: three ungated same-address prospects block attribution even though a fourth, domain-only prospect is sent-gated", async () => {
    const sharedEmail = `shared3-${randomUUID()}@ambiguous.test`;
    const sharedDomain = sharedEmail.split("@")[1];
    const prospectA = await seedProspect({ contactEmail: sharedEmail, domain: null });
    const prospectB = await seedProspect({ contactEmail: sharedEmail, domain: null });
    const prospectC = await seedProspect({ contactEmail: sharedEmail, domain: null });
    await seedOutreach(prospectA, "draft");
    await seedOutreach(prospectB, "draft");
    await seedOutreach(prospectC, "draft");
    // Shares only the domain half of the booking address, not the address
    // itself, and IS sent-gated — a domain-fallback attribution here would
    // be a wrong hand-off to a business that merely shares a domain.
    const domainOnlyProspect = await seedProspect({ contactEmail: null, domain: sharedDomain });
    await seedOutreach(domainOnlyProspect, "sent");

    const res = await postBooking(sharedEmail);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.prospectAttribution).toBe("no_sent_outreach");
    expect((await getProspect(prospectA)).booked_at).toBeNull();
    expect((await getProspect(prospectB)).booked_at).toBeNull();
    expect((await getProspect(prospectC)).booked_at).toBeNull();
    expect((await getProspect(domainOnlyProspect)).booked_at).toBeNull();
  });

  it("leaves the pre-existing leads behaviour and response fields unchanged, and adds prospectAttribution", async () => {
    const domain = fixtureDomain();
    const email = `info@${domain}`;
    await seedLead(email, domain);

    const res = await postBooking(email);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    expect(body.matched).toBe(true);
    expect(body.leadsUpdated).toBe(1);
    expect(typeof body.prospectAttribution).toBe("string");

    const lead = await getLead(email);
    expect(lead?.booked_at).not.toBeNull();
  });
});

// D-7-09 / T-07-22: this guarantee fails silently in the direction that
// costs the most. A regression here does not throw in the admin UI — it
// turns a 200 into a 500, Fillout retries the submission, and the failure
// surfaces as duplicate webhook traffic against the earning product's own
// booking path. Code inspection passes a `try` block that has quietly
// stopped covering the call; only an injected failure catches that.
describe("POST /api/webhooks/fillout — D-7-09 fire-and-forget guarantee", () => {
  afterEach(() => {
    vi.mocked(attributeBookingToProspect).mockClear();
  });

  it("returns 200 and leaves the lead booked when attribution rejects asynchronously", async () => {
    const domain = fixtureDomain();
    const email = `info@${domain}`;
    await seedLead(email, domain);

    vi.mocked(attributeBookingToProspect).mockRejectedValueOnce(new Error("boom-async"));

    const res = await postBooking(email);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.matched).toBe(true);
    expect(body.leadsUpdated).toBe(1);
    expect(body.prospectAttribution).toBe("failed");

    const lead = await getLead(email);
    expect(lead?.booked_at).not.toBeNull();
  });

  it("returns 200 and leaves the lead booked when attribution throws synchronously", async () => {
    const domain = fixtureDomain();
    const email = `info@${domain}`;
    await seedLead(email, domain);

    vi.mocked(attributeBookingToProspect).mockImplementationOnce(() => {
      throw new Error("boom-sync");
    });

    const res = await postBooking(email);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.matched).toBe(true);
    expect(body.leadsUpdated).toBe(1);
    expect(body.prospectAttribution).toBe("failed");

    const lead = await getLead(email);
    expect(lead?.booked_at).not.toBeNull();
  });

  it("regression guard: a no-match booking with no mock override still returns 200 with matched:false and a no_match outcome", async () => {
    const res = await postBooking(`unmocked-${randomUUID()}@nowhere-really.test`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.matched).toBe(false);
    expect(body.leadsUpdated).toBe(0);
    expect(body.prospectAttribution).toBe("no_match");
  });
});
