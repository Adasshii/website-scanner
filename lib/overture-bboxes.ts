// Overture bbox lookup tables — extracted out of lib/overture-client.ts
// (Task 3, 260806-ntm) so the Import admin form's dropdowns can read the
// exact tables the importer resolves against, with no way for the two to
// drift, WITHOUT pulling @duckdb/node-api (109 MB, a native binary) into
// the browser bundle. lib/overture-client.ts line 1 imports
// @duckdb/node-api; this module has zero dependencies and is safe for a
// client component to import directly.
//
// Nothing here changed in value or behavior from its prior home in
// lib/overture-client.ts — see that file's re-export for the rest of the
// Overture query pipeline (buildPlacesSql, detectCategoryColumn,
// pickProvinceDivisionId, queryOverturePlaces), which stayed put.

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
 * buildPlacesSql() in lib/overture-client.ts. Keep these bboxes generous
 * (superset of the true polygon); tightening them risks pruning away real
 * rows before the exact polygon filter even runs.
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

export function slugifyRegion(input: string): string {
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
