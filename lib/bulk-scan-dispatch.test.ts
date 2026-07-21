/**
 * Unit tests for lib/bulk-scan-dispatch.ts — DI-stubbed Supabase client
 * (mirrors lib/suppression.test.ts's chainable/thenable builder pattern)
 * and a fetch-stubbing style for robots.txt matching lib/triage-fetch.test.ts.
 * No real network, DNS, or timers. Covers every behavior bullet in
 * 04-03-PLAN.md Task 2.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchClaimedProspects } from "./bulk-scan-dispatch";
import { BULK_USER_AGENT, BULK_DISPATCH_CONCURRENCY, BULK_SCAN_IP_HASH } from "./bulk-scan-constants";
import type { ClaimedProspect } from "./scan-queue";
import type { TriageResponseLike } from "./triage-fetch";

type Call = { table: string; op: string; payload?: unknown };

/** Chainable + thenable mock query builder, one per `.from()` call. Records
 * every insert/update/delete payload into a shared `calls` array so
 * assertions can inspect exactly what was written, to which table. */
function makeSupabaseMock(config: {
  scansInsertError?: unknown;
  scansDeleteError?: unknown;
  prospectsUpdateError?: unknown;
} = {}) {
  const calls: Call[] = [];

  function makeBuilder(table: string) {
    let op = "";
    const builder: Record<string, unknown> = {
      insert: vi.fn((payload: unknown) => {
        op = "insert";
        calls.push({ table, op, payload });
        return builder;
      }),
      update: vi.fn((payload: unknown) => {
        op = "update";
        calls.push({ table, op, payload });
        return builder;
      }),
      delete: vi.fn(() => {
        op = "delete";
        calls.push({ table, op });
        return builder;
      }),
      eq: vi.fn(() => builder),
      then: (onFulfilled: (v: { error: unknown }) => unknown, onRejected?: (r: unknown) => unknown) => {
        let error: unknown = null;
        if (table === "scans" && op === "insert") error = config.scansInsertError ?? null;
        if (table === "scans" && op === "delete") error = config.scansDeleteError ?? null;
        if (table === "prospects" && op === "update") error = config.prospectsUpdateError ?? null;
        return Promise.resolve({ error }).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));
  return { sb: { from } as unknown as SupabaseClient, calls };
}

function makeProspect(overrides?: Partial<ClaimedProspect>): ClaimedProspect {
  return {
    id: "p1",
    domain: "shop.test",
    website_url: "https://shop.test",
    scan_attempts: 0,
    ...overrides,
  };
}

const passthroughValidate = vi.fn(async (url: string) => url);

function robotsResponse(text: string, ok = true): TriageResponseLike {
  return {
    status: ok ? 200 : 404,
    ok,
    headers: { get: () => null },
    body: ok ? {} : null,
    async text() {
      return text;
    },
  } as unknown as TriageResponseLike;
}

/** robots.txt fetch stub: fail-open (404) unless a disallow body is given. */
function makeFetchImpl(disallow = false) {
  return vi.fn(async () => (disallow ? robotsResponse("User-agent: *\nDisallow: /") : robotsResponse("", false)));
}

describe("dispatchClaimedProspects", () => {
  it("marks a robots-disallowed prospect failed and never calls the scanner client (D-10)", async () => {
    const { sb, calls } = makeSupabaseMock();
    const client = { fullScanBulk: vi.fn() };

    const outcomes = await dispatchClaimedProspects(sb, [makeProspect()], {
      client,
      fetchImpl: makeFetchImpl(true),
      sleep: async () => {},
      validateUrlSafe: passthroughValidate,
    });

    expect(outcomes).toEqual([{ id: "p1", dispatched: false, reason: "robots_disallowed" }]);
    expect(client.fullScanBulk).not.toHaveBeenCalled();
    expect(calls.some((c) => c.table === "scans" && c.op === "insert")).toBe(false);
    expect(calls).toContainEqual({
      table: "prospects",
      op: "update",
      payload: { scan_status: "failed", scan_status_reason: "robots_disallowed" },
    });
  });

  it("marks an SSRF-rejected prospect failed and never calls the scanner client", async () => {
    const { sb, calls } = makeSupabaseMock();
    const client = { fullScanBulk: vi.fn() };
    const rejectValidate = vi.fn(async () => {
      throw new Error("private network");
    });

    const outcomes = await dispatchClaimedProspects(sb, [makeProspect()], {
      client,
      fetchImpl: makeFetchImpl(),
      sleep: async () => {},
      validateUrlSafe: rejectValidate,
    });

    expect(outcomes).toEqual([{ id: "p1", dispatched: false, reason: "url_validation_failed" }]);
    expect(client.fullScanBulk).not.toHaveBeenCalled();
    expect(calls).toContainEqual({
      table: "prospects",
      op: "update",
      payload: { scan_status: "failed", scan_status_reason: "url_validation_failed" },
    });
  });

  it("an accepted dispatch inserts one scans row with prospect_id and the bulk ip_hash sentinel, then sets latest_scan_id and scan_attempts=1", async () => {
    const { sb, calls } = makeSupabaseMock();
    const client = { fullScanBulk: vi.fn(async () => ({ accepted: true })) };

    const outcomes = await dispatchClaimedProspects(sb, [makeProspect()], {
      client,
      fetchImpl: makeFetchImpl(),
      sleep: async () => {},
      validateUrlSafe: passthroughValidate,
    });

    expect(outcomes).toEqual([{ id: "p1", dispatched: true }]);

    const insertCall = calls.find((c) => c.table === "scans" && c.op === "insert");
    expect(insertCall).toBeDefined();
    const insertPayload = insertCall!.payload as Record<string, unknown>;
    expect(insertPayload.prospect_id).toBe("p1");
    expect(insertPayload.ip_hash).toBe(BULK_SCAN_IP_HASH);

    const updateCall = calls.find(
      (c) => c.table === "prospects" && c.op === "update" && (c.payload as Record<string, unknown>).latest_scan_id
    );
    expect(updateCall).toBeDefined();
    const updatePayload = updateCall!.payload as Record<string, unknown>;
    expect(updatePayload.latest_scan_id).toBe(insertPayload.id);
    expect(updatePayload.scan_attempts).toBe(1);
  });

  it("a 503 capacity refusal returns the prospect to queued, leaves no scans row, and leaves scan_attempts untouched", async () => {
    const { sb, calls } = makeSupabaseMock();
    const client = { fullScanBulk: vi.fn(async () => ({ accepted: false })) };

    const outcomes = await dispatchClaimedProspects(sb, [makeProspect()], {
      client,
      fetchImpl: makeFetchImpl(),
      sleep: async () => {},
      validateUrlSafe: passthroughValidate,
    });

    expect(outcomes).toEqual([{ id: "p1", dispatched: false, reason: "at_capacity" }]);

    expect(calls.some((c) => c.table === "scans" && c.op === "insert")).toBe(true);
    expect(calls.some((c) => c.table === "scans" && c.op === "delete")).toBe(true);

    const requeueCall = calls.find(
      (c) => c.table === "prospects" && c.op === "update" && (c.payload as Record<string, unknown>).scan_status === "queued"
    );
    expect(requeueCall).toBeDefined();
    expect(requeueCall!.payload).not.toHaveProperty("scan_attempts");
  });

  it("a thrown dispatch error marks the prospect failed with the error text and scan_attempts=1", async () => {
    const { sb, calls } = makeSupabaseMock();
    const client = {
      fullScanBulk: vi.fn(async () => {
        throw new Error("connection reset");
      }),
    };

    const outcomes = await dispatchClaimedProspects(sb, [makeProspect()], {
      client,
      fetchImpl: makeFetchImpl(),
      sleep: async () => {},
      validateUrlSafe: passthroughValidate,
    });

    expect(outcomes).toEqual([{ id: "p1", dispatched: false, reason: "connection reset" }]);
    expect(calls).toContainEqual({
      table: "prospects",
      op: "update",
      payload: { scan_status: "failed", scan_status_reason: "connection reset", scan_attempts: 1 },
    });
  });

  it("passes BULK_USER_AGENT (not any other identity) to the scanner client", async () => {
    const { sb } = makeSupabaseMock();
    const client = { fullScanBulk: vi.fn(async () => ({ accepted: true })) };

    await dispatchClaimedProspects(sb, [makeProspect()], {
      client,
      fetchImpl: makeFetchImpl(),
      sleep: async () => {},
      validateUrlSafe: passthroughValidate,
    });

    expect(client.fullScanBulk).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ userAgent: BULK_USER_AGENT })
    );
  });

  it("never exceeds BULK_DISPATCH_CONCURRENCY simultaneous in-flight calls", async () => {
    const { sb } = makeSupabaseMock();
    let inFlight = 0;
    let peak = 0;

    const client = {
      fullScanBulk: vi.fn(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        return { accepted: true };
      }),
    };

    const batch = Array.from({ length: BULK_DISPATCH_CONCURRENCY * 3 }, (_, i) =>
      makeProspect({ id: `p${i}`, domain: `shop${i}.test`, website_url: `https://shop${i}.test` })
    );

    await dispatchClaimedProspects(sb, batch, {
      client,
      fetchImpl: makeFetchImpl(),
      sleep: async () => {},
      validateUrlSafe: passthroughValidate,
    });

    expect(peak).toBeLessThanOrEqual(BULK_DISPATCH_CONCURRENCY);
    expect(peak).toBeGreaterThan(0);
  });
});
