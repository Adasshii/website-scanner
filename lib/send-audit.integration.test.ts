/**
 * Integration suite for lib/send-audit.ts's getSendAudit() and
 * GET /api/admin/outreach/audit, asserted against a real Postgres with
 * migrations through 020 applied.
 *
 * PRECONDITION: a local Supabase stack, NOT production:
 *   supabase start --ignore-health-check
 *   supabase migration up
 *   npx vitest run lib/send-audit.integration.test.ts
 *
 * This repo's own .env.local points at REMOTE PRODUCTION Supabase. The
 * override below is what keeps this suite local — it must run before any
 * client-constructing import below it. Run this suite against local
 * Supabase only.
 *
 * PERMANENT FIXTURE RESIDUE (deliberate, mirrors lib/send-gate.integration.test.ts
 * and lib/send-record.integration.test.ts): send_records carries a BEFORE
 * UPDATE OR DELETE trigger, so a row this suite writes there can never be
 * cleaned up by a DELETE, and the outreach_messages/prospects rows it
 * references are FK-locked behind it too. Two permanent, disjoint
 * prospects (each under its own never-collected domain, outside the
 * `${FIXTURE_DOMAIN_PREFIX}` pattern the afterEach cleanup targets) back
 * the ordering, field-mapping, and cross-prospect-isolation assertions
 * below, created idempotently (check-then-insert on a stable marker
 * subject) so re-running this suite reuses them instead of duplicating
 * rows. Only the throwaway, no-send-record prospect used for the
 * empty-array case is created under `${FIXTURE_DOMAIN_PREFIX}` and
 * actually deleted by the afterEach cleanup.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
// The route handler under test reads process.env.ADMIN_SECRET per request —
// set here as a literal test-only value so this suite is independent of
// whatever the real environment (local or production) happens to hold.
process.env.ADMIN_SECRET = "test-admin-secret-for-send-audit-integration-tests";

import { createServerClient } from "@/lib/supabase";
import { getSendAudit } from "./send-audit";
import { chunkIds } from "./chunk-ids";
import { GET } from "@/app/api/admin/outreach/audit/route";

let sb: SupabaseClient;

beforeAll(() => {
  sb = createServerClient();
});

const FIXTURE_DOMAIN_PREFIX = "test-send-audit-";
const ADMIN_SECRET = "test-admin-secret-for-send-audit-integration-tests";

/** Permanent fixture identifiers — see the file header's PERMANENT FIXTURE RESIDUE note. */
const AUDIT_FIXTURE_DOMAIN_A = "send-audit-fixture-a-permanent.example.com";
const AUDIT_FIXTURE_EMAIL_A = "audit-fixture-a@example.com";
const AUDIT_FIXTURE_A_MARKER_1 = "Send-audit fixture A message 1 (older)";
const AUDIT_FIXTURE_A_MARKER_2 = "Send-audit fixture A message 2 (newer)";

const AUDIT_FIXTURE_DOMAIN_B = "send-audit-fixture-b-permanent.example.com";
const AUDIT_FIXTURE_EMAIL_B = "audit-fixture-b@example.com";
const AUDIT_FIXTURE_B_MARKER = "Send-audit fixture B message";

interface AuditFixtureA {
  prospectId: string;
  olderRecordId: string;
  newerRecordId: string;
  olderMessageId: string;
  newerMessageId: string;
}

