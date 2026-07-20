/**
 * scripts/triage-prospects.ts — the Prospect Radar triage CLI (D-10: a plain
 * tsx-run script, off the production Vercel/Railway IP, sidestepping both
 * the Vercel function-timeout cliff and thin-cron reliability for 10-50
 * sequential fetches).
 *
 * Usage:
 *   npx tsx scripts/triage-prospects.ts [--dry-run] [--limit=N] [--cutoff=N]
 *
 * No required flags — every eligible prospect (has a domain, not yet
 * released, D-09) is triaged by default. --limit caps how many rows are
 * processed. --cutoff (0-100, default DEFAULT_CUTOFF) only affects the
 * printed "clear the cutoff" count, never the writes. --dry-run computes
 * and prints the same summary but performs zero DB writes.
 *
 * This file stays a thin orchestrator: the redirect-chain fetch lives in
 * lib/triage-fetch.ts, the pure scorer in lib/triage-scorer.ts, the
 * eligible-rows query in lib/triage-candidates.ts. Writes are always
 * `.update(...).eq("id", ...)` — the upsert method is never used (Pitfall
 * 3: prospects.country is NOT NULL with no default).
 */
import { parseArgs } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTriageCandidates, type TriageCandidate } from "@/lib/triage-candidates";
import { fetchTriageSignals } from "@/lib/triage-fetch";
import { computeTriageScore } from "@/lib/triage-scorer";
import { createServerClient } from "@/lib/supabase";
import { validateUrlSafe } from "@/lib/url-validation.server";
import { BATCH_SIZE, BATCH_DELAY_MS, DEFAULT_CUTOFF } from "@/lib/triage-constants";
import type { TriageSignals } from "@/types/triage";

const USAGE = "Usage: npx tsx scripts/triage-prospects.ts [--dry-run] [--limit=N] [--cutoff=N]";

export class TriageArgsError extends Error {}

export interface TriageArgs {
  dryRun: boolean;
  limit?: number;
  cutoff: number;
}

/**
 * Parses and validates CLI args. `--limit` (positive number) and
 * `--cutoff` (finite, 0-100) are checked synchronously, before any
 * DB/network call — an invalid flag throws with zero side effects.
 */
export function parseTriageArgs(argv: string[]): TriageArgs {
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        "dry-run": { type: "boolean", default: false },
        limit: { type: "string" },
        cutoff: { type: "string" },
      },
      strict: true,
    });

    let limit: number | undefined;
    if (values.limit !== undefined) {
      const parsedLimit = Number(values.limit);
      if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
        throw new TriageArgsError(
          `${USAGE}\n\n--limit must be a positive number, got: ${values.limit}`
        );
      }
      limit = Math.floor(parsedLimit);
    }

    let cutoff = DEFAULT_CUTOFF;
    if (values.cutoff !== undefined) {
      const parsedCutoff = Number(values.cutoff);
      if (!Number.isFinite(parsedCutoff) || parsedCutoff < 0 || parsedCutoff > 100) {
        throw new TriageArgsError(
          `${USAGE}\n\n--cutoff must be a finite number between 0 and 100, got: ${values.cutoff}`
        );
      }
      cutoff = parsedCutoff;
    }

    return {
      dryRun: Boolean(values["dry-run"]),
      limit,
      cutoff,
    };
  } catch (err) {
    if (err instanceof TriageArgsError) throw err;
    throw new TriageArgsError(`${USAGE}\n\n${(err as Error).message}`);
  }
}

// ── Dependency seams (testable without live network/Supabase) ─────────────

export interface TriageDeps {
  getTriageCandidates: (
    sb: SupabaseClient,
    opts: { limit?: number }
  ) => Promise<TriageCandidate[]>;
  validateUrlSafe: (url: string) => Promise<string>;
  fetchTriageSignals: (
    url: string,
    deps: { validateUrlSafe: (url: string) => Promise<string> }
  ) => Promise<TriageSignals>;
  computeTriageScore: typeof computeTriageScore;
  createServerClient: () => SupabaseClient;
}

