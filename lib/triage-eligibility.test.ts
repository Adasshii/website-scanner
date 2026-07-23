// Unit tests for the single releasability predicate (D-4.1-01/03/04). No
// Supabase — pure functions only. Integration coverage for selectWorstN
// wiring lives in lib/triage-release.integration.test.ts.
import { describe, expect, it } from "vitest";
import type { TriageScore } from "@/types/triage";
import { isExcludedCategory, isReleasable } from "./triage-eligibility";

function makeTriageScore(overrides?: Partial<TriageScore>): TriageScore {
  return {
    score: 50,
    gated: false,
    reachable: true,
    https: true,
    finalStatus: 200,
    redirectChain: [],
    hasViewport: true,
    bytes: 100_000,
    truncated: false,
    responseMs: 200,
    robotsBlocked: false,
    gateReason: null,
    ...overrides,
  };
}

describe("isExcludedCategory", () => {
  it("returns false for null", () => {
    expect(isExcludedCategory(null)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isExcludedCategory("")).toBe(false);
  });

  it("returns true for an excluded category, exact case", () => {
    expect(isExcludedCategory("restaurant")).toBe(true);
  });

  it("normalizes casing", () => {
    expect(isExcludedCategory("Restaurant")).toBe(true);
  });

  it("normalizes surrounding whitespace", () => {
    expect(isExcludedCategory(" cafe ")).toBe(true);
  });

  it("returns false for a non-excluded category", () => {
    expect(isExcludedCategory("software_agency")).toBe(false);
  });
});

describe("isReleasable", () => {
  const cutoff = 60;

  it("unreachable → false, regardless of score/https", () => {
    const row = {
      triage_score: makeTriageScore({ reachable: false, gated: true, score: 10 }),
      category: "software_agency",
    };
    expect(isReleasable(row, cutoff)).toBe(false);
  });

  it("excluded category → false, even below cutoff", () => {
    const row = {
      triage_score: makeTriageScore({ reachable: true, score: 10 }),
      category: "restaurant",
    };
    expect(isReleasable(row, cutoff)).toBe(false);
  });

  it("reachable, no-https, non-excluded → true even above cutoff (D-4.1-04)", () => {
    const row = {
      triage_score: makeTriageScore({
        reachable: true,
        https: false,
        gated: true,
        score: 95,
      }),
      category: "software_agency",
    };
    expect(isReleasable(row, cutoff)).toBe(true);
  });

  it("reachable, https, non-excluded, score <= cutoff → true", () => {
    const row = {
      triage_score: makeTriageScore({ reachable: true, https: true, gated: false, score: 30 }),
      category: "software_agency",
    };
    expect(isReleasable(row, cutoff)).toBe(true);
  });

  it("reachable, https, non-excluded, score > cutoff → false", () => {
    const row = {
      triage_score: makeTriageScore({ reachable: true, https: true, gated: false, score: 90 }),
      category: "software_agency",
    };
    expect(isReleasable(row, cutoff)).toBe(false);
  });

  it("null category is not excluded — eligible below cutoff", () => {
    const row = {
      triage_score: makeTriageScore({ reachable: true, https: true, gated: false, score: 30 }),
      category: null,
    };
    expect(isReleasable(row, cutoff)).toBe(true);
  });
});
