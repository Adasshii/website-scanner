/**
 * lib/niche-profile/isolation.test.ts — Phase 9, plan 09-02 (NIC-03, NIC-04).
 *
 * NIC-03 and NIC-04 are architectural claims. This file turns them from prose
 * into failing builds, the same family as lib/outreach-isolation.test.ts and
 * lib/google-content-guard.test.ts:
 *
 *   NIC-03: no engine file carries a Dutch trade word or a country or locale
 *           literal. `country` and `locales` are fields of the profile.
 *   NIC-04: no engine file imports the profile. The engine receives a typed
 *           slice and never reads the profile, so "adding a niche is a new
 *           profile plus a landing page" is structural, not conventional.
 *
 * What this does NOT prove: that the engine BEHAVES correctly for a second
 * country, because no second country exists to test against. The honest
 * state is "no hardcoded geography", not "proven multi-country". Likewise the
 * guarded set is only as complete as ENGINE_FILES: a new engine file that
 * nobody adds here is unguarded, and no test can detect its own omission.
 * That is why the existence assertion runs first, so a rename shrinks the set
 * loudly instead of silently.
 *
 * SEQUENCING: plan 09-09 adds scanner-service/src/own-site-harvest.ts,
 * scanner-service/src/own-site-facts.ts and
 * scanner-service/src/trade-detection.ts to ENGINE_FILES in the same plan
 * that finishes wiring them. They do not exist yet, so their absence here is
 * a sequencing fact and not an oversight.
 *
 * Pure source assertion: node:fs only, no database, no server, no clock.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { INSTALLERS_PROFILE, toScannerSlice } from "./index";

/**
 * Files that must stay niche-free. Asserted to exist before any content
 * assertion runs.
 */
export const ENGINE_FILES: readonly string[] = [
  "lib/triage-eligibility.ts",
  "lib/google-content-guard.ts",
];

/**
 * Where niche vocabulary is ALLOWED to live. Written as an explicit path
 * filter, applied to ENGINE_FILES below, rather than left to the shape of the
 * file list: the exclusion is deliberate and visible.
 */
export const VOCABULARY_HOME_DIRS: readonly string[] = ["lib/niche-profile/installers/"];

/**
 * The six Dutch trade stems plus the certification scheme name, lower-cased.
 * Matched case-insensitively as substrings of non-comment lines. Exported so a
 * failure message can name the token that tripped.
 */
export const DUTCH_TRADE_VOCABULARY: readonly string[] = [
  "warmtepomp", // heat pump
  "zonnepane", // solar panels (stem covers singular and plural)
  "badkamer", // bathroom
  "keuken", // kitchen
  "dakdekk", // roofing
  "centrale verwarming", // central heating
  "installq", // certification scheme
];

/**
 * Country and locale literals, lower-cased: quoted two-letter codes and the
 * country's names. Matched case-insensitively, so "NL" and "nl" both trip.
 */
export const GEOGRAPHY_LITERALS: readonly string[] = [
  '"nl"',
  "'nl'",
  "`nl`",
  '"en"',
  "'en'",
  "`en`",
  "netherlands",
  "nederland",
];

/** The slice budget (09-RESEARCH.md Pitfall 10): the scanner route's express body limit is 100kb. */
const SLICE_BUDGET_BYTES = 20480;

const PROFILE_DIR = "lib/niche-profile";

/** Trimmed lines starting with these markers are dropped before matching. */
const COMMENT_LINE_MARKERS = ["//", "/*", "*"] as const;

/**
 * Drops comment lines and trailing ` // ...` comments. Every engine file
 * explains in its own header why it avoids the niche, and a matcher that read
 * comments would fail on its own documentation.
 */
export function stripComments(source: string): string[] {
  return source
    .split("\n")
    .map((line) => line.replace(/\s\/\/.*$/, "").trim())
    .filter((line) => line.length > 0 && !COMMENT_LINE_MARKERS.some((marker) => line.startsWith(marker)));
}

/** Returns each (token, line) pair where a non-comment line contains a token, case-insensitively. */
function findTokenViolations(source: string, tokens: readonly string[]): string[] {
  const hits: string[] = [];
  for (const line of stripComments(source)) {
    const lower = line.toLowerCase();
    for (const token of tokens) {
      if (lower.includes(token)) hits.push(`${token}: ${line}`);
    }
  }
  return hits;
}

export function findVocabularyViolations(source: string): string[] {
  return findTokenViolations(source, DUTCH_TRADE_VOCABULARY);
}

export function findGeographyViolations(source: string): string[] {
  return findTokenViolations(source, GEOGRAPHY_LITERALS);
}

/**
 * Returns every import specifier in `source` that resolves into
 * lib/niche-profile/, by the `@/` alias or by a relative path from
 * `fromFile`. Reads the joined non-comment text, so a multi-line import is
 * seen whole.
 */
export function findProfileImports(source: string, fromFile: string): string[] {
  const code = stripComments(source).join("\n");
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s*["'`]([^"'`]+)["'`]/g,
    /\bimport\s*["'`]([^"'`]+)["'`]/g,
    /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
    /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of Array.from(code.matchAll(pattern))) specifiers.push(match[1]);
  }

  const root = process.cwd();
  const profileRoot = path.join(root, PROFILE_DIR);
  return specifiers.filter((specifier) => {
    let resolved: string;
    if (specifier.startsWith("@/")) resolved = path.join(root, specifier.slice(2));
    else if (specifier.startsWith(".")) resolved = path.resolve(root, path.dirname(fromFile), specifier);
    else return false;
    return resolved === profileRoot || resolved.startsWith(profileRoot + path.sep);
  });
}

function readEngineFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf-8");
}

/** ENGINE_FILES minus anything under a directory where niche vocabulary is allowed to live. */
const SCANNED_ENGINE_FILES = ENGINE_FILES.filter(
  (file) => !VOCABULARY_HOME_DIRS.some((dir) => file.startsWith(dir))
);

describe("niche isolation (NIC-03, NIC-04)", () => {
  it("every file in ENGINE_FILES exists on disk", () => {
    expect(ENGINE_FILES.length).toBeGreaterThan(0);
    for (const relativePath of ENGINE_FILES) {
      expect(existsSync(path.join(process.cwd(), relativePath)), `missing: ${relativePath}`).toBe(true);
    }
  });

  it("the vocabulary exclusion leaves a non-empty guarded set and spares nothing it should not", () => {
    expect(SCANNED_ENGINE_FILES.length).toBeGreaterThan(0);
    expect(SCANNED_ENGINE_FILES).toEqual(ENGINE_FILES);
  });

  it("NIC-03: no engine file contains a Dutch trade vocabulary stem on a non-comment line", () => {
    for (const relativePath of SCANNED_ENGINE_FILES) {
      const hits = findVocabularyViolations(readEngineFile(relativePath));
      expect(hits, `${relativePath} carries trade vocabulary: ${hits.join(" | ")}`).toEqual([]);
    }
  });

  it("NIC-03: no engine file contains a country or locale literal on a non-comment line", () => {
    for (const relativePath of SCANNED_ENGINE_FILES) {
      const hits = findGeographyViolations(readEngineFile(relativePath));
      expect(hits, `${relativePath} carries a geography literal: ${hits.join(" | ")}`).toEqual([]);
    }
  });

  it("NIC-04: no engine file imports the niche profile", () => {
    for (const relativePath of SCANNED_ENGINE_FILES) {
      const hits = findProfileImports(readEngineFile(relativePath), relativePath);
      expect(hits, `${relativePath} imports the profile: ${hits.join(" | ")}`).toEqual([]);
    }
  });

  it("the vocabulary really does live under the exclusion directory, so the exclusion is not vacuous", () => {
    const tradesSource = readEngineFile("lib/niche-profile/installers/trades.ts");
    expect(findVocabularyViolations(tradesSource).length).toBeGreaterThan(0);
    expect(VOCABULARY_HOME_DIRS.some((dir) => "lib/niche-profile/installers/trades.ts".startsWith(dir))).toBe(true);
  });
});

describe("detector canaries: each detector works in both directions", () => {
  it("flags a synthetic source carrying a trade stem", () => {
    const source = 'export const x = "warmtepomp";\n';
    expect(findVocabularyViolations(source).length).toBeGreaterThan(0);
  });

  it("flags a stem in a different case", () => {
    expect(findVocabularyViolations('const a = "Badkamer";').length).toBeGreaterThan(0);
  });

  it("does not flag a synthetic source carrying none, or a stem that appears only in comments", () => {
    const clean = "export const x = 1;\n// warmtepomp lives in the profile\n/* keuken */\n * badkamer\n";
    expect(findVocabularyViolations(clean)).toEqual([]);
  });

  it("flags a country or locale literal and ignores a clean source", () => {
    expect(findGeographyViolations('const country = "NL";').length).toBeGreaterThan(0);
    expect(findGeographyViolations("const locale = 'nl';").length).toBeGreaterThan(0);
    expect(findGeographyViolations("export const x = 1; // \"nl\" in a comment").length).toBe(0);
    expect(findGeographyViolations("export const x = 1;")).toEqual([]);
  });

  it("flags an alias import and a relative import of the profile, and ignores unrelated imports", () => {
    expect(findProfileImports('import { x } from "@/lib/niche-profile";', "lib/a.ts").length).toBe(1);
    expect(findProfileImports('import { x } from "@/lib/niche-profile/installers/trades";', "lib/a.ts").length).toBe(1);
    expect(findProfileImports('import { x } from "./niche-profile";', "lib/a.ts").length).toBe(1);
    expect(findProfileImports('import { x } from "../lib/niche-profile/index";', "scripts/a.ts").length).toBe(1);
    expect(findProfileImports('const m = require("./niche-profile");', "lib/a.ts").length).toBe(1);
    expect(findProfileImports('import("@/lib/niche-profile")', "lib/a.ts").length).toBe(1);
    expect(findProfileImports('import {\n  a,\n  b,\n} from "@/lib/niche-profile";', "lib/a.ts").length).toBe(1);
    expect(findProfileImports('import { x } from "@/lib/triage-constants";', "lib/a.ts")).toEqual([]);
    expect(findProfileImports('import { x } from "./niche-profile-notes";', "lib/a.ts")).toEqual([]);
    expect(findProfileImports('import { x } from "react";\n// import { y } from "@/lib/niche-profile";', "lib/a.ts")).toEqual([]);
  });
});

describe("scanner slice budget (09-RESEARCH.md Pitfall 10)", () => {
  it("the serialised slice is under 20480 bytes", () => {
    const bytes = Buffer.byteLength(JSON.stringify(toScannerSlice(INSTALLERS_PROFILE)), "utf8");
    expect(bytes, `slice is ${bytes} bytes`).toBeLessThan(20480);
    expect(SLICE_BUDGET_BYTES).toBe(20480);
  });
});
