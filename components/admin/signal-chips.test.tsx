import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SignalChips } from "@/components/admin/signal-chips";
import type { TriageScore } from "@/types/triage";

// globals: false on the "component" vitest project (vitest.config.ts) means
// RTL's automatic cleanup-after-each never registers. Do this explicitly or
// nodes from one test leak into the next.
afterEach(() => {
  cleanup();
});

function baseScore(overrides: Partial<TriageScore>): TriageScore {
  return {
    reachable: true,
    https: true,
    finalStatus: 200,
    redirectChain: [],
    hasViewport: true,
    bytes: 100_000,
    truncated: false,
    responseMs: 500,
    robotsBlocked: false,
    gateReason: null,
    score: 80,
    gated: false,
    ...overrides,
  };
}

describe("SignalChips", () => {
  it("shows the No HTTPS chip for a reachable, non-HTTPS site", () => {
    const score = baseScore({ reachable: true, https: false });
    render(<SignalChips score={score} />);
    expect(screen.getByText("No HTTPS")).toBeTruthy();
  });

  it("shows the Unreachable chip when the site is not reachable", () => {
    const score = baseScore({ reachable: false, https: false });
    const { container } = render(<SignalChips score={score} />);
    expect(screen.getByText("Unreachable")).toBeTruthy();
    // Unreachable is a short-circuit (D-01) — No HTTPS must not also render.
    expect(container.textContent).not.toContain("No HTTPS");
  });
});
