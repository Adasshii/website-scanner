/**
 * Integration suite for lib/retention.ts — the D-7-15 clock, the D-7-16
 * scope boundary, and the CMP-15 allowlist, asserted against a real
 * Postgres with migrations 001-019 applied.
 *
 * PRECONDITION: a local Supabase stack, NOT production:
 *   supabase start
 *   supabase db reset   # applies supabase/migrations/*, including 019
 *   npx vitest run lib/retention.integration.test.ts
 *
 * This repo's .env.local points at the REMOTE production Supabase — the
 * env override below (the fixed local-dev URL and demo service-role JWT
 * `supabase start` always prints for a fresh local project) is what keeps
 * this suite off it. Mirrors lib/suppression.integration.test.ts's header
 * and setup.
 *
 * Every case here drives runRetention(sb, { mode: "dry-run" }) and reads
 * the delta in its `expiring` count around seeding one fixture, rather than
 * an absolute count — the shared local Supabase instance can carry stray
 * rows from other suites (documented project hazard), so a delta is what
 * stays exact regardless of contamination.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase";
import { BULK_SCAN_IP_HASH } from "@/lib/bulk-scan-constants";
import {
  ANONYMIZED_OUTREACH_FIELDS,
  ANONYMIZED_PROSPECT_FIELDS,
  ANONYMIZED_SCAN_FIELDS,
  ANONYMIZED_SCAN_SENTINEL_DOMAIN,
  ANONYMIZED_SCAN_SENTINEL_URL,
  RETENTION_TABLE_ALLOWLIST,
  type RetentionTable,
} from "@/lib/retention-constants";
import { anonymizeProspects, retentionFrom, runRetention } from "./retention";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
// Explicit deletes so lib/retention-constants.ts's module-scope reads
// evaluate to their shipped defaults rather than whatever the developer's
// shell carries. Every case below that needs a different mode or window
// passes it through runRetention()'s opts argument instead of mutating the
// environment, which cannot work once the module has evaluated.
delete process.env.RETENTION_MODE;
delete process.env.RETENTION_MONTHS;

const DOMAIN_PREFIX = "test-07-06-retention-";

let sb: SupabaseClient;
let counter = 0;

const prospectIds: string[] = [];
const scanDomains: string[] = [];
// Task 1 addition: cleanup keys scans off `id`, not `domain` — an
// anonymise-mode test rewrites a scan's `domain` column to the sentinel
// value (ANONYMIZED_SCAN_SENTINEL_DOMAIN) as the very thing under test, so
// a domain-keyed delete would no longer find the row afterward and orphan
// it, which then fails the prospect delete below on scans_prospect_id_fkey.
// scanDomains is kept for lead fixtures, which need the domain string
// rather than the scan id.
const scanIds: string[] = [];
const suppressionIds: string[] = [];
// Task 1 addition: leads reference scan_id ON DELETE CASCADE (migration
// 001), so deleting the owning scan already removes a lead row. Deleted
// explicitly anyway, and before the scan delete, so cleanup is provable
// rather than relying on a cascade a future migration edit could remove.
const leadIds: string[] = [];

beforeAll(() => {
  sb = createServerClient();
});

afterEach(async () => {
  // Task 1 addition: leads first — its FK (scan_id, cascade) points at
  // scans, so removing it before the scan delete keeps the order
  // explicit rather than implicit in the cascade.
  if (leadIds.length) {
    const { error } = await sb.from("leads").delete().in("id", leadIds);
    if (error) throw error;
  }
  // Scans reference prospects with no ON DELETE clause (migration 013) —
  // scan fixtures (including the public-scanner one, matched by domain
  // prefix since its prospect_id is null) must be deleted before their
  // owning prospects, or the prospect delete fails on
  // scans_prospect_id_fkey. This suite never sets prospects.latest_scan_id,
  // so the reciprocal FK (prospects_latest_scan_id_fkey) never blocks a
  // scan delete and needs no clearing step.
  if (scanIds.length) {
    const { error } = await sb.from("scans").delete().in("id", scanIds);
    if (error) throw error;
  }
  if (prospectIds.length) {
    // outreach_messages cascades via prospect_id ON DELETE CASCADE
    // (migration 012), so no separate outreach delete is needed.
    const { error } = await sb.from("prospects").delete().in("id", prospectIds);
    if (error) throw error;
  }
  if (suppressionIds.length) {
    const { error } = await sb.from("suppressions").delete().in("id", suppressionIds);
    if (error) throw error;
  }
  leadIds.length = 0;
  scanDomains.length = 0;
  scanIds.length = 0;
  prospectIds.length = 0;
  suppressionIds.length = 0;
});

function isoMonthsAgo(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString();
}

function nextDomain(): string {
  counter += 1;
  return `${DOMAIN_PREFIX}${counter}.test`;
}

// `overrides` (Task 1 addition) is spread last so a caller can set any
// other prospects column (name, website_url, triage_score, lifecycle_state,
// ...) without every 07-06 call site needing to change — the default `{}`
// keeps every existing call identical.
async function seedProspect(
  createdAtIso: string,
  overrides: Record<string, unknown> = {}
): Promise<{ id: string }> {
  const domain = nextDomain();
  const { data, error } = await sb
    .from("prospects")
    .insert({ domain, country: "NL", created_at: createdAtIso, ...overrides })
    .select("id")
    .single();
  if (error) throw error;
  prospectIds.push(data.id as string);
  return { id: data.id as string };
}

// `overrides` (Task 1 addition) lets a caller set scan content columns
// (scores, summary, ip_hash, ...) or override the default bulk ip_hash for
// a public-scanner-shaped fixture. Now also returns `id`, needed by the
// anonymise-mode assertions; every 07-06 call site destructures only
// `{ domain }` and is unaffected.
async function seedScan(
  prospectId: string | null,
  createdAtIso: string,
  overrides: Record<string, unknown> = {}
): Promise<{ domain: string; id: string }> {
  const domain = nextDomain();
  const { data, error } = await sb
    .from("scans")
    .insert({
      url: `https://${domain}`,
      domain,
      type: "full",
      ip_hash: BULK_SCAN_IP_HASH,
      prospect_id: prospectId,
      created_at: createdAtIso,
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw error;
  scanDomains.push(domain);
  scanIds.push(data.id as string);
  return { domain, id: data.id as string };
}

async function seedOutreach(
  prospectId: string,
  overrides: {
    status: string;
    sentAt?: string | null;
    createdAt?: string;
    draftSubject?: string | null;
    draftBody?: string | null;
    approvedAt?: string | null;
    approvedBy?: string | null;
  }
): Promise<{ id: string }> {
  const { data, error } = await sb
    .from("outreach_messages")
    .insert({
      prospect_id: prospectId,
      status: overrides.status,
      sent_at: overrides.sentAt ?? null,
      created_at: overrides.createdAt ?? new Date().toISOString(),
      draft_subject: overrides.draftSubject,
      draft_body: overrides.draftBody,
      approved_at: overrides.approvedAt,
      approved_by: overrides.approvedBy,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string };
}

// Task 1 addition — a leads row for the D-7-16/D-7-R5 scope boundary: the
// public scanner's own table, never reachable by this job.
async function seedLead(scanId: string, domain: string, createdAtIso: string): Promise<string> {
  const { data, error } = await sb
    .from("leads")
    .insert({
      scan_id: scanId,
      email: `visitor@${domain}`,
      domain,
      consented_at: createdAtIso,
      created_at: createdAtIso,
    })
    .select("id")
    .single();
  if (error) throw error;
  leadIds.push(data.id as string);
  return data.id as string;
}

async function seedSuppression(createdAtIso: string): Promise<string> {
  counter += 1;
  const email = `contact@${DOMAIN_PREFIX}${counter}.test`;
  const { data, error } = await sb
    .from("suppressions")
    .insert({ email, reason: "unsubscribe", source: "unsubscribe_link", created_at: createdAtIso })
    .select("id")
    .single();
  if (error) throw error;
  suppressionIds.push(data.id as string);
  return data.id as string;
}

/** Runs a dry-run before and after `action`, returning the change in the
 * result's `expiring` count — exact regardless of stray rows already in
 * the shared local Supabase instance. */
