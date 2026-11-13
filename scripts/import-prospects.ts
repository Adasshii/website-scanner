/**
 * scripts/import-prospects.ts — the Prospect Radar importer (D-09: a plain
 * tsx-run script, NOT a Vercel route — bulk GeoParquet scans are the wrong
 * shape for a request/response function).
 *
 * Usage:
 *   npx tsx scripts/import-prospects.ts --country=NL --region=<region|random> --category=<category|random> [--dry-run] [--limit=N] [--campaign-tag=<tag>]
 *
 * --country, --region, --category are all REQUIRED (D-10) and are validated
 * BEFORE any Overture query or DB write. `random` is accepted as the value of
 * --region and --category and resolves to an entry of the niche profile's own
 * list (lib/niche-profile) before validation returns. --dry-run performs zero writes and
 * prints a random 20-30 row sample with a reachability signal that is always
 * routed through validateUrlSafe() (D-11, SSRF-safe — Pitfall 3 / T-01-06).
 * --limit caps the number of rows processed/written on a real run.
 *
 * This file stays a thin orchestrator: identity/dedupe logic lives in
 * lib/prospect-upsert.ts, the Overture query lives in lib/overture-client.ts.
 */
import { parseArgs } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { queryOverturePlaces, type OvertureQueryParams } from "@/lib/overture-client";
import { INSTALLERS_PROFILE } from "@/lib/niche-profile";
import { upsertOverturePlace } from "@/lib/prospect-upsert";
import { refreshScoreability, type ScoreabilityRefreshResult } from "@/lib/scoreability-refresh";
import { createServerClient } from "@/lib/supabase";
import { validateUrlSafe } from "@/lib/url-validation.server";
import { isAggregatorDomain, normalizeDomain } from "@/lib/domain-normalize";
import type { OverturePlaceRow } from "@/types/scanner";

const USAGE =
  "Usage: npx tsx scripts/import-prospects.ts --country=<ISO2> --region=<region|random> " +
  "--category=<category|random> [--dry-run] [--limit=N] [--campaign-tag=<tag>]\n" +
  "  random picks one entry from the niche profile's own list (lib/niche-profile).";

/** The one flag value that means "sample from the profile" instead of naming a value. */
const RANDOM_VALUE = "random";

export class ImportArgsError extends Error {}

export interface ImportArgs {
  country: string;
  region: string;
  category: string;
  dryRun: boolean;
  limit?: number;
  campaignTag: string | null;
}

/**
 * Picks one entry. `random()` is expected in [0, 1); a source that returns
 * exactly 1 is clamped to the last entry rather than indexing past the end.
 */
function pickFrom(list: readonly string[], random: () => number): string {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

/**
 * Parses and validates CLI args. All three filters are REQUIRED (D-10) and
 * checked here, synchronously, before anything else runs — a missing filter
 * throws with zero side effects (no Overture query, no Supabase client).
 *
 * `random` is a VALUE for --region and --category, never a way to omit them: it
 * is resolved to a concrete entry from the installers profile's own lists
 * BEFORE this function returns (D-9-11, NIC-04), so runImport, the Overture
 * query, resolveBbox and the province containment check all see an ordinary
 * explicit value. The region is drawn first, then the category. `random` is the
 * injectable source, so a test can assert an exact result. Explicit values never
 * draw from it.
 */
export function parseImportArgs(argv: string[], random: () => number = Math.random): ImportArgs {
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        country: { type: "string" },
        region: { type: "string" },
        category: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        limit: { type: "string" },
        "campaign-tag": { type: "string" },
      },
      strict: true,
    });

    const missing: string[] = [];
    if (!values.country) missing.push("--country");
    if (!values.region) missing.push("--region");
    if (!values.category) missing.push("--category");
    if (missing.length > 0) {
      throw new ImportArgsError(
        `${USAGE}\n\nMissing required flag(s): ${missing.join(", ")}`
      );
    }

    let limit: number | undefined;
    if (values.limit !== undefined) {
      const parsedLimit = Number(values.limit);
      if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
        throw new ImportArgsError(
          `${USAGE}\n\n--limit must be a positive number, got: ${values.limit}`
        );
      }
      limit = Math.floor(parsedLimit);
    }

    const country = values.country as string;
    let region = values.region as string;
    let category = values.category as string;

    if (region === RANDOM_VALUE || category === RANDOM_VALUE) {
      // The profile's lists describe its own country only. A random region for
      // another country would fail later in resolveBbox, so refuse here.
      if (region === RANDOM_VALUE && country.toUpperCase() !== INSTALLERS_PROFILE.country) {
        throw new ImportArgsError(
          `${USAGE}\n\n--region=random samples ${INSTALLERS_PROFILE.country} regions only, got --country=${country}`
        );
      }
      if (region === RANDOM_VALUE) region = pickFrom(INSTALLERS_PROFILE.regions, random);
      if (category === RANDOM_VALUE) category = pickFrom(INSTALLERS_PROFILE.overtureCategories, random);
    }

    return {
      country,
      region,
      category,
      dryRun: Boolean(values["dry-run"]),
      limit,
      campaignTag: (values["campaign-tag"] as string | undefined) ?? null,
    };
  } catch (err) {
    if (err instanceof ImportArgsError) throw err;
    throw new ImportArgsError(`${USAGE}\n\n${(err as Error).message}`);
  }
}

