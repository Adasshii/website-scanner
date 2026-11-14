/**
 * Wiring guard for plan 09-09 (D-9-12, D-9-13, D-9-R6).
 *
 * The scanner's route and page scanner cannot be executed in a unit test: the
 * route starts a server and needs a database, and the page scanner needs a
 * browser. The behaviour of each seam they call is tested in
 * lib/own-site-run.test.ts and lib/own-site-aggregate.test.ts. What those tests
 * cannot show is that the route and the scanner call the seams in the right
 * ORDER and place, and the order is the whole point of D-9-R6: the facts column
 * must never join the completed-scan update, and the facts write must finish
 * before the report-email callback.
 *
 * So this file reads the two source files and asserts that order, the same way
 * lib/niche-profile/isolation.test.ts asserts NIC-03 and NIC-04. It is a
 * structural guard, not a behavioural test, and it says so: a rewrite that keeps
 * the order but changes the spelling of a call will need this file updated.
 *
 * Pure source assertion: node:fs only.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf-8");
}

/** Code with whole-line comments removed, so a comment that mentions a name does not count as a use. */
function code(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join("\n");
}

const INDEX = code(source("scanner-service/src/index.ts"));
const SCANNER = code(source("scanner-service/src/scanner.ts"));

const ROUTE_START = INDEX.indexOf('app.post("/api/scan/full-async"');
const ROUTE_END = INDEX.indexOf("// ── Helpers");
const ROUTE = INDEX.slice(ROUTE_START, ROUTE_END === -1 ? undefined : ROUTE_END);

function indexOfAfter(text: string, needle: string, from = 0): number {
  const at = text.indexOf(needle, from);
  if (at === -1) throw new Error(`not found: ${needle}`);
  return at;
}

describe("full-async route: the facts write stays out of the completed update (T-9-19)", () => {
  it("the route slice was found", () => {
    expect(ROUTE_START).toBeGreaterThan(-1);
    expect(ROUTE.length).toBeGreaterThan(1000);
  });

  it("the completed update names no own_site_facts column", () => {
    const start = indexOfAfter(ROUTE, 'status: "completed"');
    const end = indexOfAfter(ROUTE, '.eq("id", scanId)', start);
    const update = ROUTE.slice(start, end);
    expect(update).toContain("sales_brief");
    expect(update.includes("own_site_facts")).toBe(false);
    expect(update.includes("ownSite")).toBe(false);
  });

  it("the column is named in exactly one place: the write adapter of the second update", () => {
    const lines = ROUTE.split("\n").filter((line) => line.includes("own_site_facts"));
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('.from("scans").update({ own_site_facts: facts })');
  });

  it("the second update is awaited after the completed update and before the report callback", () => {
    const completed = indexOfAfter(ROUTE, 'status: "completed"');
    const released = indexOfAfter(ROUTE, "activeFullScans.delete(scanId)", completed);
    const stored = indexOfAfter(ROUTE, "await storeOwnSiteFacts(", released);
    const callback = indexOfAfter(ROUTE, "fetch(callbackUrl", stored);
    expect(completed).toBeLessThan(released);
    expect(released).toBeLessThan(stored);
    expect(stored).toBeLessThan(callback);
  });

  it("storeOwnSiteFacts is called once, and not from the failure handler", () => {
    expect(ROUTE.split("storeOwnSiteFacts(").length - 1).toBe(1);
    const failure = indexOfAfter(ROUTE, "} catch (error) {");
    expect(ROUTE.indexOf("storeOwnSiteFacts(")).toBeLessThan(failure);
  });

  it("the write is given the validated slice, so no slice means no write", () => {
    const call = indexOfAfter(ROUTE, "await storeOwnSiteFacts(");
    const args = ROUTE.slice(call, call + 400);
    expect(args).toContain("slice: nicheSlice");
    expect(args).toContain("aggregate: aggregateOwnSite");
  });
});

