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
 * client-constructing import below it. Run this suite against local
 * Supabase only.
 *
 * PERMANENT FIXTURE RESIDUE (deliberate): send_records carries a BEFORE
 * UPDATE OR DELETE trigger, so a row this suite inserts there can never be
 * cleaned up by a DELETE, and the outreach_messages/prospects rows it
 * references are FK-locked behind it too. Rather than fight the trigger,
 * the already-sent and non-first-contact cases below share one prospect
 * (domain `${ALREADY_SENT_PERMANENT_DOMAIN}`, outside the
 * `${FIXTURE_DOMAIN_PREFIX}` pattern the afterEach cleanup targets), one
 * permanently-seeded `legal_regimes` row for `${PERMANENT_FIXTURE_COUNTRY}`,
 * and two `outreach_messages` rows, all created idempotently (check-then-
 * insert on a stable marker) so re-running this suite reuses them instead of
 * duplicating rows. This is accepted, permanent test residue in local
 * Postgres, not a leak: unlike the FK-safe/chunked cleanup below (closing
 * the 2026-08-02/08-03 leaks), which prevents unbounded growth, these five
 * rows are fixed in number and never grow.
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
import { writeSuppression, liftSuppression } from "@/lib/suppression";
import { normalizeDomain } from "@/lib/domain-normalize";
import type { ScanScores, ScanSummary } from "@/types/scanner";

let sb: SupabaseClient;

beforeAll(() => {
  sb = createServerClient();
});

const FIXTURE_DOMAIN_PREFIX = "test-send-gate-";
/** Fake, never-real two-letter code for the fixture-owned legal_regimes row this suite owns end to end. */
const FIXTURE_COUNTRY = "ZZ";
/** A second fake code, never seeded, used only to prove the no-legal-regime refusal. */
const NO_REGIME_COUNTRY = "YY";

/** Permanent fixture identifiers — see the file header's PERMANENT FIXTURE RESIDUE note. */
const PERMANENT_FIXTURE_COUNTRY = "XX";
const ALREADY_SENT_PERMANENT_DOMAIN = "send-gate-already-sent-permanent-fixture.example.com";
const ALREADY_SENT_PERMANENT_EMAIL = "already-sent-fixture@example.com";
const ALREADY_SENT_MARKER_SUBJECT = "Already-sent permanent fixture";
const NON_FIRST_CONTACT_MARKER_SUBJECT = "Non-first-contact permanent fixture";

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

/**
 * Idempotent: ensures the one permanent send_records row (and its owning
 * prospect/message/legal_regimes row) exists, reusing it on every run
 * instead of duplicating it. See the file header's PERMANENT FIXTURE
 * RESIDUE note.
 */
