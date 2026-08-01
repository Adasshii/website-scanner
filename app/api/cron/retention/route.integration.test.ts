/**
 * Integration suite for GET /api/cron/retention — the CRON_SECRET auth
 * guard and the dry-run happy path, asserted against a real Postgres with
 * migrations 001-019 applied.
 *
 * PRECONDITION: a local Supabase stack, NOT production:
 *   supabase start
 *   supabase db reset   # applies supabase/migrations/*, including 019
 *   npx vitest run "app/api/cron/retention/route.integration.test.ts"
 *
 * This repo's .env.local points at the REMOTE production Supabase — the
 * env override below (the fixed local-dev URL and demo service-role JWT
 * `supabase start` always prints for a fresh local project) is what keeps
 * this suite off it. These are Supabase's published local-only defaults
 * (see CLI output), not a real secret, and are never valid against a
 * hosted/production project.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import type { GET as GetHandler } from "./route";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
process.env.CRON_SECRET = "test-retention-cron-secret";

const DOMAIN_PREFIX = "test-07-06-route-";
let sb: SupabaseClient;
let GET: typeof GetHandler;
let seededId: string | null = null;

beforeAll(async () => {
  // lib/retention-constants.ts reads RETENTION_MODE/RETENTION_MONTHS at
  // module scope — a static top-of-file import of "./route" would already
  // have evaluated that module before these deletes run (ES module
  // imports are linked before any of this file's own top-level code
  // executes). A dynamic import here guarantees the deletes below land
  // first, so the constants module evaluates to its shipped defaults
  // (dry-run / 12) rather than whatever the developer's shell carries.
  delete process.env.RETENTION_MODE;
  delete process.env.RETENTION_MONTHS;
  ({ GET } = await import("./route"));
  sb = createServerClient();
});

afterEach(async () => {
  if (seededId) {
    const { error } = await sb.from("prospects").delete().eq("id", seededId);
    if (error) throw error;
    seededId = null;
  }
});

async function seedExpiredProspect(): Promise<void> {
  const thirteenMonthsAgo = new Date();
  thirteenMonthsAgo.setUTCMonth(thirteenMonthsAgo.getUTCMonth() - 13);

  const { data, error } = await sb
    .from("prospects")
    .insert({
      domain: `${DOMAIN_PREFIX}${Date.now()}.example`,
      country: "NL",
      created_at: thirteenMonthsAgo.toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  seededId = data.id as string;
}

function makeRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.authorization = authHeader;
  return new NextRequest("http://localhost/api/cron/retention", { headers });
}

describe("GET /api/cron/retention", () => {
  it("returns 401 when no authorization header is present", async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
  });

  it("returns 401 when the bearer is wrong", async () => {
    const response = await GET(makeRequest("Bearer wrong-secret"));
    expect(response.status).toBe(401);
  });

  it("returns 200 with the dry-run mode, the 12-month window, and an expiring count that rises by exactly the seeded fixture", async () => {
    // The shared local Supabase instance can carry stray rows from other
    // suites (documented project hazard), so this asserts an exact delta
    // rather than an absolute count — still "equals the number of seeded
    // expired fixtures" (one), just contamination-proof.
    const before = await GET(makeRequest(`Bearer ${process.env.CRON_SECRET}`));
    const beforeBody = await before.json();

    await seedExpiredProspect();

    const response = await GET(makeRequest(`Bearer ${process.env.CRON_SECRET}`));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.mode).toBe("dry-run");
    expect(body.months).toBe(12);
    expect(typeof body.cutoff).toBe("string");
    expect(body.expiring).toBe(beforeBody.expiring + 1);
  });
});
