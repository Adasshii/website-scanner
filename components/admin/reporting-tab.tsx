"use client";

import { StatCard } from "@/components/admin/stat-card";
import { FUNNEL_CARD_ORDER, type FunnelGroup } from "@/lib/lifecycle";
import { formatReplyRate } from "@/lib/reporting-format";
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

// Same literal formatReplyRate(null) returns — the Booked cell is not a
// rate so it doesn't go through that formatter, but the copy is locked to
// be pixel-identical across both gated columns (UI-SPEC Copywriting
// Contract).
const NOT_YET_SENDING = "— Not yet sending";
const AWAITING_CELL_CLASS = "text-gray-400 italic text-xs";

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
  // empty state in place of the card row and the table — never five zeroed
  // cards plus 30 zeroed rows.
  if (!payload || totalProspects === 0) {
    return (
      <div className="p-12 text-center text-gray-400">
        <p className="font-medium text-gray-500 mb-1">No prospects imported yet</p>
        <p className="text-sm">Run the importer to start building your funnel.</p>
      </div>
    );
  }

  // Distinct from the tab-level empty state above: prospects exist, but
  // nothing happened in the 30-day window. Checked against the four
  // always-real counters only — Reply rate/Booked are gated (D-7-13) and
  // read null/awaiting independent of real activity, so they say nothing
  // about whether the window itself was active.
  const zeroActivity = payload.days.every(
    (day) => day.imported === 0 && day.triaged === 0 && day.scanned === 0 && day.contacted === 0
  );

  return (
    <div>
      {!payload.sentGateOpen && <p className="text-sm text-gray-500 mb-4">{EXPLAINER}</p>}
      <FunnelCards funnel={payload.funnel} sentGateOpen={payload.sentGateOpen} />
      {zeroActivity && (
        <div className="mb-4">
          <p className="font-medium text-gray-500 mb-1">No activity in the last 30 days</p>
          <p className="text-sm text-gray-400">
            Every date below reads zero. Check the Shortlist tab to see where existing
            prospects currently stand.
          </p>
        </div>
      )}
      <PerDayTable days={payload.days} sentGateOpen={payload.sentGateOpen} />
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

// E2 (UI-SPEC): the 30-day per-day table. Table shell copied from
// shortlist-table.tsx lines 189-201 verbatim in shape — overflow-x-auto
// wrapper, table w-full text-sm, the same thead classes, px-4 py-3 cells.
export function PerDayTable({
  days,
  sentGateOpen,
}: {
  days: ReportingPayload["days"];
  sentGateOpen: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-gray-400 text-xs uppercase tracking-wider">
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Imported</th>
            <th className="px-4 py-3">Triaged</th>
            <th className="px-4 py-3">Scanned</th>
            <th className="px-4 py-3">Contacted</th>
            <th className="px-4 py-3">Reply rate</th>
            <th className="px-4 py-3">Booked</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            // Booked's gate is the global sentGateOpen (D-7-13), not
            // day.booked's own nullability — the payload can carry a real
            // booked number while the gate is closed (that is exactly what
            // the closed-gate render test proves the UI must suppress).
            const bookedAwaiting = !sentGateOpen;
            return (
              <tr key={day.date} className="border-b border-gray-50">
                <td className="px-4 py-3">{day.date}</td>
                <td className="px-4 py-3">{day.imported}</td>
                <td className="px-4 py-3">{day.triaged}</td>
                <td className="px-4 py-3">{day.scanned}</td>
                <td className="px-4 py-3">{day.contacted}</td>
                <td
                  className={`px-4 py-3 ${
                    day.replyRate === null ? AWAITING_CELL_CLASS : ""
                  }`}
                >
                  {formatReplyRate(day.replyRate)}
                </td>
                <td
                  className={`px-4 py-3 ${bookedAwaiting ? AWAITING_CELL_CLASS : ""}`}
                  title={
                    !bookedAwaiting && (day.bookedByDomain ?? 0) > 0
                      ? `${day.bookedByDomain} of these matched by domain rather than email address`
                      : undefined
                  }
                >
                  {bookedAwaiting ? NOT_YET_SENDING : (day.booked ?? 0)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
