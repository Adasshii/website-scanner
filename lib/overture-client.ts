import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import type { OverturePlaceRow } from "@/types/scanner";

/**
 * Overture cuts a new monthly release; the S3 path segment is pinned here as
 * a documented constant Joshua bumps by hand when a new release is needed —
 * NOT auto-discovered (RESEARCH.md Open Question #3: simplest thing that
 * works; add release auto-discovery only if manually bumping this proves to
 * be a recurring friction point).
 */
export const OVERTURE_RELEASE = "2026-06-17.0";

export interface OvertureQueryParams {
  /** ISO 3166-1 alpha-2, e.g. "NL" */
  country: string;
  /** Matches addresses[1].region as Overture encodes it */
  region?: string;
  /** categories.primary (or taxonomy.primary/basic_category — detected at runtime) */
  category: string;
  limit?: number;
}

interface OvertureAddress {
  freeform?: string | null;
  region?: string | null;
  country?: string | null;
}

function overturePlacesPath(): string {
  return `s3://overturemaps-us-west-2/release/${OVERTURE_RELEASE}/theme=places/type=place/*`;
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Overture is mid-migration from `categories.primary` to
 * `taxonomy.primary`/`basic_category` (RESEARCH.md Pitfall 1) — detect at
 * runtime which field the release actually exposes rather than hardcode one.
 * A hardcoded field could silently return zero rows (or error) against a
 * release where it's already been dropped.
 */
export async function detectCategoryColumn(
  conn: DuckDBConnection,
  path: string
): Promise<string> {
  const reader = await conn.runAndReadAll(
    `DESCRIBE SELECT * FROM read_parquet('${path}') LIMIT 0`
  );
  const columns = reader
    .getRowObjectsJS()
    .map((row) => String(row.column_name));

  if (columns.includes("categories")) return "categories.primary";
  if (columns.includes("taxonomy")) return "taxonomy.primary";
  if (columns.includes("basic_category")) return "basic_category";

  throw new Error(
    `Overture release ${OVERTURE_RELEASE} exposes neither categories nor ` +
      `taxonomy/basic_category — cannot filter by category. Columns seen: ${columns.join(", ")}`
  );
}

/**
 * Queries Overture Places directly from the public S3 GeoParquet bucket via
 * DuckDB's spatial+httpfs extensions, in-process — no download, no API key
 * (RESEARCH.md Pattern 2). Rows are reduced to OverturePlaceRow before return.
 *
 * NOTE (RESEARCH.md Pattern 2 trade-off): struct-field predicates on
 * addresses[] may prune Parquet row groups less effectively than a flat
 * scalar/bbox column would. A bbox pre-filter is the documented escalation
 * only if a real run proves too slow — not built now.
 */
export async function queryOverturePlaces(
  params: OvertureQueryParams
): Promise<OverturePlaceRow[]> {
  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();

  try {
    await conn.run("INSTALL spatial");
    await conn.run("LOAD spatial");
    await conn.run("INSTALL httpfs");
    await conn.run("LOAD httpfs");
    await conn.run("SET s3_region='us-west-2'");

    const path = overturePlacesPath();
    const categoryColumn = await detectCategoryColumn(conn, path);

    const conditions = [
      `addresses[1].country = '${escapeSqlString(params.country)}'`,
      `${categoryColumn} = '${escapeSqlString(params.category)}'`,
    ];
    if (params.region) {
      conditions.push(`addresses[1].region = '${escapeSqlString(params.region)}'`);
    }
    const limitClause = params.limit
      ? `LIMIT ${Math.max(0, Math.floor(params.limit))}`
      : "";

    const sql = `
      SELECT id AS gers_id, names.primary AS name, websites, addresses,
             ${categoryColumn} AS category, confidence
      FROM read_parquet('${path}', filename=true, hive_partitioning=1)
      WHERE ${conditions.join(" AND ")}
      ${limitClause}
    `;

    const reader = await conn.runAndReadAll(sql);
    const rows = reader.getRowObjectsJS();

    return rows.map((row): OverturePlaceRow => {
      const websites = row.websites as unknown as string[] | null;
      const addresses = row.addresses as unknown as OvertureAddress[] | null;
      const address = addresses?.[0] ?? null;

      return {
        gersId: String(row.gers_id),
        name: (row.name as unknown as string | null) ?? null,
        // Overture's addresses[] is a struct list, not one formatted string —
        // `freeform` is the closest match to a street-address line.
        address: address?.freeform ?? null,
        category: (row.category as unknown as string | null) ?? null,
        region: address?.region ?? null,
        country: address?.country ?? params.country,
        // websites is an optional LIST, sparsely populated — absence is the
        // no-website path (IMP-07, RESEARCH.md Pitfall 2), not a data error.
        websiteUrl: websites && websites.length > 0 ? websites[0] : null,
        confidence: (row.confidence as unknown as number | null) ?? null,
      };
    });
  } finally {
    conn.closeSync();
    instance.closeSync();
  }
}
