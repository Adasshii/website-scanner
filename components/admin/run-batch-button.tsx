"use client";

import { useState } from "react";
import { BULK_ARM_CEILING } from "@/lib/bulk-scan-constants";

interface RunBatchButtonProps {
  armableCount: number;
  secret: string;
  onArmed: () => void;
}

/**
 * "Run batch" CTA (D-07). Named analog of ReleaseButton: this click arms the
 * batch (marks released-but-unarmed prospects as queued, up to
 * BULK_ARM_CEILING), Vercel Cron then drains the queue in paced ticks, and
 * nothing is scanned that was not armed here. Accent blue, never
 * destructive-red — spending scan budget is the intended action of this
 * screen, not a hazard.
 */
export function RunBatchButton({ armableCount, secret, onArmed }: RunBatchButtonProps) {
  const [arming, setArming] = useState(false);
  const disabled = armableCount === 0 || arming;

  async function handleClick() {
    const armed = Math.min(armableCount, BULK_ARM_CEILING);
    const overflowNote =
      armableCount > BULK_ARM_CEILING
        ? ` ${armableCount} are released and unarmed; the first ${armed} will be queued, the rest roll into the next run.`
        : "";
    const confirmed = window.confirm(
      `Queue ${armed} prospect${armed !== 1 ? "s" : ""} for a full scan? This starts real full scans and spends real scan budget (ceiling: ${BULK_ARM_CEILING}/click).${overflowNote}`
    );
    if (!confirmed) return;

    setArming(true);
    try {
      const res = await fetch("/api/admin/run-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      });
      if (res.ok) {
        onArmed();
      } else {
        alert("Failed to run batch.");
      }
    } catch {
      alert("Failed to run batch.");
    } finally {
      setArming(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={disabled}
        className="bg-adashi-blue hover:bg-adashi-science text-white font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
      >
        {arming ? "Queuing..." : "Run batch"}
      </button>
      {armableCount === 0 && (
        <p className="text-xs text-gray-400 mt-2">No released prospects waiting to be queued.</p>
      )}
    </div>
  );
}
