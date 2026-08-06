// Category vocabulary cache — pure, dependency-free (Task 1, 260806-p6f).
// Imported by both a client component (components/admin/category-autocomplete
// via import-form.tsx, type-only) and a Node script
// (scripts/overture-categories.ts), so it MUST import nothing but
// slugifyRegion from ./overture-bboxes (itself dependency-free). No node:fs,
// no @duckdb/node-api, no Supabase — see lib/overture-bboxes.ts's own header
// comment for why that separation exists (260806-ntm precedent).
import { slugifyRegion } from "./overture-bboxes";

export interface CategoryCount {
  category: string;
  count: number;
  withSite: number;
}

export type CategoryCache = Record<string, CategoryCount[]>;

/** Per D-01 — keeps the committed data/overture-categories.json reviewable. */
export const CATEGORY_CACHE_LIMIT = 300;

/** Repo-relative path; resolved against process.cwd() by whoever reads/writes it. */
export const CATEGORY_CACHE_FILE = "data/overture-categories.json";

/**
 * Builds the cache key. MUST equal REGION_BBOXES's key format
 * ("<ISO2>:<region-slug>") — the Import form's region <select> values ARE
 * those slugs, so any mismatch here silently degrades every region to the
 * no-cache path.
 */
export function cacheKey(country: string, region: string): string {
  return `${country.toUpperCase()}:${slugifyRegion(region)}`;
}

/**
 * Merges one region's freshly-queried rows into the cache. Returns a NEW
 * object (never mutates `existing`): the given key's rows sorted by count
 * descending and capped at CATEGORY_CACHE_LIMIT, every other key untouched,
 * and the result's keys in sorted order (keeps the committed JSON diff
 * stable/reviewable across regenerations). Replaces the key's rows outright
 * — a re-run for the same region must not double the list.
 */
export function mergeCategoryCache(
  existing: CategoryCache,
  key: string,
  rows: CategoryCount[]
): CategoryCache {
  const sorted = [...rows]
    .sort((a, b) => b.count - a.count)
    .slice(0, CATEGORY_CACHE_LIMIT);

  const merged: CategoryCache = { ...existing, [key]: sorted };

  const result: CategoryCache = {};
  for (const k of Object.keys(merged).sort()) {
    result[k] = merged[k];
  }
  return result;
}
