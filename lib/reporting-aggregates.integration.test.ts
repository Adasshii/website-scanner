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
import { getReportingData, utcDay } from "./reporting-aggregates";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

let sb: SupabaseClient;

beforeAll(() => {
  sb = createServerClient();
});

const PREFIX = "test-reporting-agg-";

// Every fixture scans row this suite inserts carries an ip_hash starting with
// PREFIX-minus-trailing-dash, which is what makes them findable here. The
// public-scanner fixture (prospect_id NULL) uses an off-prefix *domain* on
// purpose, so domain is not a reliable marker for scans.
const SCAN_MARKER = PREFIX.replace(/-$/, "");

// Deletes in an order that satisfies the FK graph, and throws on any failure.
//
// Only outreach_messages and prospect_sources cascade off prospects. Three
// edges are ON DELETE NO ACTION and have to be cleared by hand, in order:
//   scans.prospect_id -> prospects      (migration 013, no ON DELETE clause)
//   prospects.latest_scan_id -> scans   (migration 013)
//   outreach_messages.scan_id -> scans  (migration 012)
//
// The failure this replaces: the per-day test seeds a scans row pointing at a
// fixture prospect, that FK rejected the prospects delete, and because a
// PostgREST delete is one statement over all matched ids, the rejection took
// every other prospect down with it. The error was never read, so cleanup
// reported success while leaving the whole fixture set behind, and the
// survivors were prefix-matched again next run, so the leak became permanent.
// Throwing here fails the run that caused the leak instead of the next one.
afterEach(async () => {
  const { data: prospects, error: selectError } = await sb
    .from("prospects")
    .select("id")
    .like("domain", `${PREFIX}%`);
  if (selectError) throw selectError;
  const ids = (prospects ?? []).map((p) => p.id as string);

  const { data: scans, error: scanSelectError } = await sb
    .from("scans")
    .select("id")
    .like("ip_hash", `${SCAN_MARKER}%`);
  if (scanSelectError) throw scanSelectError;
  const scanIds = (scans ?? []).map((s) => s.id as string);

  if (ids.length > 0) {
    // Release prospects.latest_scan_id before the scans delete below. No test
    // sets it today; leaving the edge unhandled would make the first one that
    // does reintroduce exactly this bug.
    const { error: unlinkError } = await sb
      .from("prospects")
      .update({ latest_scan_id: null })
      .in("id", ids)
      .not("latest_scan_id", "is", null);
    if (unlinkError) throw unlinkError;

    // Clears the outreach_messages.scan_id edge as well as the prospect one.
    const { error: outreachError } = await sb
      .from("outreach_messages")
      .delete()
      .in("prospect_id", ids);
    if (outreachError) throw outreachError;
  }

  if (scanIds.length > 0) {
    const { error: scanError } = await sb.from("scans").delete().in("id", scanIds);
    if (scanError) throw scanError;
  }

  if (ids.length > 0) {
    const { error: prospectError } = await sb.from("prospects").delete().in("id", ids);
    if (prospectError) throw prospectError;
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

// utcDay() (Pitfall 6) — bucketing helper `days` builds on. Tested directly
// (no DB) alongside the DB-backed `days` assertions below so a bucketing
// regression is caught at the smallest possible unit.
describe("utcDay", () => {
  it("returns the UTC calendar day of an ISO timestamp regardless of process TZ", () => {
    const original = process.env.TZ;
    process.env.TZ = "Europe/Amsterdam";
    try {
      expect(utcDay("2026-03-15T23:59:59Z")).toBe("2026-03-15");
      expect(utcDay("2026-03-16T00:00:01Z")).toBe("2026-03-16");
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

// Helper: builds the exact 30-entry, newest-first UTC-day window
// getReportingData() itself builds, so a test can assert against a real
// "today" without hardcoding a date that goes stale.
function expectedDayWindow(): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(utcDay(d.toISOString()));
  }
  return days;
}

describe("getReportingData — days (30-day per-day table, TRK-05)", () => {
  it("returns exactly 30 entries, newest first, each a distinct date with no gaps", async () => {
    const { days } = await getReportingData(sb);
    const expected = expectedDayWindow();

    expect(days.length).toBe(30);
    expect(days.map((d) => d.date)).toEqual(expected);
    // No gaps / no duplicates: 30 distinct calendar days.
    expect(new Set(days.map((d) => d.date)).size).toBe(30);
  });

  it("buckets a 23:59:59Z prospect and the next day's 00:00:01Z prospect into two different days, unaffected by process TZ", async () => {
    const original = process.env.TZ;
    process.env.TZ = "Europe/Amsterdam";
    try {
      // Anchor 5 days back from "now" so both fixtures land safely inside
      // the 30-day window no matter what instant the window is built from.
      const anchor = new Date();
      anchor.setUTCDate(anchor.getUTCDate() - 5);
      const day1 = utcDay(anchor.toISOString());
      const nextAnchor = new Date(anchor);
      nextAnchor.setUTCDate(nextAnchor.getUTCDate() + 1);
      const day2 = utcDay(nextAnchor.toISOString());

      const before = await getReportingData(sb);
      await seedProspect(`${PREFIX}boundary-1`, { created_at: `${day1}T23:59:59Z` });
      await seedProspect(`${PREFIX}boundary-2`, { created_at: `${day2}T00:00:01Z` });
      const after = await getReportingData(sb);

      const beforeD1 = before.days.find((d) => d.date === day1)!.imported;
      const afterD1 = after.days.find((d) => d.date === day1)!.imported;
      const beforeD2 = before.days.find((d) => d.date === day2)!.imported;
      const afterD2 = after.days.find((d) => d.date === day2)!.imported;

      expect(afterD1 - beforeD1).toBe(1);
      expect(afterD2 - beforeD2).toBe(1);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("per-day imported/triaged/scanned/contacted counts match hand-seeded fixture rows, and a zero day renders 0", async () => {
    const anchor = new Date();
    anchor.setUTCDate(anchor.getUTCDate() - 6);
    const day = utcDay(anchor.toISOString());
    const iso = `${day}T12:00:00Z`;

    const before = await getReportingData(sb);

    await seedProspect(`${PREFIX}day-imported-1`, { created_at: iso });
    await seedProspect(`${PREFIX}day-triaged-1`, {
      created_at: iso,
      triage_checked_at: iso,
    });
    const contactedId = await seedProspect(`${PREFIX}day-contacted-1`, { created_at: iso });
    const { error } = await sb.from("outreach_messages").insert({
      prospect_id: contactedId,
      status: "sent",
      created_at: iso,
      sent_at: iso,
    });
    if (error) throw error;
    const { error: scanError } = await sb.from("scans").insert({
      url: "https://example.com",
      domain: `${PREFIX}day-scanned`,
      type: "full",
      status: "completed",
      pages: [],
      ip_hash: "test-reporting-agg",
      prospect_id: contactedId,
      created_at: iso,
    });
    if (scanError) throw scanError;

    const after = await getReportingData(sb);

    const beforeDay = before.days.find((d) => d.date === day)!;
    const afterDay = after.days.find((d) => d.date === day)!;

    expect(afterDay.imported - beforeDay.imported).toBe(3);
    expect(afterDay.triaged - beforeDay.triaged).toBe(1);
    expect(afterDay.scanned - beforeDay.scanned).toBe(1);
    expect(afterDay.contacted - beforeDay.contacted).toBe(1);

    // A day with no seeded activity still renders 0, not an omitted entry.
    const untouchedDay = after.days.find((d) => d.date !== day)!;
    expect(typeof untouchedDay.imported).toBe("number");
  });

  it("does not count a scans row with a NULL prospect_id (a public-scanner scan) into scanned", async () => {
    const anchor = new Date();
    anchor.setUTCDate(anchor.getUTCDate() - 7);
    const day = utcDay(anchor.toISOString());
    const iso = `${day}T12:00:00Z`;

    const before = await getReportingData(sb);

    const { error: scanError } = await sb
      .from("scans")
      .insert({
        url: "https://public-scanner-example.com",
        domain: "public-scanner-example.com",
        type: "quick",
        status: "completed",
        pages: [],
        ip_hash: "test-reporting-agg-public",
        prospect_id: null,
        created_at: iso,
      });
    if (scanError) throw scanError;

    const after = await getReportingData(sb);
    const beforeDay = before.days.find((d) => d.date === day)!;
    const afterDay = after.days.find((d) => d.date === day)!;
    expect(afterDay.scanned - beforeDay.scanned).toBe(0);

    // No inline cleanup: this row is not prospect-owned, but its ip_hash
    // carries SCAN_MARKER, so afterEach sweeps it. Cleaning up there rather
    // than here means a failed assertion above no longer leaks the row.
  });

  it("excludes an event older than 30 days from every day bucket, but still counts it in the funnel", async () => {
    const oldIso = "2020-01-01T12:00:00Z";
    const beforeFunnel = await getReportingData(sb);

    await seedProspect(`${PREFIX}old-event-1`, { created_at: oldIso });

    const afterFunnel = await getReportingData(sb);
    // Still counted in the (unbounded) funnel.
    expect(afterFunnel.funnel.New - beforeFunnel.funnel.New).toBe(1);
    // Never counted into any of the 30 day-window buckets.
    const totalImportedInWindow = afterFunnel.days.reduce((sum, d) => sum + d.imported, 0);
    const totalImportedInWindowBefore = beforeFunnel.days.reduce(
      (sum, d) => sum + d.imported,
      0
    );
    expect(totalImportedInWindow - totalImportedInWindowBefore).toBe(0);
  });

  it("replyRate is null on every day while REPLY_SIGNAL_AVAILABLE is false, even on a day with contacted > 0", async () => {
    const anchor = new Date();
    anchor.setUTCDate(anchor.getUTCDate() - 8);
    const day = utcDay(anchor.toISOString());
    const iso = `${day}T12:00:00Z`;

    const contactedId = await seedProspect(`${PREFIX}reply-gate-1`, { created_at: iso });
    const { error } = await sb.from("outreach_messages").insert({
      prospect_id: contactedId,
      status: "sent",
      created_at: iso,
      sent_at: iso,
    });
    if (error) throw error;

    const { days } = await getReportingData(sb);
    for (const d of days) {
      expect(d.replyRate).toBeNull();
    }
  });

  it("booked and bookedByDomain are null on every day while sentGateOpen is false; bookedByDomain never exceeds booked", async () => {
    const { days, sentGateOpen } = await getReportingData(sb);
    if (!sentGateOpen) {
      for (const d of days) {
        expect(d.booked).toBeNull();
        expect(d.bookedByDomain).toBeNull();
      }
    } else {
      for (const d of days) {
        expect(typeof d.booked).toBe("number");
        expect(d.bookedByDomain ?? 0).toBeLessThanOrEqual(d.booked ?? 0);
      }
    }
  });
});
