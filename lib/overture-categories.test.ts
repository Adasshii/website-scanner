// Pure-module tests for the category vocabulary cache (Task 1, 260806-p6f).
// No I/O — cacheKey/mergeCategoryCache are dependency-free besides
// slugifyRegion, so these run in the default "unit" (node) project.
import { describe, expect, it } from "vitest";
import {
  CATEGORY_CACHE_LIMIT,
  cacheKey,
  mergeCategoryCache,
  type CategoryCount,
} from "./overture-categories";

function row(category: string, count: number, withSite = count): CategoryCount {
  return { category, count, withSite };
}

describe("cacheKey", () => {
  it("uppercases the country and slugifies the region so the key matches REGION_BBOXES's format", () => {
    expect(cacheKey("nl", "Noord-Holland")).toBe("NL:noord-holland");
  });
});

describe("mergeCategoryCache", () => {
  it("returns a NEW object with the key's rows sorted by count descending, other keys untouched", () => {
    const existing = { "NL:zuid-holland": [row("cafe", 1)] };
    const rows = [row("dentist", 5), row("hair_salon", 20), row("bakery", 10)];

    const result = mergeCategoryCache(existing, "NL:noord-holland", rows);

    expect(result).not.toBe(existing);
    expect(result["NL:zuid-holland"]).toEqual(existing["NL:zuid-holland"]);
    expect(result["NL:noord-holland"].map((r) => r.category)).toEqual([
      "hair_salon",
      "bakery",
      "dentist",
    ]);
  });

  it("returns the result's keys in sorted order", () => {
    const existing = { "NL:zuid-holland": [row("cafe", 1)] };
    const result = mergeCategoryCache(existing, "NL:noord-holland", [row("dentist", 5)]);
    expect(Object.keys(result)).toEqual(["NL:noord-holland", "NL:zuid-holland"]);
  });

  it("truncates to CATEGORY_CACHE_LIMIT, keeping the highest-count rows and dropping the lowest", () => {
    const rows: CategoryCount[] = [];
    for (let i = 0; i < 400; i++) {
      rows.push(row(`category-${i}`, i));
    }

    const result = mergeCategoryCache({}, "NL:noord-holland", rows);
    const list = result["NL:noord-holland"];

    expect(list.length).toBe(CATEGORY_CACHE_LIMIT);
    expect(list[0].category).toBe("category-399");
    expect(list.some((r) => r.category === "category-0")).toBe(false);
  });

  it("replaces an existing key's rows outright rather than appending to them (re-run must not double the list)", () => {
    const first = mergeCategoryCache({}, "NL:noord-holland", [row("dentist", 5), row("cafe", 1)]);
    const second = mergeCategoryCache(first, "NL:noord-holland", [row("bakery", 9)]);

    expect(second["NL:noord-holland"]).toEqual([row("bakery", 9)]);
  });
});
