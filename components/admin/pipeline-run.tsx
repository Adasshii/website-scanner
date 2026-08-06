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

/** One decoded NDJSON event from scripts/pipeline-runner.ts, forwarded
 * through streamPipelineRun (lib/pipeline-run.ts). */
export interface PipelineStreamEvent {
  t: "start" | "progress" | "result" | "error" | "exit";
  done?: number;
  total?: number;
  mode?: string;
  result?: unknown;
  message?: string;
  code?: number | null;
}

/**
 * Shared run-state hook for all three Pipeline controls (Import, Triage,
 * Drain). Task 1 shipped the plain-JSON POST path (`runJson`), which is
 * all Drain needs — it is short enough that a spinner is fine (CONTEXT.md).
 * Task 2 adds `runStream`, the NDJSON-streaming path for Import and
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

  /**
   * NDJSON-streaming request path — used by Import and Triage, both of
   * which run long enough (10-50 sequential fetches for triage, a
   * multi-minute S3 query for import) that no progress feedback would look
   * identical to a hung request. Reads the response body incrementally,
   * splits it on newlines the same way the server-side splitter does,
   * parses each line as JSON and falls back to treating it as a raw log
   * line when it isn't (the scripts' own `console.log` output flows
   * through this path unchanged). `toOutcome` receives the last
   * "result"/"error" event seen (or null if the stream ended without one —
   * that "ended with no result event" case is a failure, closing the
   * silent-hang hole) plus whether an `error` event was ever seen.
   */
  async function runStream(
    path: string,
    body: Record<string, unknown>,
    toOutcome: (finalEvent: PipelineStreamEvent | null, sawError: boolean) => RunOutcome
  ) {
    setStatus("running");
    setOutcome(null);
    setLogLines([]);
    setProgress(null);

    let finalEvent: PipelineStreamEvent | null = null;
    let sawError = false;

    function appendLog(line: string) {
      setLogLines((prev) => [...prev.slice(-199), line]);
    }

    function handleLine(line: string) {
      let parsed: PipelineStreamEvent | null = null;
      try {
        parsed = JSON.parse(line) as PipelineStreamEvent;
      } catch {
        // Not JSON — one of the scripts' own human-readable console.log
        // lines. Pass it through as a log line for display, unclassified.
        appendLog(line);
        return;
      }

      if (parsed.t === "start" || parsed.t === "progress") {
        setProgress({ done: parsed.done ?? 0, total: parsed.total ?? 0 });
      } else if (parsed.t === "result") {
        finalEvent = parsed;
      } else if (parsed.t === "error") {
        sawError = true;
        finalEvent = parsed;
        appendLog(`error: ${parsed.message ?? "unknown error"}`);
      } else if (parsed.t === "exit") {
        // Only adopt exit as the final event if no result/error arrived
        // first — result/error carry the real payload, exit is a fallback.
        if (!finalEvent) finalEvent = parsed;
      }
    }

    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({} as Record<string, unknown>));
        const detail =
          (data as { detail?: string; error?: string }).detail ??
          (data as { detail?: string; error?: string }).error ??
          `HTTP ${res.status}`;
        setOutcome({ tone: "error", headline: "Request failed to start", lines: [detail] });
        setStatus("failed");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.length === 0) continue;
          handleLine(line);
        }
      }
      if (buffer.trim().length > 0) handleLine(buffer);

      const result = toOutcome(finalEvent, sawError);
      setOutcome(result);
      setStatus(result.tone === "error" ? "failed" : "done");
    } catch (e) {
      setOutcome({
        tone: "error",
        headline: "Stream failed",
        lines: [e instanceof Error ? e.message : String(e)],
      });
      setStatus("failed");
    }
  }

  return { status, logLines, progress, outcome, runJson, runStream, reset };
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
