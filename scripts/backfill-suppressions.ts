/**
 * scripts/backfill-suppressions.ts — D-06 one-time backfill: seeds
 * `suppressions` from every historical `email_events` row already marked
 * `bounced`/`complained`, regardless of `email_type` (Pitfall 5), so anyone
 * who already signalled "stop" on the shared Resend account is protected
 * from day one ("the spine starts complete, not empty").
 *
 * Usage:
 *   npx tsx scripts/backfill-suppressions.ts [--dry-run]
 *
 * Idempotent: writeSuppression() is a no-op for an email that already has
 * an active suppression row, so re-running this script is always safe.
 * --dry-run scans and reports counts without writing anything.
 */
import { parseArgs } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase";
import { normalizeDomain } from "@/lib/domain-normalize";
import { writeSuppression, type SuppressionReason } from "@/lib/suppression";

const USAGE = "Usage: npx tsx scripts/backfill-suppressions.ts [--dry-run]";

export class BackfillArgsError extends Error {}

export interface BackfillArgs {
  dryRun: boolean;
}

export function parseBackfillArgs(argv: string[]): BackfillArgs {
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        "dry-run": { type: "boolean", default: false },
      },
      strict: true,
    });
    return { dryRun: Boolean(values["dry-run"]) };
  } catch (err) {
    throw new BackfillArgsError(`${USAGE}\n\n${(err as Error).message}`);
  }
}

// ── Dependency seam (testable without a live Supabase) ────────────────────

export interface BackfillDeps {
  createServerClient: () => SupabaseClient;
  writeSuppression: typeof writeSuppression;
}

const defaultDeps: BackfillDeps = {
  createServerClient,
  writeSuppression,
};

// ── Orchestration ───────────────────────────────────────────────────────────

export interface BackfillResult {
  rowsScanned: number;
  distinctEmails: number;
  created: number;
  alreadyActive: number;
  dryRun: boolean;
}

export async function runBackfill(
  deps: BackfillDeps,
  args: BackfillArgs
): Promise<BackfillResult> {
  const sb = deps.createServerClient();

  // D-06/Pitfall 5: every bounced/complained row, no email_type filter —
  // outreach didn't exist yet, but past "stop" signals still count.
  const { data, error } = await sb
    .from("email_events")
    .select("email, status")
    .in("status", ["bounced", "complained"]);
  if (error) throw error;

  const rows = (data ?? []) as { email: string; status: string }[];

  // One row per distinct (normalised) email — first bounced/complained
  // status seen wins the reason; writeSuppression's own idempotency makes
  // the exact ordering harmless either way.
  const distinct = new Map<string, SuppressionReason>();
  for (const row of rows) {
    const normalizedEmail = row.email.trim().toLowerCase();
    if (!distinct.has(normalizedEmail)) {
      distinct.set(normalizedEmail, row.status as SuppressionReason);
    }
  }

  let created = 0;
  let alreadyActive = 0;

  if (!args.dryRun) {
    for (const email of Array.from(distinct.keys())) {
      const reason = distinct.get(email)!;
      const domain = normalizeDomain(email);
      const result = await deps.writeSuppression(sb, {
        email,
        domain,
        reason,
        source: "backfill",
      });
      if (result.created) created++;
      else alreadyActive++;
    }
  }

  console.log(
    `[backfill-suppressions] scanned=${rows.length} distinctEmails=${distinct.size} ` +
      `created=${created} alreadyActive=${alreadyActive}` +
      (args.dryRun ? " (dry-run — zero writes performed)" : "")
  );

  return {
    rowsScanned: rows.length,
    distinctEmails: distinct.size,
    created,
    alreadyActive,
    dryRun: args.dryRun,
  };
}

/**
 * Parses argv then runs the backfill — exposed separately so tests can
 * assert CLI arg parsing without touching Supabase.
 */
export async function runCli(
  argv: string[],
  deps: BackfillDeps = defaultDeps
): Promise<BackfillResult> {
  const args = parseBackfillArgs(argv);
  return runBackfill(deps, args);
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────

function loadLocalEnv(): void {
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
    if (err instanceof BackfillArgsError) {
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
