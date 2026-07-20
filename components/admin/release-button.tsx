"use client";

import { useState } from "react";
import { RELEASE_CEILING } from "@/lib/triage-constants";

interface ReleaseButtonProps {
  cutoff: number;
  eligibleCount: number;
  secret: string;
  onReleased: () => void;
}

/**
 * "Release to Scan Queue" CTA (TRI-09, D-04, D-05, D-11). Accent blue, never
 * destructive-red — spending scan budget is the intended action of this
 * screen, not a hazard.
 */
export function ReleaseButton({ cutoff, eligibleCount, secret, onReleased }: ReleaseButtonProps) {
  const [releasing, setReleasing] = useState(false);
  const disabled = eligibleCount === 0 || releasing;

  async function handleClick() {
    const released = Math.min(eligibleCount, RELEASE_CEILING);
    const overflowNote =
      eligibleCount > RELEASE_CEILING
        ? ` ${eligibleCount} are eligible; the worst ${released} will be released, the rest roll into the next run.`
        : "";
    const confirmed = window.confirm(
      `Release ${released} prospect${released !== 1 ? "s" : ""} to the scan queue? This will spend real scan budget (ceiling: ${RELEASE_CEILING}/run).${overflowNote}`
    );
    if (!confirmed) return;

    setReleasing(true);
    try {
      const res = await fetch("/api/admin/release-prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ cutoff }),
      });
      if (res.ok) {
        onReleased();
      } else {
        alert("Failed to release prospects.");
      }
    } catch {
      alert("Failed to release prospects.");
    } finally {
      setReleasing(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={disabled}
        className="bg-adashi-blue hover:bg-adashi-science text-white font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
      >
        {releasing ? "Releasing..." : "Release to Scan Queue"}
      </button>
      {eligibleCount === 0 && (
        <p className="text-xs text-gray-400 mt-2">No eligible prospects at this cutoff.</p>
      )}
    </div>
  );
}
