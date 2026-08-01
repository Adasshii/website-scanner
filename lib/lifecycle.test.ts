import { describe, expect, it } from "vitest";
import {
  deriveLifecycleState,
  FUNNEL_CARD_ORDER,
  FUNNEL_GROUPS,
  type FineLifecycleState,
  type LifecycleInputs,
} from "./lifecycle";

const ALL_FINE_STATES: FineLifecycleState[] = [
  "new",
  "no_website",
  "triaged",
  "qualified",
  "scan_queued",
  "scanned",
  "drafted",
  "approved",
  "contacted",
  "replied",
  "booked",
  "rejected",
];

function row(overrides: Partial<LifecycleInputs> = {}): LifecycleInputs {
  return {
    lifecycle_state: "new",
    triage_checked_at: null,
    scan_released_at: null,
    scan_status: null,
    booked_at: null,
    outreachStatus: null,
    ...overrides,
  };
}

describe("deriveLifecycleState", () => {
  it("rejected short-circuits over every other marker (D-7-R2, D-7-04)", () => {
    expect(
      deriveLifecycleState(
        row({
          lifecycle_state: "rejected",
          booked_at: "2026-01-01T00:00:00Z",
          outreachStatus: "sent",
          scan_status: "done",
        })
      )
    ).toBe("rejected");
  });

  it("no_website short-circuits over triage_checked_at", () => {
    expect(
      deriveLifecycleState(
        row({ lifecycle_state: "no_website", triage_checked_at: "2026-01-01T00:00:00Z" })
      )
    ).toBe("no_website");
  });

  it("returns new as the floor when every marker is null", () => {
    expect(deriveLifecycleState(row())).toBe("new");
  });

  it("returns booked when booked_at, sent outreach, and a done scan all coexist", () => {
    expect(
      deriveLifecycleState(
        row({ booked_at: "2026-01-01T00:00:00Z", outreachStatus: "sent", scan_status: "done" })
      )
    ).toBe("booked");
  });

  it("distinguishes scan_queued from scanned", () => {
    expect(deriveLifecycleState(row({ scan_status: "queued" }))).toBe("scan_queued");
    expect(deriveLifecycleState(row({ scan_status: "done" }))).toBe("scanned");
  });

  it("distinguishes drafted from approved", () => {
    expect(deriveLifecycleState(row({ outreachStatus: "draft" }))).toBe("drafted");
    expect(deriveLifecycleState(row({ outreachStatus: "approved" }))).toBe("approved");
  });

  it("treats an edited draft the same as a fresh draft", () => {
    expect(deriveLifecycleState(row({ outreachStatus: "edited" }))).toBe("drafted");
  });

  it("returns qualified from scan_released_at alone (null scan_status)", () => {
    expect(deriveLifecycleState(row({ scan_released_at: "2026-01-01T00:00:00Z" }))).toBe(
      "qualified"
    );
  });

  it("returns triaged from triage_checked_at alone (null scan_released_at)", () => {
    expect(deriveLifecycleState(row({ triage_checked_at: "2026-01-01T00:00:00Z" }))).toBe(
      "triaged"
    );
  });

  it("falls a failed scan through to qualified — no 13th state", () => {
    expect(
      deriveLifecycleState(
        row({ scan_status: "failed", scan_released_at: "2026-01-01T00:00:00Z" })
      )
    ).toBe("qualified");
  });

  it("has exactly one FUNNEL_GROUPS entry per fine state, none undefined", () => {
    expect(Object.keys(FUNNEL_GROUPS)).toHaveLength(12);
    for (const state of ALL_FINE_STATES) {
      expect(FUNNEL_GROUPS[state]).toBeDefined();
    }
  });

  it("FUNNEL_CARD_ORDER holds exactly the five TRK-01 groups in order", () => {
    expect(FUNNEL_CARD_ORDER).toHaveLength(5);
    expect(FUNNEL_CARD_ORDER).toEqual(["New", "Qualified", "Contacted", "Replied", "Booked"]);
  });

  it("never returns replied for any input combination reachable in Phase 7", () => {
    const lifecycleStates = [
      "new",
      "no_website",
      "triaged",
      "qualified",
      "scan_queued",
      "scanned",
      "drafted",
      "approved",
      "contacted",
      "replied",
      "booked",
      "rejected",
      "suppressed",
    ];
    const dateOrNull: (string | null)[] = [null, "2026-01-01T00:00:00Z"];
    const scanStatuses: LifecycleInputs["scan_status"][] = [
      "queued",
      "scanning",
      "done",
      "failed",
      null,
    ];
    const outreachStatuses: LifecycleInputs["outreachStatus"][] = [
      "draft",
      "edited",
      "approved",
      "rejected",
      "sent",
      null,
    ];

    for (const lifecycle_state of lifecycleStates) {
      for (const triage_checked_at of dateOrNull) {
        for (const scan_released_at of dateOrNull) {
          for (const booked_at of dateOrNull) {
            for (const scan_status of scanStatuses) {
              for (const outreachStatus of outreachStatuses) {
                const result = deriveLifecycleState({
                  lifecycle_state,
                  triage_checked_at,
                  scan_released_at,
                  booked_at,
                  scan_status,
                  outreachStatus,
                });
                expect(result).not.toBe("replied");
              }
            }
          }
        }
      }
    }
  });
});
