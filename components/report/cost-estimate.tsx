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
        Based on the issues we found, your site has meaningful performance and accessibility gaps.
        Google research shows <span className="font-bold text-amber-900">53% of mobile users abandon pages that take longer than 3 seconds to load</span>,
        and each additional second reduces conversions by up to 7% (Akamai). The factors below
        reflect what we found in your scan.
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
        Impact estimates are based on the specific issues found in your scan, informed by Google and Akamai research on page speed and conversion rates.
      </p>
    </div>
  );
}
