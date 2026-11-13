/**
 * Route 4: GET /api/admin/atrium/suppressions?since=. PRECONDITION: local
 * Supabase with migration 014 (suppressions) applied.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { useLocalSupabase } from "@/tests/helpers/prospect-fixtures";
import { GET } from "./route";

// Not a React hook: "use" is the fixed name of this helper.
// eslint-disable-next-line react-hooks/rules-of-hooks
useLocalSupabase();
process.env.ADMIN_SECRET = "test-admin-secret-atrium";

const DOMAIN_PREFIX = "test-atrium-supp-";
let sb: SupabaseClient;

beforeAll(() => {
  sb = createServerClient();
});

afterEach(async () => {
  const { error } = await sb.from("suppressions").delete().like("email", `%@${DOMAIN_PREFIX}%`);
  if (error) throw error;
});

async function seedSuppression(createdAt: string, opts: { lifted?: boolean } = {}) {
  const domain = `${DOMAIN_PREFIX}${crypto.randomUUID().slice(0, 8)}.nl`;
  const email = `info@${domain}`;
  const { error } = await sb.from("suppressions").insert({
    email,
    domain,
    reason: "unsubscribe",
    source: "unsubscribe_link",
    created_at: createdAt,
    ...(opts.lifted ? { lifted_at: createdAt, lifted_by_reason: "test" } : {}),
  });
  if (error) throw error;
  return { email, domain };
}

function get(query: string, secret: string | null = "test-admin-secret-atrium") {
  const headers: Record<string, string> = {};
  if (secret !== null) headers["x-admin-secret"] = secret;
  return GET(new NextRequest(`http://localhost/api/admin/atrium/suppressions${query}`, { headers }));
}

function ours(list: { email: string | null }[]) {
  return list.filter((s) => s.email?.includes(`@${DOMAIN_PREFIX}`));
}

describe("GET /api/admin/atrium/suppressions", () => {
  it("returns 401 without the admin secret", async () => {
    expect((await get("?since=2026-01-01T00:00:00.000Z", null)).status).toBe(401);
  });

  it("returns 400 when since is missing or not a time", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("?since=yesterday")).status).toBe(400);
  });

  it("returns active suppressions created at or after since, in the contract shape", async () => {
    const before = await seedSuppression("2026-11-10T08:00:00.000Z");
    const after = await seedSuppression("2026-11-11T08:00:00.000Z");
    await seedSuppression("2026-11-11T09:00:00.000Z", { lifted: true });

    const res = await get("?since=2026-11-11T00:00:00.000Z");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(Object.keys(body).sort()).toEqual(["now", "suppressions"]);
    expect(Number.isNaN(Date.parse(body.now))).toBe(false);
    expect(Date.parse(body.now)).toBeLessThanOrEqual(Date.now());
    expect(ours(body.suppressions)).toEqual([
      { email: after.email, domain: after.domain, createdAt: "2026-11-11T08:00:00.000Z" },
    ]);
    expect(ours(body.suppressions).some((s) => s.email === before.email)).toBe(false);
  });

  it("finds a row again when the previous now is passed as since", async () => {
    const first = await (await get("?since=2026-11-11T00:00:00.000Z")).json();
    const late = await seedSuppression(new Date().toISOString());

    const second = await (await get(`?since=${encodeURIComponent(first.now)}`)).json();
    expect(ours(second.suppressions).some((s) => s.email === late.email)).toBe(true);
  });
});
