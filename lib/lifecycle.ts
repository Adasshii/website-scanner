// Single source of truth for a prospect's lifecycle stage (D-7-01/02/03/04).
// A pure predicate, no I/O: it reads the markers that already carry the
// truth (the stored `lifecycle_state` column for its two terminal values
// only, plus triage/scan/outreach/booking markers) and derives the furthest
// stage reached. This MUST be the only place this ladder is implemented —
// the callers that MUST route through it are `lib/reporting-aggregates.ts`
// (this phase) and `lib/triage-candidates.ts`'s `getShortlist()` (plan
// 07-04, the Shortlist `Stage` column). A divergent copy of this ladder
// anywhere else re-introduces the exact drift D-7-01 exists to make
// impossible.

export type FineLifecycleState =
  | "new"
  | "no_website"
  | "triaged"
  | "qualified"
  | "scan_queued"
  | "scanned"
  | "drafted"
  | "approved"
  | "contacted"
  | "replied"
  | "booked"
  | "rejected";

export interface LifecycleInputs {
  lifecycle_state: string;
  triage_checked_at: string | null;
  scan_released_at: string | null;
  scan_status: "queued" | "scanning" | "done" | "failed" | null;
  booked_at: string | null;
  outreachStatus: "draft" | "edited" | "approved" | "rejected" | "sent" | null;
}

// `contact_email` is deliberately NOT an input, even though D-7-01 lists it
// among the markers: no rung of the confirmed ladder reads it, because
// having a contact address is not a funnel stage. It gates draft
// generation, and reaching a draft is already captured by `outreachStatus`.
// This is a recorded omission, not an oversight.

/**
 * The CONFIRMED ladder (D-7-04), checked top-down, first match wins. This
 * is the shipped pipeline order read backwards: booking is further than
 * sending, sending is further than approving, approving is further than
 * drafting, a done scan is further than a queued one, a released prospect
 * is further than a merely-triaged one, and `new` is the floor.
 */
export function deriveLifecycleState(row: LifecycleInputs): FineLifecycleState {
  // Stored terminals win over every marker (D-7-R2) — checked first and
  // only for these two values, which is what makes "Phase 7 never
  // overwrites rejected" structural rather than a rule someone has to obey.
  if (row.lifecycle_state === "rejected") return "rejected";
  if (row.lifecycle_state === "no_website") return "no_website";

  if (row.booked_at) return "booked";
  if (row.outreachStatus === "sent") return "contacted";
  if (row.outreachStatus === "approved") return "approved";
  // A rejected draft (outreachStatus === "rejected") intentionally matches
  // no rung here and falls through to the scan rungs below — a rejected
  // draft does not un-scan the prospect, and D-7-04 reserves the
  // FineLifecycleState value `rejected` for the stored terminal only.
  if (row.outreachStatus === "draft" || row.outreachStatus === "edited") return "drafted";

  if (row.scan_status === "done") return "scanned";
  if (row.scan_status === "queued" || row.scan_status === "scanning") return "scan_queued";
  // `scan_status === "failed"` has no rung of its own and falls through to
  // `qualified` below, keeping the row visible as still-needs-attention
  // rather than falsely advanced — its failure is already rendered by the
  // Shortlist `Status` column, immediately beside the future `Stage` column
  // (plan 07-04).

  if (row.scan_released_at) return "qualified";
  if (row.triage_checked_at) return "triaged";

  // `replied` has no rung: no reply marker exists anywhere in this
  // codebase until Phase 8 builds one, and Phase 8 owns adding both the
  // marker and the rung.

  return "new";
}

export type FunnelGroup = "New" | "Qualified" | "Contacted" | "Replied" | "Booked" | "Rejected";

export const FUNNEL_GROUPS: Record<FineLifecycleState, FunnelGroup> = {
  new: "New",
  no_website: "New",
  triaged: "Qualified",
  qualified: "Qualified",
  scan_queued: "Qualified",
  scanned: "Qualified",
  drafted: "Qualified",
  approved: "Qualified",
  contacted: "Contacted",
  replied: "Replied",
  booked: "Booked",
  rejected: "Rejected",
};

// Rejected is deliberately absent from the card row (UI-SPEC E1 locks
// exactly 5 cards) — rejected prospects stay visible on the Shortlist
// `Stage` column (plan 07-04), so the card row is a funnel view, not a
// partition of all prospects.
export const FUNNEL_CARD_ORDER: readonly FunnelGroup[] = [
  "New",
  "Qualified",
  "Contacted",
  "Replied",
  "Booked",
];

// The single flip point for Phase 8 (D-7-R1). No reply marker exists
// anywhere in this codebase — no `replied_at` column, no reply-detection
// webhook, no event log — so `deriveLifecycleState()` above can never
// return `replied`, and no reply-rate figure can be honestly computed.
// Phase 8 must flip this to `true` in the SAME change that adds the reply
// marker and the `replied` ladder rung; a caller (lib/reporting-aggregates.ts)
// reads this constant rather than inferring "can we show a rate" from the
// presence of a rung, so Phase 8 does not have to go hunting for the gate.
export const REPLY_SIGNAL_AVAILABLE = false;
