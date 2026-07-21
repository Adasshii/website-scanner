/**
 * isAtCapacity() — reserved-headroom capacity gate for the shared Railway
 * Playwright instance (D-08, SCAN-02, T-04-03). Lives in the root Vitest
 * tree, not beside scanner-service/src/capacity.ts: root Vitest picks up
 * this file, scanner-service's own `tsc` build does not (its tsconfig only
 * includes src/**\/*), so the service ships no test-only dependency.
 */
import { describe, expect, it } from "vitest";
import {
  isAtCapacity,
  MAX_TOTAL_FULL_SCANS,
  RESERVED_FOR_PUBLIC,
} from "../scanner-service/src/capacity";

describe("isAtCapacity", () => {
  it("is false with no active scans", () => {
    expect(isAtCapacity(0, "bulk")).toBe(false);
  });

  it("refuses bulk while the reserved public slot is still free (D-08)", () => {
    expect(isAtCapacity(MAX_TOTAL_FULL_SCANS - RESERVED_FOR_PUBLIC, "bulk")).toBe(true);
  });

  it("lets a public scan use the headroom bulk was just refused", () => {
    expect(isAtCapacity(MAX_TOTAL_FULL_SCANS - RESERVED_FOR_PUBLIC, undefined)).toBe(false);
  });

  it("still bounds the public scanner by the total", () => {
    expect(isAtCapacity(MAX_TOTAL_FULL_SCANS, undefined)).toBe(true);
  });

  it("reserves at least one slot, strictly below total capacity", () => {
    expect(RESERVED_FOR_PUBLIC).toBeGreaterThanOrEqual(1);
    expect(RESERVED_FOR_PUBLIC).toBeLessThan(MAX_TOTAL_FULL_SCANS);
  });
});
