/**
 * resolveBbox() — the region-bbox resolution that replaced the unusable
 * addresses[1].region string predicate (D-11 unblock, RESEARCH.md Pattern 2
 * escalation). Pure function, no DuckDB/S3 dependency.
 */
import { describe, expect, it } from "vitest";
import { resolveBbox } from "./overture-client";

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
