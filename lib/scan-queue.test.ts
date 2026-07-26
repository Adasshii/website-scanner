/**
 * Unit tests for lib/scan-queue.ts — DI-stubbed Supabase client, no real DB
 * (mirrors lib/suppression.test.ts's chainable-and-thenable builder stub).
 * Covers every behavior bullet in 04-03-PLAN.md Task 1: arm ceiling and
 * eligibility, claim pass-through, fail/reason recording, the capacity-
 * refusal vs human-requeue distinction (D-04/D-08), and reconciliation.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  armBatch,
  claimNextScanBatch,
  markScanFailed,
  reconcileInFlightScans,
  requeueProspect,
  requeueToQueued,
} from "./scan-queue";

interface QueryResult {
  data?: unknown;
  error: unknown;
}

/** Chainable + thenable mock query builder, one per `.from()` call so
 * different tables/queries in the same test can return different canned
 * results (reconcileInFlightScans queries both `prospects` and `scans`). */
function makeBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    not: vi.fn(() => builder),
    is: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    update: vi.fn(() => builder),
    then: (onFulfilled: (v: QueryResult) => unknown, onRejected?: (r: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return builder;
}

function makeSupabaseMock(fromResults: QueryResult[], rpcResult?: QueryResult) {
  let call = 0;
  const builders: ReturnType<typeof makeBuilder>[] = [];
  const from = vi.fn(() => {
    const result = fromResults[call] ?? fromResults[fromResults.length - 1];
    call++;
    const builder = makeBuilder(result);
    builders.push(builder);
    return builder;
  });
  const rpc = vi.fn(async () => rpcResult ?? { data: [], error: null });
  return { sb: { from, rpc } as unknown as SupabaseClient, from, rpc, builders };
}

describe("armBatch", () => {
  it("arms at most BULK_ARM_CEILING eligible prospects, sliced in JS", async () => {
    const ids = Array.from({ length: 25 }, (_, i) => ({ id: `p${i}` }));
    const { sb, builders } = makeSupabaseMock([{ data: ids, error: null }, { error: null }]);

    const armed = await armBatch(sb, { ceiling: 20 });

    expect(armed.length).toBe(20);
    expect(builders[1].update).toHaveBeenCalledWith(
      expect.objectContaining({ scan_status: "queued", scan_attempts: 0 })
    );
    expect(builders[1].in).toHaveBeenCalledWith("id", armed);
  });

  it("returns an empty array and never updates when nothing is eligible", async () => {
    const { sb, builders } = makeSupabaseMock([{ data: [], error: null }]);
    const armed = await armBatch(sb);
    expect(armed).toEqual([]);
    expect(builders.length).toBe(1); // no update-builder created
  });
});

describe("claimNextScanBatch", () => {
  it("passes the requested batch size through to the RPC and returns the rows", async () => {
    const claimed = [{ id: "p1", domain: "a.test", website_url: "https://a.test", scan_attempts: 0 }];
    const { sb, rpc } = makeSupabaseMock([], { data: claimed, error: null });

    const result = await claimNextScanBatch(sb, 5);

    expect(rpc).toHaveBeenCalledWith("claim_next_scan_batch", { batch_size: 5 });
    expect(result).toEqual(claimed);
  });

  it("throws on RPC error", async () => {
    const { sb } = makeSupabaseMock([], { data: null, error: new Error("boom") });
    await expect(claimNextScanBatch(sb)).rejects.toThrow("boom");
  });
});

describe("markScanFailed", () => {
  it("records the reason without touching scan_attempts by default (a skip, attemptSpent omitted)", async () => {
    const { sb, builders } = makeSupabaseMock([{ error: null }]);
    await markScanFailed(sb, "p1", "robots_disallowed");
    expect(builders[0].update).toHaveBeenCalledWith({
      scan_status: "failed",
      scan_status_reason: "robots_disallowed",
    });
    expect(builders[0].eq).toHaveBeenCalledWith("id", "p1");
  });

  it("sets scan_attempts to 1 when attemptSpent is true (a real dispatch error)", async () => {
    const { sb, builders } = makeSupabaseMock([{ error: null }]);
    await markScanFailed(sb, "p1", "dispatch error", { attemptSpent: true });
    expect(builders[0].update).toHaveBeenCalledWith({
      scan_status: "failed",
      scan_status_reason: "dispatch error",
      scan_attempts: 1,
    });
  });
});

describe("requeueToQueued (capacity refusal, D-08/D-04)", () => {
  it("moves the prospect back to queued with no scan_attempts key in the payload", async () => {
    const { sb, builders } = makeSupabaseMock([{ error: null }]);
    await requeueToQueued(sb, "p1");
    const payload = (builders[0].update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload).toEqual({ scan_status: "queued" });
    expect(payload).not.toHaveProperty("scan_attempts");
  });
});

describe("requeueProspect (human requeue, SCAN-04)", () => {
  it("chains a second scan_status=failed filter so a done row is unaffected", async () => {
    const { sb, builders } = makeSupabaseMock([{ error: null }]);
    await requeueProspect(sb, "p1");
    const eqCalls = (builders[0].eq as ReturnType<typeof vi.fn>).mock.calls;
    expect(eqCalls).toContainEqual(["id", "p1"]);
    expect(eqCalls).toContainEqual(["scan_status", "failed"]);
    expect(builders[0].update).toHaveBeenCalledWith(
      expect.objectContaining({ scan_status: "queued", scan_attempts: 0, scan_status_reason: null })
    );
  });
});

describe("reconcileInFlightScans", () => {
  it("derives contact fields for a NULL-contact done prospect and maps a failed scan to failed with its error_message as reason", async () => {
    const inFlight = [
      { id: "p-done", latest_scan_id: "s-done", domain: "acme.nl", contact_email: null },
      { id: "p-failed", latest_scan_id: "s-failed", domain: "other.nl", contact_email: null },
      { id: "p-scanning", latest_scan_id: "s-scanning", domain: "third.nl", contact_email: null },
    ];
    const scans = [
      {
        id: "s-done",
        status: "completed",
        error_message: null,
        pages: [
          {
            url: "https://acme.nl/contact",
            data: { contactExtraction: { mailtoHrefs: ["mailto:info@acme.nl"], cfemailTokens: [], contactText: "" } },
          },
        ],
      },
      { id: "s-failed", status: "failed", error_message: "timed out", pages: [] },
      { id: "s-scanning", status: "scanning", error_message: null, pages: [] },
    ];
    const { sb, builders } = makeSupabaseMock([
      { data: inFlight, error: null }, // prospects select
      { data: scans, error: null }, // scans select
      { error: null }, // done: scan_status update (unconditional)
      { error: null }, // done: contact-field update (guarded by .is contact_email null)
      { error: null }, // failed update
    ]);

    const result = await reconcileInFlightScans(sb);

    expect(result.done).toEqual(["p-done"]);
    expect(result.failed).toEqual(["p-failed"]);
    // "scanning" row is untouched: two update-builders for p-done (status,
    // then guarded contact-field write) + one for p-failed, after the two selects.
    expect(builders.length).toBe(5);
    expect(builders[2].update).toHaveBeenCalledWith({ scan_status: "done" });
    expect(builders[3].update).toHaveBeenCalledWith({
      contact_email: "info@acme.nl",
      contact_email_type: "generic",
      commercial_contact_invited: false,
      sole_proprietorship: "unknown",
    });
    expect(builders[3].is).toHaveBeenCalledWith("contact_email", null);
    expect(builders[4].update).toHaveBeenCalledWith({
      scan_status: "failed",
      scan_status_reason: "timed out",
    });
  });

  it("writes scan_status only for a done prospect that already has a contact_email (fill-only-when-null)", async () => {
    const inFlight = [{ id: "p-has-contact", latest_scan_id: "s-done", domain: "acme.nl", contact_email: "existing@keep.nl" }];
    const scans = [{ id: "s-done", status: "completed", error_message: null, pages: [] }];
    const { sb, builders } = makeSupabaseMock([
      { data: inFlight, error: null },
      { data: scans, error: null },
      { error: null },
    ]);

    const result = await reconcileInFlightScans(sb);

    expect(result.done).toEqual(["p-has-contact"]);
    expect(builders[2].update).toHaveBeenCalledWith({ scan_status: "done" });
  });

  it("ignores scanning prospects with no latest_scan_id and returns early with no update calls", async () => {
    const { sb, builders } = makeSupabaseMock([{ data: [], error: null }]);
    const result = await reconcileInFlightScans(sb);
    expect(result).toEqual({ done: [], failed: [] });
    expect(builders.length).toBe(1); // only the initial select ran
  });
});
