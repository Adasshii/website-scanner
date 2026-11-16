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
 * Honest limit (09-RESEARCH.md Pattern 8): a static token ban cannot catch a
 * write that copies a Google response object wholesale. Two controls cover
 * that gap. Assertion (c) confines any Google endpoint call to the one file
 * named in ALLOWED_GOOGLE_CLIENT_FILES, so the call site is reachable. And
 * toStorableGooglePlace is a runtime allowlist that file must call. A write
 * that spreads the raw object inside the allowlisted file is NOT caught here.
 *
 * Pure source assertion. It reads files from disk with node:fs and opens no
 * database connection, so it belongs to the "unit" vitest project.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  ALLOWED_GOOGLE_CLIENT_FILES,
  GOOGLE_STORABLE_FIELDS,
  GUARDED_SOURCE_ROOTS,
  findGoogleColumnViolations,
  findGoogleEndpointViolations,
  findGoogleFieldViolations,
  toStorableGooglePlace,
} from "./google-content-guard";

const GUARD_MODULE_PATH = "lib/google-content-guard.ts";
const TEST_FILE_PATTERN = /\.test\.tsx?$/;

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

/**
 * The files the banned-token and endpoint assertions scan. The exclusion is an
 * explicit filter, not an accident of the glob: the guard module names every
 * banned token by design, and tests quote them as fixtures.
 */
function scannedSourceFiles(): string[] {
  return GUARDED_SOURCE_ROOTS.flatMap((root) => listSourceFiles(root)).filter(
    (file) => file !== GUARD_MODULE_PATH && !TEST_FILE_PATTERN.test(file)
  );
}

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("google content guard (ENG-07, D-9-R4)", () => {
  it("every guarded source root exists and yields more than zero files, before any token assertion runs", () => {
    for (const root of GUARDED_SOURCE_ROOTS) {
      expect(existsSync(path.join(process.cwd(), root)), `missing root: ${root}`).toBe(true);
      expect(listSourceFiles(root).length, `root scans zero files: ${root}`).toBeGreaterThan(0);
    }
  });

  it("no source file under the guarded roots names a field Google returns", () => {
    const files = scannedSourceFiles();
    expect(files.length, "scanned zero source files").toBeGreaterThan(0);
    for (const file of files) {
      const [offending] = findGoogleFieldViolations(readRepoFile(file));
      expect(offending, `${file} names a Google Places field: ${offending}`).toBeUndefined();
    }
  });

  it("no file outside ALLOWED_GOOGLE_CLIENT_FILES talks to a Google endpoint", () => {
    const allowed = new Set(ALLOWED_GOOGLE_CLIENT_FILES);
    for (const file of scannedSourceFiles()) {
      if (allowed.has(file)) continue;
      const [offending] = findGoogleEndpointViolations(readRepoFile(file));
      expect(offending, `${file} references a Google endpoint outside the allowlist: ${offending}`).toBeUndefined();
    }
  });

  it("no migration declares a column named after a field Google returns", () => {
    const migrationDir = "supabase/migrations";
    expect(existsSync(path.join(process.cwd(), migrationDir)), `missing dir: ${migrationDir}`).toBe(true);
    const sqlFiles = [
      ...readdirSync(path.join(process.cwd(), migrationDir))
        .filter((entry) => entry.endsWith(".sql"))
        .map((entry) => path.posix.join(migrationDir, entry)),
    ];
    expect(sqlFiles.length, "scanned zero SQL files").toBeGreaterThan(1);
    for (const file of sqlFiles) {
      const [offending] = findGoogleColumnViolations(readRepoFile(file));
      expect(offending, `${file} declares a Google-named column: ${offending}`).toBeUndefined();
    }
  });

  describe("canaries: each detector is proven in both directions", () => {
    it("field detector flags a synthetic write path naming a Places field", () => {
      const violations = findGoogleFieldViolations("const row = { userRatingCount: place.userRatingCount };");
      expect(violations.length).toBeGreaterThan(0);
    });

    it("field detector ignores a comment line and the generic words Overture owns", () => {
      expect(findGoogleFieldViolations("// userRatingCount is documented here")).toEqual([]);
      expect(findGoogleFieldViolations("const row = { name, address, rating, latitude, longitude };")).toEqual([]);
    });

    it("endpoint detector flags a Google host and ignores a comment naming it", () => {
      expect(findGoogleEndpointViolations('fetch("https://places.googleapis.com/v1/places:searchText")').length).toBeGreaterThan(0);
      expect(findGoogleEndpointViolations("// places.googleapis.com is Phase 12")).toEqual([]);
    });

    it("column detector flags a Google-named column", () => {
      expect(findGoogleColumnViolations("create table x (formatted_address text)").length).toBeGreaterThan(0);
    });

    it("column detector flags an add column statement", () => {
      expect(findGoogleColumnViolations("alter table x add column if not exists rating numeric;").length).toBeGreaterThan(0);
    });

    it("column detector allows Overture-owned columns and place_id", () => {
      expect(findGoogleColumnViolations("create table x (address text, place_id text)")).toEqual([]);
      expect(findGoogleColumnViolations("create table x (name text, raw_address text, raw_name text)")).toEqual([]);
    });
  });

  it("ALLOWED_GOOGLE_CLIENT_FILES is empty today: no Google call exists in this phase", () => {
    expect(ALLOWED_GOOGLE_CLIENT_FILES).toEqual([]);
  });

  it("toStorableGooglePlace keeps only place_id and drops every other field Google returned", () => {
    expect(GOOGLE_STORABLE_FIELDS).toEqual(["place_id"]);
    const stored = toStorableGooglePlace({ place_id: "x", rating: 4.5, formattedAddress: "y" });
    expect(Object.keys(stored)).toEqual(["place_id"]);
  });
});
