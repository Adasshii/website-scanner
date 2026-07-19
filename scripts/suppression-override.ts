/**
 * scripts/suppression-override.ts — the logged, lift-only escape hatch for
 * suppression-list entries (D-08/D-09, CMP-06). This is the ONLY code path
 * that can re-enable contact for a suppressed address: it always lifts the
 * active row (lifted_at + lifted_by_reason), never deletes it, and requires
 * an explicit --email + --reason for exactly one address per run — no
 * wildcard/bulk mode (T-02-20).
 *
 * Usage:
 *   npx tsx scripts/suppression-override.ts --email=<address> --reason="<why>"
 */
import { parseArgs } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { liftSuppression } from "@/lib/suppression";
import { createServerClient } from "@/lib/supabase";

const USAGE =
  'Usage: npx tsx scripts/suppression-override.ts --email=<address> --reason="<why>"';

export class OverrideArgsError extends Error {}

export interface OverrideArgs {
  email: string;
  reason: string;
}

/**
 * Parses and validates CLI args. Both --email and --reason are REQUIRED
 * (D-08) and checked here, synchronously, before anything else runs — a
 * missing flag throws with zero side effects (no Supabase client, no write).
 * There is deliberately no bulk/wildcard flag: this script accepts exactly
 * one address per run (T-02-20).
 */
export function parseOverrideArgs(argv: string[]): OverrideArgs {
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        email: { type: "string" },
        reason: { type: "string" },
      },
      strict: true,
    });

    const missing: string[] = [];
    if (!values.email) missing.push("--email");
    if (!values.reason) missing.push("--reason");
    if (missing.length > 0) {
      throw new OverrideArgsError(
        `${USAGE}\n\nMissing required flag(s): ${missing.join(", ")}`
      );
    }

    return {
      email: values.email as string,
      reason: values.reason as string,
    };
  } catch (err) {
    if (err instanceof OverrideArgsError) throw err;
    throw new OverrideArgsError(`${USAGE}\n\n${(err as Error).message}`);
  }
}

// ── Dependency seam (testable without a live Supabase) ─────────────────────

export interface OverrideDeps {
  createServerClient: () => SupabaseClient;
  liftSuppression: (
    sb: SupabaseClient,
    params: { email: string; reason: string }
  ) => Promise<{ lifted: boolean }>;
}

const defaultDeps: OverrideDeps = {
  createServerClient,
  liftSuppression,
};

export interface OverrideResult {
  email: string;
  reason: string;
  lifted: boolean;
}

/**
 * Lifts the active suppression row for one address with an explicit logged
 * reason. Sets lifted_at/lifted_by_reason on the existing row — the row is
 * never removed (D-09), so the audit trail survives every override. Prints
 * exactly what happened: the email, the reason, and whether an active row
 * existed to lift.
 */
export async function runOverride(
  args: OverrideArgs,
  deps: OverrideDeps = defaultDeps
): Promise<OverrideResult> {
  const sb = deps.createServerClient();
  const { lifted } = await deps.liftSuppression(sb, {
    email: args.email,
    reason: args.reason,
  });

  if (lifted) {
    console.log(
      `[suppression-override] lifted suppression for ${args.email} — reason: "${args.reason}"`
    );
  } else {
    console.log(
      `[suppression-override] no active suppression found for ${args.email} — nothing to lift`
    );
  }

  return { email: args.email, reason: args.reason, lifted };
}

/**
 * Parses argv then runs the override — the exact sequence main() uses.
 * Exposed separately so tests can assert an invalid-args run never reaches
 * createServerClient/liftSuppression (parseOverrideArgs throws synchronously,
 * before runOverride is ever called).
 */
export async function runCli(
  argv: string[],
  deps: OverrideDeps = defaultDeps
): Promise<OverrideResult> {
  const args = parseOverrideArgs(argv);
  return runOverride(args, deps);
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
    if (err instanceof OverrideArgsError) {
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
