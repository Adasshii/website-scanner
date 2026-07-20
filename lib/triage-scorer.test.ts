/**
 * computeTriageScore() — determinism, per-signal monotonicity, gate-always-
 * tops, and exact boundary-value coverage for every weighted band (TRI-06).
 * Pure-function tests only, no network/DOM.
 */
import { describe, expect, it } from "vitest";
import type { TriageSignals } from "@/types/triage";
import { computeTriageScore } from "./triage-scorer";
import {
  VIEWPORT_MISSING_DEDUCTION,
  REDIRECT_HOPS_HIGH_THRESHOLD,
  REDIRECT_HOPS_HIGH_DEDUCTION,
  REDIRECT_HOPS_LOW_THRESHOLD,
  REDIRECT_HOPS_LOW_DEDUCTION,
  PAGE_WEIGHT_HIGH_BYTES,
  PAGE_WEIGHT_HIGH_DEDUCTION,
  PAGE_WEIGHT_LOW_BYTES,
  PAGE_WEIGHT_LOW_DEDUCTION,
  RESPONSE_TIME_HIGH_MS,
  RESPONSE_TIME_HIGH_DEDUCTION,
  RESPONSE_TIME_LOW_MS,
  RESPONSE_TIME_LOW_DEDUCTION,
} from "@/lib/triage-constants";

function chainOfLength(n: number): Array<{ url: string; status: number }> {
  return Array.from({ length: n }, (_, i) => ({ url: `https://example.test/${i}`, status: 200 }));
}

const BASE: TriageSignals = {
  reachable: true,
  https: true,
  finalStatus: 200,
  redirectChain: chainOfLength(1),
  hasViewport: true,
  bytes: 100_000,
  truncated: false,
  responseMs: 200,
  robotsBlocked: false,
  gateReason: null,
};

describe("computeTriageScore — determinism", () => {
  it("returns the same score for the same signals", () => {
    expect(computeTriageScore(BASE)).toEqual(computeTriageScore(BASE));
  });
});

describe("computeTriageScore — gate (D-01)", () => {
  it("gates when unreachable", () => {
    expect(computeTriageScore({ ...BASE, reachable: false }).gated).toBe(true);
  });

  it("gates when not https", () => {
    expect(computeTriageScore({ ...BASE, https: false }).gated).toBe(true);
  });

  it("does not gate a reachable, https prospect", () => {
    expect(computeTriageScore(BASE).gated).toBe(false);
  });

  it("ranks a gated prospect ahead of a non-gated prospect with objectively worse secondary signals", () => {
    const gated = computeTriageScore({
      ...BASE,
      reachable: false,
      https: false,
      hasViewport: true,
      bytes: 50_000,
      responseMs: 100,
      redirectChain: chainOfLength(1),
    });
    const notGatedButBad = computeTriageScore({
      ...BASE,
      reachable: true,
      https: true,
      hasViewport: false,
      bytes: 9_000_000,
      responseMs: 9000,
      redirectChain: chainOfLength(11),
    });

    expect(gated.gated).toBe(true);
    expect(notGatedButBad.gated).toBe(false);

    const sorted = [notGatedButBad, gated].sort((a, b) =>
      a.gated === b.gated ? a.score - b.score : a.gated ? -1 : 1,
    );
    expect(sorted[0]).toBe(gated);
  });
});

describe("computeTriageScore — monotonicity", () => {
  it("never scores a heavier page better than an otherwise-identical lighter one", () => {
    const light = computeTriageScore({ ...BASE, bytes: 200_000 });
    const heavy = computeTriageScore({ ...BASE, bytes: 4_000_000 });
    expect(heavy.score).toBeLessThanOrEqual(light.score);
  });

  it("never scores a slower response better than an otherwise-identical faster one", () => {
    const fast = computeTriageScore({ ...BASE, responseMs: 300 });
    const slow = computeTriageScore({ ...BASE, responseMs: 5000 });
    expect(slow.score).toBeLessThanOrEqual(fast.score);
  });

  it("never scores a longer redirect chain better than an otherwise-identical shorter one", () => {
    const short = computeTriageScore({ ...BASE, redirectChain: chainOfLength(1) });
    const long = computeTriageScore({ ...BASE, redirectChain: chainOfLength(10) });
    expect(long.score).toBeLessThanOrEqual(short.score);
  });
});

