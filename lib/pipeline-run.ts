// Shared run-state plumbing for the local-only Pipeline admin tab
// (app/api/admin/pipeline/*, components/admin/pipeline-*). Task 1 provides
// the run lock, shared by all three routes so a double-click can never
// launch two importers/triage runs against the same DB at once (T-ntm-05,
// D-single-tenant: one lock, not per-action locks — simpler to reason about
// at this project's scale). Task 2 adds the NDJSON line splitter and
// streamPipelineRun, which spawns scripts/pipeline-runner.ts as a child
// process rather than importing it — see lib/overture-client.ts's doc
// comment for why (a value import would drag @duckdb/node-api into the
// Next server bundle).
//
// The lock is stored on `globalThis` under a namespaced key, not a plain
// module-level `let`, so it survives Next dev's HMR module re-evaluation —
// a naive module-level flag resets to false on every hot-reloaded edit to
// this file, silently defeating the lock mid-development.
import { spawn } from "node:child_process";
import path from "node:path";

const LOCK_KEY = "__gsd_260806_ntm_pipeline_run_lock__";

interface PipelineLockState {
  locked: boolean;
}

function lockState(): PipelineLockState {
  const g = globalThis as unknown as Record<string, PipelineLockState | undefined>;
  if (!g[LOCK_KEY]) {
    g[LOCK_KEY] = { locked: false };
  }
  return g[LOCK_KEY]!;
}

/**
 * Attempts to acquire the single pipeline run lock. Returns false — never
 * throws — when a run is already in flight, so callers can respond with a
 * 409 rather than crash.
 */
export function acquirePipelineLock(): boolean {
  const state = lockState();
  if (state.locked) return false;
  state.locked = true;
  return true;
}

/** Releases the pipeline run lock. Safe to call even if never acquired. */
export function releasePipelineLock(): void {
  lockState().locked = false;
}

// ── NDJSON line splitter ────────────────────────────────────────────────

/**
 * Turns a chunked byte/text stream into whole NDJSON lines. A spawned
 * child process's `data` events do not respect object boundaries — a
 * single JSON object emitted by scripts/pipeline-runner.ts can arrive
 * split across two `data` events, and a naive per-chunk `.split("\n")`
 * would corrupt it. This buffers any trailing (post-last-newline) content
 * across calls to push() and only flush()es it once the stream ends.
 */
export class NdjsonLineSplitter {
  private buffer = "";

  /** Feeds a decoded text chunk; returns any complete (newline-terminated)
   * lines it produced. Incomplete trailing content is held until the next
   * push() or flush(). */
  push(chunk: string): string[] {
    this.buffer += chunk;
    const parts = this.buffer.split("\n");
    this.buffer = parts.pop() ?? "";
    return parts;
  }

  /** Flushes any trailing content with no newline, exactly once — a second
   * call after the first returns an empty array, never a duplicate. */
  flush(): string[] {
    if (this.buffer.length === 0) return [];
    const remaining = this.buffer;
    this.buffer = "";
    return [remaining];
  }
}

// ── NDJSON streaming child-process runner ───────────────────────────────

const RUNNER_PATH = path.join(process.cwd(), "scripts", "pipeline-runner.ts");
const TSX_BIN = path.join(process.cwd(), "node_modules", ".bin", "tsx");

type PipelineMode = "triage" | "import";

/**
 * Spawns scripts/pipeline-runner.ts (absolute binary path, array argv, no
 * `shell: true` — T-ntm-03: no shell ever interprets a free-text flag
 * value like `--category=`) and streams its NDJSON stdout/stderr straight
 * through to the browser as an `application/x-ndjson` Response.
 *
 * If the client disconnects mid-run, the child is deliberately NOT killed
 * — a half-killed import/triage run leaves the DB mid-write, so letting
 * the run finish to completion is the safer default. The lock is released
 * only when the child actually exits (the `close` handler below), so it
 * stays held for exactly as long as real work is happening.
 */
export function streamPipelineRun(mode: PipelineMode, flags: string[]): Response {
  const child = spawn(TSX_BIN, [RUNNER_PATH, mode, ...flags], {
    cwd: process.cwd(),
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      function makePump() {
        const decoder = new TextDecoder();
        const splitter = new NdjsonLineSplitter();
        return {
          onData(chunk: Buffer) {
            const lines = splitter.push(decoder.decode(chunk, { stream: true }));
            for (const line of lines) {
              if (line.length === 0) continue;
              controller.enqueue(encoder.encode(line + "\n"));
            }
          },
          flushRemainder() {
            for (const line of splitter.flush()) {
              if (line.length === 0) continue;
              controller.enqueue(encoder.encode(line + "\n"));
            }
          },
        };
      }

      const stdoutPump = makePump();
      const stderrPump = makePump();

      child.stdout?.on("data", stdoutPump.onData);
      child.stderr?.on("data", stderrPump.onData);

      child.on("close", (code) => {
        stdoutPump.flushRemainder();
        stderrPump.flushRemainder();
        controller.enqueue(encoder.encode(JSON.stringify({ t: "exit", code }) + "\n"));
        controller.close();
        releasePipelineLock();
      });

      child.on("error", (err) => {
        controller.enqueue(
          encoder.encode(JSON.stringify({ t: "error", message: err.message }) + "\n")
        );
        controller.close();
        releasePipelineLock();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });
}
