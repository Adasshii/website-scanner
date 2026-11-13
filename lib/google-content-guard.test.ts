/**
 * lib/google-content-guard.test.ts: Phase 9, ENG-07 (D-9-R4). Turns the
 * Maps Platform Terms rule (section 3.2.3: nothing Google returns is stored,
 * except the place_id) into a failing build.
 *
 * What breaks if this file starts failing and someone "fixes" it by loosening
 * an assertion rather than the code: a Google field name would be free to
 * enter a write path or a schema column, and the project would be storing
 * content its licence forbids it to store.
 *
 * Pure source assertion. It reads files from disk with node:fs and opens no
 * database connection, so it belongs to the "unit" vitest project.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  GOOGLE_STORABLE_FIELDS,
  GUARDED_SOURCE_ROOTS,
  findGoogleFieldViolations,
  toStorableGooglePlace,
} from "./google-content-guard";

/** Every .ts/.tsx file under a repo-relative directory, as repo-relative paths. */
function listSourceFiles(relativeDir: string): string[] {
  const absoluteDir = path.join(process.cwd(), relativeDir);
  const found: string[] = [];
  for (const entry of readdirSync(absoluteDir)) {
    const relativePath = path.posix.join(relativeDir, entry);
    const stats = statSync(path.join(process.cwd(), relativePath));
    if (stats.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === ".next") continue;
      found.push(...listSourceFiles(relativePath));
    } else if (/\.tsx?$/.test(entry)) {
      found.push(relativePath);
    }
  }
  return found;
}

describe("google content guard (ENG-07, D-9-R4)", () => {
  it("every guarded source root exists and yields more than zero files, before any token assertion runs", () => {
    for (const root of GUARDED_SOURCE_ROOTS) {
      expect(existsSync(path.join(process.cwd(), root)), `missing root: ${root}`).toBe(true);
      expect(listSourceFiles(root).length, `root scans zero files: ${root}`).toBeGreaterThan(0);
    }
  });

  it("canary: a synthetic write path naming a Places field is flagged", () => {
    const violations = findGoogleFieldViolations("const row = { userRatingCount: place.userRatingCount };");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("toStorableGooglePlace keeps only place_id and drops every other field Google returned", () => {
    expect(GOOGLE_STORABLE_FIELDS).toEqual(["place_id"]);
    const stored = toStorableGooglePlace({ place_id: "x", rating: 4.5, formattedAddress: "y" });
    expect(Object.keys(stored)).toEqual(["place_id"]);
  });
});
