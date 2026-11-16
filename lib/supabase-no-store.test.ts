import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerClient } from "./supabase";

// Next.js patches global fetch and can keep a GET response in its Data Cache.
// On 2026-11-16 the Atrium scan-status route kept answering "running" for scans
// the database had marked completed, because the first poll (taken while the
// scan was still running) was served again on every later poll. Every database
// read from the server client must therefore ask fetch for no-store.
describe("createServerClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends every database request with cache: no-store", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    const seen: (RequestInit | undefined)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(init);
        return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
      })
    );

    await createServerClient().from("scans").select("id").eq("id", "x");

    expect(seen).toHaveLength(1);
    expect(seen[0]?.cache).toBe("no-store");
  });
});
