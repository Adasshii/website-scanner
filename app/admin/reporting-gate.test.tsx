/**
 * Held-out render test for the Reporting tab's D-7-13 sent-gate treatment
 * (UI-SPEC E1/`partial`, `verification: backstop`) — plus the loading and
 * error states this file is the natural home for.
 *
 * WHY THIS FILE EXISTS AND MUST NOT BE DELETED OR WEAKENED: the sent-gate
 * fails silently. If `sentGateOpen` regresses to always-true (or the
 * awaiting branch is ever accidentally removed), the Contacted/Replied/
 * Booked cards render a plausible `0` instead of the awaiting copy — a
 * number that looks like a real answer and is actually an absence, exactly
 * the failure D-7-13 exists to prevent. A code-reading review would pass
 * such a regression; only asserting the actual rendered output catches it.
 * This file is the evidence UI-SPEC row E1/`partial` routes to.
 *
 * Plan 07-03 extends this same file with the E2 per-day-table assertions —
 * structured with one top-level `describe` per element so that addition is
 * additive.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ReportingTab } from "@/components/admin/reporting-tab";
import { FUNNEL_CARD_ORDER } from "@/lib/lifecycle";
import type { ReportingPayload } from "@/lib/reporting-aggregates";

// globals: false on the "component" vitest project (vitest.config.ts) means
// RTL's automatic cleanup-after-each never registers. Do this explicitly or
// nodes from one test leak into the next.
afterEach(() => {
  cleanup();
});

// Non-zero, mutually non-substring counts for every group, so the closed-
// gate test proves the gate wins over real data rather than merely that
// zeros happen to render, and so no group's numeral is a substring of
// another's.
const FUNNEL: ReportingPayload["funnel"] = {
  New: 5,
  Qualified: 7,
  Contacted: 11,
  Replied: 13,
  Booked: 17,
  Rejected: 2,
};

function countCards(container: HTMLElement): number {
  // StatCard's root div always carries these two classes together — a
  // structural count, not a text match (UI-SPEC E1/populated).
  return container.querySelectorAll(".rounded-xl.p-4").length;
}

function cardLabelsInOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".text-sm.text-gray-500.mt-1")).map(
    (el) => el.textContent ?? ""
  );
}

describe("ReportingTab — E1 sent-gate backstop", () => {
  it("gate CLOSED: renders the awaiting treatment on Contacted/Replied/Booked, real counts elsewhere", () => {
    const payload: ReportingPayload = { funnel: FUNNEL, sentGateOpen: false, days: [] };
    const { container } = render(<ReportingTab payload={payload} loading={false} error="" />);

    expect(screen.getAllByText(/Not yet sending/).length).toBe(3);
    expect(container.textContent).not.toContain("11");
    expect(container.textContent).not.toContain("13");
    expect(container.textContent).not.toContain("17");

    // New and Qualified always render real counts, gate or no gate.
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();

    expect(container.textContent).toContain("aren't measurable yet");

    expect(countCards(container)).toBe(5);
    expect(cardLabelsInOrder(container)).toEqual([...FUNNEL_CARD_ORDER]);
  });

  it("gate OPEN: renders every group as a real integer, no awaiting copy, no explainer", () => {
    const payload: ReportingPayload = { funnel: FUNNEL, sentGateOpen: true, days: [] };
    const { container } = render(<ReportingTab payload={payload} loading={false} error="" />);

    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("11")).toBeTruthy();
    expect(screen.getByText("13")).toBeTruthy();
    expect(screen.getByText("17")).toBeTruthy();

    expect(screen.queryByText(/Not yet sending/)).toBeNull();
    expect(container.textContent).not.toContain("aren't measurable yet");

    expect(countCards(container)).toBe(5);
    expect(cardLabelsInOrder(container)).toEqual([...FUNNEL_CARD_ORDER]);
  });

  it("loading: renders the panel-level Loading... treatment and no cards", () => {
    const { container } = render(<ReportingTab payload={null} loading={true} error="" />);

    expect(screen.getByText("Loading...")).toBeTruthy();
    expect(countCards(container)).toBe(0);
  });

  it("error: renders the red error banner and no cards", () => {
    const { container } = render(
      <ReportingTab payload={null} loading={false} error="Failed to fetch reporting data: boom." />
    );

    expect(screen.getByText("Failed to fetch reporting data: boom.")).toBeTruthy();
    expect(countCards(container)).toBe(0);
  });

  it("empty: zero prospects ever imported renders the tab-level empty state, not five zeroed cards", () => {
    const zeroPayload: ReportingPayload = {
      funnel: { New: 0, Qualified: 0, Contacted: 0, Replied: 0, Booked: 0, Rejected: 0 },
      sentGateOpen: false,
      days: [],
    };
    const { container } = render(<ReportingTab payload={zeroPayload} loading={false} error="" />);

    expect(screen.getByText("No prospects imported yet")).toBeTruthy();
    expect(countCards(container)).toBe(0);
  });
});
