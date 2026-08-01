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
import { RETENTION_TABLE_ALLOWLIST, type RetentionTable } from "@/lib/retention-constants";
import { retentionFrom, runRetention } from "./retention";

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
const suppressionIds: string[] = [];

beforeAll(() => {
  sb = createServerClient();
});

afterEach(async () => {
  // Scans reference prospects with no ON DELETE clause (migration 013) —
  // scan fixtures (including the public-scanner one, matched by domain
  // prefix since its prospect_id is null) must be deleted before their
  // owning prospects, or the prospect delete fails on
  // scans_prospect_id_fkey. This suite never sets prospects.latest_scan_id,
  // so the reciprocal FK (prospects_latest_scan_id_fkey) never blocks a
  // scan delete and needs no clearing step.
  if (scanDomains.length) {
    const { error } = await sb.from("scans").delete().in("domain", scanDomains);
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
  scanDomains.length = 0;
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

async function seedProspect(createdAtIso: string): Promise<{ id: string }> {
  const domain = nextDomain();
  const { data, error } = await sb
    .from("prospects")
    .insert({ domain, country: "NL", created_at: createdAtIso })
    .select("id")
    .single();
  if (error) throw error;
  prospectIds.push(data.id as string);
  return { id: data.id as string };
}

async function seedScan(prospectId: string | null, createdAtIso: string): Promise<{ domain: string }> {
  const domain = nextDomain();
  const { error } = await sb.from("scans").insert({
    url: `https://${domain}`,
    domain,
    type: "full",
    ip_hash: BULK_SCAN_IP_HASH,
    prospect_id: prospectId,
    created_at: createdAtIso,
  });
  if (error) throw error;
  scanDomains.push(domain);
  return { domain };
}

async function seedOutreach(
  prospectId: string,
  overrides: { status: string; sentAt?: string | null; createdAt?: string }
): Promise<void> {
  const { error } = await sb.from("outreach_messages").insert({
    prospect_id: prospectId,
    status: overrides.status,
    sent_at: overrides.sentAt ?? null,
    created_at: overrides.createdAt ?? new Date().toISOString(),
  });
  if (error) throw error;
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

  it("runRetention(sb, { mode: 'anonymize' }) rejects and leaves the seeded row unchanged", async () => {
    const { id: prospectId } = await seedProspect(isoMonthsAgo(20));
    const before = await sb.from("prospects").select("*").eq("id", prospectId).single();
    if (before.error) throw before.error;

    await expect(runRetention(sb, { mode: "anonymize" })).rejects.toThrow();

    const after = await sb.from("prospects").select("*").eq("id", prospectId).single();
    if (after.error) throw after.error;
    expect(after.data).toEqual(before.data);
  });

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
