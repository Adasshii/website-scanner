/**
 * Integration suite for claimNextScanBatch() and reconcileInFlightScans()
 * (lib/scan-queue.ts) — SCAN-01's SKIP LOCKED disjointness guarantee, D-07's
 * arming gate, and SCAN-03's reconciliation, asserted against a real
 * Postgres with migrations 010-017 applied.
 *
 * PRECONDITION: a local Supabase stack, NOT production:
 *   supabase start
 *   supabase db reset   # applies supabase/migrations/*, including 017
 *   npx vitest run lib/scan-drain.integration.test.ts
 *
 * Mirrors lib/triage-release.integration.test.ts's env-var +
 * createServerClient() + scoped-cleanup-by-campaign_tag pattern verbatim.
 * A `beforeAll` reachability probe sets `localDbAvailable`; every test calls
 * `ctx.skip()` up front when it's false, so `npx vitest run` reports these
 * as skipped (not failed) on a machine with no local Supabase running.
 * (A top-level-await probe would be the more direct expression of this, but
 * this project's tsconfig has no explicit `target`, which defaults to ES3
 * and rejects top-level await — `npx tsc --noEmit` must stay green.)
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase";
import { claimNextScanBatch, reconcileInFlightScans } from "./scan-queue";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const CAMPAIGN_TAG = "test-04-03-scan-drain-integration";

const sb: SupabaseClient = createServerClient();
let localDbAvailable = true;

beforeAll(async () => {
  localDbAvailable = await sb
    .from("prospects")
    .select("id")
    .limit(1)
    .then(
      ({ error }) => !error,
      () => false
    );
});

let domainCounter = 0;
const seededScanIds: string[] = [];

async function seedQueued(overrides?: {
  scanStatus?: string | null;
  scanReleasedAt?: string | null;
}): Promise<string> {
  domainCounter += 1;
  const { data, error } = await sb
    .from("prospects")
    .insert({
      domain: `scan-drain-${domainCounter}.test`,
      country: "NL",
      campaign_tag: CAMPAIGN_TAG,
      website_url: `https://scan-drain-${domainCounter}.test`,
      scan_released_at: overrides?.scanReleasedAt ?? new Date().toISOString(),
      scan_status: overrides?.scanStatus === undefined ? "queued" : overrides.scanStatus,
      scan_attempts: 0,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function seedScan(status: "completed" | "failed", errorMessage: string | null = null): Promise<string> {
  const { data, error } = await sb
    .from("scans")
    .insert({
      url: "https://scan-drain-scan.test",
      domain: "scan-drain-scan.test",
      type: "full",
      status,
      pages: [],
      ip_hash: "test-scan-drain-integration",
      error_message: errorMessage,
    })
    .select("id")
    .single();
  if (error) throw error;
  seededScanIds.push(data!.id as string);
  return data!.id as string;
}

afterEach(async () => {
  if (!localDbAvailable) return;
  const { error: prospectsError } = await sb.from("prospects").delete().eq("campaign_tag", CAMPAIGN_TAG);
  if (prospectsError) throw prospectsError;
  if (seededScanIds.length > 0) {
    const { error: scansError } = await sb.from("scans").delete().in("id", seededScanIds);
    if (scansError) throw scansError;
    seededScanIds.length = 0;
  }
});

describe("scan-drain integration (SCAN-01 / SCAN-03 / SCAN-04 / D-07)", () => {
  it("two concurrent claimNextScanBatch() calls return disjoint id sets (SKIP LOCKED, SCAN-01)", async (ctx) => {
    if (!localDbAvailable) return ctx.skip();
    await Promise.all(Array.from({ length: 6 }, () => seedQueued()));

    const [batchA, batchB] = await Promise.all([claimNextScanBatch(sb, 3), claimNextScanBatch(sb, 3)]);

    const idsA = batchA.map((r) => r.id);
    const idsB = batchB.map((r) => r.id);
    const intersection = idsA.filter((id) => idsB.includes(id));

    expect(intersection).toEqual([]);
    expect(idsA.length + idsB.length).toBeLessThanOrEqual(6);
  });

  it("every claimed row's scan_status is 'scanning' in the database after the claim", async (ctx) => {
    if (!localDbAvailable) return ctx.skip();
    const id = await seedQueued();
    const claimed = await claimNextScanBatch(sb, 10);
    expect(claimed.some((r) => r.id === id)).toBe(true);

    const { data, error } = await sb.from("prospects").select("scan_status").eq("id", id).single();
    if (error) throw error;
    expect(data!.scan_status).toBe("scanning");
  });

  it("a subsequent claim returns zero rows once nothing is queued (done/failed/scanning never re-claimed, SCAN-04)", async (ctx) => {
    if (!localDbAvailable) return ctx.skip();
    const id = await seedQueued();
    await claimNextScanBatch(sb, 10); // claims it -> 'scanning'

    const second = await claimNextScanBatch(sb, 10);
    expect(second.some((r) => r.id === id)).toBe(false);
  });

  it("a released-but-unarmed row (scan_status still null) is never claimed (D-07 structural gate)", async (ctx) => {
    if (!localDbAvailable) return ctx.skip();
    const unarmedId = await seedQueued({ scanStatus: null });

    const claimed = await claimNextScanBatch(sb, 10);
    expect(claimed.some((r) => r.id === unarmedId)).toBe(false);
  });

  it("reconcileInFlightScans() moves a completed scan to done and a failed scan to failed with its error text (SCAN-03)", async (ctx) => {
    if (!localDbAvailable) return ctx.skip();
    const doneScanId = await seedScan("completed");
    const failedScanId = await seedScan("failed", "Full scan timed out after 15 minutes");

    const doneProspectId = await seedQueued({ scanStatus: "scanning" });
    const failedProspectId = await seedQueued({ scanStatus: "scanning" });

    const { error: linkDoneError } = await sb
      .from("prospects")
      .update({ latest_scan_id: doneScanId })
      .eq("id", doneProspectId);
    if (linkDoneError) throw linkDoneError;
    const { error: linkFailedError } = await sb
      .from("prospects")
      .update({ latest_scan_id: failedScanId })
      .eq("id", failedProspectId);
    if (linkFailedError) throw linkFailedError;

    const result = await reconcileInFlightScans(sb);

    expect(result.done).toContain(doneProspectId);
    expect(result.failed).toContain(failedProspectId);

    const { data: doneRow, error: doneError } = await sb
      .from("prospects")
      .select("scan_status")
      .eq("id", doneProspectId)
      .single();
    if (doneError) throw doneError;
    expect(doneRow!.scan_status).toBe("done");

    const { data: failedRow, error: failedError } = await sb
      .from("prospects")
      .select("scan_status, scan_status_reason")
      .eq("id", failedProspectId)
      .single();
    if (failedError) throw failedError;
    expect(failedRow!.scan_status).toBe("failed");
    expect(failedRow!.scan_status_reason).toBe("Full scan timed out after 15 minutes");
  });

  it("calling the RPC with an oversized batch_size returns no more than the function's internal clamp", async (ctx) => {
    if (!localDbAvailable) return ctx.skip();
    await Promise.all(Array.from({ length: 12 }, () => seedQueued()));

    const claimed = await claimNextScanBatch(sb, 999);
    expect(claimed.length).toBeLessThanOrEqual(10);
  });
});
