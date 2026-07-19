/**
 * Unit tests for lib/suppression.ts — DI-stubbed Supabase client, no real DB
 * (mirrors scripts/import-prospects.test.ts's vi.fn() stub pattern). The
 * mock query builder is chainable AND thenable (like the real supabase-js
 * builder): every chain method returns the same builder, and awaiting it
 * (directly, or via .maybeSingle()) resolves to the canned result for that
 * call.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSuppressed, liftSuppression, writeSuppression } from "./suppression";

interface QueryResult {
  data?: unknown;
  error: unknown;
}

function makeSupabaseMock(config: {
  select?: QueryResult;
  insert?: QueryResult;
  update?: QueryResult;
}) {
  let current: QueryResult = { data: null, error: null };

  const builder = {
    select: vi.fn(() => builder),
    is: vi.fn(() => builder),
    or: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(() => {
      current = config.select ?? { data: null, error: null };
      return builder;
    }),
    insert: vi.fn(() => {
      current = config.insert ?? { error: null };
      return builder;
    }),
    update: vi.fn(() => {
      current = config.update ?? { error: null };
      return builder;
    }),
    then: (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(current).then(onFulfilled, onRejected),
  };

  const from = vi.fn(() => builder);
  return { sb: { from } as unknown as SupabaseClient, builder, from };
}

describe("isSuppressed", () => {
  it("returns true when an active row matches the exact email", async () => {
    const { sb } = makeSupabaseMock({ select: { data: { id: "row-1" }, error: null } });
    expect(await isSuppressed(sb, "info@shop.nl")).toBe(true);
  });

  it("returns true on a domain match even when the exact email differs (CMP-03 domain-wide match)", async () => {
    const { sb, builder } = makeSupabaseMock({ select: { data: { id: "row-1" }, error: null } });
    // sales@shop.nl was suppressed; a lookup for a different address on the
    // same domain (info@shop.nl) must still be blocked — the .or() clause
    // is what makes that true against a real DB (proven in the integration
    // suite); here we assert the domain clause is actually built.
    const result = await isSuppressed(sb, "info@shop.nl");
    expect(result).toBe(true);
    expect(builder.or).toHaveBeenCalledWith(expect.stringContaining("domain.eq.shop.nl"));
    expect(builder.or).toHaveBeenCalledWith(expect.stringContaining("email.eq.info@shop.nl"));
  });

  it("returns false when the only matching row has lifted_at set (lifted rows are ignored)", async () => {
    const { sb, builder } = makeSupabaseMock({ select: { data: null, error: null } });
    expect(await isSuppressed(sb, "info@shop.nl")).toBe(false);
    expect(builder.is).toHaveBeenCalledWith("lifted_at", null);
  });

  it("throws when the query errors", async () => {
    const { sb } = makeSupabaseMock({ select: { data: null, error: new Error("boom") } });
    await expect(isSuppressed(sb, "info@shop.nl")).rejects.toThrow("boom");
  });
});

describe("writeSuppression", () => {
  it("is a no-op returning { created: false } when an active row already exists (CMP-04 idempotency)", async () => {
    const { sb } = makeSupabaseMock({ select: { data: { id: "row-1" }, error: null } });
    const result = await writeSuppression(sb, {
      email: "info@shop.nl",
      domain: "shop.nl",
      reason: "unsubscribe",
      source: "unsubscribe_link",
    });
    expect(result).toEqual({ created: false });
  });

  it("inserts and returns { created: true } when no active row exists", async () => {
    const { sb, builder } = makeSupabaseMock({
      select: { data: null, error: null },
      insert: { error: null },
    });
    const result = await writeSuppression(sb, {
      email: "info@shop.nl",
      domain: "shop.nl",
      reason: "unsubscribe",
      source: "unsubscribe_link",
    });
    expect(result).toEqual({ created: true });
    expect(builder.insert).toHaveBeenCalledWith({
      email: "info@shop.nl",
      domain: "shop.nl",
      reason: "unsubscribe",
      source: "unsubscribe_link",
    });
  });
});

describe("liftSuppression", () => {
  it("sets lifted_at + lifted_by_reason and returns { lifted: true } when an active row exists", async () => {
    const { sb, builder } = makeSupabaseMock({
      select: { data: { id: "row-1" }, error: null },
      update: { error: null },
    });
    const result = await liftSuppression(sb, { email: "info@shop.nl", reason: "false positive" });
    expect(result).toEqual({ lifted: true });
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ lifted_by_reason: "false positive" })
    );
  });

  it("returns { lifted: false } when no active row exists", async () => {
    const { sb, builder } = makeSupabaseMock({ select: { data: null, error: null } });
    const result = await liftSuppression(sb, { email: "info@shop.nl", reason: "false positive" });
    expect(result).toEqual({ lifted: false });
    expect(builder.update).not.toHaveBeenCalled();
  });
});