async function expiringDelta(action: () => Promise<void>, opts: { months?: number } = {}): Promise<number> {
  const before = await runRetention(sb, { mode: "dry-run", months: opts.months });
  await action();
  const after = await runRetention(sb, { mode: "dry-run", months: opts.months });
  return after.expiring - before.expiring;
}

describe("runRetention — clock (D-7-15)", () => {
  it("a prospect created 13 months ago with no scan and no outreach is selected", async () => {
    const delta = await expiringDelta(async () => {
      await seedProspect(isoMonthsAgo(13));
    });
    expect(delta).toBe(1);
  });

  it("a prospect created 11 months ago with no scan and no outreach is not selected", async () => {
    const delta = await expiringDelta(async () => {
      await seedProspect(isoMonthsAgo(11));
    });
    expect(delta).toBe(0);
  });

  it("a prospect created 24 months ago whose prospect-owned scan is 2 months old is not selected — the scan moved the clock", async () => {
    const delta = await expiringDelta(async () => {
      const { id } = await seedProspect(isoMonthsAgo(24));
      await seedScan(id, isoMonthsAgo(2));
    });
    expect(delta).toBe(0);
  });

  it("a prospect created 24 months ago with a sent message 1 month ago is not selected — contact moved the clock", async () => {
    const delta = await expiringDelta(async () => {
      const { id } = await seedProspect(isoMonthsAgo(24));
      await seedScan(id, isoMonthsAgo(24));
      await seedOutreach(id, { status: "sent", sentAt: isoMonthsAgo(1) });
    });
    expect(delta).toBe(0);
  });

  it("a prospect created 24 months ago with only a draft message 1 month ago is selected — only sent counts as contact", async () => {
    const delta = await expiringDelta(async () => {
      const { id } = await seedProspect(isoMonthsAgo(24));
      await seedScan(id, isoMonthsAgo(24));
      await seedOutreach(id, { status: "draft", sentAt: null, createdAt: isoMonthsAgo(1) });
    });
    expect(delta).toBe(1);
  });

  it("a prospect with two sent messages, the later 1 month ago, is not selected — the clock takes the latest", async () => {
    const delta = await expiringDelta(async () => {
      const { id } = await seedProspect(isoMonthsAgo(24));
      await seedScan(id, isoMonthsAgo(24));
      await seedOutreach(id, { status: "sent", sentAt: isoMonthsAgo(20) });
      await seedOutreach(id, { status: "sent", sentAt: isoMonthsAgo(1) });
    });
    expect(delta).toBe(0);
  });
});

