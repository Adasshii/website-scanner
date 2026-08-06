"use client";

import { useState } from "react";

export type RunTone = "ok" | "empty" | "error";
export type RunStatus = "idle" | "running" | "done" | "failed";

export interface RunOutcome {
  tone: RunTone;
  headline: string;
  lines: string[];
}

interface UsePipelineRunOptions {
  secret: string;
}

/**
 * Shared run-state hook for all three Pipeline controls (Import, Triage,
 * Drain). Task 1 ships only the plain-JSON POST path (`runJson`), which is
 * all Drain needs — it is short enough that a spinner is fine (CONTEXT.md).
 * Task 2 extends this hook with an NDJSON-streaming path for Import and
 * Triage, which both run long enough that a silent request would look
 * identical to a hung one.
 */
export function usePipelineRun({ secret }: UsePipelineRunOptions) {
  const [status, setStatus] = useState<RunStatus>("idle");
  const [logLines, setLogLines] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);

  function reset() {
    setStatus("idle");
    setOutcome(null);
    setLogLines([]);
    setProgress(null);
  }

  /**
   * Plain-JSON request/response path — one POST, one JSON body back. Used
   * by Drain, whose run is short enough that streaming progress adds
   * nothing.
   */
  async function runJson(
    path: string,
    body: Record<string, unknown>,
    toOutcome: (data: unknown, ok: boolean) => RunOutcome
  ) {
    setStatus("running");
    setOutcome(null);
    setLogLines([]);
    setProgress(null);

    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      const result = toOutcome(data, res.ok);
      setOutcome(result);
      setStatus(result.tone === "error" ? "failed" : "done");
    } catch (e) {
      setOutcome({
        tone: "error",
        headline: "Request failed",
        lines: [e instanceof Error ? e.message : String(e)],
      });
      setStatus("failed");
    }
  }

  return { status, logLines, progress, outcome, runJson, reset };
}

/**
 * Shared result-display component for all three controls (CONTEXT.md:
 * "Drain uses the same result-display component for consistency"). Renders
 * three visually distinct tones — `empty` is a loud amber state, not a
 * muted one, because a run that did nothing must never read as a run that
 * succeeded (the single most probable way this UI wastes time, per
 * CONTEXT.md's zero-row-results note).
 */
export function PipelineRunPanel({
  status,
  outcome,
  progress,
  logLines,
}: {
  status: RunStatus;
  outcome: RunOutcome | null;
  progress: { done: number; total: number } | null;
  logLines: string[];
}) {
  if (status === "idle") return null;

  if (status === "running") {
    return (
      <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
        <p className="font-medium">
          Running…
          {progress ? ` ${progress.done}/${progress.total}` : ""}
        </p>
        {logLines.length > 0 && (
          <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-blue-600">
            {logLines.slice(-200).join("\n")}
          </pre>
        )}
      </div>
    );
  }

  if (!outcome) return null;

  const toneClasses: Record<RunTone, string> = {
    ok: "border-green-200 bg-green-50 text-green-700",
    empty: "border-amber-300 bg-amber-100 text-amber-800",
    error: "border-red-200 bg-red-50 text-red-700",
  };

  return (
    <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${toneClasses[outcome.tone]}`}>
      <p className="font-semibold">{outcome.headline}</p>
      {outcome.lines.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs">
          {outcome.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      {logLines.length > 0 && (
        <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs opacity-80">
          {logLines.slice(-200).join("\n")}
        </pre>
      )}
    </div>
  );
}
