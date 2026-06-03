"use client";

import { useTranslations } from "next-intl";
import type { Issue } from "@/types/scanner";

const severityBadge: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  major: "bg-orange-100 text-orange-700",
  minor: "bg-yellow-100 text-yellow-700",
  info: "bg-blue-100 text-blue-700",
};

interface BlurredSectionProps {
  issues: Issue[];
}

export function BlurredSection({ issues }: BlurredSectionProps) {
  const t = useTranslations("blurredSection");
  const tSev = useTranslations("common.severity");

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Blurred teaser content */}
      <div className="blur-[4px] pointer-events-none select-none" aria-hidden="true">
        <div className="bg-white rounded-2xl p-6 sm:p-8 space-y-3">
          {issues.map((issue, i) => (
            <div key={`${issue.id}-${i}`} className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                    severityBadge[issue.severity] || severityBadge.info
                  }`}
                >
                  {tSev(issue.severity)}
                </span>
              </div>
              <p className="font-medium text-adashi-gulf text-sm">{issue.title}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[2px]">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-adashi-gulf/10 rounded-full mb-4">
          <svg className="w-7 h-7 text-adashi-gulf" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <p className="font-display text-lg text-adashi-gulf mb-1">{t("lockedHeading")}</p>
        <p className="text-sm text-gray-500">{t("lockedHint")}</p>
      </div>
    </div>
  );
}
