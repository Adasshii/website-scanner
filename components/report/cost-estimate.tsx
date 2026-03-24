"use client";

import type { CostEstimate } from "@/types/scanner";

interface CostEstimateProps {
  costEstimate: CostEstimate;
}

export function CostEstimateSection({ costEstimate }: CostEstimateProps) {
  const { totalLostPercent, factors } = costEstimate;

  if (!factors || factors.length === 0) return null;

  // Show as a range (±5%)
  const low = Math.max(totalLostPercent - 5, 0);
  const high = Math.min(totalLostPercent + 5, 60);
  const rangeText = low === 0 ? `up to ${high}%` : `${low}–${high}%`;

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6 sm:p-8 mb-8">
      <h2 className="font-display text-lg sm:text-xl text-amber-900 mb-3">
        What this is costing you
      </h2>

      <p className="text-amber-800 text-base sm:text-lg leading-relaxed mb-5">
        Based on the issues we found, your website may be losing an estimated{" "}
        <span className="font-bold text-amber-900">{rangeText} of potential visitors</span>{" "}
        due to accessibility barriers, slow performance, and unclear messaging.
      </p>

      {/* Factor breakdown */}
      <div className="space-y-3 mb-4">
        {factors.map((factor, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-1">
              <div
                className="h-2 rounded-full bg-amber-400"
                style={{ width: `${Math.max(factor.percentImpact * 4, 16)}px` }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-amber-900 text-sm">
                  {factor.name}
                </span>
                <span className="text-amber-700 text-xs font-medium">
                  ~{factor.percentImpact}% impact
                </span>
              </div>
              <p className="text-amber-700 text-sm leading-relaxed">
                {factor.explanation}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-amber-600 text-xs">
        This is an estimate based on industry benchmarks.
      </p>
    </div>
  );
}
