"use client";

import { Fragment, useState } from "react";
import type { OutreachFilter, OutreachQueueRow } from "@/lib/outreach-queue";
import { OutreachRowPanel } from "@/components/admin/outreach-row-panel";

interface OutreachCounts {
  pending: number;
  approved: number;
  rejected: number;
  sent: number;
}

interface OutreachTableProps {
  rows: OutreachQueueRow[];
  loading: boolean;
  secret: string;
  counts: OutreachCounts;
  onRefetch: (filter: OutreachFilter) => void;
}

// ponytail: duplicated from app/admin/page.tsx rather than imported — that
// file is the Next.js page component that renders this one, so importing a
// named export back from it would be a page<->component circular import for
// a ~10-line presentational card. Same props/JSX shape as the original.
function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl p-4 bg-white shadow-sm">
      <div className="text-2xl font-bold text-adashi-gulf">{value}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  );
}

// ponytail: Intl.RelativeTimeFormat (stdlib) over a date-fns dependency —
// copied verbatim from components/admin/shortlist-table.tsx, the only other
// relative-date display in the codebase.
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function relativeDate(dateStr: string): string {
  const diffMs = new Date(dateStr).getTime() - Date.now();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (Math.abs(diffDays) < 1) return "today";
  return rtf.format(diffDays, "day");
}

// Message-status pills (draft/edited/approved/rejected) — a sibling map to
// shortlist-table.tsx's scan-status statusPillStyles: same shape, same
// component convention, different domain (message lifecycle vs scan queue).
const statusPillStyles = {
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  edited: "bg-blue-100 text-blue-700 border-blue-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  sent: "bg-adashi-electric/30 text-adashi-gulf border-adashi-electric/50",
} as const;

function StatusPill({ status }: { status: keyof typeof statusPillStyles }) {
  return (
    <span
      className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${statusPillStyles[status]}`}
    >
      {status.toUpperCase()}
    </span>
  );
}

/**
 * The Phase 8 unresolved marker (D-04): a message that was prepared and
 * never marked sent must not sit silently in an ambiguous state. Also
 * surfaces Task 1's one recoverable failure mode, where send_records was
 * written but the outreach_messages.status update did not land — that row
 * stays visibly `approved` with a `preparedAt`, exactly this badge's
 * trigger condition.
 */
function PreparedNotSentPill({ preparedAt }: { preparedAt: string }) {
  const elapsedMs = Date.now() - new Date(preparedAt).getTime();
  const elapsedMinutes = Math.max(0, Math.round(elapsedMs / (1000 * 60)));
  const elapsedLabel =
    elapsedMinutes < 60 ? `${elapsedMinutes}m` : `${Math.round(elapsedMinutes / 60)}h`;
  return (
    <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200 ml-1">
      PREPARED, NOT SENT · {elapsedLabel}
    </span>
  );
}

const FILTERS: { value: OutreachFilter; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "sent", label: "Sent" },
];

/**
 * The Outreach tab (D-6-01): collapsed table with a status filter and stat
 * cards, one expandable row at a time. `expandedId` is the literal
 * enforcement of QUE-05 — a single nullable id, never a Set, never a second
 * piece of open-row state, so there is no code path in which two rows (and
 * therefore two Approve buttons) are on screen at once.
 */
export function OutreachTable({ rows, loading, secret, counts, onRefetch }: OutreachTableProps) {
  const [filter, setFilter] = useState<OutreachFilter>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleFilterChange(next: OutreachFilter) {
    setFilter(next);
    setExpandedId(null);
    onRefetch(next);
  }

  function toggleRow(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  const refetchCurrentFilter = () => onRefetch(filter);
  const total = counts.pending + counts.approved + counts.rejected + counts.sent;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
        <StatCard label="Pending" value={counts.pending} />
        <StatCard label="Approved" value={counts.approved} />
        <StatCard label="Rejected" value={counts.rejected} />
        <StatCard label="Sent" value={counts.sent} />
        <StatCard label="Total" value={total} />
      </div>

      <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 shadow-sm w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => handleFilterChange(f.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f.value ? "bg-adashi-blue text-white" : "text-gray-500 hover:text-adashi-gulf"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading...</div>
        ) : rows.length === 0 && filter === "pending" ? (
          <div className="p-12 text-center text-gray-400">
            <p className="font-medium text-gray-500 mb-1">Nothing waiting for review</p>
            <p className="text-sm max-w-md mx-auto">
              Every scanned prospect with a usable contact has either not been drafted yet or has already
              been reviewed. Check back after the next scan completes, or switch the status filter to see
              approved and rejected drafts.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No drafts in this view.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-400 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3">Domain</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Locale</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const expanded = row.id === expandedId;
                  return (
                    <Fragment key={row.id}>
                      <tr
                        onClick={() => toggleRow(row.id)}
                        className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={`https://${row.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-adashi-blue hover:underline font-medium"
                          >
                            {row.domain}
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-bold ${
                              row.overallScore >= 80
                                ? "text-green-600"
                                : row.overallScore >= 50
                                ? "text-yellow-600"
                                : "text-red-600"
                            }`}
                          >
                            {row.overallScore}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{row.locale.toUpperCase()}</td>
                        <td className="px-4 py-3">
                          <StatusPill status={row.status as keyof typeof statusPillStyles} />
                          {row.status === "approved" && row.preparedAt && (
                            <PreparedNotSentPill preparedAt={row.preparedAt} />
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                          {relativeDate(row.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          <span className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}>
                            ▸
                          </span>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-gray-50">
                          <td colSpan={6} className="p-0">
                            <OutreachRowPanel row={row} secret={secret} onRefetch={refetchCurrentFilter} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
