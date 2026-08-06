"use client";

import { useState } from "react";
import {
  usePipelineRun,
  PipelineRunPanel,
  type PipelineStreamEvent,
  type RunOutcome,
} from "@/components/admin/pipeline-run";
import { DEFAULT_CUTOFF } from "@/lib/triage-constants";

interface TriageResult {
  totalRows: number;
  triaged: number;
  clearsCutoff: number;
  unreachable: number;
  skipped: number;
  dryRun: boolean;
}

function toOutcome(finalEvent: PipelineStreamEvent | null, sawError: boolean): RunOutcome {
  // "Stream ended with no result event" is itself a failure — this is what
  // closes the silent-hang hole a naive success-by-default would leave.
  if (sawError || !finalEvent || finalEvent.t !== "result") {
    return {
      tone: "error",
      headline: "Triage failed",
      lines: [finalEvent?.message ?? "The run ended without a result — check the server console."],
    };
  }

  const result = finalEvent.result as TriageResult;

  if (result.totalRows === 0) {
    return {
      tone: "empty",
      headline: "No eligible prospects were found to triage.",
      lines: [],
    };
  }

  return {
    tone: "ok",
    headline: `Triaged ${result.triaged} of ${result.totalRows}${result.dryRun ? " (dry run)" : ""}`,
    lines: [
      `clears cutoff=${result.clearsCutoff}`,
      `unreachable=${result.unreachable}`,
      `skipped=${result.skipped}`,
    ],
  };
}

/**
 * Triage control — dry-run-by-default (CONTEXT.md), streams a rising
 * "done/total" count while it runs, since a real run goes quiet for
 * minutes (BATCH_DELAY_MS between batches) and a long run must never look
 * identical to a hung one.
 */
export function TriageForm({ secret }: { secret: string }) {
  const [dryRun, setDryRun] = useState(true);
  const [limit, setLimit] = useState("");
  const [cutoff, setCutoff] = useState(String(DEFAULT_CUTOFF));

  const { status, outcome, progress, logLines, runStream } = usePipelineRun({ secret });
  const running = status === "running";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body: { dryRun?: boolean; limit?: number; cutoff?: number } = { dryRun };
    if (limit.trim()) body.limit = Number(limit);
    if (cutoff.trim()) body.cutoff = Number(cutoff);
    await runStream("/api/admin/pipeline/triage", body, toOutcome);
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-wrap items-end gap-4 mb-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            className="rounded"
          />
          Dry run
        </label>
        <label className="text-sm text-gray-600">
          Limit
          <input
            type="number"
            min={1}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="all eligible"
            className="ml-2 w-28 px-2 py-1 rounded-lg border border-gray-200 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          Cutoff
          <input
            type="number"
            min={0}
            max={100}
            value={cutoff}
            onChange={(e) => setCutoff(e.target.value)}
            className="ml-2 w-20 px-2 py-1 rounded-lg border border-gray-200 text-sm"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={running}
        className="bg-adashi-blue hover:bg-adashi-science text-white font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
      >
        {running
          ? progress
            ? `Triaging… ${progress.done}/${progress.total}`
            : "Triaging…"
          : dryRun
          ? "Run triage (dry run)"
          : "Run triage"}
      </button>
      <PipelineRunPanel status={status} outcome={outcome} progress={progress} logLines={logLines} />
    </form>
  );
}
