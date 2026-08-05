/**
 * Integration suite for lib/send-record.ts — markAsSent(), the second half
 * of the Phase 8 two-step flow, asserted against a real Postgres with
 * migrations through 020 applied.
 *
 * PRECONDITION: a local Supabase stack, NOT production:
 *   supabase start --ignore-health-check
 *   supabase migration up
 *   npx vitest run lib/send-record.integration.test.ts
 *
 * This repo's own .env.local points at REMOTE PRODUCTION Supabase. The
 * override below is what keeps this suite local — it must run before any
 * client-constructing import below it. Run this suite against local
 * Supabase only.
 *
 * PERMANENT FIXTURE RESIDUE (deliberate, mirrors lib/send-gate.integration.test.ts):
 * send_records carries a BEFORE UPDATE OR DELETE trigger, so a row this
 * suite writes there can never be cleaned up by a DELETE, and the
 * outreach_messages/prospects rows it references are FK-locked behind it
 * too. The two successful-mark fixtures below (one with
 * commercial_contact_invited false, one true — needed by the
 * tw_exemption_claimed assertion) share one permanently-seeded
 * legal_regimes row for `${PERMANENT_FIXTURE_COUNTRY}`, and are created
 * idempotently (check-then-insert on a stable marker subject, then reused
 * via markAsSent's own already-sent refusal on every later run) so
 * re-running this suite never duplicates them. This is accepted, permanent
 * test residue in local Postgres, not a leak: unlike the FK-safe/chunked
 * cleanup below (mirroring the fix for the 2026-08-02/08-03 leaks), which
 * prevents unbounded growth, these rows are fixed in number and never grow.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
// prepareSend() composes the opt-out link (lib/opt-out-link.ts's
// renderSendableBody), which requires this secret. Set here as a literal
// test-only value, same pattern as lib/opt-out-link.test.ts.
process.env.UNSUBSCRIBE_TOKEN_SECRET = "test-secret-for-send-record-integration-tests";

import { createServerClient } from "@/lib/supabase";
import { markAsSent } from "./send-record";
import { prepareSend, PREPARED_TTL_MINUTES } from "./send-gate";
import { chunkIds } from "./chunk-ids";
import { appendArticle14Notice, ARTICLE_14_NOTICE_EN } from "@/lib/draft-prompt";
import { writeSuppression } from "@/lib/suppression";
import { normalizeDomain } from "@/lib/domain-normalize";

let sb: SupabaseClient;

beforeAll(() => {
  sb = createServerClient();
});

const FIXTURE_DOMAIN_PREFIX = "test-send-record-";
/** Fake, never-real two-letter code for the fixture-owned legal_regimes row this suite owns end to end. */
const FIXTURE_COUNTRY = "QQ";

/** Permanent fixture identifiers — see the file header's PERMANENT FIXTURE RESIDUE note. */
const PERMANENT_FIXTURE_COUNTRY = "QR";
const MARK_SUCCESS_DOMAIN_FALSE = "send-record-success-false-permanent-fixture.example.com";
const MARK_SUCCESS_EMAIL_FALSE = "success-false-fixture@example.com";
const MARK_SUCCESS_MARKER_SUBJECT_FALSE = "Send-record success (tw false) permanent fixture";
const MARK_SUCCESS_DOMAIN_TRUE = "send-record-success-true-permanent-fixture.example.com";
const MARK_SUCCESS_EMAIL_TRUE = "success-true-fixture@example.com";
const MARK_SUCCESS_MARKER_SUBJECT_TRUE = "Send-record success (tw true) permanent fixture";
const ALREADY_SENT_SIMULATED_DOMAIN = "send-record-already-sent-simulated-permanent-fixture.example.com";
const ALREADY_SENT_SIMULATED_EMAIL = "already-sent-simulated-fixture@example.com";
const ALREADY_SENT_SIMULATED_MARKER_SUBJECT = "Already-sent-simulated permanent fixture";

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

