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
import { parseImportArgs, runImport, ImportArgsError, type ImportDeps } from "@/scripts/import-prospects";
import { getTriageCandidates } from "@/lib/triage-candidates";
import { fetchTriageSignals } from "@/lib/triage-fetch";
import { computeTriageScore } from "@/lib/triage-scorer";
import { queryOverturePlaces } from "@/lib/overture-client";
import { upsertOverturePlace } from "@/lib/prospect-upsert";
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

/**
 * The only HEAD in this file. ImportDeps requires all five fields and the
 * script's own defaultFetchReachability is not exported, so this is a
 * local re-implementation — but it is safe by construction: runImport's
 * checkReachability() ALWAYS routes the URL through deps.validateUrlSafe
 * (the real one, passed through untouched below) BEFORE this is ever
 * called, so the SSRF gate (D-11, Pitfall 3, T-01-06) lives in the script
 * and is not weakened by this local helper. Do not add validation here and
 * do not remove the real validateUrlSafe pass-through below.
 */
async function fetchReachabilityForRunner(
  url: string
): Promise<{ ok: boolean; status: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { method: "HEAD", signal: controller.signal, redirect: "follow" });
    return { ok: res.ok, status: res.status };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runImportMode(argv: string[]): Promise<void> {
  const args = parseImportArgs(argv);

  let done = 0;
  let total = 0;

  const deps: ImportDeps = {
    queryOverturePlaces: async (params) => {
      // The S3 query is the long silent stretch in a real run — this
      // `start` event is the first proof of life the browser sees.
      const rows = await queryOverturePlaces(params);
      total = rows.length;
      emit({ t: "start", total });
      return rows;
    },
    upsertOverturePlace: async (sb, place, campaignTag) => {
      try {
        return await upsertOverturePlace(sb, place, campaignTag);
      } finally {
        done++;
        emit({ t: "progress", done, total });
      }
    },
    createServerClient,
    validateUrlSafe,
    fetchReachability: fetchReachabilityForRunner,
  };

  const result = await runImport(args, deps);
  emit({ t: "result", mode: "import", result });
}

async function main(): Promise<void> {
  loadLocalEnv();

  const mode = process.argv[2];
  const flags = process.argv.slice(3);

  try {
    if (mode === "triage") {
      await runTriageMode(flags);
    } else if (mode === "import") {
      await runImportMode(flags);
    } else {
      emit({ t: "error", message: `Unknown pipeline-runner mode: ${mode ?? "(none)"}` });
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof TriageArgsError || err instanceof ImportArgsError) {
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