// ── Dependency seams (testable without live Overture/DuckDB/Supabase) ─────

export interface ImportDeps {
  queryOverturePlaces: (params: OvertureQueryParams) => Promise<OverturePlaceRow[]>;
  upsertOverturePlace: (
    sb: SupabaseClient,
    place: OverturePlaceRow,
    campaignTag: string | null
  ) => Promise<{ prospectId: string; created: boolean }>;
  createServerClient: () => SupabaseClient;
  validateUrlSafe: (input: string) => Promise<string>;
  fetchReachability: (url: string) => Promise<{ ok: boolean; status: number }>;
  /** End-of-run marker refresh (ENG-06, D-9-17). Never called on a dry run. */
  refreshScoreability: (sb: SupabaseClient) => Promise<ScoreabilityRefreshResult>;
  /** Random source for --region=random and --category=random. Defaults to Math.random. */
  random?: () => number;
}

/**
 * The only HEAD/GET in this file. Only ever invoked with a URL that has
 * already passed validateUrlSafe() below — never called directly on raw
 * Overture-sourced input (Pitfall 3 / T-01-06).
 */
async function defaultFetchReachability(
  url: string
): Promise<{ ok: boolean; status: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    return { ok: res.ok, status: res.status };
  } finally {
    clearTimeout(timeoutId);
  }
}

const defaultDeps: ImportDeps = {
  queryOverturePlaces,
  upsertOverturePlace,
  createServerClient,
  validateUrlSafe,
  fetchReachability: defaultFetchReachability,
  refreshScoreability,
  random: Math.random,
};

// ── Dry-run reachability + sample reporting ────────────────────────────────

type ReachabilitySignal = "no-website" | "reachable" | "unreachable" | "blocked" | "aggregator";

async function checkReachability(
  url: string | null,
  deps: ImportDeps
): Promise<ReachabilitySignal> {
  if (!url) return "no-website";
  // Aggregator/directory links (tripadvisor.com, facebook.com, ...) route to
  // the no-website prospect path (D-11 audit fix) — labeled distinctly here
  // rather than fetched, since it is never the business's own site.
  if (isAggregatorDomain(url)) return "aggregator";

  let validated: string;
  try {
    // SSRF-safe gate (D-11, Pitfall 3, T-01-06) — DNS resolution + private-IP
    // block happens here, BEFORE any HEAD/GET is attempted. A URL that fails
    // this check is reported blocked and never fetched.
    validated = await deps.validateUrlSafe(url);
  } catch {
    return "blocked";
  }

  try {
    const res = await deps.fetchReachability(validated);
    return res.ok ? "reachable" : "unreachable";
  } catch {
    return "unreachable";
  }
}

export function pickRandomSample<T>(rows: T[], min = 20, max = 30): T[] {
  if (rows.length <= min) return [...rows];
  const size = Math.min(max, rows.length);
  return [...rows].sort(() => Math.random() - 0.5).slice(0, size);
}

