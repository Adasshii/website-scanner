/**
 * lib/niche-profile/installers/categories.ts — Phase 9, D-9-11 / D-9-23 / D-9-24.
 *
 * The positive Overture import list, the regions a random import samples
 * from, and the competitor rules. Plan 09-06 wires `--category=random` and
 * `--region=random` to read these exact lists, so a wrong entry here samples
 * the wrong vertical on every random import.
 *
 * Confirmed by Joshua on 2026-11-13 (09-CONTEXT.md folded todo, closed): keep
 * all eight categories, including the three broad builder types, for volume;
 * widen the regions from the four cached provinces to all twelve.
 */
import type { ProfileLocale } from "../types";

/**
 * Overture `taxonomy.primary` values, measured to return rows on the
 * 2026-10-21.0 release. Counts are NL with-a-website, aggregated from
 * data/overture-categories.json (09-RESEARCH.md Pattern 9):
 *   contractor 10,491; building_or_construction_service 5,638;
 *   energy_company 3,345; plumbing 2,094; electrician 1,997;
 *   roofing 1,908; building_contractor 1,118; hvac_service 953.
 * Must have an empty intersection with EXCLUDED_CATEGORIES in
 * lib/triage-constants.ts (asserted in profile.test.ts).
 */
export const OVERTURE_IMPORT_CATEGORIES: readonly string[] = [
  "roofing",
  "hvac_service",
  "plumbing",
  "electrician",
  "energy_company",
  "building_contractor",
  "building_or_construction_service",
  "contractor",
];

/**
 * All twelve Dutch provinces, each a key REGION_BBOXES already carries.
 * The `fryslan` alias is deliberately absent: REGION_BBOXES holds it as a
 * second name for `friesland` with the same bbox, so listing both would make
 * a random sampler pick Friesland twice as often as any other province.
 *
 * Only noord-holland, zuid-holland, utrecht and noord-brabant are cached in
 * data/overture-categories.json, so the first random import that lands on one
 * of the other eight pays a category-cache miss. That is expected, not a failure.
 */
export const TARGET_REGIONS: readonly string[] = [
  "noord-holland",
  "zuid-holland",
  "utrecht",
  "noord-brabant",
  "groningen",
  "friesland",
  "drenthe",
  "overijssel",
  "flevoland",
  "gelderland",
  "limburg",
  "zeeland",
];

/**
 * Competitor rules. Phase 10 consumes these; Phase 9 only holds them (D-9-23).
 * 25 km matches how a Dutch installer travels for a job, so "installers near
 * you" reads as true.
 */
export const COMPETITOR_RULES = {
  radiusKm: 25, // tunable default
  maxCompetitors: 3, // tunable default
} as const;

/**
 * The AI question template slot (D-9-24). Phase 10 writes the questions and
 * their `{trade}` and `{city}` templates; nothing in Phase 9 fires one, so
 * empty is the honest state rather than a stub pretending to work.
 */
export const EMPTY_AI_QUESTIONS: Record<ProfileLocale, readonly string[]> = {
  nl: [],
  en: [],
};
