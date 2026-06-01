"use client";

import type { CostEstimate } from "@/types/scanner";

interface CostEstimateProps {
  costEstimate: CostEstimate;
}

export function CostEstimateSection({ costEstimate }: CostEstimateProps) {
  const { factors, totalLostPercent } = costEstimate;

  if (!factors || factors.length === 0) return null;

  const perHundred = Math.round(totalLostPercent);

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6 sm:p-8 mb-8">
      <h2 className="font-display text-lg sm:text-xl text-amber-900 mb-4">
        What this is costing you
      </h2>

      {/* Lost-enquiries headline: concrete, no traffic data required */}
      <div className="flex items-baseline gap-3 mb-2">
        <span className="font-display text-4xl sm:text-5xl font-bold text-amber-900 leading-none">
          ~{perHundred}%
        </span>
        <span className="text-amber-800 text-sm sm:text-base leading-snug">
          of potential enquiries are likely slipping away because of the issues below.
        </span>
      </div>

      <p className="text-amber-800 text-base sm:text-lg leading-relaxed mb-5">
        Put another way: for every 100 visitors who reach your site, around {perHundred} leave
        without calling, emailing, or buying. Google found 53% of mobile visitors give up on pages
        that take over 3 seconds to load, and each extra second can cut conversions by up to 7% (Akamai).
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
