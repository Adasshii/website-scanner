import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

// Unit-level: does not assert db.ok (that needs a real Supabase connection,
// covered by the *.integration.test.ts suite elsewhere). This test only
// guards REQUIRED_VARS — specifically that GEMINI_API_KEY, the one variable
// this entire draft-generation phase depends on, cannot be silently dropped
// from the reported env keys again (it was missing until this fix).
describe("GET /api/health", () => {
  it("reports GEMINI_API_KEY among the required env vars, as a boolean only", async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.env).toHaveProperty("GEMINI_API_KEY");
    expect(typeof data.env.GEMINI_API_KEY).toBe("boolean");
  });
});
