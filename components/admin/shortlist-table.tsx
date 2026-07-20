"use client";

import type { ShortlistRow } from "@/lib/triage-candidates";
import { SignalChips } from "@/components/admin/signal-chips";

interface ShortlistTableProps {
  rows: ShortlistRow[];
  cutoff: number;
  loading: boolean;
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

export function ShortlistTable({ rows, cutoff, loading }: ShortlistTableProps) {
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

  if (eligibleCount === 0) {
    const unreleased = rows.filter((r) => !r.scan_released_at);
    const allReleased = unreleased.length === 0;

    return (
      <div className="p-12 text-center text-gray-400">
        {allReleased ? (
          <>
            <p className="font-medium text-gray-500 mb-1">Everything eligible is already released.</p>
            <p className="text-sm">
              Run <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">npm run triage</code> again to
              refresh scores, or wait for new prospects to import.
            </p>
          </>
        ) : (
          <>
            <p className="font-medium text-gray-500 mb-1">Nothing eligible at this cutoff.</p>
            <p className="text-sm">
              {unreleased.length} prospect{unreleased.length !== 1 ? "s are" : " is"} gated or scored low enough
              to matter — try raising the cutoff.
            </p>
          </>
        )}
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
