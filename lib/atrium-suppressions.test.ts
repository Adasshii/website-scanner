import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listSuppressionsSince, SUPPRESSION_SYNC_OVERLAP_MS } from "./atrium-suppressions";

function row(i: number) {
  return { id: `id-${String(i).padStart(5, "0")}`, email: `a${i}@x.nl`, domain: "x.nl", created_at: "2026-11-12T09:00:00.000Z" };
}

/** One page result per .from() call, in order. Records the .range() args. */
function mockSb(pages: unknown[][]) {
  const ranges: [number, number][] = [];
  let call = 0;
  const from = vi.fn(() => {
    const data = pages[call++] ?? [];
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "gte", "is", "order"]) builder[m] = vi.fn(() => builder);
    builder.range = vi.fn((a: number, b: number) => {
      ranges.push([a, b]);
      return builder;
    });
    builder.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok);
    return builder;
  });
  return { sb: { from } as unknown as SupabaseClient, ranges };
}

describe("listSuppressionsSince", () => {
  it("pages past PostgREST's 1000-row cap", async () => {
    const first = Array.from({ length: 1000 }, (_, i) => row(i));
    const second = [row(1000), row(1001), row(1002)];
    const { sb, ranges } = mockSb([first, second]);

    const result = await listSuppressionsSince(sb, "2026-11-01T00:00:00.000Z", new Date("2026-11-12T10:00:00.000Z"));

    expect(result.suppressions).toHaveLength(1003);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("returns now moved back by the overlap, never before since", async () => {
    const { sb } = mockSb([[]]);
    const now = new Date("2026-11-12T10:00:00.000Z");

    const far = await listSuppressionsSince(sb, "2026-11-01T00:00:00.000Z", now);
    expect(far.now).toBe(new Date(now.getTime() - SUPPRESSION_SYNC_OVERLAP_MS).toISOString());

    const { sb: sb2 } = mockSb([[]]);
    const close = await listSuppressionsSince(sb2, "2026-11-12T09:59:30.000Z", now);
    expect(close.now).toBe("2026-11-12T09:59:30.000Z");
  });

  it("maps rows to the contract shape", async () => {
    const { sb } = mockSb([[{ id: "1", email: "info@x.nl", domain: "x.nl", created_at: "2026-11-12T09:00:00+00:00" }]]);
    const result = await listSuppressionsSince(sb, "2026-11-01T00:00:00.000Z");
    expect(result.suppressions).toEqual([
      { email: "info@x.nl", domain: "x.nl", createdAt: "2026-11-12T09:00:00.000Z" },
    ]);
  });
});
