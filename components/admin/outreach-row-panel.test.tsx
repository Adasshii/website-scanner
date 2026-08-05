// Protects the CMP-12 audit block: presence/absence gated on row.status,
// all eleven labels rendered from a real fetch response, booleans rendered
// as Yes/No, and the record-missing warning for a sent row with zero
// entries. Stubs global.fetch per test — no dev server, no database.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { OutreachRowPanel } from "@/components/admin/outreach-row-panel";
import type { OutreachQueueRow } from "@/lib/outreach-queue";
import type { SendAuditEntry } from "@/lib/send-audit";

// globals: false on the "component" vitest project (vitest.config.ts) means
// RTL's automatic cleanup-after-each never registers. Do this explicitly or
// nodes from one test leak into the next.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const noop = () => {};

function makeRow(overrides?: Partial<OutreachQueueRow>): OutreachQueueRow {
  return {
    id: "message-1",
    prospectId: "prospect-1",
    scanId: "scan-1",
    status: "approved",
    draftSubject: "A quick observation about your site",
    draftBody: "Body text.",
    approvedBy: "admin-secret",
    approvedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    preparedAt: null,
    domain: "example.test",
    country: "NL",
    contactEmail: "contact@example.test",
    locale: "en",
    overallScore: 60,
    verdict: "needs work",
    criticalIssues: 1,
    majorIssues: 1,
    topIssueTitles: [],
    citedMetric: null,
    reportUrl: "https://scan.adashi.io/report/scan-1",
    ...overrides,
  };
}

function makeEntry(overrides?: Partial<SendAuditEntry>): SendAuditEntry {
  return {
    sendRecordId: "record-1",
    outreachMessageId: "message-1",
    prospectId: "prospect-1",
    sentAt: "2026-01-02T10:00:00.000Z",
    resolvedEmail: "contact@example.test",
    resolvedEmailType: "generic",
    subjectSent: "A quick observation about your site",
    bodySent: "Body text with opt-out link.",
    legalBasis: "legitimate interest",
    liaVersion: 1,
    twExemptionClaimed: true,
    firstContactNoticeIncluded: true,
    isFirstContact: true,
    approvedBy: "admin-secret",
    suppressionCheckedAt: "2026-01-02T09:59:00.000Z",
    suppressionHit: false,
    ...overrides,
  };
}

function stubFetchJson(body: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  }) as unknown as typeof fetch;
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
});

describe("OutreachRowPanel audit block (CMP-12)", () => {
  it("is absent for a row whose status is approved, and never calls fetch", async () => {
    global.fetch = fetchSpy as unknown as typeof fetch;
    render(<OutreachRowPanel row={makeRow({ status: "approved" })} secret="s" onRefetch={noop} />);

    expect(screen.queryByText("Why were we allowed to email this business?")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders all eleven labels for a sent row when the fetch resolves with one entry", async () => {
    stubFetchJson({ entries: [makeEntry()] });
    render(<OutreachRowPanel row={makeRow({ status: "sent" })} secret="s" onRefetch={noop} />);

    await screen.findByText("Why were we allowed to email this business?");

    for (const label of [
      "Sent at",
      "Resolved address",
      "Address classification",
      "First contact",
      "Legal basis",
      "LIA version",
      "Tw exemption claimed",
      "Article 14 notice included",
      "Approved by",
      "Suppression checked at",
      "Suppression result",
    ]) {
      await waitFor(() => expect(screen.getByText(label)).toBeTruthy());
    }
  });

  it("renders booleans as Yes and No, not raw literals", async () => {
    stubFetchJson({
      entries: [makeEntry({ isFirstContact: true, twExemptionClaimed: false, firstContactNoticeIncluded: true, suppressionHit: false })],
    });
    render(<OutreachRowPanel row={makeRow({ status: "sent" })} secret="s" onRefetch={noop} />);

    await screen.findByText("Why were we allowed to email this business?");

    const yesCells = await screen.findAllByText("Yes");
    const noCells = await screen.findAllByText("No");
    // First contact (true) + Article 14 notice included (true) = 2 "Yes"
    expect(yesCells.length).toBe(2);
    // Tw exemption claimed (false) + Suppression result (false) = 2 "No"
    expect(noCells.length).toBe(2);
    expect(screen.queryByText("true")).toBeNull();
    expect(screen.queryByText("false")).toBeNull();
  });

  it("renders the record-missing warning when the fetch resolves with an empty entries array for a sent row", async () => {
    stubFetchJson({ entries: [] });
    render(<OutreachRowPanel row={makeRow({ status: "sent" })} secret="s" onRefetch={noop} />);

    await screen.findByText("Why were we allowed to email this business?");
    const warning = await screen.findByRole("alert");
    expect(warning.textContent).toContain("No send record exists");
  });
});