describe("runRetention — scope (D-7-16, D-7-R5)", () => {
  it("a scan whose prospect_id is null and whose created_at is 24 months old does not appear in any prospect's clock and is still present after a full dry-run", async () => {
    const { domain } = await seedScan(null, isoMonthsAgo(24));

    const result = await runRetention(sb, { mode: "dry-run" });
    expect(result.mode).toBe("dry-run");

    const { data, error } = await sb.from("scans").select("id").eq("domain", domain).maybeSingle();
    if (error) throw error;
    expect(data).not.toBeNull();
  });

  it("retentionFrom() throws when handed the leads table name cast past the compiler", () => {
    expect(() => retentionFrom(sb, "leads" as unknown as RetentionTable)).toThrow();
  });
});

describe("runRetention — allowlist (CMP-15, D-7-19)", () => {
  it("RETENTION_TABLE_ALLOWLIST holds exactly 3 entries and the suppression table is not among them", () => {
    expect(RETENTION_TABLE_ALLOWLIST.length).toBe(3);
    expect((RETENTION_TABLE_ALLOWLIST as readonly string[]).includes("suppressions")).toBe(false);
  });

  it("retentionFrom() throws when handed the suppression table name cast past the compiler", () => {
    expect(() => retentionFrom(sb, "suppressions" as unknown as RetentionTable)).toThrow();
  });

  it("a suppression row older than the retention window is byte-identical after a full dry-run", async () => {
    const id = await seedSuppression(isoMonthsAgo(24));
    const before = await sb.from("suppressions").select("*").eq("id", id).single();
    if (before.error) throw before.error;

    await runRetention(sb, { mode: "dry-run" });

    const after = await sb.from("suppressions").select("*").eq("id", id).single();
    if (after.error) throw after.error;
    expect(after.data).toEqual(before.data);
  });
});

