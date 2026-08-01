/**
 * Integration suite for getTriageCandidates()/getShortlist() — the D-09
 * eligibility exclusions and D-07 pure-read guarantee, asserted against a
 * real Postgres with migrations 010-016 applied.
 *
 * PRECONDITION: a local Supabase stack, NOT production:
 *   supabase start
 *   supabase db reset   # applies supabase/migrations/*, including 016
 *   npx vitest run lib/triage-candidates.integration.test.ts
 *
 * Mirrors lib/triage-release.integration.test.ts's env-var +
 * createServerClient() + scoped-cleanup-by-campaign_tag pattern verbatim.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase";
import type { TriageScore } from "@/types/triage";
import { getShortlist, getTriageCandidates } from "./triage-candidates";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const CAMPAIGN_TAG = "test-03-04-integration";

let sb: SupabaseClient;
let domainCounter = 0;

beforeAll(() => {
  sb = createServerClient();
});

afterEach(async () => {
  const { error } = await sb.from("prospects").delete().eq("campaign_tag", CAMPAIGN_TAG);
  if (error) throw error;
});

function makeTriageScore(overrides?: Partial<TriageScore>): TriageScore {
  return {
    score: 50,
    gated: false,
    reachable: true,
    https: true,
    finalStatus: 200,
    redirectChain: [],
    hasViewport: true,
    bytes: 100_000,
    truncated: false,
    responseMs: 200,
    robotsBlocked: false,
    gateReason: null,
    ...overrides,
  };
}

async function seedProspect(overrides?: {
  domain?: string | null;
  triageScore?: TriageScore | null;
  scanReleasedAt?: string | null;
  contactEmail?: string | null;
  lifecycleState?: string;
  scanStatus?: "queued" | "scanning" | "done" | "failed" | null;
  bookedAt?: string | null;
}) {
  domainCounter += 1;
  const domain = overrides?.domain === undefined ? `triage-candidates-${domainCounter}.test` : overrides.domain;
  const { data, error } = await sb
    .from("prospects")
    .insert({
      domain,
      website_url: domain ? `https://${domain}` : null,
      country: "NL",
      campaign_tag: CAMPAIGN_TAG,
      triage_score: overrides?.triageScore ?? null,
      triage_checked_at: overrides?.triageScore ? new Date().toISOString() : null,
      scan_released_at: overrides?.scanReleasedAt ?? null,
      contact_email: overrides?.contactEmail ?? null,
      ...(overrides?.lifecycleState !== undefined ? { lifecycle_state: overrides.lifecycleState } : {}),
      ...(overrides?.scanStatus !== undefined ? { scan_status: overrides.scanStatus } : {}),
      ...(overrides?.bookedAt !== undefined ? { booked_at: overrides.bookedAt } : {}),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function seedOutreachMessage(
  prospectId: string,
  overrides?: { status?: "draft" | "edited" | "approved" | "rejected" | "sent"; createdAt?: string }
) {
  const { error } = await sb.from("outreach_messages").insert({
    prospect_id: prospectId,
    draft_subject: "Test subject",
    draft_body: "Test body",
    ...(overrides?.status !== undefined ? { status: overrides.status } : {}),
    ...(overrides?.createdAt !== undefined ? { created_at: overrides.createdAt } : {}),
  });
  if (error) throw error;
}

describe("getTriageCandidates", () => {
  it("excludes a row whose scan_released_at is set (D-09)", async () => {
    const releasedId = await seedProspect({ scanReleasedAt: new Date().toISOString() });
    const freshId = await seedProspect();

    const candidates = await getTriageCandidates(sb);
    const ids = candidates.map((c) => c.id);
    expect(ids).not.toContain(releasedId);
    expect(ids).toContain(freshId);
  });

  it("excludes a null-domain (no-website) prospect", async () => {
    const noWebsiteId = await seedProspect({ domain: null });
    const hasDomainId = await seedProspect();

    const candidates = await getTriageCandidates(sb);
    const ids = candidates.map((c) => c.id);
    expect(ids).not.toContain(noWebsiteId);
    expect(ids).toContain(hasDomainId);
  });

  it("includes a fresh has-domain, un-released row", async () => {
    const id = await seedProspect();
    const candidates = await getTriageCandidates(sb);
    expect(candidates.some((c) => c.id === id)).toBe(true);
  });

  it("respects limit", async () => {
    await Promise.all(Array.from({ length: 5 }, () => seedProspect()));
    const candidates = await getTriageCandidates(sb, { limit: 2 });
    expect(candidates.length).toBeLessThanOrEqual(2);
  });
});

describe("getShortlist", () => {
  it("returns only rows where triage_score is not null", async () => {
    const triagedId = await seedProspect({ triageScore: makeTriageScore({ score: 40 }) });
    const untriagedId = await seedProspect({ triageScore: null });

    const shortlist = await getShortlist(sb);
    const ids = shortlist.map((r) => r.id);
    expect(ids).toContain(triagedId);
    expect(ids).not.toContain(untriagedId);
  });

  it("sets has_contact_email true for a non-empty address and false for null (06-08)", async () => {
    const withEmailId = await seedProspect({
      triageScore: makeTriageScore(),
      contactEmail: "info@example.test",
    });
    const withoutEmailId = await seedProspect({ triageScore: makeTriageScore(), contactEmail: null });

    const shortlist = await getShortlist(sb);
    const withEmailRow = shortlist.find((r) => r.id === withEmailId);
    const withoutEmailRow = shortlist.find((r) => r.id === withoutEmailId);
    expect(withEmailRow?.has_contact_email).toBe(true);
    expect(withoutEmailRow?.has_contact_email).toBe(false);
  });

  it("never returns the raw contact_email property (06-08 data minimisation)", async () => {
    await seedProspect({ triageScore: makeTriageScore(), contactEmail: "info@example.test" });

    const shortlist = await getShortlist(sb);
    for (const row of shortlist) {
      expect(row).not.toHaveProperty("contact_email");
    }
  });

  it("sets has_outreach_draft true when any outreach_messages row exists, false otherwise (06-08)", async () => {
    const withDraftId = await seedProspect({ triageScore: makeTriageScore() });
    await seedOutreachMessage(withDraftId);
    const withoutDraftId = await seedProspect({ triageScore: makeTriageScore() });

    const shortlist = await getShortlist(sb);
    const withDraftRow = shortlist.find((r) => r.id === withDraftId);
    const withoutDraftRow = shortlist.find((r) => r.id === withoutDraftId);
    expect(withDraftRow?.has_outreach_draft).toBe(true);
    expect(withoutDraftRow?.has_outreach_draft).toBe(false);
  });

  // 07-04: `stage` resolution (D-7-01/02/04, D-7-14). Each test seeds only the
  // markers relevant to the rung it asserts, mirroring lib/lifecycle.test.ts's
  // per-rung shape but proving it at this surface (getShortlist), not just in
  // the unit-tested derivation.

  it("resolves stage: triaged for a prospect with a triage score and nothing else", async () => {
    const id = await seedProspect({ triageScore: makeTriageScore() });
    const shortlist = await getShortlist(sb);
    expect(shortlist.find((r) => r.id === id)?.stage).toBe("triaged");
  });

  it("resolves stage: qualified for a released, unscanned prospect", async () => {
    const id = await seedProspect({
      triageScore: makeTriageScore(),
      scanReleasedAt: new Date().toISOString(),
    });
    const shortlist = await getShortlist(sb);
    expect(shortlist.find((r) => r.id === id)?.stage).toBe("qualified");
  });

  it("resolves stage: scanned for a prospect with scan_status done", async () => {
    const id = await seedProspect({
      triageScore: makeTriageScore(),
      scanReleasedAt: new Date().toISOString(),
      scanStatus: "done",
    });
    const shortlist = await getShortlist(sb);
    expect(shortlist.find((r) => r.id === id)?.stage).toBe("scanned");
  });

  it("resolves stage: contacted for a prospect with a sent outreach message", async () => {
    const id = await seedProspect({
      triageScore: makeTriageScore(),
      scanReleasedAt: new Date().toISOString(),
      scanStatus: "done",
    });
    await seedOutreachMessage(id, { status: "sent" });
    const shortlist = await getShortlist(sb);
    expect(shortlist.find((r) => r.id === id)?.stage).toBe("contacted");
  });

  it("resolves stage: booked for a prospect with booked_at set, outranking a sent outreach row", async () => {
    const id = await seedProspect({
      triageScore: makeTriageScore(),
      scanReleasedAt: new Date().toISOString(),
      scanStatus: "done",
      bookedAt: new Date().toISOString(),
    });
    await seedOutreachMessage(id, { status: "sent" });
    const shortlist = await getShortlist(sb);
    expect(shortlist.find((r) => r.id === id)?.stage).toBe("booked");
  });

  it("resolves stage: rejected for a prospect whose stored lifecycle_state is rejected, even with booked_at set and a sent outreach row (D-7-R2)", async () => {
    const id = await seedProspect({
      triageScore: makeTriageScore(),
      scanReleasedAt: new Date().toISOString(),
      scanStatus: "done",
      bookedAt: new Date().toISOString(),
      lifecycleState: "rejected",
    });
    await seedOutreachMessage(id, { status: "sent" });
    const shortlist = await getShortlist(sb);
    expect(shortlist.find((r) => r.id === id)?.stage).toBe("rejected");
  });

  it("resolves stage from the newest outreach_messages row when two exist, and still reports has_outreach_draft true (Pitfall 4)", async () => {
    const id = await seedProspect({ triageScore: makeTriageScore() });
    await seedOutreachMessage(id, { status: "sent", createdAt: "2026-01-01T00:00:00.000Z" });
    await seedOutreachMessage(id, { status: "draft", createdAt: "2026-01-02T00:00:00.000Z" });

    const shortlist = await getShortlist(sb);
    const row = shortlist.find((r) => r.id === id);
    expect(row?.stage).toBe("drafted");
    expect(row?.has_outreach_draft).toBe(true);
  });

  it("returns a row with a stage property and none of the raw derivation input properties", async () => {
    await seedProspect({ triageScore: makeTriageScore() });
    const shortlist = await getShortlist(sb);
    for (const row of shortlist) {
      expect(row).toHaveProperty("stage");
      expect(row).not.toHaveProperty("lifecycle_state");
      expect(row).not.toHaveProperty("triage_checked_at");
      expect(row).not.toHaveProperty("booked_at");
    }
  });

  it("every returned row's stage is one of the 12 FineLifecycleState values", async () => {
    await seedProspect({ triageScore: makeTriageScore() });
    const shortlist = await getShortlist(sb);
    const validStages = new Set([
      "new",
      "no_website",
      "triaged",
      "qualified",
      "scan_queued",
      "scanned",
      "drafted",
      "approved",
      "contacted",
      "replied",
      "booked",
      "rejected",
    ]);
    for (const row of shortlist) {
      expect(row.stage).toBeDefined();
      expect(validStages.has(row.stage)).toBe(true);
    }
  });
});
