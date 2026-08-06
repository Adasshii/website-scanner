/**
 * scripts/pipeline-runner.ts — a third CLI, spawned by the local-only admin
 * Pipeline routes (app/api/admin/pipeline/{triage,import}/route.ts, via
 * lib/pipeline-run.ts's streamPipelineRun) as a child process rather than
 * imported in-process. Importing scripts/import-prospects.ts's exports
 * directly from the Next.js server would drag @duckdb/node-api (109 MB, a
 * native binary) into the Next server bundle for the first time — see
 * lib/overture-client.ts's doc comment.
 *
 * This file does NOT modify scripts/import-prospects.ts or
 * scripts/triage-prospects.ts. It imports their exported parse-args and
 * run-mode functions and wraps their dependency-injection seams (TriageDeps /
 * ImportDeps) with NDJSON-emitting versions of the same functions — that
 * seam is the designed extension point, so this needs zero edits to
 * either script. The runner never validates arguments itself:
 * parseTriageArgs/parseImportArgs are the single validator both the
 * terminal and the button go through, so the two can never drift.
 *
 * Usage: npx tsx scripts/pipeline-runner.ts <triage|import> [...flags]
 *
 * Emits one JSON object per stdout line (NDJSON):
 *   { t: "start", total }
 *   { t: "progress", done, total }
 *   { t: "result", mode, result }
 *   { t: "error", message }        (then process.exit(1))
 */
import { parseTriageArgs, runTriage, TriageArgsError, type TriageDeps } from "@/scripts/triage-prospects";
import { getTriageCandidates } from "@/lib/triage-candidates";
import { fetchTriageSignals } from "@/lib/triage-fetch";
import { computeTriageScore } from "@/lib/triage-scorer";
import { createServerClient } from "@/lib/supabase";
import { validateUrlSafe } from "@/lib/url-validation.server";

type NdjsonEvent =
  | { t: "start"; total: number }
  | { t: "progress"; done: number; total: number }
  | { t: "result"; mode: string; result: unknown }
  | { t: "error"; message: string };

function emit(event: NdjsonEvent): void {
  process.stdout.write(JSON.stringify(event) + "\n");
}

function loadLocalEnv(): void {
  // Mirrors both scripts' own loader (Node 20.6+ native env-file loader) so
  // this runner also works when invoked directly from a terminal, not only
  // when spawned by an admin route.
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // Missing file, or already-exported env vars are sufficient — ignore.
    }
  }
}

async function runTriageMode(argv: string[]): Promise<void> {
  const args = parseTriageArgs(argv);

  let done = 0;
  let total = 0;

  const deps: TriageDeps = {
    getTriageCandidates: async (sb, opts) => {
      const rows = await getTriageCandidates(sb, opts);
      total = rows.length;
      emit({ t: "start", total });
      return rows;
    },
    fetchTriageSignals: async (url, fetchDeps) => {
      try {
        return await fetchTriageSignals(url, fetchDeps);
      } finally {
        // A prospect with a null website_url throws before this seam runs
        // (runTriage's own per-prospect try/catch), so it never advances
        // this counter — the `result` event's totals, not this counter,
        // are the authoritative tally.
        done++;
        emit({ t: "progress", done, total });
      }
    },
    validateUrlSafe,
    computeTriageScore,
    createServerClient,
  };

  const result = await runTriage(args, deps);
  emit({ t: "result", mode: "triage", result });
}

async function main(): Promise<void> {
  loadLocalEnv();

  const mode = process.argv[2];
  const flags = process.argv.slice(3);

  try {
    if (mode === "triage") {
      await runTriageMode(flags);
    } else {
      emit({ t: "error", message: `Unknown pipeline-runner mode: ${mode ?? "(none)"}` });
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof TriageArgsError) {
      emit({ t: "error", message: err.message });
      process.exit(1);
      return;
    }
    emit({ t: "error", message: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
