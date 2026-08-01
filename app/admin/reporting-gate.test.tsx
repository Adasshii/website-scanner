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

// Non-zero, mutually non-substring counts for the four always-real columns
// plus Booked, matching the fixture-design rationale above the FUNNEL
// constant: proves the gate wins over real supplied data, not merely that
// zeros happen to render.
const NON_ZERO_DAY = {
  imported: 101,
  triaged: 102,
  scanned: 103,
  contacted: 104,
  replyRate: null as number | null,
  booked: 205,
  bookedByDomain: 0,
};

function make30Days(
  overrides: Partial<Omit<ReportingPayload["days"][number], "date">> = {}
): ReportingPayload["days"] {
  const days: ReportingPayload["days"] = [];
  const base = new Date("2026-06-15T00:00:00Z");
  for (let i = 0; i < 30; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    days.push({
      date: d.toISOString().slice(0, 10),
      ...NON_ZERO_DAY,
      ...overrides,
    });
  }
  return days;
}

function tableRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll("tbody tr")) as HTMLElement[];
}

describe("ReportingTab — E2 per-day table", () => {
  it("gate CLOSED: Imported/Triaged/Scanned/Contacted render supplied integers; Reply rate and Booked show the awaiting treatment; supplied booked integers never appear", () => {
    const payload: ReportingPayload = { funnel: FUNNEL, sentGateOpen: false, days: make30Days() };
    const { container } = render(<ReportingTab payload={payload} loading={false} error="" />);

    const rows = tableRows(container);
    expect(rows.length).toBe(30);
    for (const tr of rows) {
      const cells = tr.querySelectorAll("td");
      expect(cells[1].textContent).toBe("101");
      expect(cells[2].textContent).toBe("102");
      expect(cells[3].textContent).toBe("103");
      expect(cells[4].textContent).toBe("104");
      expect(cells[5].textContent).toBe("— Not yet sending");
      expect(cells[6].textContent).toBe("— Not yet sending");
    }

    // Supplying zeros here would prove nothing — the fixture supplies a
    // real booked integer (205) so this proves the gate suppresses real
    // data, not that suppressing an absent value is a no-op.
    expect(container.textContent).not.toContain("205");
  });

  it("gate OPEN: booked integers render, Reply rate keeps the awaiting treatment, the four core columns are unchanged", () => {
    const payload: ReportingPayload = { funnel: FUNNEL, sentGateOpen: true, days: make30Days() };
    const { container } = render(<ReportingTab payload={payload} loading={false} error="" />);

    const rows = tableRows(container);
    expect(rows.length).toBe(30);
    for (const tr of rows) {
      const cells = tr.querySelectorAll("td");
      // "No other UI change" (UI-SPEC E2/partial): these four cells are
      // identical to the closed-gate render above.
      expect(cells[1].textContent).toBe("101");
      expect(cells[2].textContent).toBe("102");
      expect(cells[3].textContent).toBe("103");
      expect(cells[4].textContent).toBe("104");
      // Guard against Phase 8 shipping a send path without also shipping
      // the reply marker: REPLY_SIGNAL_AVAILABLE is false, so this cell
      // must still read the awaiting literal even with the gate open. This
      // assertion is EXPECTED to change the moment REPLY_SIGNAL_AVAILABLE
      // flips to true and a real per-day replied count exists.
      expect(cells[5].textContent).toBe("— Not yet sending");
      expect(cells[6].textContent).toBe("205");
    }

    // "Not yet sending" no longer appears in the Booked column specifically
    // (it still legitimately appears in Reply rate, asserted per-row above).
    const bookedCells = rows.map((tr) => tr.querySelectorAll("td")[6]?.textContent);
    expect(bookedCells.every((text) => text !== "— Not yet sending")).toBe(true);
  });

  it("always renders exactly 30 tbody rows, including in the zero-30-day-activity empty state", () => {
    const populatedPayload: ReportingPayload = {
      funnel: FUNNEL,
      sentGateOpen: false,
      days: make30Days(),
    };
    const { container: populatedContainer } = render(
      <ReportingTab payload={populatedPayload} loading={false} error="" />
    );
    expect(tableRows(populatedContainer).length).toBe(30);
    cleanup();

    const zeroActivityPayload: ReportingPayload = {
      funnel: FUNNEL,
      sentGateOpen: false,
      days: make30Days({ imported: 0, triaged: 0, scanned: 0, contacted: 0 }),
    };
    const { container } = render(
      <ReportingTab payload={zeroActivityPayload} loading={false} error="" />
    );
    expect(tableRows(container).length).toBe(30);
  });

  it("empty state (prospects exist, zero 30-day activity): renders the zero-activity copy above the 30 zero rows", () => {
    const payload: ReportingPayload = {
      funnel: FUNNEL,
      sentGateOpen: false,
      days: make30Days({ imported: 0, triaged: 0, scanned: 0, contacted: 0 }),
    };
    const { container } = render(<ReportingTab payload={payload} loading={false} error="" />);

    expect(screen.getByText("No activity in the last 30 days")).toBeTruthy();
    expect(
      screen.getByText(
        "Every date below reads zero. Check the Shortlist tab to see where existing prospects currently stand."
      )
    ).toBeTruthy();
    expect(tableRows(container).length).toBe(30);
  });

  it("empty state (zero prospects ever imported): no table renders at all", () => {
    const zeroPayload: ReportingPayload = {
      funnel: { New: 0, Qualified: 0, Contacted: 0, Replied: 0, Booked: 0, Rejected: 0 },
      sentGateOpen: false,
      days: [],
    };
    const { container } = render(<ReportingTab payload={zeroPayload} loading={false} error="" />);

    expect(screen.getByText("No prospects imported yet")).toBeTruthy();
    expect(container.querySelector("table")).toBeNull();
  });
});
