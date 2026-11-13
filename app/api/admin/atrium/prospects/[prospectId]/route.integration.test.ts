/**
 * Route 5: DELETE /api/admin/atrium/prospects/:prospectId. PRECONDITION:
 * local Supabase, migration 021.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  cleanupProspectsByDomainPrefix,
  seedProspect,
  seedScan,
  useLocalSupabase,
} from "@/tests/helpers/prospect-fixtures";
import { DELETE } from "./route";

// Not a React hook: "use" is the fixed name of this helper.
// eslint-disable-next-line react-hooks/rules-of-hooks
useLocalSupabase();
process.env.ADMIN_SECRET = "test-admin-secret-atrium";

const PREFIX = "test-atrium-rel-";
let sb: SupabaseClient;

beforeAll(() => {
  sb = createServerClient();
});

afterEach(async () => {
  const { error } = await sb.from("suppressions").delete().like("email", `%@${PREFIX}%`);
  if (error) throw error;
  await cleanupProspectsByDomainPrefix(sb, PREFIX);
});

function del(prospectId: string, secret: string | null = "test-admin-secret-atrium") {
  const headers: Record<string, string> = {};
  if (secret !== null) headers["x-admin-secret"] = secret;
  return DELETE(
    new NextRequest(`http://localhost/api/admin/atrium/prospects/${prospectId}`, { method: "DELETE", headers }),
    { params: Promise.resolve({ prospectId }) }
  );
}

function freshDomain() {
  return `${PREFIX}${crypto.randomUUID().slice(0, 8)}.nl`;
}

async function count(table: string, column: string, value: string) {
  const { data, error } = await sb.from(table).select("id").eq(column, value);
  if (error) throw error;
  return data.length;
}

describe("DELETE /api/admin/atrium/prospects/:prospectId", () => {
  it("returns 401 without the admin secret", async () => {
    expect((await del(crypto.randomUUID(), null)).status).toBe(401);
  });

  it("returns 400 for an id that is not a UUID", async () => {
    expect((await del("abc")).status).toBe(400);
  });

  it("returns 204 for an unknown prospect (idempotent)", async () => {
    expect((await del(crypto.randomUUID())).status).toBe(204);
  });

  it("refuses a scanner-owned prospect with 409 not-atrium and deletes nothing", async () => {
    const id = await seedProspect(sb, { domain: freshDomain(), owner: "scanner" });
    await seedScan(sb, { prospectId: id, status: "completed" });

    const res = await del(id);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not-atrium" });
    expect(await count("prospects", "id", id)).toBe(1);
    expect(await count("scans", "prospect_id", id)).toBe(1);
  });

  it("deletes an Atrium prospect with its scans, drafts and sources, keeps suppressions, returns 204", async () => {
    const domain = freshDomain();
    const id = await seedProspect(sb, { domain, owner: "atrium" });
    const firstScan = await seedScan(sb, { prospectId: id, status: "failed" });
    const latestScan = await seedScan(sb, { prospectId: id, status: "completed" });

    const link = await sb.from("prospects").update({ latest_scan_id: latestScan }).eq("id", id);
    if (link.error) throw link.error;
    const draft = await sb.from("outreach_messages").insert({
      prospect_id: id,
      scan_id: latestScan,
      draft_subject: "s",
      draft_body: "b",
      status: "draft",
    });
    if (draft.error) throw draft.error;
    const source = await sb.from("prospect_sources").insert({
      prospect_id: id,
      overture_gers_id: `${PREFIX}gers-${crypto.randomUUID()}`,
      raw_name: "Test",
    });
    if (source.error) throw source.error;
    const suppression = await sb.from("suppressions").insert({
      email: `info@${domain}`,
      domain,
      reason: "unsubscribe",
      source: "unsubscribe_link",
    });
    if (suppression.error) throw suppression.error;

    const res = await del(id);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(await count("prospects", "id", id)).toBe(0);
    expect(await count("scans", "id", firstScan)).toBe(0);
    expect(await count("scans", "id", latestScan)).toBe(0);
    expect(await count("outreach_messages", "prospect_id", id)).toBe(0);
    expect(await count("prospect_sources", "prospect_id", id)).toBe(0);
    expect(await count("suppressions", "email", `info@${domain}`)).toBe(1);

    expect((await del(id)).status).toBe(204);
  });
});
