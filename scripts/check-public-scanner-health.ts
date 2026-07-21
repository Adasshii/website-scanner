/**
 * scripts/check-public-scanner-health.ts — the SCAN-06 measurement (plan
 * 04-06): makes "the public scanner holds its normal success rate" a
 * number, not a feeling.
 *
 * Usage:
 *   npx tsx scripts/check-public-scanner-health.ts [--save <label> | --compare <label>]
 *
 * With no flags: prints the current reading and exits 0.
 * --save <label>: computes the current reading, prints it, and writes it to
 *   .planning/phases/04-bulk-scan-queue/scan-health/<label>.json — the
 *   baseline capture, taken before a bulk run starts.
 * --compare <label>: recomputes now, prints the saved reading beside the
 *   current one and the delta in percentage points, and exits 0 when the
 *   current rate is no more than PUBLIC_SCANNER_TOLERANCE_PP percentage
 *   points below the saved one (a rise always passes), or exits 1 when it
 *   dropped further — the after-a-bulk-run check.
 *
 * The reading is always restricted to `scans.prospect_id is null` in both
 * the numerator and the denominator — that's what keeps bulk-scan failures
 * out of the metric being watched. The metric IS the public scanner's own
 * rate, never a blend (D-07 human-in-the-loop philosophy: every number is
 * printed, not just the verdict, so Joshua can eyeball the raw counts).
 */
import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase";
import {
  PUBLIC_SCANNER_BASELINE_DAYS,
  PUBLIC_SCANNER_TOLERANCE_PP,
} from "@/lib/bulk-scan-constants";

const USAGE =
  "Usage: npx tsx scripts/check-public-scanner-health.ts [--save <label> | --compare <label>]";

const SCAN_HEALTH_DIR = path.join(
  ".planning",
  "phases",
  "04-bulk-scan-queue",
  "scan-health"
);

export class ScannerHealthArgsError extends Error {}

export interface ScannerHealthArgs {
  mode: "default" | "save" | "compare";
  label?: string;
}

/** Parses and validates CLI args, synchronously, before any DB call. */
export function parseScannerHealthArgs(argv: string[]): ScannerHealthArgs {
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        save: { type: "string" },
        compare: { type: "string" },
      },
      strict: true,
    });

    if (values.save && values.compare) {
      throw new ScannerHealthArgsError(
        `${USAGE}\n\n--save and --compare cannot be combined.`
      );
    }

    if (values.compare !== undefined) return { mode: "compare", label: values.compare };
    if (values.save !== undefined) return { mode: "save", label: values.save };
    return { mode: "default" };
  } catch (err) {
    if (err instanceof ScannerHealthArgsError) throw err;
    throw new ScannerHealthArgsError(`${USAGE}\n\n${(err as Error).message}`);
  }
}

export interface HealthReading {
  rate: number; // percentage, rounded to one decimal
  completedCount: number;
  totalCount: number;
  windowStart: string; // ISO
  windowEnd: string; // ISO
  capturedAt: string; // ISO
}

function round1(value: number): number {
  // Normalizes -0 to 0 so a zero delta always prints "0.0", never "-0.0".
  const rounded = Math.round(value * 10) / 10;
  return rounded === 0 ? 0 : rounded;
}

/**
 * The public scanner's rolling success rate over the trailing
 * PUBLIC_SCANNER_BASELINE_DAYS window: completed / total, both counts
 * restricted to prospect_id is null so bulk scans never contaminate the
 * number being watched.
 */
export async function computeHealthReading(
  sb: SupabaseClient,
  now: Date = new Date()
): Promise<HealthReading> {
  const windowEnd = now;
  const windowStart = new Date(
    now.getTime() - PUBLIC_SCANNER_BASELINE_DAYS * 24 * 60 * 60 * 1000
  );

  const { count: totalCount, error: totalError } = await sb
    .from("scans")
    .select("*", { count: "exact", head: true })
    .is("prospect_id", null)
    .gte("created_at", windowStart.toISOString())
    .lte("created_at", windowEnd.toISOString());
  if (totalError) throw totalError;

  const { count: completedCount, error: completedError } = await sb
    .from("scans")
    .select("*", { count: "exact", head: true })
    .is("prospect_id", null)
    .eq("status", "completed")
    .gte("created_at", windowStart.toISOString())
    .lte("created_at", windowEnd.toISOString());
  if (completedError) throw completedError;

  const total = totalCount ?? 0;
  const completed = completedCount ?? 0;
  const rate = total > 0 ? round1((completed / total) * 100) : 0;

  return {
    rate,
    completedCount: completed,
    totalCount: total,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    capturedAt: now.toISOString(),
  };
}

function printReading(label: string, reading: HealthReading): void {
  console.log(
    `[scanner-health] ${label}: ${reading.rate.toFixed(1)}% (${reading.completedCount}/${reading.totalCount} completed)`
  );
  console.log(
    `[scanner-health] ${label} window: ${reading.windowStart} -> ${reading.windowEnd} (captured ${reading.capturedAt})`
  );
}

async function saveReading(label: string, reading: HealthReading): Promise<string> {
  const dir = path.join(process.cwd(), SCAN_HEALTH_DIR);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${label}.json`);
  await writeFile(file, `${JSON.stringify(reading, null, 2)}\n`);
  return file;
}

async function loadReading(label: string): Promise<HealthReading> {
  const file = path.join(process.cwd(), SCAN_HEALTH_DIR, `${label}.json`);
  const raw = await readFile(file, "utf-8");
  return JSON.parse(raw) as HealthReading;
}

// ── Dependency seam (testable without a live Supabase connection) ─────────

export interface ScannerHealthDeps {
  createServerClient: () => SupabaseClient;
  computeHealthReading: typeof computeHealthReading;
}

const defaultDeps: ScannerHealthDeps = {
  createServerClient,
  computeHealthReading,
};

/** Exit code this run should use — kept separate from process.exit for tests. */
export async function runScannerHealth(
  args: ScannerHealthArgs,
  deps: ScannerHealthDeps = defaultDeps
): Promise<number> {
  const sb = deps.createServerClient();

  if (args.mode === "compare") {
    const label = args.label!;
    const saved = await loadReading(label);
    const current = await deps.computeHealthReading(sb);
    printReading(`saved (${label})`, saved);
    printReading("current", current);
    const deltaPP = round1(current.rate - saved.rate);
    console.log(
      `[scanner-health] delta: ${deltaPP.toFixed(1)} percentage points (tolerance: ${PUBLIC_SCANNER_TOLERANCE_PP}pp)`
    );
    const pass = deltaPP >= -PUBLIC_SCANNER_TOLERANCE_PP;
    console.log(pass ? "[scanner-health] PASS" : "[scanner-health] FAIL — dropped beyond tolerance");
    return pass ? 0 : 1;
  }

  const current = await deps.computeHealthReading(sb);
  printReading("current", current);

  if (args.mode === "save") {
    const file = await saveReading(args.label!, current);
    console.log(`[scanner-health] saved to ${file}`);
  }

  return 0;
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────

function loadLocalEnv(): void {
  // Native env-file loader (Node 20.6+) — never hardcode/log the key.
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

  let args: ScannerHealthArgs;
  try {
    args = parseScannerHealthArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof ScannerHealthArgsError) {
      console.error(err.message);
      process.exit(1);
      return;
    }
    throw err;
  }

  const exitCode = await runScannerHealth(args);
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
