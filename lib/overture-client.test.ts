/**
 * resolveBbox() — the region-bbox resolution that replaced the unusable
 * addresses[1].region string predicate (D-11 unblock, RESEARCH.md Pattern 2
 * escalation). Pure function, no DuckDB/S3 dependency.
 *
 * pickProvinceDivisionId() / buildPlacesSql() — the exact province-boundary
 * fix (D-11 audit follow-up: bbox pre-filter alone bled in neighboring-
 * province border towns). Both are pure/synchronous and statically
 * testable without a live DuckDB/S3 connection; the S3 fetch itself stays
 * untested per RESEARCH.md §Validation Architecture.
 */
import { describe, expect, it } from "vitest";
import {
  buildPlacesSql,
  mapOvertureRow,
  pickProvinceDivisionId,
  resolveBbox,
} from "./overture-client";

describe("resolveBbox", () => {
  it("resolves a known region case/diacritic-insensitively", () => {
    expect(resolveBbox("NL", "Noord-Holland")).toEqual([4.49, 52.16, 5.33, 53.22]);
    expect(resolveBbox("nl", "noord holland")).toEqual([4.49, 52.16, 5.33, 53.22]);
  });

  it("falls back to the whole-country bbox when no region is given", () => {
    expect(resolveBbox("NL")).toEqual([3.31, 50.75, 7.23, 53.7]);
  });

  it("throws a clear error listing known regions for an unknown region", () => {
    expect(() => resolveBbox("NL", "Atlantis")).toThrow(/Unknown region "Atlantis"/);
    expect(() => resolveBbox("NL", "Atlantis")).toThrow(/noord-holland/);
  });

  it("throws a clear error for an unknown country with no region", () => {
    expect(() => resolveBbox("ZZ")).toThrow(/No bbox configured for country "ZZ"/);
  });
});

describe("pickProvinceDivisionId", () => {
  it("returns the id when exactly one row matches case/diacritic-insensitively", () => {
    const id = pickProvinceDivisionId(
      [
        { id: "gers-noord-holland", name: "Noord-Holland" },
        { id: "gers-zuid-holland", name: "Zuid-Holland" },
      ],
      "noord holland"
    );
    expect(id).toBe("gers-noord-holland");
  });

  it("throws a clear error when zero rows match", () => {
    expect(() =>
      pickProvinceDivisionId([{ id: "gers-zuid-holland", name: "Zuid-Holland" }], "Noord-Holland")
    ).toThrow(/No division_area region found for "Noord-Holland"/);
  });

  it("throws a clear error when multiple rows match (never silently picks one)", () => {
    expect(() =>
      pickProvinceDivisionId(
        [
          { id: "gers-a", name: "Noord-Holland" },
          { id: "gers-b", name: "Noord-Holland" },
        ],
        "Noord-Holland"
      )
    ).toThrow(/Ambiguous division_area match for "Noord-Holland": 2 rows/);
  });
});

describe("buildPlacesSql", () => {
  const params = { country: "NL", region: "Noord-Holland", category: "restaurant" };

  it("always includes the bbox pre-filter and category/country predicates", () => {
    const sql = buildPlacesSql(
      "s3://bucket/places/*",
      "categories.primary",
      params,
      null,
      null
    );
    expect(sql).toContain("place.addresses[1].country = 'NL'");
    expect(sql).toContain("place.categories.primary = 'restaurant'");
    expect(sql).toContain("place.bbox.xmin > 4.49");
    expect(sql).toContain("place.bbox.xmax < 5.33");
  });

  it("omits ST_Within when no divisionId is given (e.g. country-only run)", () => {
    const sql = buildPlacesSql(
      "s3://bucket/places/*",
      "categories.primary",
      { country: "NL", category: "restaurant" },
      null,
      null
    );
    expect(sql).not.toContain("ST_Within");
    expect(sql).not.toContain("province");
  });

  it("adds exact ST_Within polygon containment alongside the bbox when a divisionId is given", () => {
    const sql = buildPlacesSql(
      "s3://bucket/places/*",
      "categories.primary",
      params,
      "s3://bucket/divisions/*",
      "gers-noord-holland-id"
    );
    expect(sql).toContain("ST_Within(place.geometry, province.geometry)");
    expect(sql).toContain("gers-noord-holland-id");
    // bbox pruning still present alongside the exact containment
    expect(sql).toContain("place.bbox.xmin > 4.49");
  });

  it("respects --limit in the LIMIT clause", () => {
    const sql = buildPlacesSql(
      "s3://bucket/places/*",
      "categories.primary",
      { ...params, limit: 50 },
      "s3://bucket/divisions/*",
      "gers-noord-holland-id"
    );
    expect(sql).toContain("LIMIT 50");
  });

  it("omits the LIMIT clause when no limit is given", () => {
    const sql = buildPlacesSql(
      "s3://bucket/places/*",
      "categories.primary",
      params,
      null,
      null
    );
    expect(sql).not.toContain("LIMIT");
  });

  it("D-9-16/D-9-22: projects longitude as ST_X, latitude as ST_Y and operating_status", () => {
    const sql = buildPlacesSql("s3://bucket/places/*", "categories.primary", params, null, null);
    // X is longitude, Y is latitude. Swapped, every Dutch prospect lands in the Indian Ocean.
    expect(sql).toContain("ST_X(place.geometry) AS lon");
    expect(sql).toContain("ST_Y(place.geometry) AS lat");
    expect(sql).toContain("place.operating_status AS operating_status");
  });
});

describe("mapOvertureRow", () => {
  const baseRow = {
    gers_id: "08f2-fixture",
    name: "Dakdekker Test BV",
    websites: ["https://dakdekker.test"],
    addresses: [{ freeform: "Damrak 1", region: "NH", country: "NL" }],
    category: "roofing",
    confidence: 0.91,
  };

  it("carries lon, lat and operating_status onto the OverturePlaceRow", () => {
    const row = mapOvertureRow(
      { ...baseRow, lon: 4.4984826, lat: 52.1602462, operating_status: "open" },
      "NL"
    );
    expect(row.lon).toBe(4.4984826);
    expect(row.lat).toBe(52.1602462);
    expect(row.operatingStatus).toBe("open");
  });

  it("maps missing coordinate and status columns to null, not undefined", () => {
    const row = mapOvertureRow(baseRow, "NL");
    expect(row.lon).toBeNull();
    expect(row.lat).toBeNull();
    expect(row.operatingStatus).toBeNull();
  });

  it("keeps the existing mapping: websites[0] to websiteUrl, addresses[0] to address and region", () => {
    const row = mapOvertureRow(baseRow, "NL");
    expect(row.websiteUrl).toBe("https://dakdekker.test");
    expect(row.address).toBe("Damrak 1");
    expect(row.region).toBe("NH");
    expect(row.country).toBe("NL");
  });
});
