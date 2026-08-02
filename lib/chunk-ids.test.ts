import { describe, expect, it } from "vitest";
import { chunkIds } from "./chunk-ids";

describe("chunkIds", () => {
  it("returns an empty array of chunks for an empty input, not one empty chunk", () => {
    expect(chunkIds([], 3)).toEqual([]);
  });

  it("returns exactly one chunk holding every id, in order, when the count is below the chunk size", () => {
    expect(chunkIds(["a", "b"], 3)).toEqual([["a", "b"]]);
  });

  it("returns exactly one chunk when the count equals the chunk size", () => {
    expect(chunkIds(["a", "b", "c"], 3)).toEqual([["a", "b", "c"]]);
  });

  it("returns two chunks when the count is one above the chunk size, the second holding exactly one id", () => {
    expect(chunkIds(["a", "b", "c", "d"], 3)).toEqual([
      ["a", "b", "c"],
      ["d"],
    ]);
  });

  it("concatenating the returned chunks reproduces the input array exactly, order preserved", () => {
    const input = Array.from({ length: 337 }, (_, i) => `id-${i}`);
    const chunks = chunkIds(input, 150);
    expect(chunks.flat()).toEqual(input);
  });
});
