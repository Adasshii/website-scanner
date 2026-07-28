/**
 * Integration suite for lib/draft-on-scan-complete.ts — the D-6-05
 * eligibility gate that decides whether a completed prospect scan produces
 * an automatic outreach draft, asserted against a real Postgres with
 * migrations 010, 012 and 013 applied.
 *
 * PRECONDITION: a local Supabase stack, NOT production:
 *   supabase start
 *   supabase db reset   # applies supabase/migrations/*
 *   npx vitest run lib/draft-on-scan-complete.integration.test.ts
 *
 * The client is pointed at the local stack via the env vars set below — the
 * fixed local-dev URL and demo service-role JWT `supabase start` always
 * prints for a fresh local project. These are Supabase's published
 * local-only defaults (see CLI output), not a real secret, and are never
 * valid against a hosted/production project. This repo's own .env.local
 * points at REMOTE PRODUCTION Supabase, so a suite without this override
 * would read and write production.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase";
import { maybeGenerateDraftForProspectScan, type ScanCompleteRow } from "./draft-on-scan-complete";
import type { ScanScores, ScanSummary } from "@/types/scanner";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

let sb: SupabaseClient;

beforeAll(() => {
  sb = createServerClient();
});

afterEach(async () => {
  // Cascade: outreach_messages / scans reference prospects, delete children
  // first, then the seeded prospects themselves.
  const { data: prospects } = await sb
    .from("prospects")
    .select("id")
    .like("domain", "test-draft-hook-%");
  const ids = (prospects ?? []).map((p) => p.id as string);
  if (ids.length > 0) {
    await sb.from("outreach_messages").delete().in("prospect_id", ids);
    await sb.from("scans").delete().in("prospect_id", ids);
    await sb.from("prospects").delete().in("id", ids);
  }
});

const baseScores: ScanScores = {
  overall: 40,
  accessibility: 40,
  content: 40,
  seo: 40,
  performance: 40,
  security: 40,
  design: 40,
};

const baseSummary: ScanSummary = {
  totalPages: 1,
  totalIssues: 3,
  criticalIssues: 2,
  majorIssues: 1,
  topIssues: [],
  verdict: "needs work",
};

async function seedProspect(overrides: Record<string, unknown> = {}): Promise<string> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const { data, error } = await sb
    .from("prospects")
    .insert({
      domain: `test-draft-hook-${suffix}.example.com`,
      name: "Test Prospect",
      country: "NL",
      contact_email: "info@example.com",
      contact_email_type: "generic",
      lifecycle_state: "scanned",
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function seedScan(
  prospectId: string | null,
  overrides: Record<string, unknown> = {}
): Promise<ScanCompleteRow> {
  const { data, error } = await sb
    .from("scans")
    .insert({
      url: "https://example.com",
      domain: "test-draft-hook.example.com",
      type: "full",
      status: "completed",
      scores: baseScores,
      summary: baseSummary,
      pages: [],
      ip_hash: "test-draft-hook",
      prospect_id: prospectId,
      ...overrides,
    })
    .select("id, prospect_id, status, scores, summary, pages")
    .single();
  if (error) throw error;
  return data as ScanCompleteRow;
}

const neverGenerate = async (): Promise<string | null> => "should not be called";
// Echoes the prompt back: the prompt always contains the metric's exact
// displayValue (lib/draft-prompt.ts's REQUIRED FIGURE line) and the report
// URL, so this trivially satisfies generateDraft's verbatim + link guards
// without needing to parse the prompt for the specific figure per test.
const stubGenerate = async (prompt: string): Promise<string> => `${prompt}\n\nBest, Joshua`;

describe("maybeGenerateDraftForProspectScan integration", () => {
  it("DRA-01/D-6-05: a generic contact email produces exactly one draft row", async () => {
    const prospectId = await seedProspect();
    const scan = await seedScan(prospectId);

    const result = await maybeGenerateDraftForProspectScan(sb, scan, { generate: stubGenerate });

    expect(result.outcome).toBe("created");
    const { data } = await sb.from("outreach_messages").select("*").eq("prospect_id", prospectId);
    expect(data).toHaveLength(1);
    expect(data![0].status).toBe("draft");
    expect(data![0].scan_id).toBe(scan.id);
    expect(data![0].draft_subject).toBeTruthy();
    expect(data![0].draft_body).toBeTruthy();
  });

  it("re-scanning the same prospect produces NO second row and leaves the existing one untouched", async () => {
    const prospectId = await seedProspect();
    const scan1 = await seedScan(prospectId);
    await maybeGenerateDraftForProspectScan(sb, scan1, { generate: stubGenerate });

    const scan2 = await seedScan(prospectId);
    const result = await maybeGenerateDraftForProspectScan(sb, scan2, { generate: neverGenerate });

    expect(result).toEqual({ outcome: "skipped", reason: "already-drafted" });
    const { data } = await sb.from("outreach_messages").select("*").eq("prospect_id", prospectId);
    expect(data).toHaveLength(1);
    expect(data![0].scan_id).toBe(scan1.id);
  });

  it("a re-scan skips even when the existing draft's status is 'edited' or 'approved'", async () => {
    const prospectId = await seedProspect();
    const scan1 = await seedScan(prospectId);
    await maybeGenerateDraftForProspectScan(sb, scan1, { generate: stubGenerate });
    await sb.from("outreach_messages").update({ status: "approved" }).eq("prospect_id", prospectId);

    const scan2 = await seedScan(prospectId);
    const result = await maybeGenerateDraftForProspectScan(sb, scan2, { generate: neverGenerate });

    expect(result).toEqual({ outcome: "skipped", reason: "already-drafted" });
    const { data } = await sb.from("outreach_messages").select("status").eq("prospect_id", prospectId).single();
    expect(data!.status).toBe("approved");
  });

  it("D-6-07: a null contact_email produces no row and a skip outcome", async () => {
    const prospectId = await seedProspect({ contact_email: null });
    const scan = await seedScan(prospectId);

    const result = await maybeGenerateDraftForProspectScan(sb, scan, { generate: neverGenerate });

    expect(result).toEqual({ outcome: "skipped", reason: "no-contact-email" });
    const { data } = await sb.from("outreach_messages").select("id").eq("prospect_id", prospectId);
    expect(data).toHaveLength(0);
  });

  it("D-6-06: a named-person contact_email_type produces no row and a skip outcome", async () => {
    const prospectId = await seedProspect({ contact_email_type: "named-person" });
    const scan = await seedScan(prospectId);

    const result = await maybeGenerateDraftForProspectScan(sb, scan, { generate: neverGenerate });

    expect(result).toEqual({ outcome: "skipped", reason: "named-person-only" });
    const { data } = await sb.from("outreach_messages").select("id").eq("prospect_id", prospectId);
    expect(data).toHaveLength(0);
  });

  it("D-6-15/T-06-REJ: a rejected prospect produces no row even with a generic email and completed scan", async () => {
    const prospectId = await seedProspect({ lifecycle_state: "rejected" });
    const scan = await seedScan(prospectId);

    const result = await maybeGenerateDraftForProspectScan(sb, scan, { generate: neverGenerate });

    expect(result).toEqual({ outcome: "skipped", reason: "prospect-rejected" });
    const { data } = await sb.from("outreach_messages").select("id").eq("prospect_id", prospectId);
    expect(data).toHaveLength(0);
  });

  it("a null prospect_id returns a skip outcome without querying prospects at all", async () => {
    const scan = await seedScan(null);

    const result = await maybeGenerateDraftForProspectScan(sb, scan, { generate: neverGenerate });

    expect(result).toEqual({ outcome: "skipped", reason: "not-a-prospect-scan" });
  });

  it("a scan whose status is not 'completed' returns a skip outcome", async () => {
    const prospectId = await seedProspect();
    const scan = await seedScan(prospectId, { status: "scanning" });

    const result = await maybeGenerateDraftForProspectScan(sb, scan, { generate: neverGenerate });

    expect(result).toEqual({ outcome: "skipped", reason: "scan-not-ready" });
  });

  it("a scan with missing scores or summary returns a skip outcome", async () => {
    const prospectId = await seedProspect();
    const scan = await seedScan(prospectId, { scores: null, summary: null });

    const result = await maybeGenerateDraftForProspectScan(sb, scan, { generate: neverGenerate });

    expect(result).toEqual({ outcome: "skipped", reason: "scan-not-ready" });
  });

  it("an injected generate that returns null produces no row, a failed outcome, and does not throw", async () => {
    const prospectId = await seedProspect();
    const scan = await seedScan(prospectId);

    const result = await maybeGenerateDraftForProspectScan(sb, scan, { generate: async () => null });

    expect(result).toEqual({ outcome: "failed", reason: "generation-failed" });
    const { data } = await sb.from("outreach_messages").select("id").eq("prospect_id", prospectId);
    expect(data).toHaveLength(0);
  });

  it("D-6-08: a low-scoring (12) and a high-scoring (88) prospect BOTH get a row — no score threshold gates drafting", async () => {
    const lowProspectId = await seedProspect();
    const lowScan = await seedScan(lowProspectId, {
      scores: { ...baseScores, overall: 12 },
      summary: { ...baseSummary, criticalIssues: 5 },
    });
    const highProspectId = await seedProspect();
    const highScan = await seedScan(highProspectId, {
      scores: { ...baseScores, overall: 88 },
      summary: { ...baseSummary, criticalIssues: 1 },
    });

    const lowResult = await maybeGenerateDraftForProspectScan(sb, lowScan, { generate: stubGenerate });
    const highResult = await maybeGenerateDraftForProspectScan(sb, highScan, { generate: stubGenerate });

    expect(lowResult.outcome).toBe("created");
    expect(highResult.outcome).toBe("created");
  });
});
