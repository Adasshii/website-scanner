/**
 * prospects.owner (migration 021): 'scanner' by default, 'atrium' for
 * prospects registered through /api/admin/atrium/prospects, nothing else.
 * PRECONDITION: local Supabase with migration 021 applied.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase";
import { cleanupProspectsByDomainPrefix, useLocalSupabase } from "@/tests/helpers/prospect-fixtures";

// Not a React hook: "use" is the fixed name of this helper.
// eslint-disable-next-line react-hooks/rules-of-hooks
useLocalSupabase();

const PREFIX = "test-owner-col-";
let sb: SupabaseClient;

beforeAll(() => {
  sb = createServerClient();
});

afterEach(async () => {
  await cleanupProspectsByDomainPrefix(sb, PREFIX);
});

async function insertWithOwner(owner?: string) {
  const domain = `${PREFIX}${crypto.randomUUID().slice(0, 8)}.nl`;
  return sb
    .from("prospects")
    .insert({ domain, country: "NL", ...(owner === undefined ? {} : { owner }) })
    .select("owner")
    .single();
}

describe("prospects.owner", () => {
  it("defaults to 'scanner'", async () => {
    const { data, error } = await insertWithOwner();
    expect(error).toBeNull();
    expect(data!.owner).toBe("scanner");
  });

  it("accepts 'atrium'", async () => {
    const { data, error } = await insertWithOwner("atrium");
    expect(error).toBeNull();
    expect(data!.owner).toBe("atrium");
  });

  it("rejects any other value", async () => {
    const { error } = await insertWithOwner("someone-else");
    expect(error?.code).toBe("23514");
  });
});