const defaultDeps: TriageDeps = {
  getTriageCandidates,
  validateUrlSafe,
  fetchTriageSignals,
  computeTriageScore,
  createServerClient,
};

// ── Orchestration ───────────────────────────────────────────────────────────

export interface TriageResult {
  totalRows: number;
  triaged: number;
  clearsCutoff: number;
  unreachable: number;
  skipped: number;
  dryRun: boolean;
}

export async function runTriage(
  args: TriageArgs,
  deps: TriageDeps = defaultDeps
): Promise<TriageResult> {
  // A read is always needed to know what's eligible, dry-run or not — only
  // the per-prospect .update() write is skipped under --dry-run.
  const sb = deps.createServerClient();
  const candidates = await deps.getTriageCandidates(sb, { limit: args.limit });

  let triaged = 0;
  let clearsCutoff = 0;
  let unreachable = 0;
  let skipped = 0;

  // Bounded-concurrency batch loop with an inter-batch delay (RESEARCH.md
  // Pattern 7 / D-12 good-citizen manners) — BATCH_SIZE in flight at once,
  // a BATCH_DELAY_MS gap between waves.
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (prospect) => {
        try {
          // Per-prospect try/catch (import-prospects.ts pattern): one bad
          // prospect is logged and skipped, never aborts the whole run.
          if (!prospect.website_url) {
            throw new Error("missing website_url");
          }
          const signals = await deps.fetchTriageSignals(prospect.website_url, {
            validateUrlSafe: deps.validateUrlSafe,
          });
          const score = deps.computeTriageScore(signals);

          triaged++;
          if (!score.reachable) unreachable++;
          if (score.gated || score.score <= args.cutoff) clearsCutoff++;

          if (!args.dryRun) {
            // The upsert method is never used here — prospects.country is
            // NOT NULL with no default (Pitfall 3); update the two triage
            // columns only.
            const { error } = await sb
              .from("prospects")
              .update({ triage_score: score, triage_checked_at: new Date().toISOString() })
              .eq("id", prospect.id);
            if (error) throw error;
          }
        } catch (err) {
          skipped++;
          console.error(
            `[triage-prospects] skipped domain=${prospect.domain}: ${(err as Error).message}`
          );
        }
      })
    );
    if (i + BATCH_SIZE < candidates.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  console.log(
    `[triage-prospects] ${triaged} triaged, ${clearsCutoff} clear the cutoff, ${unreachable} unreachable` +
      (skipped > 0 ? `, ${skipped} skipped` : "") +
      (args.dryRun ? " — dry-run, zero writes performed." : "")
  );

  return {
    totalRows: candidates.length,
    triaged,
    clearsCutoff,
    unreachable,
    skipped,
    dryRun: args.dryRun,
  };
}

/**
 * Parses argv then runs triage — the exact sequence main() uses. Exposed
 * separately so tests can assert an invalid-args run never reaches
 * createServerClient/getTriageCandidates (parseTriageArgs throws
 * synchronously, before runTriage is ever called).
 */
export async function runCli(
  argv: string[],
  deps: TriageDeps = defaultDeps
): Promise<TriageResult> {
  const args = parseTriageArgs(argv);
  return runTriage(args, deps);
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────

function loadLocalEnv(): void {
  // Native env-file loader (Node 20.6+, no root `dotenv` dependency needed
  // for this one local script — never hardcode/log the key).
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // Missing file, or already-exported env vars are sufficient — ignore.
    }
  }
}

async function main(): Promise<void> {
  loadLocalEnv();

  try {
    await runCli(process.argv.slice(2));
  } catch (err) {
    if (err instanceof TriageArgsError) {
      console.error(err.message);
      process.exit(1);
      return;
    }
    throw err;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
