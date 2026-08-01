/**
 * Integration suite for lib/reporting-aggregates.ts's getReportingData() —
 * asserted against a real Postgres with migrations 010-019 applied.
 *
 * PRECONDITION: a local Supabase stack, NOT production:
 *   npx supabase start --ignore-health-check
 *   npx vitest run lib/reporting-aggregates.integration.test.ts
 *
 * The client is pointed at the local stack via the env vars set below — the
 * fixed local-dev URL and demo service-role JWT `supabase start` always
 * prints for a fresh local project. These are Supabase's published
 * local-only defaults (see CLI output), not a real secret, and are never
 * valid against a hosted/production project. This repo's own .env.local
 * points at REMOTE PRODUCTION Supabase, so a suite without this override
 * would read and write production (draft-on-scan-complete.integration.test.ts
 * sets the same override for the same reason).
 *
 * The local DB carries ~800 pre-existing prospect rows from prior phases'
 * manual verification. Every assertion below reads a getReportingData()
 * snapshot BEFORE seeding and compares the DELTA after seeding, rather than
 * asserting an absolute count — the shared table already has real rows in
 * every funnel group.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase";
import { getReportingData } from "./reporting-aggregates";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

let sb: SupabaseClient;

beforeAll(() => {
  sb = createServerClient();
});

const PREFIX = "test-reporting-agg-";

afterEach(async () => {
  const { data: prospects } = await sb
    .from("prospects")
    .select("id")
    .like("domain", `${PREFIX}%`);
  const ids = (prospects ?? []).map((p) => p.id as string);
  if (ids.length > 0) {
    await sb.from("outreach_messages").delete().in("prospect_id", ids);
    await sb.from("prospects").delete().in("id", ids);
  }
});

async function seedProspect(
  domain: string,
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const { data, error } = await sb
    .from("prospects")
    .insert({
      domain,
      country: "NL",
      lifecycle_state: "new",
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

describe("getReportingData", () => {
  it("counts seeded prospects at four different stages into the matching funnel groups", async () => {
    const before = await getReportingData(sb);

    await seedProspect(`${PREFIX}new-1`);
    await seedProspect(`${PREFIX}qualified-1`, {
      triage_checked_at: "2026-01-01T00:00:00Z",
    });
    const contactedId = await seedProspect(`${PREFIX}contacted-1`);
    const { error: outreachError } = await sb.from("outreach_messages").insert({
      prospect_id: contactedId,
      status: "sent",
      created_at: "2026-01-01T00:00:00Z",
    });
    if (outreachError) throw outreachError;
    await seedProspect(`${PREFIX}booked-1`, { booked_at: "2026-01-01T00:00:00Z" });

    const after = await getReportingData(sb);

    expect(after.funnel.New - before.funnel.New).toBe(1);
    expect(after.funnel.Qualified - before.funnel.Qualified).toBe(1);
    expect(after.funnel.Contacted - before.funnel.Contacted).toBe(1);
    expect(after.funnel.Booked - before.funnel.Booked).toBe(1);
  });

  it("sentGateOpen is false with no sent row and flips true once one exists", async () => {
    const id = await seedProspect(`${PREFIX}gate-1`);

    const closed = await getReportingData(sb);
    // Guard: only meaningful while this shared local DB genuinely has no
    // `sent` outreach rows — Phase 8 (the send channel) has not shipped in
    // this codebase yet (D-7-R1/D-7-13, 07-CONTEXT.md: "Nothing sends").
    // If this ever fails because a real sent row exists, that assumption no
    // longer holds and the test needs revisiting, not silencing.
    expect(closed.sentGateOpen).toBe(false);

    const { error } = await sb.from("outreach_messages").insert({
      prospect_id: id,
      status: "sent",
      created_at: "2026-01-01T00:00:00Z",
    });
    if (error) throw error;

    const open = await getReportingData(sb);
    expect(open.sentGateOpen).toBe(true);
  });

  it("resolves a prospect with two outreach_messages rows to the newest by created_at", async () => {
    const before = await getReportingData(sb);

    const id = await seedProspect(`${PREFIX}latest-1`);
    const { error: err1 } = await sb.from("outreach_messages").insert({
      prospect_id: id,
      status: "sent",
      created_at: "2026-01-01T00:00:00Z",
    });
    if (err1) throw err1;
    // Migration 012 declares no UNIQUE constraint on prospect_id (Pitfall
    // 4) — a second, newer row for the same prospect is a valid state this
    // repo can produce, and the newer row must win.
    const { error: err2 } = await sb.from("outreach_messages").insert({
      prospect_id: id,
      status: "approved",
      created_at: "2026-01-02T00:00:00Z",
    });
    if (err2) throw err2;

    const after = await getReportingData(sb);

    // The newest row ("approved") must win over the older "sent" row — if
    // the older row won instead, this prospect would land in Contacted, not
    // Qualified.
    expect(after.funnel.Qualified - before.funnel.Qualified).toBe(1);
    expect(after.funnel.Contacted - before.funnel.Contacted).toBe(0);
  });

  it("counts a rejected prospect into Rejected only, never into a TRK-01 group", async () => {
    const before = await getReportingData(sb);

    await seedProspect(`${PREFIX}rejected-1`, {
      lifecycle_state: "rejected",
      booked_at: "2026-01-01T00:00:00Z",
    });

    const after = await getReportingData(sb);

    expect(after.funnel.Rejected - before.funnel.Rejected).toBe(1);
    expect(after.funnel.Booked - before.funnel.Booked).toBe(0);
    expect(after.funnel.New - before.funnel.New).toBe(0);
  });
});
