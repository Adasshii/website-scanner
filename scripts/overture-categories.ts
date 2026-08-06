/**
 * scripts/overture-categories.ts — generates/updates the category
 * vocabulary cache (data/overture-categories.json) for one country+region
 * pair per run (Task 1, 260806-p6f; D-02). A plain tsx-run script, same
 * shape as import-prospects.ts and triage-prospects.ts — this is an
 * occasional refresh, not request/response work.
 *
 * Usage:
 *   npx tsx scripts/overture-categories.ts --country=NL --region=noord-holland
 *   npm run overture-categories -- --country NL --region noord-holland
 *
 * Writes ONLY data/overture-categories.json. It never touches Supabase,
 * never writes to `prospects`, and imports nothing from the outreach,
 * send-gate, or scan-queue modules. Sequential runs are additive: each run
 * reads the existing file, merges in the queried region via
 * mergeCategoryCache(), and writes the result back.
 */
import { parseArgs } from "node:util";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { resolveBbox } from "@/lib/overture-bboxes";
import { detectCategoryColumn, overturePlacesPath } from "@/lib/overture-client";
import {
  CATEGORY_CACHE_FILE,
  cacheKey,
  mergeCategoryCache,
  type CategoryCache,
  type CategoryCount,
} from "@/lib/overture-categories";

const USAGE =
  "Usage: npx tsx scripts/overture-categories.ts --country=<ISO2> --region=<region>";

function parseGeneratorArgs(argv: string[]): { country: string; region: string } {
  const { values } = parseArgs({
    args: argv,
    options: {
      country: { type: "string" },
      region: { type: "string" },
    },
    strict: true,
  });

  const missing: string[] = [];
  if (!values.country) missing.push("--country");
  if (!values.region) missing.push("--region");
  if (missing.length > 0) {
    console.error(`${USAGE}\n\nMissing required flag(s): ${missing.join(", ")}`);
    process.exit(1);
  }

  return { country: values.country as string, region: values.region as string };
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function readCache(): CategoryCache {
  const filePath = path.join(process.cwd(), CATEGORY_CACHE_FILE);
  if (!existsSync(filePath)) return {};
  return JSON.parse(readFileSync(filePath, "utf-8")) as CategoryCache;
}

function writeCache(cache: CategoryCache): void {
  const filePath = path.join(process.cwd(), CATEGORY_CACHE_FILE);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(cache, null, 2)}\n`);
}

async function main(): Promise<void> {
  const { country, region } = parseGeneratorArgs(process.argv.slice(2));

  // resolveBbox fails fast with the known-region list on an unknown region —
  // reused rather than reimplemented (D-02).
  const [minLon, minLat, maxLon, maxLat] = resolveBbox(country, region);
  const iso2 = country.toUpperCase();

  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();

  try {
    // Deliberately SKIP the spatial extension and the ST_Within province
    // containment check here — for a vocabulary LISTING a rectangular bbox
    // is the right scope (D-02) and is far faster than the exact polygon
    // join queryOverturePlaces() runs. This omission is intentional and is
    // NOT safe to copy into the importer (lib/overture-client.ts), whose
    // province boundary decides which rows actually get written to
    // `prospects` and is load-bearing there.
    await conn.run("INSTALL httpfs");
    await conn.run("LOAD httpfs");
    await conn.run("SET s3_region='us-west-2'");

    const placesPath = overturePlacesPath();
    const categoryColumn = await detectCategoryColumn(conn, placesPath);

    const sql = `
      SELECT place.${categoryColumn} AS category,
             count(*) AS n,
             count(*) FILTER (WHERE place.websites IS NOT NULL) AS with_site
      FROM read_parquet('${placesPath}', filename=true, hive_partitioning=1) AS place
      WHERE place.addresses[1].country = '${escapeSqlString(iso2)}'
        AND place.bbox.xmin > ${minLon}
        AND place.bbox.xmax < ${maxLon}
        AND place.bbox.ymin > ${minLat}
        AND place.bbox.ymax < ${maxLat}
        AND place.${categoryColumn} IS NOT NULL
      GROUP BY 1
      ORDER BY n DESC
    `;

    const reader = await conn.runAndReadAll(sql);
    const rows = reader.getRowObjectsJS();

    // DuckDB returns count(*) as BIGINT, which getRowObjectsJS() surfaces as
    // a JS bigint — JSON.stringify throws on a bigint, so both counts are
    // coerced to Number before they reach the cache.
    const counts: CategoryCount[] = rows.map((row) => ({
      category: String(row.category),
      count: Number(row.n),
      withSite: Number(row.with_site),
    }));

    const key = cacheKey(country, region);
    const existing = readCache();
    const merged = mergeCategoryCache(existing, key, counts);
    writeCache(merged);

    const kept = merged[key];
    const top3 = kept
      .slice(0, 3)
      .map((r) => `${r.category} (${r.withSite} with a website)`)
      .join(", ");
    console.log(
      `[overture-categories] ${key}: kept ${kept.length} categories. Top 3: ${top3 || "(none)"}`
    );
  } finally {
    conn.closeSync();
    instance.closeSync();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
