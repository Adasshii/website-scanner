/**
 * Integration suite for lib/outreach-queue.ts — the queue's list/edit/
 * approve/reject/regenerate/manual-generate state transitions, asserted
 * against a real Postgres with migrations 010, 012 and 013 applied.
 *
 * PRECONDITION: a local Supabase stack, NOT production:
 *   supabase start
 *   supabase db reset   # applies supabase/migrations/*
 *   npx vitest run lib/outreach-queue.integration.test.ts
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
import {
  listOutreachDrafts,
  applyDraftEdit,
  approveDraft,
  rejectDraft,
  regenerateDraft,
  generateDraftForProspect,
  APPROVED_BY,
  MAX_DRAFT_BODY_LENGTH,
} from "./outreach-queue";
import type { ScanScores, ScanSummary } from "@/types/scanner";
import { chunkIds } from "./chunk-ids";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

let sb: SupabaseClient;

beforeAll(() => {
  sb = createServerClient();
});

// Deletes in an order that satisfies the FK graph, chunks every `.in()`, and
// throws on any failure. Mirrors the cleanup in
// reporting-aggregates.integration.test.ts (fixed 2026-08-02) — the same bug
// lived here and went unfixed, which is what actually leaked.
//
// This suite is the one that provably creates the cycle: the regenerate tests
// below set prospects.latest_scan_id (migration 013, ON DELETE NO ACTION), so
// the scans delete is rejected until that edge is released.
//
// How the leak became permanent: none of the four calls read `error`. The
// scans delete failed on the latest_scan_id FK, the prospects delete then
// failed on scans.prospect_id, both errors were discarded, and cleanup
// reported success. Survivors were prefix-matched again next run, so the set
// only ever grew. Past ~1000 survivors the unchunked `.in()` also overflowed
// the gateway's URI limit (the same limit lib/retention.ts documents), so
// cleanup could no longer succeed even once the FK order was right. It
// self-amplified: 1121 leaked prospects, purged 2026-08-03.
//
// Chunking keeps the recovery path open; throwing fails the run that caused a
// leak instead of the next one.
afterEach(async () => {
  const { data: prospects, error: selectError } = await sb
    .from("prospects")
    .select("id")
    .like("domain", "test-outreach-queue-%");
  if (selectError) throw selectError;
  const ids = (prospects ?? []).map((p) => p.id as string);
  if (ids.length === 0) return;

  for (const batch of chunkIds(ids, 150)) {
    // Release prospects.latest_scan_id before deleting scans, or the delete
    // below is rejected and takes every other fixture row down with it.
    const { error: unlinkError } = await sb
      .from("prospects")
      .update({ latest_scan_id: null })
      .in("id", batch)
      .not("latest_scan_id", "is", null);
    if (unlinkError) throw unlinkError;

    // outreach_messages first: it carries FKs to both prospects and scans.
    const { error: outreachError } = await sb
      .from("outreach_messages")
      .delete()
      .in("prospect_id", batch);
    if (outreachError) throw outreachError;

    const { error: scanError } = await sb.from("scans").delete().in("prospect_id", batch);
    if (scanError) throw scanError;

    const { error: prospectError } = await sb.from("prospects").delete().in("id", batch);
    if (prospectError) throw prospectError;
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
      domain: `test-outreach-queue-${suffix}.example.com`,
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

async function seedScan(prospectId: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await sb
    .from("scans")
    .insert({
      url: "https://example.com",
      domain: "test-outreach-queue.example.com",
      type: "full",
      status: "completed",
      scores: baseScores,
      summary: baseSummary,
      pages: [],
      ip_hash: "test-outreach-queue",
      prospect_id: prospectId,
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function seedMessage(
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
      status: "draft",
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

const stubGenerate = async (prompt: string): Promise<string> => `${prompt}\n\nBest, Joshua`;
const nullGenerate = async (): Promise<string | null> => null;

describe("outreach-queue integration", () => {
  describe("listOutreachDrafts", () => {
    it("pending filter returns only 'draft' and 'edited' rows, excludes approved/rejected", async () => {
      const p1 = await seedProspect();
      const s1 = await seedScan(p1);
      const draftId = await seedMessage(p1, s1, { status: "draft" });

      const p2 = await seedProspect();
      const s2 = await seedScan(p2);
      const editedId = await seedMessage(p2, s2, { status: "edited" });

      const p3 = await seedProspect();
      const s3 = await seedScan(p3);
      await seedMessage(p3, s3, { status: "approved" });

      const p4 = await seedProspect();
      const s4 = await seedScan(p4);
      await seedMessage(p4, s4, { status: "rejected" });

      const rows = await listOutreachDrafts(sb, "pending");
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(draftId);
      expect(ids).toContain(editedId);
      expect(rows.every((r) => r.status === "draft" || r.status === "edited")).toBe(true);
    });

    it("orders rows lowest overall score first", async () => {
      const pHigh = await seedProspect();
      const sHigh = await seedScan(pHigh, { scores: { ...baseScores, overall: 88 } });
      const highId = await seedMessage(pHigh, sHigh);

      const pLow = await seedProspect();
      const sLow = await seedScan(pLow, { scores: { ...baseScores, overall: 12 } });
      const lowId = await seedMessage(pLow, sLow);

      const rows = await listOutreachDrafts(sb, "pending");
      const relevant = rows.filter((r) => r.id === highId || r.id === lowId);
      expect(relevant.map((r) => r.id)).toEqual([lowId, highId]);
    });

    it("each row carries domain, locale, overall score, verdict, issue counts, top issues and cited metric", async () => {
      const prospectId = await seedProspect({ country: "NL" });
      const scanId = await seedScan(prospectId, {
        scores: { ...baseScores, overall: 12 },
        summary: { ...baseSummary, criticalIssues: 4 },
      });
      const messageId = await seedMessage(prospectId, scanId);

      const rows = await listOutreachDrafts(sb, "pending");
      const row = rows.find((r) => r.id === messageId)!;

      expect(row.domain).toMatch(/^test-outreach-queue-/);
      expect(row.locale).toBe("nl");
      expect(row.overallScore).toBe(12);
      expect(row.verdict).toBeTruthy();
      expect(row.criticalIssues).toBe(4);
      expect(row.majorIssues).toBe(1);
      expect(Array.isArray(row.topIssueTitles)).toBe(true);
      expect(row.citedMetric?.displayValue).toBe("4");
      expect(row.reportUrl).toContain(scanId);
    });
  });

  describe("applyDraftEdit", () => {
    it("on a 'draft' row sets status to 'edited' and stores the new text", async () => {
      const prospectId = await seedProspect();
      const scanId = await seedScan(prospectId);
      const messageId = await seedMessage(prospectId, scanId, { status: "draft" });

      const result = await applyDraftEdit(sb, messageId, { subject: "New subject", body: "New body" });
      expect(result.ok).toBe(true);

      const { data } = await sb.from("outreach_messages").select("*").eq("id", messageId).single();
      expect(data!.status).toBe("edited");
      expect(data!.draft_subject).toBe("New subject");
      expect(data!.draft_body).toBe("New body");
    });

    it("on an already-'edited' row leaves status 'edited' and stores the newer text", async () => {
      const prospectId = await seedProspect();
      const scanId = await seedScan(prospectId);
      const messageId = await seedMessage(prospectId, scanId, { status: "edited" });

      const result = await applyDraftEdit(sb, messageId, { subject: "Second edit", body: "Second body" });
      expect(result.ok).toBe(true);

      const { data } = await sb.from("outreach_messages").select("*").eq("id", messageId).single();
      expect(data!.status).toBe("edited");
      expect(data!.draft_body).toBe("Second body");
    });

    it("rejects an empty body without writing anything", async () => {
      const prospectId = await seedProspect();
      const scanId = await seedScan(prospectId);
      const messageId = await seedMessage(prospectId, scanId, { draft_body: "Original body" });

      const result = await applyDraftEdit(sb, messageId, { subject: "Subject", body: "" });
      expect(result.ok).toBe(false);

      const { data } = await sb.from("outreach_messages").select("draft_body, status").eq("id", messageId).single();
      expect(data!.draft_body).toBe("Original body");
      expect(data!.status).toBe("draft");
    });

    it("rejects a whitespace-only body without writing anything", async () => {
      const prospectId = await seedProspect();
      const scanId = await seedScan(prospectId);
      const messageId = await seedMessage(prospectId, scanId, { draft_body: "Original body" });

      const result = await applyDraftEdit(sb, messageId, { subject: "Subject", body: "   \n\t  " });
      expect(result.ok).toBe(false);

      const { data } = await sb.from("outreach_messages").select("draft_body").eq("id", messageId).single();
      expect(data!.draft_body).toBe("Original body");
    });

    it("rejects a body beyond the maximum length without writing anything", async () => {
      const prospectId = await seedProspect();
      const scanId = await seedScan(prospectId);
      const messageId = await seedMessage(prospectId, scanId, { draft_body: "Original body" });

      const tooLong = "a".repeat(MAX_DRAFT_BODY_LENGTH + 1);
      const result = await applyDraftEdit(sb, messageId, { subject: "Subject", body: tooLong });
      expect(result.ok).toBe(false);

      const { data } = await sb.from("outreach_messages").select("draft_body").eq("id", messageId).single();
      expect(data!.draft_body).toBe("Original body");
    });
  });

  describe("approveDraft", () => {
    it("sets status 'approved', approved_by to the constant, and an approved_at timestamp", async () => {
      const prospectId = await seedProspect();
      const scanId = await seedScan(prospectId);
      const messageId = await seedMessage(prospectId, scanId);

      const result = await approveDraft(sb, messageId);
      expect(result.ok).toBe(true);

      const { data } = await sb.from("outreach_messages").select("*").eq("id", messageId).single();
      expect(data!.status).toBe("approved");
      expect(data!.approved_by).toBe(APPROVED_BY);
      expect(data!.approved_at).toBeTruthy();
      expect(data!.resend_message_id).toBeNull();
    });

    it("does not change the prospect's lifecycle_state", async () => {
      const prospectId = await seedProspect({ lifecycle_state: "scanned" });
      const scanId = await seedScan(prospectId);
      const messageId = await seedMessage(prospectId, scanId);

      await approveDraft(sb, messageId);

      const { data } = await sb.from("prospects").select("lifecycle_state").eq("id", prospectId).single();
      expect(data!.lifecycle_state).toBe("scanned");
    });
  });

  describe("rejectDraft", () => {
    it("sets the message status to 'rejected' AND the prospect's lifecycle_state to 'rejected'", async () => {
      const prospectId = await seedProspect({ lifecycle_state: "scanned" });
      const scanId = await seedScan(prospectId);
      const messageId = await seedMessage(prospectId, scanId);

      const result = await rejectDraft(sb, messageId);
      expect(result.ok).toBe(true);

      const { data: message } = await sb.from("outreach_messages").select("status").eq("id", messageId).single();
      expect(message!.status).toBe("rejected");

      const { data: prospect } = await sb.from("prospects").select("lifecycle_state").eq("id", prospectId).single();
      expect(prospect!.lifecycle_state).toBe("rejected");
    });

    it("writes no row to the suppressions table", async () => {
      const prospectId = await seedProspect();
      const scanId = await seedScan(prospectId);
      const messageId = await seedMessage(prospectId, scanId);

      await rejectDraft(sb, messageId);

      const { data: prospect } = await sb.from("prospects").select("contact_email").eq("id", prospectId).single();
      const { data: suppressions } = await sb
        .from("suppressions")
        .select("id")
        .eq("email", prospect!.contact_email as string);
      expect(suppressions).toHaveLength(0);
    });
  });

  describe("regenerateDraft", () => {
    it("with an injected generate, replaces body and subject and resets status from 'edited' to 'draft'", async () => {
      const prospectId = await seedProspect();
      const scanId = await seedScan(prospectId);
      const messageId = await seedMessage(prospectId, scanId, {
        status: "edited",
        draft_subject: "Old subject",
        draft_body: "Old body",
      });

      const result = await regenerateDraft(sb, messageId, { generate: stubGenerate });
      expect(result.ok).toBe(true);

      const { data } = await sb.from("outreach_messages").select("*").eq("id", messageId).single();
      expect(data!.status).toBe("draft");
      expect(data!.draft_body).not.toBe("Old body");
      expect(data!.draft_subject).toBeTruthy();
    });

    it("whose injected generate returns null leaves the existing row completely unchanged", async () => {
      const prospectId = await seedProspect();
      const scanId = await seedScan(prospectId);
      const messageId = await seedMessage(prospectId, scanId, {
        status: "edited",
        draft_subject: "Old subject",
        draft_body: "Old body",
      });

      const result = await regenerateDraft(sb, messageId, { generate: nullGenerate });
      expect(result.ok).toBe(false);

      const { data } = await sb.from("outreach_messages").select("*").eq("id", messageId).single();
      expect(data!.status).toBe("edited");
      expect(data!.draft_subject).toBe("Old subject");
      expect(data!.draft_body).toBe("Old body");
    });
  });

  describe("generateDraftForProspect", () => {
    it("creates a first row for a named-person prospect the automatic path skipped", async () => {
      const prospectId = await seedProspect({ contact_email_type: "named-person" });
      const scanId = await seedScan(prospectId);
      await sb.from("prospects").update({ latest_scan_id: scanId }).eq("id", prospectId);

      const result = await generateDraftForProspect(sb, prospectId, { generate: stubGenerate });
      expect(result.ok).toBe(true);

      const { data } = await sb.from("outreach_messages").select("*").eq("prospect_id", prospectId);
      expect(data).toHaveLength(1);
      expect(data![0].status).toBe("draft");
    });

    it("on a prospect that already has a row returns an error outcome rather than creating a second one", async () => {
      const prospectId = await seedProspect();
      const scanId = await seedScan(prospectId);
      await sb.from("prospects").update({ latest_scan_id: scanId }).eq("id", prospectId);
      await seedMessage(prospectId, scanId);

      const result = await generateDraftForProspect(sb, prospectId, { generate: stubGenerate });
      expect(result.ok).toBe(false);

      const { data } = await sb.from("outreach_messages").select("id").eq("prospect_id", prospectId);
      expect(data).toHaveLength(1);
    });
  });
});