describe("runRetention — config (CMP-13, CMP-14)", () => {
  it("{ months: 0 } selects a prospect created minutes ago", async () => {
    const minutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const delta = await expiringDelta(
      async () => {
        await seedProspect(minutesAgo);
      },
      { months: 0 }
    );
    expect(delta).toBe(1);
  });

  it("the same fixture shape selects nothing under { months: 600 }", async () => {
    const minutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const delta = await expiringDelta(
      async () => {
        await seedProspect(minutesAgo);
      },
      { months: 600 }
    );
    expect(delta).toBe(0);
  });

  it("the returned months and cutoff reflect the { months } override", async () => {
    const result0 = await runRetention(sb, { mode: "dry-run", months: 0 });
    expect(result0.months).toBe(0);
    const result600 = await runRetention(sb, { mode: "dry-run", months: 600 });
    expect(result600.months).toBe(600);
    expect(Date.parse(result600.cutoff)).toBeLessThan(Date.parse(result0.cutoff));
  });
});

describe("runRetention — dry-run inertness (D-7-18)", () => {
  it("every seeded prospect, outreach and scan row is byte-identical after a dry-run and all five write counters are 0", async () => {
    const { id: prospectId } = await seedProspect(isoMonthsAgo(20));
    const { domain: scanDomain } = await seedScan(prospectId, isoMonthsAgo(20));
    await seedOutreach(prospectId, { status: "sent", sentAt: isoMonthsAgo(19) });

    const beforeProspect = await sb.from("prospects").select("*").eq("id", prospectId).single();
    if (beforeProspect.error) throw beforeProspect.error;
    const beforeScan = await sb.from("scans").select("*").eq("domain", scanDomain).single();
    if (beforeScan.error) throw beforeScan.error;
    const beforeOutreach = await sb.from("outreach_messages").select("*").eq("prospect_id", prospectId).single();
    if (beforeOutreach.error) throw beforeOutreach.error;

    const result = await runRetention(sb, { mode: "dry-run" });

    expect(result.prospectsAnonymized).toBe(0);
    expect(result.prospectsDeleted).toBe(0);
    expect(result.outreachAnonymized).toBe(0);
    expect(result.scansAnonymized).toBe(0);
    expect(result.scansDeleted).toBe(0);

    const afterProspect = await sb.from("prospects").select("*").eq("id", prospectId).single();
    if (afterProspect.error) throw afterProspect.error;
    const afterScan = await sb.from("scans").select("*").eq("domain", scanDomain).single();
    if (afterScan.error) throw afterScan.error;
    const afterOutreach = await sb.from("outreach_messages").select("*").eq("prospect_id", prospectId).single();
    if (afterOutreach.error) throw afterOutreach.error;

    expect(afterProspect.data).toEqual(beforeProspect.data);
    expect(afterScan.data).toEqual(beforeScan.data);
    expect(afterOutreach.data).toEqual(beforeOutreach.data);
  });

  // The 07-06 placeholder here asserted `mode: "anonymize"` rejected and
  // left the seeded row untouched. Task 1 wires that arm to a real write —
  // asserting rejection would now fail, and worse, calling
  // runRetention(sb, { mode: "anonymize" }) with no months override runs
  // the DEFAULT 12-month window against the whole local `prospects` table
  // (711 real rows per 07-06's own note), which would actually anonymise
  // every real matching row in the shared local database. Removed rather
  // than kept and silently made unsafe; anonymize's own coverage — scoped
  // with an explicit `months` override so only synthetic fixtures can ever
  // match — lives in the "anonymizeProspects" describe below.

  it("runRetention(sb, { mode: 'delete' }) rejects and leaves the seeded row unchanged", async () => {
    const { id: prospectId } = await seedProspect(isoMonthsAgo(20));
    const before = await sb.from("prospects").select("*").eq("id", prospectId).single();
    if (before.error) throw before.error;

    await expect(runRetention(sb, { mode: "delete" })).rejects.toThrow();

    const after = await sb.from("prospects").select("*").eq("id", prospectId).single();
    if (after.error) throw after.error;
    expect(after.data).toEqual(before.data);
  });
});

