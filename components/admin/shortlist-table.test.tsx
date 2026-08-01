// Protects the Stage pill vocabulary and the Stage column position (D-7-14) —
// both of which a refactor can move without breaking a type check.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ShortlistTable } from "@/components/admin/shortlist-table";
import type { ShortlistRow } from "@/lib/triage-candidates";
import type { FineLifecycleState } from "@/lib/lifecycle";
import type { TriageScore } from "@/types/triage";

// globals: false on the "component" vitest project (vitest.config.ts) means
// RTL's automatic cleanup-after-each never registers. Do this explicitly or
// nodes from one test leak into the next.
afterEach(() => {
  cleanup();
});

function baseScore(overrides?: Partial<TriageScore>): TriageScore {
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

let rowCounter = 0;
function makeRow(overrides?: Partial<ShortlistRow>): ShortlistRow {
  rowCounter += 1;
  return {
    id: `row-${rowCounter}`,
    domain: `example-${rowCounter}.test`,
    category: null,
    triage_score: baseScore(),
    scan_released_at: null,
    scan_status: null,
    scan_attempts: 0,
    scan_status_reason: null,
    latest_scan_id: null,
    contact_email_type: null,
    has_contact_email: false,
    has_outreach_draft: false,
    stage: "new",
    ...overrides,
  };
}

const noop = () => {};

describe("ShortlistTable Stage column", () => {
  it.each([
    ["new", "New", "bg-gray-100"],
    ["qualified", "Qualified", "bg-blue-100"],
    ["contacted", "Contacted", "bg-yellow-100"],
    ["replied", "Replied", "bg-green-100"],
    ["booked", "Booked", "bg-emerald-50"],
    ["rejected", "Rejected", "bg-red-100"],
  ] as [FineLifecycleState, string, string][])(
    "renders the %s funnel group's style for stage %s",
    (stage, _group, expectedClassFragment) => {
      const rows = [makeRow({ stage })];
      const { container } = render(
        <ShortlistTable rows={rows} cutoff={100} loading={false} secret="s" onRequeued={noop} />
      );
      const pill = container.querySelector(`.${expectedClassFragment}`);
      expect(pill).toBeTruthy();
    }
  );

  it("renders the label SCAN QUEUED for stage scan_queued", () => {
    const rows = [makeRow({ stage: "scan_queued" })];
    render(<ShortlistTable rows={rows} cutoff={100} loading={false} secret="s" onRequeued={noop} />);
    expect(screen.getByText("SCAN QUEUED")).toBeTruthy();
  });

  it("renders REJECTED with the red style for a rejected row even when scan_status is done", () => {
    const rows = [makeRow({ stage: "rejected", scan_status: "done" })];
    const { container } = render(
      <ShortlistTable rows={rows} cutoff={100} loading={false} secret="s" onRequeued={noop} />
    );
    expect(screen.getByText("REJECTED")).toBeTruthy();
    expect(container.querySelector(".bg-red-100")).toBeTruthy();
  });

  it("renders the header cells in order Domain, Triage score, Status, Stage, Released, Signals", () => {
    const rows = [makeRow()];
    const { container } = render(
      <ShortlistTable rows={rows} cutoff={100} loading={false} secret="s" onRequeued={noop} />
    );
    const headers = Array.from(container.querySelectorAll("thead th")).map((th) => th.textContent);
    expect(headers).toEqual(["", "Domain", "Triage score", "Status", "Stage", "Released", "Signals"]);
  });

  it("renders exactly three stage pills for a three-row table, one per row", () => {
    const rows = [makeRow({ stage: "new" }), makeRow({ stage: "qualified" }), makeRow({ stage: "booked" })];
    const { container } = render(
      <ShortlistTable rows={rows} cutoff={100} loading={false} secret="s" onRequeued={noop} />
    );
    const cells = container.querySelectorAll("tbody tr");
    expect(cells.length).toBe(3);
    const pills = [
      container.querySelectorAll("tbody tr")[0].querySelector(".bg-gray-100"),
      container.querySelectorAll("tbody tr")[1].querySelector(".bg-blue-100"),
      container.querySelectorAll("tbody tr")[2].querySelector(".bg-emerald-50"),
    ];
    expect(pills.every(Boolean)).toBe(true);
  });
});
