"use client";

import { useState } from "react";
import type { ShortlistRow } from "@/lib/triage-candidates";
import { SignalChips } from "@/components/admin/signal-chips";

interface ShortlistTableProps {
  rows: ShortlistRow[];
  cutoff: number;
  loading: boolean;
  secret: string;
  onRequeued: () => void;
}

// ponytail: Intl.RelativeTimeFormat (stdlib) over a date-fns dependency —
// this is the only relative-date display in the codebase.
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function relativeDate(dateStr: string): string {
  const diffMs = new Date(dateStr).getTime() - Date.now();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (Math.abs(diffDays) < 1) return "today";
  return rtf.format(diffDays, "day");
}

// Status pill tokens (queued/scanning/done/failed), same badge-token style
// as the existing GATED pill. A null scan_status renders no pill — an
// un-armed prospect has no queue state (SCAN-03).
const statusPillStyles = {
  queued: "bg-gray-100 text-gray-600 border-gray-200",
  scanning: "bg-blue-100 text-blue-700 border-blue-200",
  done: "bg-green-100 text-green-700 border-green-200",
  failed: "bg-red-100 text-red-700 border-red-200",
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
 * Re-queue action for a failed row (D-05). Mirrors ReleaseButton's
 * confirm-then-POST fetch shape and x-admin-secret usage. Accent blue, never
 * destructive red — spending scan budget again is the intended action of
 * this screen, not a hazard.
 */
function RequeueButton({
  id,
  domain,
  secret,
  onRequeued,
}: {
  id: string;
  domain: string;
  secret: string;
  onRequeued: () => void;
}) {
  const [requeuing, setRequeuing] = useState(false);

  async function handleClick() {
    const confirmed = window.confirm(
      `Re-queue ${domain}? This spends real scan budget again.`
    );
    if (!confirmed) return;

    setRequeuing(true);
    try {
      const res = await fetch("/api/admin/requeue-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        onRequeued();
      } else {
        alert("Failed to re-queue prospect.");
      }
    } catch {
      alert("Failed to re-queue prospect.");
    } finally {
      setRequeuing(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={requeuing}
      className="text-xs text-adashi-blue hover:underline font-medium disabled:opacity-50"
    >
      {requeuing ? "Re-queuing..." : "Re-queue"}
    </button>
  );
}

export function ShortlistTable({ rows, cutoff, loading, secret, onRequeued }: ShortlistTableProps) {
  if (loading) {
    return <div className="p-12 text-center text-gray-400">Loading...</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="p-12 text-center text-gray-400">
        <p className="font-medium text-gray-500 mb-1">No triaged prospects yet</p>
        <p className="text-sm">
          Run <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">npm run triage</code> to score your
          imported prospects, then come back here to review the shortlist.
        </p>
      </div>
    );
  }

  const eligible = (row: ShortlistRow) => row.triage_score.gated || row.triage_score.score <= cutoff;
  const eligibleCount = rows.filter((r) => !r.scan_released_at && eligible(r)).length;
  const hasQueueActivity = rows.some((r) => !!r.scan_released_at || r.scan_status !== null);

  // Only collapse to the empty state when there is truly nothing to show —
  // no eligible-to-release row AND no released/in-queue row. Once anything
  // has been released, the table must keep rendering so in-flight and
  // completed scans stay visible even at a cutoff with nothing eligible.
  if (eligibleCount === 0 && !hasQueueActivity) {
    const unreleased = rows.filter((r) => !r.scan_released_at);

    return (
      <div className="p-12 text-center text-gray-400">
        <p className="font-medium text-gray-500 mb-1">Nothing eligible at this cutoff.</p>
        <p className="text-sm">
          {unreleased.length} prospect{unreleased.length !== 1 ? "s are" : " is"} gated or scored low enough
          to matter — try raising the cutoff.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-gray-400 text-xs uppercase tracking-wider">
            <th className="px-4 py-3 w-8"></th>
            <th className="px-4 py-3">Domain</th>
            <th className="px-4 py-3">Triage score</th>
            <th className="px-4 py-3">Signals</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Released</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const score = row.triage_score;
            const released = !!row.scan_released_at;
            return (
              <tr
                key={row.id}
                className={`border-b border-gray-50 hover:bg-gray-50/50 ${
                  score.gated ? "border-l-4 border-red-400 bg-red-50/30" : ""
                } ${released ? "opacity-60" : ""}`}
              >
                <td className="px-4 py-3">
                  {score.gated && (
                    <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full border bg-red-100 text-red-700 border-red-200">
                      GATED
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
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
                      score.score >= 80 ? "text-green-600" : score.score >= 50 ? "text-yellow-600" : "text-red-600"
                    }`}
                  >
                    {score.score}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <SignalChips score={score} />
                </td>
                <td className="px-4 py-3">
                  {row.scan_status === null ? null : row.scan_status === "done" && row.latest_scan_id ? (
                    <a
                      href={`/report/${row.latest_scan_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block"
                    >
                      <StatusPill status="done" />
                    </a>
                  ) : row.scan_status === "failed" ? (
                    <div>
                      <StatusPill status="failed" />
                      {row.scan_status_reason && (
                        <p
                          className="text-xs text-gray-400 mt-1 max-w-[16rem] truncate"
                          title={row.scan_status_reason}
                        >
                          {row.scan_status_reason}
                        </p>
                      )}
                      <div className="mt-1">
                        <RequeueButton id={row.id} domain={row.domain} secret={secret} onRequeued={onRequeued} />
                      </div>
                    </div>
                  ) : (
                    <StatusPill status={row.scan_status} />
                  )}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                  {released ? `Released ${relativeDate(row.scan_released_at as string)}` : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