/**
 * Every test below calls `anonymizeProspects(sb, ids)` directly with an
 * explicit, tightly-scoped id list rather than letting `runRetention()`
 * pick candidates from the whole table. This suite's local Postgres holds
 * ~711 real prospect rows (07-06's own note); a call like
 * `runRetention(sb, { mode: "anonymize" })` with no `months` override runs
 * the default 12-month window against every one of them, silently
 * anonymising real local data. Direct calls with an explicit id array
 * cannot touch a row this suite did not seed, no matter how the shared
 * local database is populated when the suite runs. The one exception is
 * the "wired through runRetention()" test below, which uses a
 * deliberately extreme `months` override (200) against a deliberately
 * ancient fixture (250 months) — old enough that no real business record
 * imported by this project can ever match it — to prove the branch
 * dispatch and result-mapping without touching anything else.
 */
describe("anonymizeProspects — field lists (D-7-17, Task 1)", () => {
  it("clears all six ANONYMIZED_PROSPECT_FIELDS columns", async () => {
    const { id } = await seedProspect(isoMonthsAgo(20), {
      name: "Test Business",
      website_url: "https://example-anon.test",
      website_url_pending: "https://pending-anon.test",
      address: "123 Test Street",
      contact_email: "contact@example-anon.test",
    });

    const counts = await anonymizeProspects(sb, [id]);
    expect(counts.prospects).toBe(1);

    const after = await sb.from("prospects").select("*").eq("id", id).single();
    if (after.error) throw after.error;
    for (const field of Object.keys(ANONYMIZED_PROSPECT_FIELDS)) {
      expect(after.data[field]).toBeNull();
    }
  });

  it("keeps created_at, triage_checked_at, scan_released_at, triage_score, booked_at, country and the stored lifecycle value unchanged", async () => {
    const { id } = await seedProspect(isoMonthsAgo(20), {
      name: "Test Business",
      website_url: "https://example-anon-2.test",
      contact_email: "contact@example-anon-2.test",
      category: "restaurant",
      region: "Noord-Holland",
      campaign_tag: "campaign-x",
      triage_score: { overall: 42 },
      triage_checked_at: isoMonthsAgo(19),
      scan_released_at: isoMonthsAgo(18),
      booked_at: isoMonthsAgo(1),
      lifecycle_state: "contacted",
    });

    const before = await sb.from("prospects").select("*").eq("id", id).single();
    if (before.error) throw before.error;

    await anonymizeProspects(sb, [id]);

    const after = await sb.from("prospects").select("*").eq("id", id).single();
    if (after.error) throw after.error;

    expect(after.data.created_at).toBe(before.data.created_at);
    expect(after.data.triage_checked_at).toBe(before.data.triage_checked_at);
    expect(after.data.scan_released_at).toBe(before.data.scan_released_at);
    expect(after.data.triage_score).toEqual(before.data.triage_score);
    expect(after.data.booked_at).toBe(before.data.booked_at);
    expect(after.data.country).toBe(before.data.country);
    expect(after.data.lifecycle_state).toBe(before.data.lifecycle_state);
    // category, region and campaign_tag are not part of D-7-17's identifier
    // list either — kept alongside the timestamps for the same reason.
    expect(after.data.category).toBe(before.data.category);
    expect(after.data.region).toBe(before.data.region);
    expect(after.data.campaign_tag).toBe(before.data.campaign_tag);
  });

  it("outreach message reads back with draft_subject and draft_body null and status/sent_at/approved_at/created_at unchanged", async () => {
    const { id: prospectId } = await seedProspect(isoMonthsAgo(20));
    const { id: outreachId } = await seedOutreach(prospectId, {
      status: "sent",
      sentAt: isoMonthsAgo(19),
      createdAt: isoMonthsAgo(19),
      draftSubject: "A subject naming the business",
      draftBody: "A body naming the business",
      approvedAt: isoMonthsAgo(19),
      approvedBy: "joshua",
    });

    const before = await sb.from("outreach_messages").select("*").eq("id", outreachId).single();
    if (before.error) throw before.error;

    const counts = await anonymizeProspects(sb, [prospectId]);
    expect(counts.outreach).toBe(1);

    const after = await sb.from("outreach_messages").select("*").eq("id", outreachId).single();
    if (after.error) throw after.error;

    expect(after.data.draft_subject).toBeNull();
    expect(after.data.draft_body).toBeNull();
    expect(after.data.status).toBe(before.data.status);
    expect(after.data.sent_at).toBe(before.data.sent_at);
    expect(after.data.approved_at).toBe(before.data.approved_at);
    expect(after.data.created_at).toBe(before.data.created_at);
  });

  it("scan: url and domain read back at the sentinel values and pages as an empty array, with scores/type/status/locale/prospect_id and every timestamp unchanged", async () => {
    const { id: prospectId } = await seedProspect(isoMonthsAgo(20));
    const { id: scanId } = await seedScan(prospectId, isoMonthsAgo(20), {
      scores: { overall: 55 },
      pages: [{ url: "https://example-scan-anon.test" }],
      completed_at: isoMonthsAgo(20),
    });

    const before = await sb.from("scans").select("*").eq("id", scanId).single();
    if (before.error) throw before.error;

    const counts = await anonymizeProspects(sb, [prospectId]);
    expect(counts.scans).toBe(1);

    const after = await sb.from("scans").select("*").eq("id", scanId).single();
    if (after.error) throw after.error;

    expect(after.data.url).toBe(ANONYMIZED_SCAN_SENTINEL_URL);
    expect(after.data.domain).toBe(ANONYMIZED_SCAN_SENTINEL_DOMAIN);
    expect(after.data.pages).toEqual([]);
    expect(after.data.scores).toEqual(before.data.scores);
    expect(after.data.type).toBe(before.data.type);
    expect(after.data.status).toBe(before.data.status);
    expect(after.data.locale).toBe(before.data.locale);
    expect(after.data.prospect_id).toBe(before.data.prospect_id);
    expect(after.data.started_at).toBe(before.data.started_at);
    expect(after.data.completed_at).toBe(before.data.completed_at);
    expect(after.data.created_at).toBe(before.data.created_at);
  });

  it("scan: every remaining content column in ANONYMIZED_SCAN_FIELDS reads back null", async () => {
    const { id: prospectId } = await seedProspect(isoMonthsAgo(20));
    const { id: scanId } = await seedScan(prospectId, isoMonthsAgo(20), {
      summary: { verdict: "poor" },
      screenshots: { homepage: "https://storage.test/a.png" },
      homepage_screenshot_url: "https://storage.test/a.png",
      email: "found@example-scan-anon-2.test",
      error_message: "timed out",
      cost_estimate: { low: 100, high: 200 },
      quick_wins: [{ title: "fix h1" }],
      website_personality: "playful",
      sales_brief: "a brief",
      design_ai_analysis: { overallScore: 40 },
      visitor_experience: "confusing",
      ai_content_alt: { verdict: "slecht" },
      issues_alt: { "missing-h1": { title: "Ontbrekende h1" } },
    });

    await anonymizeProspects(sb, [prospectId]);

    const after = await sb.from("scans").select("*").eq("id", scanId).single();
    if (after.error) throw after.error;

    for (const field of Object.keys(ANONYMIZED_SCAN_FIELDS)) {
      if (field === "pages" || field === "url" || field === "domain") continue;
      expect(after.data[field]).toBeNull();
    }
  });

  it("a prospect inside the window is untouched by a full anonymise run wired through runRetention()", async () => {
    const { id: inWindowId } = await seedProspect(isoMonthsAgo(1), { name: "Still Live" });
    // A companion far-past fixture guarantees the scoped run below actually
    // executes a write pass rather than trivially finding nothing.
    await seedProspect(isoMonthsAgo(250));

    const before = await sb.from("prospects").select("*").eq("id", inWindowId).single();
    if (before.error) throw before.error;

    await runRetention(sb, { mode: "anonymize", months: 200 });

    const after = await sb.from("prospects").select("*").eq("id", inWindowId).single();
    if (after.error) throw after.error;
    expect(after.data).toEqual(before.data);
  });

  it("a public-scanner scan (prospect_id null) and its leads row, both older than the window, are unchanged after an anonymise run", async () => {
    const { id: unrelatedProspectId } = await seedProspect(isoMonthsAgo(20));
    const { domain: publicDomain, id: publicScanId } = await seedScan(null, isoMonthsAgo(24), {
      ip_hash: "07-07-visitor-ip-hash",
    });
    const leadId = await seedLead(publicScanId, publicDomain, isoMonthsAgo(24));

    const beforeScan = await sb.from("scans").select("*").eq("id", publicScanId).single();
    if (beforeScan.error) throw beforeScan.error;
    const beforeLead = await sb.from("leads").select("*").eq("id", leadId).single();
    if (beforeLead.error) throw beforeLead.error;

    await anonymizeProspects(sb, [unrelatedProspectId]);

    const afterScan = await sb.from("scans").select("*").eq("id", publicScanId).single();
    if (afterScan.error) throw afterScan.error;
    const afterLead = await sb.from("leads").select("*").eq("id", leadId).single();
    if (afterLead.error) throw afterLead.error;

    expect(afterScan.data).toEqual(beforeScan.data);
    expect(afterLead.data).toEqual(beforeLead.data);
  });

  it("a suppression row older than the retention window is unchanged after an anonymise run", async () => {
    const { id: unrelatedProspectId } = await seedProspect(isoMonthsAgo(20));
    const suppressionId = await seedSuppression(isoMonthsAgo(24));
    const before = await sb.from("suppressions").select("*").eq("id", suppressionId).single();
    if (before.error) throw before.error;

    await anonymizeProspects(sb, [unrelatedProspectId]);

    const after = await sb.from("suppressions").select("*").eq("id", suppressionId).single();
    if (after.error) throw after.error;
    expect(after.data).toEqual(before.data);
  });

  it("running the anonymise pass twice changes nothing further and reports the same counters", async () => {
    const { id: prospectId } = await seedProspect(isoMonthsAgo(20), { name: "Repeat Pass" });
    const { id: outreachId } = await seedOutreach(prospectId, { status: "sent", sentAt: isoMonthsAgo(19) });
    const { id: scanId } = await seedScan(prospectId, isoMonthsAgo(20));

    const first = await anonymizeProspects(sb, [prospectId]);
    expect(first).toEqual({ prospects: 1, outreach: 1, scans: 1 });

    const afterFirstProspect = await sb.from("prospects").select("*").eq("id", prospectId).single();
    if (afterFirstProspect.error) throw afterFirstProspect.error;
    const afterFirstOutreach = await sb.from("outreach_messages").select("*").eq("id", outreachId).single();
    if (afterFirstOutreach.error) throw afterFirstOutreach.error;
    const afterFirstScan = await sb.from("scans").select("*").eq("id", scanId).single();
    if (afterFirstScan.error) throw afterFirstScan.error;

    const second = await anonymizeProspects(sb, [prospectId]);
    expect(second).toEqual({ prospects: 1, outreach: 1, scans: 1 });

    const afterSecondProspect = await sb.from("prospects").select("*").eq("id", prospectId).single();
    if (afterSecondProspect.error) throw afterSecondProspect.error;
    const afterSecondOutreach = await sb.from("outreach_messages").select("*").eq("id", outreachId).single();
    if (afterSecondOutreach.error) throw afterSecondOutreach.error;
    const afterSecondScan = await sb.from("scans").select("*").eq("id", scanId).single();
    if (afterSecondScan.error) throw afterSecondScan.error;

    expect(afterSecondProspect.data).toEqual(afterFirstProspect.data);
    expect(afterSecondOutreach.data).toEqual(afterFirstOutreach.data);
    expect(afterSecondScan.data).toEqual(afterFirstScan.data);
  });

  it("wired through runRetention(): reports non-zero prospectsAnonymized/outreachAnonymized/scansAnonymized matching the seeded fixtures, and prospectsDeleted/scansDeleted at 0", async () => {
    const { id: prospectId } = await seedProspect(isoMonthsAgo(250), { name: "Wiring Fixture" });
    await seedOutreach(prospectId, { status: "sent", sentAt: isoMonthsAgo(250) });
    await seedScan(prospectId, isoMonthsAgo(250));

    const result = await runRetention(sb, { mode: "anonymize", months: 200 });

    expect(result.mode).toBe("anonymize");
    expect(result.prospectsAnonymized).toBeGreaterThan(0);
    expect(result.outreachAnonymized).toBeGreaterThan(0);
    expect(result.scansAnonymized).toBeGreaterThan(0);
    expect(result.prospectsDeleted).toBe(0);
    expect(result.scansDeleted).toBe(0);
  });
});
