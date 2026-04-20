"use client";

import type { QuickWin } from "@/types/scanner";

interface QuickWinsProps {
  quickWins: QuickWin[];
}

function getTimeBadgeColor(win: QuickWin): string {
  if (win.needsDeveloper) return "bg-blue-100 text-blue-700";
  const time = win.estimatedTime.toLowerCase();
  if (time.includes("hour") || time.includes("day")) return "bg-yellow-100 text-yellow-700";
  return "bg-green-100 text-green-700";
}

export function QuickWinsSection({ quickWins }: QuickWinsProps) {
  if (!quickWins || quickWins.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="font-display text-lg sm:text-xl text-adashi-gulf mb-2">
        Your Top 3 Quick Wins
      </h2>
      <p className="text-gray-500 text-sm mb-5">
        The highest-impact fixes you can make right now.
      </p>

      <div className="space-y-4">
        {quickWins.slice(0, 3).map((win, i) => (
          <div
            key={i}
            className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6 hover:border-green-300 transition-colors"
          >
            <div className="flex items-start gap-4">
              {/* Number badge */}
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 text-green-700 font-bold text-sm flex items-center justify-center">
                {i + 1}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-adashi-gulf mb-1">
                  {win.title}
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed mb-3">
                  {win.description}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-block px-2.5 py-1 rounded-lg text-xs font-medium ${getTimeBadgeColor(win)}`}
                  >
                    {win.estimatedTime}
                  </span>
                  <span className="text-xs text-gray-500">
                    {win.expectedImpact}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
