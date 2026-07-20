"use client";

import type { TriageScore } from "@/types/triage";

// Reuses components/scan/issue-card.tsx's severityStyles convention
// verbatim (03-UI-SPEC "Signal-severity palette").
const severityStyles = {
  critical: "bg-red-100 text-red-700 border-red-200",
  major: "bg-orange-100 text-orange-700 border-orange-200",
  minor: "bg-yellow-100 text-yellow-700 border-yellow-200",
  info: "bg-blue-50 text-blue-400 border-blue-100",
} as const;

interface Chip {
  label: string;
  tier: keyof typeof severityStyles;
}

/** Derives the applicable chips for one prospect's triage_score (D-02). */
function deriveChips(score: TriageScore): Chip[] {
  const chips: Chip[] = [];

  if (!score.reachable) chips.push({ label: "Unreachable", tier: "critical" });
  if (score.reachable && !score.https) chips.push({ label: "No HTTPS", tier: "critical" });

  if (!score.hasViewport) chips.push({ label: "No viewport", tier: "major" });

  const hops = score.redirectChain?.length ?? 0;
  if (hops >= 4) chips.push({ label: "Long redirects", tier: "major" });
  else if (hops >= 2) chips.push({ label: "Short redirects", tier: "minor" });

  if (score.bytes !== null) {
    if (score.bytes > 3_000_000 || score.truncated) {
      chips.push({ label: "Heavy page", tier: "major" });
    } else if (score.bytes > 1_000_000) {
      chips.push({ label: "Moderate weight", tier: "minor" });
    }
  }

  if (score.responseMs !== null) {
    if (score.responseMs > 4000) {
      chips.push({ label: "Slow response", tier: "major" });
    } else if (score.responseMs > 1500) {
      chips.push({ label: "Moderate response", tier: "minor" });
    }
  }

  if (score.robotsBlocked) chips.push({ label: "Robots blocked", tier: "info" });

  return chips;
}

/** Renders the wrapped signal-chip row for one prospect (D-02, TRI-07). */
export function SignalChips({ score }: { score: TriageScore }) {
  const chips = deriveChips(score);

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((chip, i) => (
        <span
          key={i}
          className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${severityStyles[chip.tier]}`}
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
}
