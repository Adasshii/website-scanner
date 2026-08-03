// Unit test for fetchAllPages' termination rule. The integration suite covers
// pagination against the real local Postgres, but it cannot reach the case
// this file exists for: a PostgREST whose own `max-rows` is SMALLER than the
// page size we request. Simulating the server is the only way to exercise it.
import { describe, expect, it } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { fetchAllPages } from "./reporting-aggregates";

/**
 * Stands in for PostgREST. Serves `total` rows, but never returns more than
 * `serverMaxRows` per request no matter how wide the requested range is —
 * which is exactly what a `max-rows` setting below our page size does.
 */
function fakeServer(total: number, serverMaxRows: number) {
  const requestedSpans: number[] = [];
  const queryPage = async (from: number, to: number) => {
    requestedSpans.push(to - from + 1);
    const end = Math.min(from + serverMaxRows, total);
    const data = from >= total ? [] : Array.from({ length: end - from }, (_, i) => ({ id: from + i }));
    return { data, error: null };
  };
  return { queryPage, requestedSpans };
}

describe("fetchAllPages", () => {
  it("returns every row when the server caps pages below the requested size", async () => {
    // 2400 rows behind a server that hands back at most 500 at a time, while
    // we ask for 1000. Breaking on a short page would stop after the first
    // 500 and silently lose the other 1900.
    const { queryPage } = fakeServer(2400, 500);

    const rows = await fetchAllPages(queryPage);

    expect(rows).toHaveLength(2400);
    expect(rows[0]).toEqual({ id: 0 });
    expect(rows[2399]).toEqual({ id: 2399 });
    // No duplicates or gaps: advancing by rows-returned must tile exactly.
    expect(new Set(rows.map((r) => r.id)).size).toBe(2400);
  });

  it("returns every row when the server page size matches the requested size", async () => {
    // The ordinary case, and the one where an exact multiple of the page size
    // is the off-by-one trap: 2000 rows must not stop at 2000 believing there
    // is more, nor request past the end forever.
    const { queryPage } = fakeServer(2000, 1000);

    const rows = await fetchAllPages(queryPage);

    expect(rows).toHaveLength(2000);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2000);
  });

  it("returns an empty array when there are no rows", async () => {
    const { queryPage } = fakeServer(0, 1000);
    await expect(fetchAllPages(queryPage)).resolves.toEqual([]);
  });

  it("throws the page error instead of returning a partial result", async () => {
    // A mid-pagination failure must not look like a short read — that would
    // be the silent-truncation bug wearing a different hat.
    let calls = 0;
    const queryPage = async (
      from: number,
      to: number
    ): Promise<{ data: { id: number }[] | null; error: PostgrestError | null }> => {
      calls += 1;
      if (calls === 2) {
        return {
          data: null,
          error: { name: "PostgrestError", message: "boom", details: "", hint: "", code: "500" },
        };
      }
      return { data: Array.from({ length: to - from + 1 }, (_, i) => ({ id: from + i })), error: null };
    };

    await expect(fetchAllPages(queryPage)).rejects.toMatchObject({ message: "boom" });
  });
});