async function findOrCreateProspect(domain: string, email: string): Promise<string> {
  const { data: existing, error: lookupError } = await sb
    .from("prospects")
    .select("id")
    .eq("domain", domain)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return existing.id as string;

  const { data, error } = await sb
    .from("prospects")
    .insert({
      domain,
      name: "Send-audit permanent fixture",
      country: "NL",
      contact_email: email,
      contact_email_type: "generic",
      lifecycle_state: "scanned",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function findOrCreateMessage(prospectId: string, markerSubject: string): Promise<string> {
  const { data: existing, error: lookupError } = await sb
    .from("outreach_messages")
    .select("id")
    .eq("prospect_id", prospectId)
    .eq("draft_subject", markerSubject)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return existing.id as string;

  const { data, error } = await sb
    .from("outreach_messages")
    .insert({
      prospect_id: prospectId,
      draft_subject: markerSubject,
      draft_body: "Body text.",
      status: "sent",
      approved_by: "admin-secret",
      approved_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function findOrCreateSendRecord(
  messageId: string,
  overrides: Record<string, unknown>
): Promise<string> {
  const { data: existing, error: lookupError } = await sb
    .from("send_records")
    .select("id")
    .eq("outreach_message_id", messageId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return existing.id as string;

  const { data, error } = await sb
    .from("send_records")
    .insert({
      outreach_message_id: messageId,
      lia_version: 1,
      approved_by: "admin-secret",
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

/**
 * Idempotent: ensures prospect A carries exactly two send_records rows with
 * explicit, one-minute-apart sent_at values (the older row deliberately
 * inserted first so ordering by sent_at, not by insert order or id, is what
 * the assertions below prove), reusing them on every later run.
 */
async function ensureAuditFixtureA(): Promise<AuditFixtureA> {
  const prospectId = await findOrCreateProspect(AUDIT_FIXTURE_DOMAIN_A, AUDIT_FIXTURE_EMAIL_A);
  const olderMessageId = await findOrCreateMessage(prospectId, AUDIT_FIXTURE_A_MARKER_1);
  const newerMessageId = await findOrCreateMessage(prospectId, AUDIT_FIXTURE_A_MARKER_2);

  const olderSentAt = new Date("2026-01-01T00:00:00.000Z").toISOString();
  const newerSentAt = new Date("2026-01-01T00:01:00.000Z").toISOString();

  const olderRecordId = await findOrCreateSendRecord(olderMessageId, {
    prospect_id: prospectId,
    sent_at: olderSentAt,
    resolved_email: AUDIT_FIXTURE_EMAIL_A,
    resolved_email_type: "generic",
    subject_sent: AUDIT_FIXTURE_A_MARKER_1,
    body_sent: "Older message body.",
    legal_basis: "legitimate interest (audit fixture A, older)",
    tw_exemption_claimed: false,
    first_contact_notice_included: true,
    is_first_contact: true,
    suppression_checked_at: olderSentAt,
    suppression_hit: false,
  });

  const newerRecordId = await findOrCreateSendRecord(newerMessageId, {
    prospect_id: prospectId,
    sent_at: newerSentAt,
    resolved_email: AUDIT_FIXTURE_EMAIL_A,
    resolved_email_type: "named-person",
    subject_sent: AUDIT_FIXTURE_A_MARKER_2,
    body_sent: "Newer message body.",
    legal_basis: "legitimate interest (audit fixture A, newer)",
    tw_exemption_claimed: true,
    first_contact_notice_included: false,
    is_first_contact: false,
    suppression_checked_at: newerSentAt,
    suppression_hit: false,
  });

  return { prospectId, olderRecordId, newerRecordId, olderMessageId, newerMessageId };
}

/** Idempotent: ensures prospect B carries exactly one send_records row, disjoint from prospect A. */
async function ensureAuditFixtureB(): Promise<{ prospectId: string; recordId: string }> {
  const prospectId = await findOrCreateProspect(AUDIT_FIXTURE_DOMAIN_B, AUDIT_FIXTURE_EMAIL_B);
  const messageId = await findOrCreateMessage(prospectId, AUDIT_FIXTURE_B_MARKER);

  const sentAt = new Date("2026-01-01T00:02:00.000Z").toISOString();
  const recordId = await findOrCreateSendRecord(messageId, {
    prospect_id: prospectId,
    sent_at: sentAt,
    resolved_email: AUDIT_FIXTURE_EMAIL_B,
    resolved_email_type: "generic",
    subject_sent: AUDIT_FIXTURE_B_MARKER,
    body_sent: "Fixture B message body.",
    legal_basis: "legitimate interest (audit fixture B)",
    tw_exemption_claimed: false,
    first_contact_notice_included: true,
    is_first_contact: true,
    suppression_checked_at: sentAt,
    suppression_hit: false,
  });

  return { prospectId, recordId };
}

// FK-safe chunked cleanup, mirroring lib/send-gate.integration.test.ts and
// lib/send-record.integration.test.ts. This suite writes no send_records
// rows under the `${FIXTURE_DOMAIN_PREFIX}` prefix — only the two permanent
// fixtures above ever reach send_records, and neither is ever deleted (file
// header).
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
});

function callAuditRoute(prospectId: string | null, secret: string | null): Promise<Response> {
  const url = prospectId
    ? `http://localhost/api/admin/outreach/audit?prospectId=${encodeURIComponent(prospectId)}`
    : "http://localhost/api/admin/outreach/audit";
  const headers: Record<string, string> = {};
  if (secret !== null) headers["x-admin-secret"] = secret;
  const request = new NextRequest(url, { headers });
  return GET(request);
}

describe("send-audit integration", () => {
  describe("getSendAudit", () => {
    it("returns an empty array for a prospect with no send record, never null and never a thrown error", async () => {
      const prospectId = await findOrCreateProspect(
        `${FIXTURE_DOMAIN_PREFIX}${crypto.randomUUID().slice(0, 8)}.example.com`,
        `no-record-${crypto.randomUUID().slice(0, 8)}@example.com`
      );

      const entries = await getSendAudit(sb, prospectId);
      expect(entries).not.toBeNull();
      expect(Array.isArray(entries)).toBe(true);
      expect(entries).toHaveLength(0);
    });

    it("returns one entry per send_records row for that prospect, newest first by sent timestamp", async () => {
      const fixture = await ensureAuditFixtureA();

      const entries = await getSendAudit(sb, fixture.prospectId);
      expect(entries).toHaveLength(2);
      expect(entries[0].sendRecordId).toBe(fixture.newerRecordId);
      expect(entries[1].sendRecordId).toBe(fixture.olderRecordId);
      expect(new Date(entries[0].sentAt).getTime()).toBeGreaterThan(new Date(entries[1].sentAt).getTime());
    });

    it("each entry carries all sixteen stored values, camelCased, matching the written record field by field", async () => {
      const fixture = await ensureAuditFixtureA();

      const entries = await getSendAudit(sb, fixture.prospectId);
      const newer = entries.find((e) => e.sendRecordId === fixture.newerRecordId);
      expect(newer).toBeDefined();
      expect(newer!.outreachMessageId).toBe(fixture.newerMessageId);
      expect(newer!.prospectId).toBe(fixture.prospectId);
      expect(newer!.resolvedEmail).toBe(AUDIT_FIXTURE_EMAIL_A);
      expect(newer!.resolvedEmailType).toBe("named-person");
      expect(newer!.subjectSent).toBe(AUDIT_FIXTURE_A_MARKER_2);
      expect(newer!.bodySent).toBe("Newer message body.");
      expect(newer!.legalBasis).toBe("legitimate interest (audit fixture A, newer)");
      expect(newer!.liaVersion).toBe(1);
      expect(newer!.twExemptionClaimed).toBe(true);
      expect(newer!.firstContactNoticeIncluded).toBe(false);
      expect(newer!.isFirstContact).toBe(false);
      expect(newer!.approvedBy).toBe("admin-secret");
      expect(newer!.suppressionHit).toBe(false);
      expect(typeof newer!.suppressionCheckedAt).toBe("string");
      expect(typeof newer!.sentAt).toBe("string");
    });

    it("two prospects with records do not bleed into each other's results", async () => {
      const fixtureA = await ensureAuditFixtureA();
      const fixtureB = await ensureAuditFixtureB();

      const entriesA = await getSendAudit(sb, fixtureA.prospectId);
      const entriesB = await getSendAudit(sb, fixtureB.prospectId);

      expect(entriesA.every((e) => e.prospectId === fixtureA.prospectId)).toBe(true);
      expect(entriesB.every((e) => e.prospectId === fixtureB.prospectId)).toBe(true);
      expect(entriesA.map((e) => e.sendRecordId)).not.toContain(fixtureB.recordId);
      expect(entriesB.map((e) => e.sendRecordId)).toEqual([fixtureB.recordId]);
    });
  });

  describe("GET /api/admin/outreach/audit", () => {
    it("returns 401 without the admin secret", async () => {
      const res = await callAuditRoute("00000000-0000-0000-0000-000000000000", null);
      expect(res.status).toBe(401);
    });

    it("returns 401 with the wrong admin secret", async () => {
      const res = await callAuditRoute("00000000-0000-0000-0000-000000000000", "wrong-secret");
      expect(res.status).toBe(401);
    });

    it("returns 400 for a missing prospect id", async () => {
      const res = await callAuditRoute(null, ADMIN_SECRET);
      expect(res.status).toBe(400);
    });

    it("returns 400 for a non-UUID prospect id", async () => {
      const res = await callAuditRoute("abc", ADMIN_SECRET);
      expect(res.status).toBe(400);
    });

    it("returns 200 with an entries array scoped to the requested prospect only", async () => {
      const fixture = await ensureAuditFixtureA();

      const res = await callAuditRoute(fixture.prospectId, ADMIN_SECRET);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.entries)).toBe(true);
      expect(data.entries).toHaveLength(2);
      expect(data.entries.every((e: { prospectId: string }) => e.prospectId === fixture.prospectId)).toBe(true);
    });
  });
});
