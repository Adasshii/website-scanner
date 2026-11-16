/**
 * Route 2: POST /api/admin/atrium/prospects/:prospectId/scan. Real local
 * database; the scan service, DNS check and robots fetch are mocked, so no
 * network call leaves the machine. PRECONDITION: local Supabase, migration 021.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  fullScanBulk: vi.fn(),
  validateUrlSafe: vi.fn(),
  isHomepageDisallowed: vi.fn(),
}));

vi.mock("@/lib/scanner-client", () => ({
  ScannerClient: class {
    fullScanBulk = mocks.fullScanBulk;
  },
}));
vi.mock("@/lib/url-validation.server", () => ({ validateUrlSafe: mocks.validateUrlSafe }));
vi.mock("@/lib/triage-fetch", () => ({ isHomepageDisallowed: mocks.isHomepageDisallowed }));

import { createServerClient } from "@/lib/supabase";
import { BULK_SCAN_IP_HASH, BULK_USER_AGENT } from "@/lib/bulk-scan-constants";
import { INSTALLERS_PROFILE, toScannerSlice } from "@/lib/niche-profile";
import {
  cleanupProspectsByDomainPrefix,
  seedProspect,
  seedScan,
  useLocalSupabase,
} from "@/tests/helpers/prospect-fixtures";
import { POST } from "./route";

// Not a React hook: "use" is the fixed name of this helper.
// eslint-disable-next-line react-hooks/rules-of-hooks
useLocalSupabase();
process.env.ADMIN_SECRET = "test-admin-secret-atrium";

const PREFIX = "test-atrium-scan-";
let sb: SupabaseClient;

beforeAll(() => {
  sb = createServerClient();
});

beforeEach(() => {
  mocks.fullScanBulk.mockReset().mockResolvedValue({ accepted: true });
  mocks.validateUrlSafe.mockReset().mockImplementation(async (url: string) => url);
  mocks.isHomepageDisallowed.mockReset().mockResolvedValue(false);
});

afterEach(async () => {
  const { error } = await sb.from("suppressions").delete().like("email", `%@${PREFIX}%`);
  if (error) throw error;
  await cleanupProspectsByDomainPrefix(sb, PREFIX);
});

function freshDomain() {
  return `${PREFIX}${crypto.randomUUID().slice(0, 8)}.nl`;
}

/** Seeds a scan in `status`, started `minutesAgo` ago, as the prospect's latest scan. */
async function linkLatestScan(prospectId: string, status: string, minutesAgo: number) {
  const scanId = await seedScan(sb, { prospectId, status });
  const startedAt = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const scan = await sb.from("scans").update({ started_at: startedAt }).eq("id", scanId);
  if (scan.error) throw scan.error;
  const link = await sb.from("prospects").update({ latest_scan_id: scanId }).eq("id", prospectId);
  if (link.error) throw link.error;
  return scanId;
}

function post(prospectId: string, secret: string | null = "test-admin-secret-atrium") {
  const headers: Record<string, string> = {};
  if (secret !== null) headers["x-admin-secret"] = secret;
  return POST(
    new NextRequest(`http://localhost/api/admin/atrium/prospects/${prospectId}/scan`, { method: "POST", headers }),
    { params: Promise.resolve({ prospectId }) }
  );
}

async function scanRow(scanId: string) {
  const { data, error } = await sb
    .from("scans")
    .select("status, prospect_id, ip_hash, error_message, url")
    .eq("id", scanId)
    .single();
  if (error) throw error;
  return data;
}