describe("computeTriageScore — viewport deduction", () => {
  it("deducts exactly VIEWPORT_MISSING_DEDUCTION when hasViewport is false", () => {
    const withViewport = computeTriageScore(BASE);
    const without = computeTriageScore({ ...BASE, hasViewport: false });
    expect(withViewport.score - without.score).toBe(VIEWPORT_MISSING_DEDUCTION);
  });
});

describe("computeTriageScore — redirect-hop boundary values", () => {
  it("applies no deduction below the low hop threshold", () => {
    const hops = REDIRECT_HOPS_LOW_THRESHOLD - 1;
    expect(computeTriageScore({ ...BASE, redirectChain: chainOfLength(hops + 1) }).score).toBe(100);
  });

  it("applies the low deduction exactly at the low hop threshold", () => {
    const hops = REDIRECT_HOPS_LOW_THRESHOLD;
    expect(computeTriageScore({ ...BASE, redirectChain: chainOfLength(hops + 1) }).score).toBe(
      100 - REDIRECT_HOPS_LOW_DEDUCTION,
    );
  });

  it("applies the high deduction exactly at the high hop threshold", () => {
    const hops = REDIRECT_HOPS_HIGH_THRESHOLD;
    expect(computeTriageScore({ ...BASE, redirectChain: chainOfLength(hops + 1) }).score).toBe(
      100 - REDIRECT_HOPS_HIGH_DEDUCTION,
    );
  });
});

describe("computeTriageScore — page-weight boundary values", () => {
  it("applies no deduction at exactly the low weight threshold", () => {
    expect(computeTriageScore({ ...BASE, bytes: PAGE_WEIGHT_LOW_BYTES }).score).toBe(100);
  });

  it("applies the low deduction just above the low weight threshold", () => {
    expect(computeTriageScore({ ...BASE, bytes: PAGE_WEIGHT_LOW_BYTES + 1 }).score).toBe(
      100 - PAGE_WEIGHT_LOW_DEDUCTION,
    );
  });

  it("applies no additional deduction at exactly the high weight threshold", () => {
    expect(computeTriageScore({ ...BASE, bytes: PAGE_WEIGHT_HIGH_BYTES }).score).toBe(
      100 - PAGE_WEIGHT_LOW_DEDUCTION,
    );
  });

  it("applies the high deduction just above the high weight threshold", () => {
    expect(computeTriageScore({ ...BASE, bytes: PAGE_WEIGHT_HIGH_BYTES + 1 }).score).toBe(
      100 - PAGE_WEIGHT_HIGH_DEDUCTION,
    );
  });

  it("treats a truncated body as at least as bad as the worst weight band regardless of bytes read so far", () => {
    const truncated = computeTriageScore({ ...BASE, bytes: 100, truncated: true });
    expect(truncated.score).toBe(100 - PAGE_WEIGHT_HIGH_DEDUCTION);
  });
});

describe("computeTriageScore — response-time boundary values", () => {
  it("applies no deduction at exactly the low response-time threshold", () => {
    expect(computeTriageScore({ ...BASE, responseMs: RESPONSE_TIME_LOW_MS }).score).toBe(100);
  });

  it("applies the low deduction just above the low response-time threshold", () => {
    expect(computeTriageScore({ ...BASE, responseMs: RESPONSE_TIME_LOW_MS + 1 }).score).toBe(
      100 - RESPONSE_TIME_LOW_DEDUCTION,
    );
  });

  it("applies the high deduction just above the high response-time threshold", () => {
    expect(computeTriageScore({ ...BASE, responseMs: RESPONSE_TIME_HIGH_MS + 1 }).score).toBe(
      100 - RESPONSE_TIME_HIGH_DEDUCTION,
    );
  });
});

describe("computeTriageScore — clamping", () => {
  it("never returns a score below 0 even with every deduction stacked", () => {
    const worst = computeTriageScore({
      ...BASE,
      hasViewport: false,
      bytes: 9_000_000,
      truncated: true,
      responseMs: 9000,
      redirectChain: chainOfLength(11),
    });
    expect(worst.score).toBeGreaterThanOrEqual(0);
  });
});
