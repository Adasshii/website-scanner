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

function overtureDivisionsPath(): string {
  return `s3://overturemaps-us-west-2/release/${OVERTURE_RELEASE}/theme=divisions/type=division_area/*`;
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
 *
 * D-11 audit follow-up: this bbox is a rectangular pre-filter for row-group
 * pruning ONLY — it is no longer the region boundary itself when --region is
 * given. A rectangular box necessarily bleeds in neighboring-province border
 * towns (e.g. Zuid-Holland's Leiden/Sassenheim/Warmond area inside a
 * Noord-Holland bbox). The exact boundary is the province polygon resolved
 * from the Overture divisions theme — see resolveProvinceDivisionId() and
 * buildPlacesSql(). Keep these bboxes generous (superset of the true
 * polygon); tightening them risks pruning away real rows before the exact
 * polygon filter even runs.
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

interface DivisionCandidate {
  id: string;
  name: string | null;
}

/**
 * Pure validation/matching logic split out of resolveProvinceDivisionId() so
 * it is testable without a live DuckDB/S3 connection (RESEARCH.md §Validation
 * Architecture — SQL-building/validation logic gets static tests, the S3
 * fetch itself stays untested). Matches diacritic/case-insensitively via
 * slugifyRegion, same as resolveBbox(), and fails fast on zero or multiple
 * matches rather than silently picking one — an ambiguous or missing match
 * here would otherwise resolve to the wrong province polygon (or none) with
 * no signal to the caller.
 */
export function pickProvinceDivisionId(
  rows: DivisionCandidate[],
  region: string
): string {
  const targetSlug = slugifyRegion(region);
  const matches = rows.filter(
    (row) => slugifyRegion(String(row.name ?? "")) === targetSlug
  );

  if (matches.length === 0) {
    const seen = rows.map((r) => r.name).join(", ") || "(no region rows found)";
    throw new Error(
      `No division_area region found for "${region}" — cannot build an exact ` +
        `province boundary. Region rows seen: ${seen}`
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous division_area match for "${region}": ${matches.length} rows ` +
        `matched (ids: ${matches.map((m) => m.id).join(", ")}). Expected exactly one.`
    );
  }

  return matches[0].id;
}

/**
 * Resolves the Overture GERS id of the divisions-theme `division_area` row
 * for a country's named region (subtype='region', e.g. NL "Noord-Holland") —
 * the exact province polygon used to replace the rectangular bbox
 * pre-filter's border-town bleed (D-11 audit follow-up: Zuid-Holland border
 * towns like Leiden/Sassenheim/Warmond were appearing inside a Noord-Holland
 * bbox slice). Only the id/name columns are projected — the file's own bbox
 * pruning is deliberately skipped here: subtype+country already narrows this
 * to a handful of rows, and pruning on a second, independently-authored bbox
 * table (REGION_BBOXES) risks a false "zero matches" if the two bboxes don't
 * agree exactly at the boundary.
 *
 * `class = 'land'` is required: coastal NL provinces (Noord-Holland,
 * Zuid-Holland, Zeeland, Fryslân — confirmed live against the divisions
 * theme) each have TWO subtype='region' rows sharing the same name — one
 * `class='land'` (the province itself) and one `class='maritime'`
 * (territorial waters, `is_territorial=true`). Businesses sit on land, so
 * the maritime row is excluded rather than left to trip the ambiguity
 * fail-fast in pickProvinceDivisionId() on every coastal province.
 */
export async function resolveProvinceDivisionId(
  conn: DuckDBConnection,
  country: string,
  region: string
): Promise<string> {
  const iso2 = country.toUpperCase();
  const reader = await conn.runAndReadAll(`
    SELECT id, names.primary AS name
    FROM read_parquet('${overtureDivisionsPath()}', hive_partitioning=1)
    WHERE subtype = 'region'
      AND class = 'land'
      AND country = '${escapeSqlString(iso2)}'
  `);
  const rows = reader
    .getRowObjectsJS()
    .map((row) => ({ id: String(row.id), name: (row.name as string | null) ?? null }));

  return pickProvinceDivisionId(rows, region);
}

/**
 * Builds the places SQL. Pure/synchronous so it is statically testable
 * without a DuckDB/S3 connection: given a resolved category column and (when
 * a region is scoped) a resolved division id, it produces the exact query
 * text queryOverturePlaces executes. The bbox conditions always run first
 * (row-group pruning); ST_Within is the exact boundary and is only added
 * when a region + divisionId are supplied.
 */
export function buildPlacesSql(
  placesPath: string,
  categoryColumn: string,
  params: OvertureQueryParams,
  divisionsPath: string | null,
  divisionId: string | null
): string {
  const [minLon, minLat, maxLon, maxLat] = resolveBbox(params.country, params.region);

  const conditions = [
    `place.addresses[1].country = '${escapeSqlString(params.country)}'`,
    `place.${categoryColumn} = '${escapeSqlString(params.category)}'`,
    // bbox pre-filter (row-group pruning ONLY) — replaces the unusable
    // addresses[1].region string predicate, see resolveBbox() doc comment.
    // When a region is given, ST_Within below is the exact boundary; this
    // bbox just narrows which Parquet row groups get scanned.
    `place.bbox.xmin > ${minLon}`,
    `place.bbox.xmax < ${maxLon}`,
    `place.bbox.ymin > ${minLat}`,
    `place.bbox.ymax < ${maxLat}`,
  ];

  let fromClause = `read_parquet('${placesPath}', filename=true, hive_partitioning=1) AS place`;

  if (divisionsPath && divisionId) {
    // Exact province containment (D-11 audit follow-up) — replaces the
    // rectangular bbox as the region boundary. The bbox above remains, but
    // only as pruning. Both `geometry` columns are already a native GEOMETRY
    // type (GeoParquet metadata is auto-detected by the spatial extension) —
    // ST_GeomFromWKB errors as a type mismatch if applied to them; confirmed
    // live via DESCRIBE against both the places and divisions Parquet.
    fromClause += `, (
        SELECT geometry
        FROM read_parquet('${divisionsPath}', hive_partitioning=1)
        WHERE id = '${escapeSqlString(divisionId)}'
      ) AS province`;
    conditions.push(`ST_Within(place.geometry, province.geometry)`);
  }

  const limitClause = params.limit
    ? `LIMIT ${Math.max(0, Math.floor(params.limit))}`
    : "";

  return `
      SELECT place.id AS gers_id, place.names.primary AS name, place.websites, place.addresses,
             place.${categoryColumn} AS category, place.confidence
      FROM ${fromClause}
      WHERE ${conditions.join(" AND ")}
      ${limitClause}
    `;
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
 * probe). See resolveBbox().
 *
 * D-11 AUDIT FOLLOW-UP: the bbox alone is a rectangle, not the province
 * boundary — it bled in neighboring-province border towns (Zuid-Holland's
 * Leiden/Sassenheim/Warmond inside a Noord-Holland slice). When --region is
 * given, the bbox now runs ONLY as row-group pruning; the exact boundary is
 * an `ST_Within` polygon containment check against the real province
 * geometry resolved from the Overture divisions theme (theme=divisions,
 * type=division_area, subtype='region', class='land') — see
 * resolveProvinceDivisionId() and buildPlacesSql(). Country-only runs (no
 * --region) are unaffected: the addresses[1].country field is populated and
 * already exact (RESEARCH.md Pitfall — only the region field is unusable).
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

    let divisionId: string | null = null;
    if (params.region) {
      divisionId = await resolveProvinceDivisionId(conn, params.country, params.region);
    }

    const sql = buildPlacesSql(
      path,
      categoryColumn,
      params,
      params.region ? overtureDivisionsPath() : null,
      divisionId
    );

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
