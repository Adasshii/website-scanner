/**
 * Integration suite for lib/send-gate.ts — the Phase 8 refusal path,
 * asserted against a real Postgres with migrations through 020 applied.
 *
 * PRECONDITION: a local Supabase stack, NOT production:
 *   supabase start --ignore-health-check
 *   supabase migration up
 *   npx vitest run lib/send-gate.integration.test.ts
 *
 * This repo's own .env.local points at REMOTE PRODUCTION Supabase. The
 * override below is what keeps this suite local — it must run before any
 * client-constructing import below it.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

import { createServerClient } from "@/lib/supabase";
import { evaluateSendGates } from "./send-gate";
import { chunkIds } from "./chunk-ids";
import { appendArticle14Notice } from "@/lib/draft-prompt";
import type { ScanScores, ScanSummary } from "@/types/scanner";

let sb: SupabaseClient;

beforeAll(() => {
  sb = createServerClient();
});

const FIXTURE_DOMAIN_PREFIX = "test-send-gate-";
/** Fake, never-real two-letter code for the fixture-owned legal_regimes row this suite owns end to end. */
const FIXTURE_COUNTRY = "ZZ";

const baseScores: ScanScores = {
  overall: 30,
  accessibility: 30,
  content: 30,
  seo: 30,
  performance: 30,
  security: 30,
  design: 30,
};

const baseSummary: ScanSummary = {
  totalPages: 1,
  totalIssues: 2,
  criticalIssues: 1,
  majorIssues: 1,
  topIssues: [],
  verdict: "needs work",
};

async function seedProspect(overrides: Record<string, unknown> = {}): Promise<string> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const { data, error } = await sb
    .from("prospects")
    .insert({
      domain: `${FIXTURE_DOMAIN_PREFIX}${suffix}.example.com`,
      name: "Test Prospect",
      country: "NL",
      contact_email: `contact-${suffix}@example.com`,
      contact_email_type: "generic",
      lifecycle_state: "scanned",
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function seedScan(prospectId: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await sb
    .from("scans")
    .insert({
      url: "https://example.com",
      domain: "test-send-gate.example.com",
      type: "full",
      status: "completed",
      scores: baseScores,
      summary: baseSummary,
      pages: [],
      ip_hash: "test-send-gate",
      prospect_id: prospectId,
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function seedApprovedMessage(
  prospectId: string,
  scanId: string,
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const { data, error } = await sb
    .from("outreach_messages")
    .insert({
      prospect_id: prospectId,
      scan_id: scanId,
      draft_subject: "A quick observation about your site",
      draft_body: "Body text.",
      status: "approved",
      approved_by: "admin-secret",
      approved_at: new Date().toISOString(),
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

/** Fixture-owned regime row this suite inserts and deletes itself. Never touches the shipped NL row. */
async function seedFixtureLegalRegime(overrides: Record<string, unknown> = {}): Promise<void> {
  const { error } = await sb
    .from("legal_regimes")
    .upsert(
      {
        country_code: FIXTURE_COUNTRY,
        spam_law_regime: "opt-out-narrow-exemption",
        current_lia_version: 1,
        legal_basis: null,
        article_14_notice_approved: false,
        ...overrides,
      },
      { onConflict: "country_code" }
    );
  if (error) throw error;
}

async function deleteFixtureLegalRegime(): Promise<void> {
  const { error } = await sb.from("legal_regimes").delete().eq("country_code", FIXTURE_COUNTRY);
  if (error) throw error;
}

// FK-safe chunked cleanup, mirroring lib/outreach-queue.integration.test.ts
// (the fix for the 2026-08-02/08-03 leaks): release latest_scan_id before
// deleting scans, delete outreach_messages before scans and prospects, chunk
// every `.in()`, and throw on any error rather than discard it. This suite
// creates no send_records rows in Task 1/2 (evaluateSendGates only reads
// that table); Task 3 documents its own handling for the immutability
// trigger where it starts writing them.
afterEach(async () => {
  const { data: prospects, error: selectError } = await sb
    .from("prospects")
    .select("id")
    .like("domain", `${FIXTURE_DOMAIN_PREFIX}%`);
  if (selectError) throw selectError;
  const ids = (prospects ?? []).map((p) => p.id as string);

  for (const batch of chunkIds(ids, 150)) {
    const { error: unlinkError } = await sb
      .from("prospects")
      .update({ latest_scan_id: null })
      .in("id", batch)
      .not("latest_scan_id", "is", null);
    if (unlinkError) throw unlinkError;

    const { error: outreachError } = await sb.from("outreach_messages").delete().in("prospect_id", batch);
    if (outreachError) throw outreachError;

    const { error: scanError } = await sb.from("scans").delete().in("prospect_id", batch);
    if (scanError) throw scanError;

    const { error: prospectError } = await sb.from("prospects").delete().in("id", batch);
    if (prospectError) throw prospectError;
  }

  await deleteFixtureLegalRegime();
});

describe("send-gate integration", () => {
  describe("evaluateSendGates", () => {
    it("refuses with legal-basis-unset under the shipped configuration (NL row, legal_basis NULL)", async () => {
      const prospectId = await seedProspect({ country: "NL" });
      const scanId = await seedScan(prospectId);
      const messageId = await seedApprovedMessage(prospectId, scanId);

      const result = await evaluateSendGates(sb, messageId);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal).toBe("legal-basis-unset");
      }
    });

    it("returns ok:true with a matching context once every gate is satisfied on a fixture-owned regime", async () => {
      await seedFixtureLegalRegime({ legal_basis: "legitimate interest (fixture)", article_14_notice_approved: true });

      const prospectId = await seedProspect({
        country: FIXTURE_COUNTRY,
        contact_email: "contact@example.com",
        contact_email_type: "generic",
        commercial_contact_invited: true,
      });
      const scanId = await seedScan(prospectId);
      // FIXTURE_COUNTRY ("ZZ") resolves to locale "en" (localeForCountry's
      // only mapped code is NL) — the fixture prospect has zero prior
      // send_records, so this is a first-contact case, and evaluateSendGates
      // requires the real EN notice text to be present in the body.
      const messageId = await seedApprovedMessage(prospectId, scanId, {
        draft_body: appendArticle14Notice("Body text.", "en"),
      });

      const result = await evaluateSendGates(sb, messageId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.context.resolvedEmail).toBe("contact@example.com");
        expect(result.context.liaVersion).toBe(1);
        expect(result.context.twExemptionClaimed).toBe(true);
      }
    });
  });
});