async function prospectRow(id: string) {
  const { data, error } = await sb
    .from("prospects")
    .select("latest_scan_id, scan_status, scan_status_reason")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

describe("POST /api/admin/atrium/prospects/:prospectId/scan", () => {
  it("returns 401 without the admin secret", async () => {
    expect((await post(crypto.randomUUID(), null)).status).toBe(401);
  });

  it("returns 400 for a prospect id that is not a UUID", async () => {
    expect((await post("abc")).status).toBe(400);
  });

  it("returns 404 for an unknown prospect", async () => {
    const res = await post(crypto.randomUUID());
    expect(res.status).toBe(404);
    expect(typeof (await res.json()).error).toBe("string");
  });

  it("returns 409 not-atrium for a scanner-owned prospect and never calls the scan service", async () => {
    const id = await seedProspect(sb, { domain: freshDomain(), owner: "scanner" });
    const res = await post(id);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not-atrium" });
    expect(mocks.fullScanBulk).not.toHaveBeenCalled();
  });

  it("returns 409 suppressed for an opted-out prospect and writes no scan", async () => {
    const domain = freshDomain();
    const id = await seedProspect(sb, { domain, owner: "atrium" });
    const s = await sb
      .from("suppressions")
      .insert({ email: `info@${domain}`, domain, reason: "unsubscribe", source: "unsubscribe_link" });
    if (s.error) throw s.error;

    const res = await post(id);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "suppressed" });
    expect(mocks.fullScanBulk).not.toHaveBeenCalled();
    const { data } = await sb.from("scans").select("id").eq("prospect_id", id);
    expect(data).toHaveLength(0);
  });

  it("returns 409 scan-running with the running scan's id when a scan started under 20 minutes ago", async () => {
    const id = await seedProspect(sb, { domain: freshDomain(), owner: "atrium" });
    const runningId = await linkLatestScan(id, "scanning", 5);

    const res = await post(id);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "scan-running", scanId: runningId });
    expect(mocks.fullScanBulk).not.toHaveBeenCalled();
  });

  it("returns 409 scan-running for a running scan that latest_scan_id does not point at", async () => {
    const id = await seedProspect(sb, { domain: freshDomain(), owner: "atrium" });
    // In flight: dispatch accepted, prospect row not yet updated (or that update failed).
    const runningId = await seedScan(sb, { prospectId: id, status: "scanning" });

    const res = await post(id);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "scan-running", scanId: runningId });
    expect(mocks.fullScanBulk).not.toHaveBeenCalled();
  });

  it("starts a new scan when the latest one is still marked running but started over 20 minutes ago", async () => {
    const id = await seedProspect(sb, { domain: freshDomain(), owner: "atrium" });
    const staleId = await linkLatestScan(id, "scanning", 25);

    const res = await post(id);

    expect(res.status).toBe(202);
    const { scanId } = await res.json();
    expect(scanId).not.toBe(staleId);
  });

  it("starts a new scan when the latest one is done", async () => {
    const id = await seedProspect(sb, { domain: freshDomain(), owner: "atrium" });
    await linkLatestScan(id, "completed", 5);
    expect((await post(id)).status).toBe(202);
  });

  it("hands the scan straight to the scan service and returns 202 { scanId }", async () => {
    const domain = freshDomain();
    const id = await seedProspect(sb, { domain, owner: "atrium" });

    const res = await post(id);
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(Object.keys(json)).toEqual(["scanId"]);

    expect(mocks.fullScanBulk).toHaveBeenCalledWith(`https://${domain}`, {
      scanId: json.scanId,
      prospectId: id,
      userAgent: BULK_USER_AGENT,
      nicheSlice: toScannerSlice(INSTALLERS_PROFILE),
    });
    expect(await scanRow(json.scanId)).toMatchObject({
      status: "scanning",
      prospect_id: id,
      ip_hash: BULK_SCAN_IP_HASH,
      url: `https://${domain}`,
    });
    expect(await prospectRow(id)).toEqual({ latest_scan_id: json.scanId, scan_status: "scanning", scan_status_reason: null });
  });

  // Regression, 2026-11-16: this route shipped on a branch cut before Phase 9, so it
  // called fullScanBulk with no nicheSlice. lib/bulk-scan-dispatch.ts sent one and this
  // route did not, and storeOwnSiteFacts returns "skipped" before doing any work when the
  // slice is missing. Every Atrium-started scan therefore left scans.own_site_facts null,
  // which is how it was found in production: 28 prospect scans, all owner 'atrium', all null.
  // An exact-object assertion above would catch a removal, but only this test says WHY.
  it("sends the niche slice, so an Atrium-started scan reads the prospect's own site", async () => {
    const id = await seedProspect(sb, { domain: freshDomain(), owner: "atrium" });

    expect((await post(id)).status).toBe(202);

    const slice = mocks.fullScanBulk.mock.calls[0][1].nicheSlice;
    expect(slice).toBeDefined();
    expect(slice.nicheId).toBe(INSTALLERS_PROFILE.id);
    expect(slice.trades.length).toBe(INSTALLERS_PROFILE.trades.length);
  });

  it("records a failed scan and returns 202 when robots.txt disallows the homepage", async () => {
    const id = await seedProspect(sb, { domain: freshDomain(), owner: "atrium" });
    mocks.isHomepageDisallowed.mockResolvedValue(true);

    const res = await post(id);
    expect(res.status).toBe(202);
    const { scanId } = await res.json();

    expect(mocks.fullScanBulk).not.toHaveBeenCalled();
    expect(await scanRow(scanId)).toMatchObject({ status: "failed", error_message: "robots_disallowed" });
    expect(await prospectRow(id)).toEqual({
      latest_scan_id: scanId,
      scan_status: "failed",
      scan_status_reason: "robots_disallowed",
    });
  });

  it("records a failed scan and returns 202 when the URL fails the safety check", async () => {
    const id = await seedProspect(sb, { domain: freshDomain(), owner: "atrium" });
    mocks.validateUrlSafe.mockRejectedValue(new Error("private address"));

    const res = await post(id);
    expect(res.status).toBe(202);
    const { scanId } = await res.json();
    expect(await scanRow(scanId)).toMatchObject({ status: "failed", error_message: "url_validation_failed" });
  });

  it("returns 503 and leaves no scan row when the scan service is at capacity", async () => {
    const id = await seedProspect(sb, { domain: freshDomain(), owner: "atrium" });
    mocks.fullScanBulk.mockResolvedValue({ accepted: false });

    const res = await post(id);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("120");
    expect(await res.json()).toEqual({ error: "at_capacity" });
    const { data } = await sb.from("scans").select("id").eq("prospect_id", id);
    expect(data).toHaveLength(0);
  });

  it("returns 502 and marks the scan row failed when the scan service errors", async () => {
    const id = await seedProspect(sb, { domain: freshDomain(), owner: "atrium" });
    mocks.fullScanBulk.mockRejectedValue(new Error("Scanner service error (500): down"));

    const res = await post(id);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Scan service error", detail: "Scanner service error (500): down" });
    const { data } = await sb.from("scans").select("status, error_message, completed_at").eq("prospect_id", id);
    expect(data).toEqual([
      { status: "failed", error_message: "Scanner service error (500): down", completed_at: expect.any(String) },
    ]);
  });
});