async function ensureAlreadySentPermanentFixture(): Promise<{ prospectId: string; sentMessageId: string }> {
  const { error: regimeError } = await sb.from("legal_regimes").upsert(
    {
      country_code: PERMANENT_FIXTURE_COUNTRY,
      spam_law_regime: "opt-out-narrow-exemption",
      current_lia_version: 1,
      legal_basis: "legitimate interest (permanent fixture)",
      // Deliberately false: the non-first-contact test proves a prospect
      // with a prior send_records row passes even while this flag is false.
      article_14_notice_approved: false,
    },
    { onConflict: "country_code" }
  );
  if (regimeError) throw regimeError;

  const { data: existingProspect, error: prospectLookupError } = await sb
    .from("prospects")
    .select("id")
    .eq("domain", ALREADY_SENT_PERMANENT_DOMAIN)
    .maybeSingle();
  if (prospectLookupError) throw prospectLookupError;

  let prospectId = existingProspect?.id as string | undefined;
  if (!prospectId) {
    const { data, error } = await sb
      .from("prospects")
      .insert({
        domain: ALREADY_SENT_PERMANENT_DOMAIN,
        name: "Already-sent permanent fixture",
        country: PERMANENT_FIXTURE_COUNTRY,
        contact_email: ALREADY_SENT_PERMANENT_EMAIL,
        contact_email_type: "generic",
        lifecycle_state: "scanned",
      })
      .select("id")
      .single();
    if (error) throw error;
    prospectId = data!.id as string;
  }

  const { data: existingMessage, error: messageLookupError } = await sb
    .from("outreach_messages")
    .select("id")
    .eq("prospect_id", prospectId)
    .eq("draft_subject", ALREADY_SENT_MARKER_SUBJECT)
    .maybeSingle();
  if (messageLookupError) throw messageLookupError;

  let sentMessageId = existingMessage?.id as string | undefined;
  if (!sentMessageId) {
    const { data, error } = await sb
      .from("outreach_messages")
      .insert({
        prospect_id: prospectId,
        draft_subject: ALREADY_SENT_MARKER_SUBJECT,
        draft_body: "Body text.",
        status: "approved",
        approved_by: "admin-secret",
        approved_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    sentMessageId = data!.id as string;

    const { error: sendRecordError } = await sb.from("send_records").insert({
      outreach_message_id: sentMessageId,
      prospect_id: prospectId,
      resolved_email: ALREADY_SENT_PERMANENT_EMAIL,
      resolved_email_type: "generic",
      subject_sent: ALREADY_SENT_MARKER_SUBJECT,
      body_sent: "Body text.",
      legal_basis: "legitimate interest (permanent fixture)",
      lia_version: 1,
      tw_exemption_claimed: false,
      first_contact_notice_included: false,
      is_first_contact: true,
      approved_by: "admin-secret",
      suppression_checked_at: new Date().toISOString(),
      suppression_hit: false,
    });
    if (sendRecordError) throw sendRecordError;
  }

  return { prospectId, sentMessageId };
}

/** Idempotent second message for the permanent fixture prospect, used only by the non-first-contact test. */
async function ensureNonFirstContactMessage(prospectId: string): Promise<string> {
  const { data: existing, error: lookupError } = await sb
    .from("outreach_messages")
    .select("id")
    .eq("prospect_id", prospectId)
    .eq("draft_subject", NON_FIRST_CONTACT_MARKER_SUBJECT)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return existing.id as string;

  const { data, error } = await sb
    .from("outreach_messages")
    .insert({
      prospect_id: prospectId,
      draft_subject: NON_FIRST_CONTACT_MARKER_SUBJECT,
      draft_body: "Body text with no Article 14 notice at all.",
      status: "approved",
      approved_by: "admin-secret",
      approved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

/** Suppression rows created by a test, deleted in the afterEach below. Reset per test. */
let suppressionEmailsToClean: string[] = [];

// FK-safe chunked cleanup, mirroring lib/outreach-queue.integration.test.ts
// (the fix for the 2026-08-02/08-03 leaks): release latest_scan_id before
// deleting scans, delete outreach_messages before scans and prospects, chunk
// every `.in()`, and throw on any error rather than discard it. This suite
// creates no send_records rows for its `${FIXTURE_DOMAIN_PREFIX}` fixtures —
// only the permanent-residue fixture above writes to send_records, and that
// row is deliberately never deleted (file header).
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

  if (suppressionEmailsToClean.length > 0) {
    const { error } = await sb.from("suppressions").delete().in("email", suppressionEmailsToClean);
    if (error) throw error;
    suppressionEmailsToClean = [];
  }
});

describe("send-gate integration", () => {
  describe("evaluateSendGates", () => {
    it("refuses with not-approved when the message status is draft", async () => {
      const prospectId = await seedProspect();
      const scanId = await seedScan(prospectId);
      const messageId = await seedApprovedMessage(prospectId, scanId, { status: "draft" });

      const result = await evaluateSendGates(sb, messageId);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal).toBe("not-approved");
    });

    it("refuses with not-approved when the message status is edited", async () => {
      const prospectId = await seedProspect();
      const scanId = await seedScan(prospectId);
      const messageId = await seedApprovedMessage(prospectId, scanId, { status: "edited" });

      const result = await evaluateSendGates(sb, messageId);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal).toBe("not-approved");
    });

    it("refuses with already-sent when a send_records row already exists for this message", async () => {
      const { sentMessageId } = await ensureAlreadySentPermanentFixture();

      const result = await evaluateSendGates(sb, sentMessageId);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal).toBe("already-sent");
    });

    it("refuses with no-contact-email when the prospect has no contact_email", async () => {
      const prospectId = await seedProspect({ contact_email: null });
      const scanId = await seedScan(prospectId);
      const messageId = await seedApprovedMessage(prospectId, scanId);

      const result = await evaluateSendGates(sb, messageId);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal).toBe("no-contact-email");
    });

    it("refuses with contact-classification-unset when contact_email_type is null", async () => {
      const prospectId = await seedProspect({ contact_email_type: null });
      const scanId = await seedScan(prospectId);
      const messageId = await seedApprovedMessage(prospectId, scanId);

      const result = await evaluateSendGates(sb, messageId);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal).toBe("contact-classification-unset");
    });

    it(
      "refuses with suppressed while an active suppression row exists for the resolved address (CMP-02: checked " +
        "live), and stops refusing once it is lifted",
      async () => {
        await seedFixtureLegalRegime({
          legal_basis: "legitimate interest (fixture)",
          article_14_notice_approved: true,
        });

        const prospectId = await seedProspect({ country: FIXTURE_COUNTRY });
        const { data: prospectRow, error: prospectReadError } = await sb
          .from("prospects")
          .select("contact_email")
          .eq("id", prospectId)
          .single();
        if (prospectReadError) throw prospectReadError;
        const resolvedEmail = prospectRow!.contact_email as string;

        const scanId = await seedScan(prospectId);
        const messageId = await seedApprovedMessage(prospectId, scanId, {
          draft_body: appendArticle14Notice("Body text.", "en"),
        });

        const domain = normalizeDomain(resolvedEmail);
        const { created } = await writeSuppression(sb, {
          email: resolvedEmail,
          domain,
          reason: "bounced",
          source: "backfill",
        });
        expect(created).toBe(true);
        suppressionEmailsToClean.push(resolvedEmail);

        const suppressedResult = await evaluateSendGates(sb, messageId);
        expect(suppressedResult.ok).toBe(false);
        if (!suppressedResult.ok) expect(suppressedResult.refusal).toBe("suppressed");

        const { lifted } = await liftSuppression(sb, { email: resolvedEmail, reason: "test lift" });
        expect(lifted).toBe(true);

        const liftedResult = await evaluateSendGates(sb, messageId);
        expect(liftedResult.ok).toBe(true);
      }
    );

    it("refuses with suppressed when only the registrable domain (not the exact address) is suppressed (CMP-03)", async () => {
      const prospectId = await seedProspect();
      const scanId = await seedScan(prospectId);
      const messageId = await seedApprovedMessage(prospectId, scanId);

      const { data: prospectRow, error: prospectReadError } = await sb
        .from("prospects")
        .select("contact_email")
        .eq("id", prospectId)
        .single();
      if (prospectReadError) throw prospectReadError;
      const resolvedEmail = prospectRow!.contact_email as string;
      const domain = normalizeDomain(resolvedEmail)!;
      const unrelatedEmail = `unrelated-${crypto.randomUUID().slice(0, 8)}@${domain}`;

      const { error: insertError } = await sb.from("suppressions").insert({
        email: unrelatedEmail,
        domain,
        reason: "bounced",
        source: "backfill",
      });
      if (insertError) throw insertError;
      suppressionEmailsToClean.push(unrelatedEmail);

      const result = await evaluateSendGates(sb, messageId);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal).toBe("suppressed");
    });

    it("refuses with no-legal-regime when the prospect's country has no legal_regimes row", async () => {
      const prospectId = await seedProspect({ country: NO_REGIME_COUNTRY });
      const scanId = await seedScan(prospectId);
      const messageId = await seedApprovedMessage(prospectId, scanId);

      const result = await evaluateSendGates(sb, messageId);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal).toBe("no-legal-regime");
    });

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

    it("refuses with article-14-notice-not-approved on a first-contact prospect when the notice flag is false", async () => {
      await seedFixtureLegalRegime({
        legal_basis: "legitimate interest (fixture)",
        article_14_notice_approved: false,
      });

      const prospectId = await seedProspect({ country: FIXTURE_COUNTRY });
      const scanId = await seedScan(prospectId);
      const messageId = await seedApprovedMessage(prospectId, scanId);

      const result = await evaluateSendGates(sb, messageId);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal).toBe("article-14-notice-not-approved");
    });

    it("refuses with notice-missing-from-body when the approval flag is true but the notice text is absent", async () => {
      await seedFixtureLegalRegime({
        legal_basis: "legitimate interest (fixture)",
        article_14_notice_approved: true,
      });

      const prospectId = await seedProspect({ country: FIXTURE_COUNTRY });
      const scanId = await seedScan(prospectId);
      const messageId = await seedApprovedMessage(prospectId, scanId, {
        draft_body: "Body text with no notice at all.",
      });

      const result = await evaluateSendGates(sb, messageId);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal).toBe("notice-missing-from-body");
    });

    it("a prospect with a prior send_records row is not first-contact and skips both Article 14 gates even with the notice flag false", async () => {
      const { prospectId } = await ensureAlreadySentPermanentFixture();
      const messageId = await ensureNonFirstContactMessage(prospectId);

      const result = await evaluateSendGates(sb, messageId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.context.isFirstContact).toBe(false);
        expect(result.context.firstContactNoticeIncluded).toBe(false);
      }
    });

    it("returns ok:true with a matching context field by field once every gate is satisfied", async () => {
      await seedFixtureLegalRegime({ legal_basis: "legitimate interest (fixture)", article_14_notice_approved: true });

      const prospectId = await seedProspect({
        country: FIXTURE_COUNTRY,
        contact_email: "contact@example.com",
        contact_email_type: "generic",
        commercial_contact_invited: true,
      });
      const scanId = await seedScan(prospectId);
      const beforeCall = Date.now();
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
        const { context } = result;
        expect(context.messageId).toBe(messageId);
        expect(context.prospectId).toBe(prospectId);
        expect(context.resolvedEmail).toBe("contact@example.com");
        expect(context.resolvedEmailType).toBe("generic");
        expect(context.locale).toBe("en");
        expect(context.legalBasis).toBe("legitimate interest (fixture)");
        expect(context.liaVersion).toBe(1);
        expect(context.twExemptionClaimed).toBe(true);
        expect(context.isFirstContact).toBe(true);
        expect(context.firstContactNoticeIncluded).toBe(true);
        expect(context.approvedBy).toBe("admin-secret");
        expect(context.suppressionHit).toBe(false);
        const checkedAtMs = new Date(context.suppressionCheckedAt).getTime();
        expect(Number.isNaN(checkedAtMs)).toBe(false);
        expect(checkedAtMs).toBeGreaterThanOrEqual(beforeCall);
        expect(checkedAtMs).toBeLessThanOrEqual(Date.now());
      }
    });
  });
});