function formatSampleLine(
  row: OverturePlaceRow,
  domain: string | null,
  reachability: ReachabilitySignal
): string {
  return `  - ${row.name ?? "(unnamed)"} | domain=${domain ?? "none"} | category=${row.category ?? "none"} | lon=${row.lon ?? "none"} lat=${row.lat ?? "none"} | ${reachability}`;
}

// ── Orchestration ───────────────────────────────────────────────────────────

export interface ImportResult {
  totalRows: number;
  hasDomainCount: number;
  noWebsiteCount: number;
  dryRun: boolean;
  created: number;
  collapsed: number;
  skipped: number;
}

export async function runImport(
  args: ImportArgs,
  deps: ImportDeps = defaultDeps
): Promise<ImportResult> {
  const queried = await deps.queryOverturePlaces({
    country: args.country,
    region: args.region,
    category: args.category,
    limit: args.limit,
  });
  // --limit caps rows processed/written regardless of whether the query
  // itself already respected it (defense in depth, and required so a stub
  // queryOverturePlaces in tests is still capped by the CLI's own logic).
  const rows = args.limit ? queried.slice(0, args.limit) : queried;

  // Aggregator rows resolve to no_website prospects (isAggregatorDomain, D-11
  // fix) so they count toward noWebsiteCount here, matching upsertOverturePlace.
  const hasDomainCount = rows.filter(
    (row) =>
      row.websiteUrl && normalizeDomain(row.websiteUrl) && !isAggregatorDomain(row.websiteUrl)
  ).length;
  const noWebsiteCount = rows.length - hasDomainCount;

  console.log(
    `[import-prospects] ${args.country}/${args.region}/${args.category}: ${rows.length} rows ` +
      `(${hasDomainCount} with domain, ${noWebsiteCount} no-website)`
  );

  if (args.dryRun) {
    const sample = pickRandomSample(rows);
    console.log(`[import-prospects] dry-run sample (${sample.length} rows):`);
    for (const row of sample) {
      const domain = row.websiteUrl ? normalizeDomain(row.websiteUrl) : null;
      const reachability = await checkReachability(row.websiteUrl, deps);
      console.log(formatSampleLine(row, domain, reachability));
    }
    console.log("[import-prospects] dry-run complete — zero writes performed.");

    return {
      totalRows: rows.length,
      hasDomainCount,
      noWebsiteCount,
      dryRun: true,
      created: 0,
      collapsed: 0,
      skipped: 0,
    };
  }

  const sb = deps.createServerClient();
  let created = 0;
  let collapsed = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      // Per-row try/catch (T-01-07): one malformed Overture row is logged
      // and skipped, never aborts the whole batch (IMP-07).
      const result = await deps.upsertOverturePlace(sb, row, args.campaignTag);
      if (result.created) created++;
      else collapsed++;
    } catch (err) {
      skipped++;
      console.error(
        `[import-prospects] skipped row gersId=${row.gersId}: ${(err as Error).message}`
      );
    }
  }

  console.log(
    `[import-prospects] done — created=${created} collapsed=${collapsed} skipped=${skipped}`
  );

  // D-9-17: a newly imported prospect carries a current not-scoreable reason
  // without a separate manual step. Runs once, after every write, and logs its
  // own per-reason count.
  await deps.refreshScoreability(sb);

  return {
    totalRows: rows.length,
    hasDomainCount,
    noWebsiteCount,
    dryRun: false,
    created,
    collapsed,
    skipped,
  };
}

/**
 * Parses argv then runs the import — the exact sequence main() uses. Exposed
 * separately so tests can assert that an invalid-args run never reaches
 * queryOverturePlaces/createServerClient/upsertOverturePlace (parseImportArgs
 * throws synchronously, before runImport is ever called).
 */
export async function runCli(
  argv: string[],
  deps: ImportDeps = defaultDeps
): Promise<ImportResult> {
  const args = parseImportArgs(argv, deps.random);
  return runImport(args, deps);
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────

function loadLocalEnv(): void {
  // Native env-file loader (Node 20.6+, no root `dotenv` dependency needed
  // for this one local script — T-01-08: never hardcode/log the key).
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
    if (err instanceof ImportArgsError) {
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
