"use client";

import { usePipelineRun, PipelineRunPanel, type RunOutcome } from "@/components/admin/pipeline-run";

interface DrainResponse {
  reconciled?: number;
  claimed?: number;
  dispatched?: number;
  refused?: number;
  skipped?: number;
  error?: string;
  detail?: string;
}

function toOutcome(data: unknown, ok: boolean): RunOutcome {
  const body = (data ?? {}) as DrainResponse;

  if (!ok) {
    return {
      tone: "error",
      headline: "Drain failed",
      lines: [body.detail ?? body.error ?? "Unknown error"],
    };
  }

  if ((body.claimed ?? 0) === 0) {
    return {
      tone: "empty",
      headline: "Nothing was queued — no prospects were waiting to be scanned.",
      lines: [`reconciled=${body.reconciled ?? 0}`],
    };
  }

  return {
    tone: "ok",
    headline: `Drained ${body.claimed} prospect${body.claimed === 1 ? "" : "s"}`,
    lines: [
      `reconciled=${body.reconciled ?? 0}`,
      `claimed=${body.claimed ?? 0}`,
      `dispatched=${body.dispatched ?? 0}`,
      `refused=${body.refused ?? 0}`,
      `skipped=${body.skipped ?? 0}`,
    ],
  };
}

/**
 * "Drain" CTA — a local-only substitute for the 10-minute Vercel Cron tick
 * (app/api/cron/drain-scan-queue), which is not available on the Hobby
 * plan. Accent-blue, matching RunBatchButton — draining is the intended
 * action of this control, not a destructive one.
 */
export function DrainButton({ secret }: { secret: string }) {
  const { status, outcome, progress, logLines, runJson } = usePipelineRun({ secret });
  const running = status === "running";

  async function handleClick() {
    await runJson("/api/admin/pipeline/drain", {}, toOutcome);
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={running}
        className="bg-adashi-blue hover:bg-adashi-science text-white font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
      >
        {running ? "Draining…" : "Run drain"}
      </button>
      <PipelineRunPanel status={status} outcome={outcome} progress={progress} logLines={logLines} />
    </div>
  );
}
