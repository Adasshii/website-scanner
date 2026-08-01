"use client";

import { StatCard } from "@/components/admin/stat-card";
import { FUNNEL_CARD_ORDER, type FunnelGroup } from "@/lib/lifecycle";
import type { ReportingPayload } from "@/lib/reporting-aggregates";

interface ReportingTabProps {
  payload: ReportingPayload | null;
  loading: boolean;
  error: string;
}

// The three cards a sent-gate closure freezes (D-7-13) — New and Qualified
// always render real counts, no matter what.
const AWAITING_GROUPS: ReadonlySet<FunnelGroup> = new Set<FunnelGroup>([
  "Contacted",
  "Replied",
  "Booked",
]);

const EXPLAINER =
  "Reply rate and booked calls aren't measurable yet — outreach sending is a later phase " +
  "(Phase 8). Once the first message sends, these numbers take over on their own.";

export function ReportingTab({ payload, loading, error }: ReportingTabProps) {
  if (loading) {
    return <div className="p-12 text-center text-gray-400">Loading...</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const totalProspects = payload
    ? Object.values(payload.funnel).reduce((sum, n) => sum + n, 0)
    : 0;

  // With zero prospects ever imported, the panel renders the tab-level
  // empty state in place of the card row — never five zeroed cards.
  if (!payload || totalProspects === 0) {
    return (
      <div className="p-12 text-center text-gray-400">
        <p className="font-medium text-gray-500 mb-1">No prospects imported yet</p>
        <p className="text-sm">Run the importer to start building your funnel.</p>
      </div>
    );
  }

  return (
    <div>
      {!payload.sentGateOpen && <p className="text-sm text-gray-500 mb-4">{EXPLAINER}</p>}
      <FunnelCards funnel={payload.funnel} sentGateOpen={payload.sentGateOpen} />
    </div>
  );
}

export function FunnelCards({
  funnel,
  sentGateOpen,
}: {
  funnel: ReportingPayload["funnel"];
  sentGateOpen: boolean;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
      {FUNNEL_CARD_ORDER.map((group) => {
        const awaiting = !sentGateOpen && AWAITING_GROUPS.has(group);
        return (
          <StatCard
            key={group}
            label={group}
            value={
              awaiting ? (
                <span className="text-gray-400 italic text-xs">— Not yet sending</span>
              ) : (
                funnel[group]
              )
            }
            highlight={group === "Booked"}
          />
        );
      })}
    </div>
  );
}
