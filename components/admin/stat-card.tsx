import type { ReactNode } from "react";

/**
 * Shared stat-card primitive used by every admin tab. Extracted from
 * app/admin/page.tsx (07-02) rather than exported from it — Next.js's App
 * Router validates that a page.tsx file only exports the reserved route
 * symbols (default, metadata, generateMetadata, etc.); a plain named export
 * fails `next build`'s generated route-type check. Both app/admin/page.tsx
 * and components/admin/reporting-tab.tsx import this module.
 */
export function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 ${
        highlight ? "bg-adashi-blue/5 border border-adashi-blue/20" : "bg-white shadow-sm"
      }`}
    >
      <div className={`text-2xl font-bold ${highlight ? "text-adashi-blue" : "text-adashi-gulf"}`}>
        {value}
      </div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