async function seedApprovedMessage(
  prospectId: string,
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const { data, error } = await sb
    .from("outreach_messages")
    .insert({
      prospect_id: prospectId,
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

/** Permanent, never-deleted legal_regimes row backing both successful-mark fixtures below. */
async function ensurePermanentLegalRegime(): Promise<void> {
  const { error } = await sb.from("legal_regimes").upsert(
    {
      country_code: PERMANENT_FIXTURE_COUNTRY,
      spam_law_regime: "opt-out-narrow-exemption",
      current_lia_version: 1,
      legal_basis: "legitimate interest (send-record permanent fixture)",
      article_14_notice_approved: true,
    },
    { onConflict: "country_code" }
  );
  if (error) throw error;
}

interface SuccessfulMarkFixture {
  prospectId: string;
  messageId: string;
  sendRecordId: string;
  preparedAt: string;
}

/**
 * Idempotent: ensures one permanently-marked message exists for the given
 * domain/email/marker, reusing it (and its already-written send_records
 * row) on every later run instead of re-marking or duplicating it. Exists
 * twice below (tw false / tw true) to drive the tw_exemption_claimed
 * assertion, which needs two real rows differing on exactly that field.
 */
async function ensureSuccessfulMarkFixture(
  domain: string,
  email: string,
  markerSubject: string,
  commercialContactInvited: boolean
): Promise<SuccessfulMarkFixture> {
  await ensurePermanentLegalRegime();

  const { data: existingProspect, error: prospectLookupError } = await sb
    .from("prospects")
    .select("id")
    .eq("domain", domain)
    .maybeSingle();
  if (prospectLookupError) throw prospectLookupError;

  let prospectId = existingProspect?.id as string | undefined;
  if (!prospectId) {
    const { data, error } = await sb
      .from("prospects")
      .insert({
        domain,
        name: "Send-record permanent fixture",
        country: PERMANENT_FIXTURE_COUNTRY,
        contact_email: email,
        contact_email_type: "generic",
        commercial_contact_invited: commercialContactInvited,
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
    .eq("draft_subject", markerSubject)
    .maybeSingle();
  if (messageLookupError) throw messageLookupError;

  let messageId = existingMessage?.id as string | undefined;
  if (!messageId) {
    const { data, error } = await sb
      .from("outreach_messages")
      .insert({
        prospect_id: prospectId,
        draft_subject: markerSubject,
        draft_body: appendArticle14Notice("Body text.", "en"),
        status: "approved",
        approved_by: "admin-secret",
        approved_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    messageId = data!.id as string;
  }

  const { data: existingRecord, error: recordLookupError } = await sb
    .from("send_records")
    .select("id")
    .eq("outreach_message_id", messageId)
    .maybeSingle();
  if (recordLookupError) throw recordLookupError;

  if (!existingRecord) {
    const prepareResult = await prepareSend(sb, messageId);
    if (!prepareResult.ok) {
      throw new Error(`fixture prepareSend failed: ${prepareResult.refusal} ${prepareResult.detail}`);
    }
    const markResult = await markAsSent(sb, messageId, prepareResult.preparedHash);
    if (!markResult.ok) {
      throw new Error(`fixture markAsSent failed: ${markResult.refusal} ${markResult.detail}`);
    }
  }

  const { data: record, error: recordError } = await sb
    .from("send_records")
    .select("id")
    .eq("outreach_message_id", messageId)
    .single();
  if (recordError) throw recordError;

  const { data: message, error: messageError } = await sb
    .from("outreach_messages")
    .select("prepared_at")
    .eq("id", messageId)
    .single();
  if (messageError) throw messageError;

  return {
    prospectId,
    messageId,
    sendRecordId: record!.id as string,
    preparedAt: message!.prepared_at as string,
  };
}

/**
 * Idempotent: a permanently-approved message (status never advances to
 * `sent`) with a send_records row already sitting under it — the exact
 * "recorded but stale status" state Task 1's insert-then-update ordering
 * can leave behind on a real status-update failure. evaluateSendGates()
 * refuses with `already-sent` the moment any such row exists, at its own
 * step 2, before any legal-config read.
 *
 * This is deliberately NOT built from two real calls to markAsSent(): a
 * first FULLY successful call flips status to `sent`, and a second real
 * call would then trip evaluateSendGates' status check (`not-approved`)
 * before ever reaching its already-sent check — that path already exists
 * as production behavior and is a different assertion than "a send_records
 * row already exists for this message id". Mirrors
 * lib/send-gate.integration.test.ts's own already-sent permanent fixture,
 * which seeds the send_records row directly for the same reason.
 * prepared_at is refreshed to now on every call so a run of this suite
 * days later still reaches the already-sent check rather than tripping
 * markAsSent's own prepare-stale check first.
 */
async function ensureAlreadySentSimulatedFixture(): Promise<{ messageId: string }> {
  const { data: existingProspect, error: prospectLookupError } = await sb
    .from("prospects")
    .select("id")
    .eq("domain", ALREADY_SENT_SIMULATED_DOMAIN)
    .maybeSingle();
  if (prospectLookupError) throw prospectLookupError;

  let prospectId = existingProspect?.id as string | undefined;
  if (!prospectId) {
    const { data, error } = await sb
      .from("prospects")
      .insert({
        domain: ALREADY_SENT_SIMULATED_DOMAIN,
        name: "Already-sent-simulated permanent fixture",
        country: PERMANENT_FIXTURE_COUNTRY,
        contact_email: ALREADY_SENT_SIMULATED_EMAIL,
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
    .eq("draft_subject", ALREADY_SENT_SIMULATED_MARKER_SUBJECT)
    .maybeSingle();
  if (messageLookupError) throw messageLookupError;

  let messageId = existingMessage?.id as string | undefined;
  if (!messageId) {
    const { data, error } = await sb
      .from("outreach_messages")
      .insert({
        prospect_id: prospectId,
        draft_subject: ALREADY_SENT_SIMULATED_MARKER_SUBJECT,
        draft_body: "Body text.",
        status: "approved",
        approved_by: "admin-secret",
        approved_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    messageId = data!.id as string;

    const { error: recordError } = await sb.from("send_records").insert({
      outreach_message_id: messageId,
      prospect_id: prospectId,
      resolved_email: ALREADY_SENT_SIMULATED_EMAIL,
      resolved_email_type: "generic",
      subject_sent: ALREADY_SENT_SIMULATED_MARKER_SUBJECT,
      body_sent: "Body text.",
      legal_basis: "legitimate interest (simulated already-sent fixture)",
      lia_version: 1,
      tw_exemption_claimed: false,
      first_contact_notice_included: false,
      is_first_contact: true,
      approved_by: "admin-secret",
      suppression_checked_at: new Date().toISOString(),
      suppression_hit: false,
    });
    if (recordError) throw recordError;
  }

  const { error: refreshError } = await sb
    .from("outreach_messages")
    .update({ prepared_at: new Date().toISOString() })
    .eq("id", messageId);
  if (refreshError) throw refreshError;

  return { messageId };
}

/** Suppression rows created by a test, deleted in the afterEach below. Reset per test. */
let suppressionEmailsToClean: string[] = [];

// FK-safe chunked cleanup, mirroring lib/send-gate.integration.test.ts and
// lib/outreach-queue.integration.test.ts (the fix for the 2026-08-02/08-03
// leaks): release latest_scan_id before deleting scans, delete
// outreach_messages before scans and prospects, chunk every `.in()`, and
// throw on any error rather than discard it. This suite writes no
// send_records rows under the `${FIXTURE_DOMAIN_PREFIX}` prefix — every
// refusal path in the tests below writes nothing, and only the permanent
// fixtures above ever reach a successful insert.
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

async function sendRecordCountFor(messageId: string): Promise<number> {
  const { count, error } = await sb
    .from("send_records")
    .select("id", { count: "exact", head: true })
    .eq("outreach_message_id", messageId);
  if (error) throw error;
  return count ?? 0;
}

describe("send-record integration", () => {
  describe("markAsSent", () => {
    it("refuses with not-prepared when prepared_at is null, and writes nothing", async () => {
      const prospectId = await seedProspect();
      const messageId = await seedApprovedMessage(prospectId);

      const result = await markAsSent(sb, messageId, "irrelevant-hash");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal).toBe("not-prepared");

      expect(await sendRecordCountFor(messageId)).toBe(0);
    });

    it("refuses with prepare-stale when prepared_at is older than PREPARED_TTL_MINUTES, and writes nothing", async () => {
      const prospectId = await seedProspect();
      const staleTimestamp = new Date(Date.now() - (PREPARED_TTL_MINUTES + 5) * 60_000).toISOString();
      const messageId = await seedApprovedMessage(prospectId, { prepared_at: staleTimestamp });

      const result = await markAsSent(sb, messageId, "irrelevant-hash");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal).toBe("prepare-stale");

      expect(await sendRecordCountFor(messageId)).toBe(0);
    });

    it(
      "refuses with suppressed when the address was suppressed after a successful Prepare, and writes nothing " +
        "(CMP-02: the gate is re-run at Mark, not carried over from Prepare)",
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

        const messageId = await seedApprovedMessage(prospectId, {
          draft_body: appendArticle14Notice("Body text.", "en"),
        });

        const prepareResult = await prepareSend(sb, messageId);
        expect(prepareResult.ok).toBe(true);
        if (!prepareResult.ok) return;

        const domain = normalizeDomain(resolvedEmail);
        const { created } = await writeSuppression(sb, {
          email: resolvedEmail,
          domain,
          reason: "bounced",
          source: "backfill",
        });
        expect(created).toBe(true);
        suppressionEmailsToClean.push(resolvedEmail);

        const result = await markAsSent(sb, messageId, prepareResult.preparedHash);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.refusal).toBe("suppressed");

        expect(await sendRecordCountFor(messageId)).toBe(0);
      }
    );

    it(
      "refuses with prepared-content-changed when the preparedHash does not match a fresh hash of the " +
        "recomposed subject and body, and writes nothing",
      async () => {
        await seedFixtureLegalRegime({
          legal_basis: "legitimate interest (fixture)",
          article_14_notice_approved: true,
        });

        const prospectId = await seedProspect({ country: FIXTURE_COUNTRY });
        const messageId = await seedApprovedMessage(prospectId, {
          draft_body: appendArticle14Notice("Body text.", "en"),
        });

        const prepareResult = await prepareSend(sb, messageId);
        expect(prepareResult.ok).toBe(true);

        const result = await markAsSent(sb, messageId, "0".repeat(64));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.refusal).toBe("prepared-content-changed");

        expect(await sendRecordCountFor(messageId)).toBe(0);
      }
    );

    it(
      "a successful mark inserts exactly one send_records row whose fields match the freshly evaluated gate " +
        "context and the recomposed message, and sets outreach_messages.status to sent with a stamped sent_at",
      async () => {
        const fixture = await ensureSuccessfulMarkFixture(
          MARK_SUCCESS_DOMAIN_FALSE,
          MARK_SUCCESS_EMAIL_FALSE,
          MARK_SUCCESS_MARKER_SUBJECT_FALSE,
          false
        );

        const { data: rows, error } = await sb
          .from("send_records")
          .select("*")
          .eq("outreach_message_id", fixture.messageId);
        if (error) throw error;
        expect(rows).toHaveLength(1);

        const row = rows![0];
        expect(row.id).toBe(fixture.sendRecordId);
        expect(row.prospect_id).toBe(fixture.prospectId);
        expect(row.resolved_email).toBe(MARK_SUCCESS_EMAIL_FALSE);
        expect(row.resolved_email_type).toBe("generic");
        expect(row.legal_basis).toBe("legitimate interest (send-record permanent fixture)");
        expect(row.lia_version).toBe(1);
        expect(row.tw_exemption_claimed).toBe(false);
        expect(row.first_contact_notice_included).toBe(true);
        expect(row.is_first_contact).toBe(true);
        expect(row.approved_by).toBe("admin-secret");
        expect(row.suppression_hit).toBe(false);
        expect(row.suppression_checked_at).toBeTruthy();
        expect(row.subject_sent).toBe(MARK_SUCCESS_MARKER_SUBJECT_FALSE);
        expect(row.body_sent).toContain(ARTICLE_14_NOTICE_EN);
        expect(row.body_sent).toContain("Unsubscribe:");

        const { data: message, error: messageError } = await sb
          .from("outreach_messages")
          .select("status, sent_at")
          .eq("id", fixture.messageId)
          .single();
        if (messageError) throw messageError;
        expect(message!.status).toBe("sent");
        expect(message!.sent_at).toBeTruthy();
      }
    );

    it("a second mark of the same message refuses with already-sent and leaves exactly one send_records row", async () => {
      const { messageId } = await ensureAlreadySentSimulatedFixture();

      const result = await markAsSent(sb, messageId, "irrelevant-because-already-sent-refuses-first");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal).toBe("already-sent");

      expect(await sendRecordCountFor(messageId)).toBe(1);
    });

    it("rejects an UPDATE and a DELETE against a written send_records row with the immutability trigger's message", async () => {
      const fixture = await ensureSuccessfulMarkFixture(
        MARK_SUCCESS_DOMAIN_FALSE,
        MARK_SUCCESS_EMAIL_FALSE,
        MARK_SUCCESS_MARKER_SUBJECT_FALSE,
        false
      );

      const { error: updateError } = await sb
        .from("send_records")
        .update({ suppression_hit: true })
        .eq("id", fixture.sendRecordId);
      expect(updateError).toBeTruthy();
      expect(updateError!.message).toContain("send_records rows are immutable");

      const { error: deleteError } = await sb
        .from("send_records")
        .delete()
        .eq("id", fixture.sendRecordId);
      expect(deleteError).toBeTruthy();
      expect(deleteError!.message).toContain("send_records rows are immutable");
    });

    it("tw_exemption_claimed on the written row equals the seeded commercial_contact_invited value for both the false and the true fixture", async () => {
      const falseFixture = await ensureSuccessfulMarkFixture(
        MARK_SUCCESS_DOMAIN_FALSE,
        MARK_SUCCESS_EMAIL_FALSE,
        MARK_SUCCESS_MARKER_SUBJECT_FALSE,
        false
      );
      const trueFixture = await ensureSuccessfulMarkFixture(
        MARK_SUCCESS_DOMAIN_TRUE,
        MARK_SUCCESS_EMAIL_TRUE,
        MARK_SUCCESS_MARKER_SUBJECT_TRUE,
        true
      );

      const { data: falseRow, error: falseError } = await sb
        .from("send_records")
        .select("tw_exemption_claimed")
        .eq("id", falseFixture.sendRecordId)
        .single();
      if (falseError) throw falseError;
      expect(falseRow!.tw_exemption_claimed).toBe(false);

      const { data: trueRow, error: trueError } = await sb
        .from("send_records")
        .select("tw_exemption_claimed")
        .eq("id", trueFixture.sendRecordId)
        .single();
      if (trueError) throw trueError;
      expect(trueRow!.tw_exemption_claimed).toBe(true);
    });

    it("a successful mark produces suppression_hit false and a suppression_checked_at later than the message's prepared_at", async () => {
      const fixture = await ensureSuccessfulMarkFixture(
        MARK_SUCCESS_DOMAIN_FALSE,
        MARK_SUCCESS_EMAIL_FALSE,
        MARK_SUCCESS_MARKER_SUBJECT_FALSE,
        false
      );

      const { data: row, error } = await sb
        .from("send_records")
        .select("suppression_hit, suppression_checked_at")
        .eq("id", fixture.sendRecordId)
        .single();
      if (error) throw error;
      expect(row!.suppression_hit).toBe(false);

      const checkedAtMs = new Date(row!.suppression_checked_at as string).getTime();
      const preparedAtMs = new Date(fixture.preparedAt).getTime();
      expect(checkedAtMs).toBeGreaterThan(preparedAtMs);
    });
  });
});
