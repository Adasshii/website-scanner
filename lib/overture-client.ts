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
  /**
   * A known region name (e.g. "Noord-Holland") resolved to a bbox via
   * resolveBbox() — NOT matched against addresses[1].region, which is NULL
   * on every sampled NL row (see REGION_BBOXES doc comment).
   */
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

/** [minLon, minLat, maxLon, maxLat] */
export type Bbox = readonly [number, number, number, number];

/**
 * Whole-country bboxes — used as the region fallback and as the outer bound
 * when no --region is given. Add countries here as needed; this is a plain
 * data table, never hardcoded query behavior (D-12).
 */
export const COUNTRY_BBOXES: Record<string, Bbox> = {
  NL: [3.31, 50.75, 7.23, 53.7],
};

/**
 * Region-level bboxes, keyed "<ISO2>:<region-slug>".
 *
 * Escalation applied (RESEARCH.md Pattern 2 trade-off, pre-authorized): a
 * diagnostic probe against a real bbox WHERE clause confirmed
 * `addresses[1].region` is NULL on every sampled NL row, so string-matching
 * that field can never work — the original country+category-only query with
 * a null-guaranteed region predicate forced a full unpruned S3 scan (9+
 * minutes with zero matches possible). The same probe with a bbox predicate
 * completed in 23 seconds and returned real NL rows. Region scoping now
 * happens via bbox instead of the (unusable) region string field.
 */
export const REGION_BBOXES: Record<string, Bbox> = {
  "NL:noord-holland": [4.49, 52.16, 5.33, 53.22],
  "NL:zuid-holland": [3.83, 51.66, 5.15, 52.33],
  "NL:utrecht": [4.79, 51.93, 5.63, 52.3],
  "NL:groningen": [6.4, 53.0, 7.23, 53.55],
  "NL:friesland": [5.1, 52.8, 6.2, 53.55],
  "NL:fryslan": [5.1, 52.8, 6.2, 53.55],
  "NL:drenthe": [6.15, 52.6, 7.05, 53.1],
  "NL:overijssel": [5.85, 52.2, 7.05, 52.8],
  "NL:flevoland": [5.2, 52.3, 5.95, 52.75],
  "NL:gelderland": [5.35, 51.75, 6.85, 52.35],
  "NL:noord-brabant": [4.2, 51.25, 5.95, 51.85],
  "NL:limburg": [5.6, 50.75, 6.15, 51.75],
  "NL:zeeland": [3.31, 51.2, 4.35, 51.75],
};

function slugifyRegion(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (combining marks left by NFD)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * Resolves the bbox to pre-filter Overture rows by: a known region's bbox if
 * --region is given, else the whole-country bbox. Region matching is
 * case/diacritic-insensitive via slugifyRegion (e.g. "Noord-Holland" and
 * "noord holland" both resolve to "noord-holland"). An unknown region or
 * country fails fast with the list of known regions — it never silently
 * falls back to an empty or wrong slice (country/region stay parameters,
 * never hardcoded behavior — D-12).
 */
export function resolveBbox(country: string, region?: string): Bbox {
  const iso2 = country.toUpperCase();

  if (region) {
    const key = `${iso2}:${slugifyRegion(region)}`;
    const bbox = REGION_BBOXES[key];
    if (!bbox) {
      const known = Object.keys(REGION_BBOXES)
        .filter((k) => k.startsWith(`${iso2}:`))
        .map((k) => k.split(":")[1])
        .join(", ");
      throw new Error(
        `Unknown region "${region}" for country "${iso2}". Known regions: ` +
          `${known || "(none configured for this country)"}`
      );
    }
    return bbox;
  }

  const countryBbox = COUNTRY_BBOXES[iso2];
  if (!countryBbox) {
    throw new Error(
      `No bbox configured for country "${iso2}". Known countries: ` +
        `${Object.keys(COUNTRY_BBOXES).join(", ")}`
    );
  }
  return countryBbox;
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
 * ESCALATION APPLIED (RESEARCH.md Pattern 2 trade-off, pre-authorized): the
 * country+category-only query with a struct-field `addresses[1].region`
 * predicate forced an unpruned full S3 scan and, worse, `addresses[1].region`
 * is NULL on every sampled NL row — that predicate could never match. A bbox
 * pre-filter on the native `bbox.xmin/xmax/ymin/ymax` columns prunes Parquet
 * row groups effectively (confirmed: 23s vs 9+ minutes on a real NL region
 * probe) and replaces the region string predicate entirely. See resolveBbox().
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
    const [minLon, minLat, maxLon, maxLat] = resolveBbox(params.country, params.region);

    const conditions = [
      `addresses[1].country = '${escapeSqlString(params.country)}'`,
      `${categoryColumn} = '${escapeSqlString(params.category)}'`,
      // bbox pre-filter (row-group pruning) — replaces the unusable
      // addresses[1].region string predicate, see resolveBbox() doc comment.
      `bbox.xmin > ${minLon}`,
      `bbox.xmax < ${maxLon}`,
      `bbox.ymin > ${minLat}`,
      `bbox.ymax < ${maxLat}`,
    ];
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