describe("full-async route: the slice is untrusted input that never changes the response", () => {
  it("validates the slice before the capacity guard, with no response or return in between", () => {
    const validate = indexOfAfter(ROUTE, "validateNicheSlice(");
    const guard = indexOfAfter(ROUTE, "isAtCapacity(", validate);
    const between = ROUTE.slice(validate, guard);
    expect(between.includes("res.")).toBe(false);
    expect(between.includes("return")).toBe(false);
    expect(between.includes("throw")).toBe(false);
  });

  it("an invalid slice is logged with the route's bracketed prefix and replaced by no slice", () => {
    expect(ROUTE).toContain("[full-scan-async] nicheSlice ignored");
    expect(ROUTE).toContain("const nicheSlice = sliceCheck.ok ? sliceCheck.slice : null");
  });

  it("the slice is typed unknown at the boundary", () => {
    expect(ROUTE).toContain("nicheSlice?: unknown");
  });

  it("only the async route passes a slice to scanPage: the public routes never do", () => {
    const calls = INDEX.split("scanPage(").slice(1);
    expect(calls.length).toBeGreaterThan(1);
    const withSlice = calls.filter((rest) => rest.slice(0, 120).includes("nicheSlice"));
    expect(withSlice.length).toBe(1);
    expect(ROUTE).toContain("scanPage({ url: pageUrl, userAgent, nicheSlice: nicheSlice ?? undefined })");
  });
});

describe("page scanner: the harvest hook", () => {
  it("runs once, after the page data is extracted and before the external checks", () => {
    const extract = indexOfAfter(SCANNER, "extractPageData(page");
    const hook = indexOfAfter(SCANNER, "collectOwnSiteHarvest(page, options.nicheSlice, harvestOwnSite)", extract);
    const external = indexOfAfter(SCANNER, "checkSiteFiles(url)", hook);
    expect(extract).toBeLessThan(hook);
    expect(hook).toBeLessThan(external);
    expect(SCANNER.split("collectOwnSiteHarvest(").length - 1).toBe(1);
  });

  it("never calls the harvester directly: it is only handed to the gated hook", () => {
    expect(SCANNER.includes("harvestOwnSite(")).toBe(false);
  });

  it("a page that failed to load reads as unreadable when a slice was asked for, and as null when not", () => {
    expect(SCANNER).toContain('ownSiteHarvest: options.nicheSlice ? { state: "unreadable" } : null');
  });

  it("carries the harvest on the internal result, and PageData gains no field", () => {
    expect(SCANNER).toContain("ownSiteHarvest: OwnSiteHarvestOutcome | null");
    const shared = source("types/scanner.ts");
    expect(shared.toLowerCase().includes("ownsite")).toBe(false);
  });
});

describe("NIC-03, NIC-04: every own-site scanner module is in the isolation guard", () => {
  it("each own-site module and the trade detector on disk is named in ENGINE_FILES", () => {
    const isolation = source("lib/niche-profile/isolation.test.ts");
    const start = isolation.indexOf("export const ENGINE_FILES");
    const list = isolation.slice(start, isolation.indexOf("];", start));
    const modules = readdirSync(path.join(process.cwd(), "scanner-service/src")).filter(
      (file) => /^own-site-[a-z-]+\.ts$/.test(file) || file === "trade-detection.ts"
    );
    // The three plan 09-09 names the guarded set must hold, so an empty listing cannot pass.
    for (const required of ["own-site-harvest.ts", "own-site-facts.ts", "trade-detection.ts"]) {
      expect(modules, required).toContain(required);
    }
    for (const file of modules) {
      expect(list.includes(`"scanner-service/src/${file}"`), `${file} is not in ENGINE_FILES`).toBe(true);
    }
  });
});

describe("D-9-13: the scanner build files are not edited and the scanner reaches no new lib file", () => {
  const RUNTIME_IMPORT = /^import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm;

  it("no scanner module imports the niche profile or anything under lib/ except the scoring module that was already there", () => {
    for (const file of ["index.ts", "scanner.ts", "own-site-run.ts", "own-site-facts.ts", "own-site-harvest.ts", "trade-detection.ts"]) {
      const text = code(source(`scanner-service/src/${file}`));
      const specifiers = Array.from(text.matchAll(RUNTIME_IMPORT), (m) => m[1]);
      for (const specifier of specifiers) {
        const intoLib = /(^|\/)lib\//.test(specifier);
        expect(!intoLib || (file === "index.ts" && specifier === "../../lib/scoring"), `${file} imports ${specifier}`).toBe(true);
      }
    }
  });

  it("the slice and fact types live under types/, which the image already copies", () => {
    for (const file of ["own-site-run.ts", "own-site-facts.ts", "scanner.ts"]) {
      const text = source(`scanner-service/src/${file}`);
      expect(text.includes("../../types/")).toBe(true);
    }
  });
});
