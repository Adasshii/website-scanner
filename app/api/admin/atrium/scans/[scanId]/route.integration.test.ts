/**
 * Route 3: GET /api/admin/atrium/scans/:scanId. PRECONDITION: local
 * Supabase, migration 021.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import type { Issue, PageResult, ScanScores } from "@/types/scanner";
import {
  cleanupProspectsByDomainPrefix,
  seedProspect,
  seedScan,
  useLocalSupabase,
} from "@/tests/helpers/prospect-fixtures";
import { GET } from "./route";

// eslint-disable-next-line react-hooks/rules-of-hooks
useLocalSupabase();
process.env.ADMIN_SECRET = "test-admin-secret-atrium";

const PREFIX = "test-atrium-status-";
let sb: SupabaseClient;
const publicScanIds: string[] = [];

beforeAll(() => {
  sb = createServerClient();
});

afterEach(async () => {
  await cleanupProspectsByDomainPrefix(sb, PREFIX);
  if (publicScanIds.length > 0) {
    const { error } = await sb.from("scans").delete().in("id", publicScanIds.splice(0));
    if (error) throw error;
  }
});

const scores: ScanScores = { overall: 41, accessibility: 40, content: 40, seo: 40, performance: 40 };

const slowSite: Issue = {
  id: "slow-lcp",
  category: "performance",
  severity: "critical",
  title: "Slow page",
  description: "The page is slow",
  recommendation: "Compress images",
  impact: 9,
  whyItMatters: "Visitors leave",
};

function get(scanId: string, secret: string | null = "test-admin-secret-atrium") {
  const headers: Record<string, string> = {};
  if (secret !== null) headers["x-admin-secret"] = secret;
  return GET(new NextRequest(`http://localhost/api/admin/atrium/scans/${scanId}`, { headers }), {
    params: Promise.resolve({ scanId }),
  });
}

async function atriumProspect() {
  return seedProspect(sb, { domain: `${PREFIX}${crypto.randomUUID().slice(0, 8)}.nl`, owner: "atrium" });
}

describe("GET /api/admin/atrium/scans/:scanId", () => {
  it("returns 401 without the admin secret", async () => {
    expect((await get(crypto.randomUUID(), null)).status).toBe(401);
  });

  it("returns 400 for an id that is not a UUID", async () => {
    expect((await get("abc")).status).toBe(400);
  });

  it("returns 404 for an unknown scan", async () => {
    expect((await get(crypto.randomUUID())).status).toBe(404);
  });

  it("returns 404 for a scan of a scanner-owned prospect", async () => {
    const id = await seedProspect(sb, { domain: `${PREFIX}${crypto.randomUUID().slice(0, 8)}.nl`, owner: "scanner" });
    const scanId = await seedScan(sb, { prospectId: id, status: "completed", scores });
    expect((await get(scanId)).status).toBe(404);
  });

  it("returns 404 for a public scan with no prospect", async () => {
    const scanId = await seedScan(sb, { prospectId: null, status: "completed", scores });
    publicScanIds.push(scanId);
    expect((await get(scanId)).status).toBe(404);
  });

  it("returns only status while the scan is not done", async () => {
    const id = await atriumProspect();
    for (const [dbStatus, expected] of [
      ["pending", "queued"],
      ["scanning", "running"],
      ["processing", "running"],
      ["failed", "failed"],
    ] as const) {
      const scanId = await seedScan(sb, { prospectId: id, status: dbStatus, scores });
      const res = await get(scanId);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: expected });
    }
  });

  it("returns score, problems and reportUrl when done", async () => {
    const id = await atriumProspect();
    const pages = [{ issues: [slowSite] }] as unknown as PageResult[];
    const scanId = await seedScan(sb, {
      prospectId: id,
      status: "completed",
      scores,
      pages,
      issuesAlt: { locale: "nl", byId: { "slow-lcp": { title: "Trage pagina" } } },
    });

    const body = await (await get(scanId)).json();

    expect(body.status).toBe("done");
    expect(body.score).toBe(41);
    expect(body.problems).toEqual([{ key: "slow-lcp", title: "Trage pagina", detail: "Visitors leave" }]);
    expect(body.reportUrl).toMatch(new RegExp(`/report/${scanId}$`));
  });

  it("returns done with an empty problems list when nothing critical or major was found", async () => {
    const id = await atriumProspect();
    const scanId = await seedScan(sb, { prospectId: id, status: "completed", scores, pages: [] });
    const body = await (await get(scanId)).json();
    expect(body).toMatchObject({ status: "done", score: 41, problems: [] });
  });
});
