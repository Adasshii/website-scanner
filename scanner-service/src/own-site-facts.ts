import type {
  FieldState,
  FieldSource,
  OwnSiteAddress,
  OwnSiteBusinessFacts,
  OwnSiteCertifications,
  OwnSiteCheck,
  OwnSiteFactsCore,
  OwnSiteHarvest,
  OwnSiteOpeningHours,
  OwnSiteOpeningHoursEntry,
  OwnSiteQuoteReadiness,
  OwnSiteServiceArea,
  OwnSiteSocialProof,
  OwnSiteTelephone,
} from "../../types/own-site";
import type { NicheScanSlice } from "../../types/niche-scan-slice";

/**
 * own-site-facts.ts: Phase 9, ENG-01. The pure Node-side parser that turns the
 * raw material harvestOwnSite() returns into the business facts (ENG-01), and,
 * from plan 09-07, the social-proof and quote-readiness extractors (ENG-02,
 * ENG-05) that read the same harvest.
 *
 * No Supabase client, no I/O, no runtime import from lib/ (D-9-13: the scanner
 * image copies types/ and exactly one file out of lib/, so a shared parser in
 * lib/ would force a build edit). Fully unit-testable over literal fixtures,
 * the same convention as lib/contact-extraction.ts.
 *
 * No JSON-LD processor is used. A processor would load remote @context
 * documents over the network from inside the scanner, which is a request
 * forgery surface and a latency cost on every scan. A bounded hand-written
 * resolver over a handful of properties avoids both.
 *
 * Every limit below is a control against a hostile or merely enormous page.
 * A bug in here must never fail a scan, so the whole extraction is wrapped and
 * answers "unreadable" if anything throws.
 */

/** Same cap the browser applies; re-applied here because the harvest is untrusted input. */
const MAX_BLOCKS = 20;
const MAX_BLOCK_CHARS = 200_000;
/** Visit depth for the node pool walk. */
const POOL_DEPTH_LIMIT = 6;
/** Hops when following an @id reference. */
const DEREF_HOP_LIMIT = 4;
/** Microdata items and values kept per property, matching the browser caps. */
const MAX_MICRODATA_ITEMS = 50;
const MAX_MICRODATA_VALUES = 20;
/** Total nodes the pool will hold. 20 blocks of 200,000 chars could otherwise be a million. */
const POOL_NODE_LIMIT = 5_000;

type Json = Record<string, unknown>;

interface PoolNode {
  node: Json;
  source: FieldSource;
  types: string[];
}

interface Pool {
  nodes: PoolNode[];
  byId: Map<string, Json>;
}

/** What the parse stage learned about the page's structured data. */
interface ParseState {
  blocksHarvested: number;
  blocksInvalid: number;
  blocksParsed: number;
  microdataItems: number;
  /** Something existed that we could not read in full, so an absence is "could not tell". */
  incomplete: boolean;
}

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A string or finite number as a trimmed string. Anything else, and blank, is "". */
function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** Strip the two schema.org URL prefixes and the schema: prefix, then lower-case. */
function normalizeType(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/schema\.org\//i, "")
    .replace(/^schema:/i, "")
    .toLowerCase();
}

function typesOf(node: Json): string[] {
  const raw = node["@type"];
  const list = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const entry of list) {
    if (typeof entry === "string" && entry.trim() !== "") out.push(normalizeType(entry));
  }
  return out;
}

// ── Node pool ────────────────────────────────────────────────────────────

/**
 * Flatten parsed JSON-LD into one pool of nodes: a top-level array, every
 * @graph array, and nested objects that carry @type or @id. The real sample
 * (53 homepages) held all three shapes, 24 of 28 JSON-LD pages using @graph.
 */
function addToPool(root: unknown, source: FieldSource, pool: PoolNode[]): void {
  const visit = (value: unknown, depth: number): void => {
    if (depth > POOL_DEPTH_LIMIT || value === null || typeof value !== "object") return;
    if (pool.length >= POOL_NODE_LIMIT) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const obj = value as Json;
    if (Array.isArray(obj["@graph"])) visit(obj["@graph"], depth + 1);
    if (obj["@type"] !== undefined || obj["@id"] !== undefined) {
      if (pool.length < POOL_NODE_LIMIT) pool.push({ node: obj, source, types: typesOf(obj) });
    }
    for (const [key, child] of Object.entries(obj)) {
      if (key !== "@graph") visit(child, depth + 1);
    }
  };
  visit(root, 0);
}

/**
 * Convert a harvested microdata item into the JSON-LD-like shape the pool
 * walks, so the field extractors are written once and serve both sources.
 * Depth-bounded like the pool. A property named __proto__ is skipped: the item
 * came from a page we did not write, and assigning that key onto a plain object
 * would change its prototype.
 */
function microdataToNode(item: unknown, depth: number): Json | null {
  if (depth > POOL_DEPTH_LIMIT || !isObject(item)) return null;
  const node: Json = {};
  const rawType = typeof item.type === "string" ? item.type.trim() : "";
  if (rawType !== "") {
    const types = rawType.split(/\s+/);
    node["@type"] = types.length === 1 ? types[0] : types;
  }
  const props = isObject(item.props) ? item.props : {};
  for (const [name, values] of Object.entries(props)) {
    if (name === "__proto__" || !Array.isArray(values)) continue;
    const converted: unknown[] = [];
    for (const value of values.slice(0, MAX_MICRODATA_VALUES)) {
      const out = typeof value === "string" ? value : microdataToNode(value, depth + 1);
      if (out !== null) converted.push(out);
    }
    if (converted.length > 0) node[name] = converted.length === 1 ? converted[0] : converted;
  }
  return node;
}

/**
 * Index nodes by @id across ALL blocks. A bare reference ({ "@id": ... } and
 * nothing else) is never an entry, so a reference cannot shadow its target. If
 * two nodes share an @id, the one with more keys is kept: it is the fuller
 * description, and on a tie the first one wins.
 */
function indexById(nodes: PoolNode[]): Map<string, Json> {
  const byId = new Map<string, Json>();
  for (const { node } of nodes) {
    const id = node["@id"];
    if (typeof id !== "string") continue;
    const size = Object.keys(node).length;
    if (size <= 1) continue;
    const existing = byId.get(id);
    if (existing === undefined || size > Object.keys(existing).length) byId.set(id, node);
  }
  return byId;
}

function isReference(value: unknown): value is { "@id": string } {
  if (!isObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "@id" && typeof value["@id"] === "string";
}

/**
 * Follow an @id reference to its node, across blocks. Bounded by a hop limit
 * and a cycle guard, so a cyclic reference graph terminates. An unresolvable
 * or over-deep reference is null: it reads as no value, never as a guess.
 *
 * Both guards are defense in depth. indexById never stores a bare reference,
 * so a lookup lands on a full node and the loop ends on the next hop; a cycle
 * in the graph cannot make it spin today. They stay because the index rule is
 * the only thing keeping that true, and a later change to it must not be able
 * to turn a hostile page into an unbounded loop.
 */
function deref(value: unknown, byId: Map<string, Json>): unknown {
  let current = value;
  const seen = new Set<string>();
  for (let hops = 0; hops <= DEREF_HOP_LIMIT; hops++) {
    if (!isReference(current)) return current;
    const id = current["@id"];
    if (seen.has(id)) return null;
    seen.add(id);
    const target = byId.get(id);
    if (target === undefined) return null;
    current = target;
  }
  return null;
}

/** A property value as a list of dereferenced candidates: arrays are flattened one level. */
function candidates(value: unknown, byId: Map<string, Json>): unknown[] {
  const list = Array.isArray(value) ? value : [value];
  const out: unknown[] = [];
  for (const entry of list) {
    const resolved = deref(entry, byId);
    if (resolved !== null && resolved !== undefined) out.push(resolved);
  }
  return out;
}

// ── Business node picker ─────────────────────────────────────────────────

/** schema.org LocalBusiness and the home-and-construction subtypes installers use. */
const LOCAL_BUSINESS_FAMILY = new Set([
  "localbusiness",
  "homeandconstructionbusiness",
  "electrician",
  "generalcontractor",
  "hvacbusiness",
  "housepainter",
  "locksmith",
  "movingcompany",
  "plumber",
  "roofingcontractor",
]);

/** Next in priority after the LocalBusiness family. */
const ORGANIZATION_FALLBACK = new Set(["organization", "corporation", "professionalservice"]);

/**
 * Business nodes in priority order: the LocalBusiness family first, then
 * Organization, Corporation and ProfessionalService, each group in pool order.
 * Microdata items go through the same ranking as JSON-LD nodes, because
 * breadcrumb and other non-business items are common and first-item-wins would
 * read the wrong one.
 */
function businessNodesInPriorityOrder(nodes: PoolNode[]): PoolNode[] {
  const family: PoolNode[] = [];
  const fallback: PoolNode[] = [];
  for (const entry of nodes) {
    if (entry.types.some((t) => LOCAL_BUSINESS_FAMILY.has(t))) family.push(entry);
    else if (entry.types.some((t) => ORGANIZATION_FALLBACK.has(t))) fallback.push(entry);
  }
  return [...family, ...fallback];
}

// ── Field extractors ─────────────────────────────────────────────────────

interface Context {
  byId: Map<string, Json>;
}

/** A country can be a plain string or a Country object with a name. */
function countryText(value: unknown): string {
  if (isObject(value)) return text(value.name);
  return text(value);
}

/**
 * Address is found when streetAddress is present, or postalCode and a locality
 * are both present, or a non-empty string is given. Empty and whitespace-only
 * values do not count: a field present in markup but blank reads as missing.
 */
function readAddress(node: Json, ctx: Context): OwnSiteAddress | null {
  for (const candidate of candidates(node.address, ctx.byId)) {
    if (typeof candidate === "string") {
      const whole = candidate.trim();
      if (whole !== "") {
        return { streetAddress: null, postalCode: null, locality: null, region: null, country: null, text: whole };
      }
      continue;
    }
    if (!isObject(candidate)) continue;
    const street = text(candidate.streetAddress);
    const postal = text(candidate.postalCode);
    const locality = text(candidate.addressLocality);
    if (street !== "" || (postal !== "" && locality !== "")) {
      return {
        streetAddress: street || null,
        postalCode: postal || null,
        locality: locality || null,
        region: text(candidate.addressRegion) || null,
        country: countryText(candidate.addressCountry) || null,
        text: null,
      };
    }
  }
  return null;
}

/** Telephone: found when at least one value has 9 or more digits after stripping non-digits. */
function readTelephone(node: Json, ctx: Context): OwnSiteTelephone | null {
  const raw: string[] = [];
  for (const c of candidates(node.telephone, ctx.byId)) {
    const t = text(c);
    if (t !== "") raw.push(t);
  }
  for (const point of candidates(node.contactPoint, ctx.byId)) {
    if (!isObject(point)) continue;
    for (const c of candidates(point.telephone, ctx.byId)) {
      const t = text(c);
      if (t !== "") raw.push(t);
    }
  }
  const numbers = Array.from(new Set(raw.filter((n) => n.replace(/\D/g, "").length >= 9)));
  return numbers.length > 0 ? { numbers } : null;
}

const WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_ABBREVIATIONS: Record<string, string> = {
  mo: "monday",
  tu: "tuesday",
  we: "wednesday",
  th: "thursday",
  fr: "friday",
  sa: "saturday",
  su: "sunday",
};

/** "https://schema.org/Monday", "Monday", "Mo" to "monday"; anything else is null. */
function normalizeDay(value: unknown): string | null {
  let raw = "";
  if (typeof value === "string") raw = value;
  else if (isObject(value) && typeof value["@id"] === "string") raw = value["@id"];
  else if (isObject(value) && typeof value.name === "string") raw = value.name;
  const key = raw
    .trim()
    .replace(/^https?:\/\/schema\.org\//i, "")
    .toLowerCase();
  if (WEEK.includes(key)) return key;
  return DAY_ABBREVIATIONS[key] ?? null;
}

function dayList(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const entry of list) {
    const day = normalizeDay(entry);
    if (day !== null && !out.includes(day)) out.push(day);
  }
  return out;
}

/** "9:00" and "09:00:00" both read as "09:00"; anything that is not a time is null. */
function hhmm(value: string): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

/** "Mo-Fr" and "Mo,We,Fr" as day names. A range may wrap past Sunday. */
function expandDayPart(part: string): string[] {
  const out: string[] = [];
  for (const token of part.split(",")) {
    const range = token.split("-").map((t) => DAY_ABBREVIATIONS[t.trim().toLowerCase()]);
    if (range.length === 0 || range.length > 2 || range.some((d) => d === undefined)) return [];
    const start = WEEK.indexOf(range[0]);
    const end = WEEK.indexOf(range[range.length - 1]);
    for (let i = start, guard = 0; guard < 7; i = (i + 1) % 7, guard++) {
      if (!out.includes(WEEK[i])) out.push(WEEK[i]);
      if (i === end) break;
    }
  }
  return out;
}

const HOURS_STRING = /^\s*([A-Za-z]{2}(?:\s*[-,]\s*[A-Za-z]{2})*)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/;

/**
 * Opening hours: openingHoursSpecification (dayOfWeek as an array or a single
 * value) and openingHours strings such as "Mo-Fr 09:00-17:00".
 *
 * looksDefault is set when all seven days span 00:00 to 23:59. That is a plugin
 * placeholder observed in the real sample, not published hours. The value is
 * stored with the flag rather than thrown away: dropping it would turn a
 * detectable fault into an absence, and Phases 11 and 12 decide its weight.
 */
function readOpeningHours(node: Json, ctx: Context): OwnSiteOpeningHours | null {
  const entries: OwnSiteOpeningHoursEntry[] = [];
  for (const spec of candidates(node.openingHoursSpecification, ctx.byId)) {
    if (!isObject(spec)) continue;
    const days = dayList(spec.dayOfWeek);
    const opens = text(spec.opens);
    const closes = text(spec.closes);
    if (days.length > 0 && opens !== "" && closes !== "") {
      entries.push({ days, opens, closes, raw: null });
    }
  }
  for (const candidate of candidates(node.openingHours, ctx.byId)) {
    if (typeof candidate !== "string") continue;
    const match = HOURS_STRING.exec(candidate);
    if (!match) continue;
    const days = expandDayPart(match[1]);
    const opens = hhmm(match[2]);
    const closes = hhmm(match[3]);
    if (days.length > 0 && opens !== null && closes !== null) {
      entries.push({ days, opens, closes, raw: candidate.trim() });
    }
  }
  if (entries.length === 0) return null;
  const coveredDays = new Set(entries.flatMap((e) => e.days));
  const looksDefault =
    coveredDays.size === 7 &&
    entries.every((e) => hhmm(e.opens ?? "") === "00:00" && hhmm(e.closes ?? "") === "23:59");
  return { entries, looksDefault };
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/** A GeoShape or GeoCircle is only counted when it carries something: a midpoint, a radius or a shape. */
function readGeoShape(value: Json, ctx: Context): OwnSiteServiceArea["geoShape"] {
  const midpoint = deref(value.geoMidpoint, ctx.byId);
  const latitude = isObject(midpoint) ? numberOrNull(midpoint.latitude) : null;
  const longitude = isObject(midpoint) ? numberOrNull(midpoint.longitude) : null;
  let radius = text(value.geoRadius) || null;
  let lat = latitude;
  let lon = longitude;
  const circle = text(value.circle);
  if (circle !== "") {
    // schema.org circle text is "latitude longitude radius".
    const parts = circle.split(/\s+/);
    if (parts.length === 3) {
      lat = lat ?? numberOrNull(parts[0]);
      lon = lon ?? numberOrNull(parts[1]);
      radius = radius ?? parts[2];
    }
  }
  const hasOtherShape = ["polygon", "box", "line"].some((k) => text(value[k]) !== "");
  if (lat === null && lon === null && radius === null && !hasOtherShape && circle === "") return null;
  return { latitude: lat, longitude: lon, radius };
}

/**
 * Service area: areaServed (and the legacy serviceArea) as text, as a Place,
 * City or AdministrativeArea object or array of them, and as a GeoShape
 * including the GeoCircle form. Found when there is at least one name or a
 * geo shape.
 */
function readServiceArea(node: Json, ctx: Context): OwnSiteServiceArea | null {
  const names: string[] = [];
  let geoShape: OwnSiteServiceArea["geoShape"] = null;
  const take = (value: unknown, depth: number): void => {
    for (const c of candidates(value, ctx.byId)) {
      if (typeof c === "string") {
        if (c.trim() !== "") names.push(c.trim());
        continue;
      }
      if (!isObject(c)) continue;
      const name = text(c.name);
      if (name !== "") names.push(name);
      const types = typesOf(c);
      const isShape = types.includes("geoshape") || types.includes("geocircle");
      if (isShape && geoShape === null) geoShape = readGeoShape(c, ctx);
      if (depth < 1 && c.geo !== undefined) take(c.geo, depth + 1);
    }
  };
  take(node.areaServed, 0);
  take(node.serviceArea, 0);
  const unique = Array.from(new Set(names));
  if (unique.length === 0 && geoShape === null) return null;
  return { names: unique, geoShape };
}

/** Certifications: hasCredential, hasCertification, award and memberOf, each needing a non-empty name. */
function readCertifications(node: Json, ctx: Context): OwnSiteCertifications | null {
  const names: string[] = [];
  for (const key of ["hasCredential", "hasCertification", "award", "memberOf"]) {
    for (const c of candidates(node[key], ctx.byId)) {
      const name = typeof c === "string" ? c.trim() : isObject(c) ? text(c.name) : "";
      if (name !== "") names.push(name);
    }
  }
  const unique = Array.from(new Set(names));
  return unique.length > 0 ? { names: unique } : null;
}

/** Service nodes, searched after the business nodes for areaServed: real sites put it there. */
function serviceNodes(nodes: PoolNode[]): PoolNode[] {
  return nodes.filter((entry) => entry.types.includes("service"));
}

/**
 * First found value per field in node priority order. A node that carries the
 * field blank is skipped and the next is tried; conflicting values are never
 * merged, averaged or concatenated.
 */
function pickField<T>(
  ordered: PoolNode[],
  read: (node: Json, ctx: Context) => T | null,
  ctx: Context,
  absent: () => FieldState<T>
): FieldState<T> {
  for (const entry of ordered) {
    const value = read(entry.node, ctx);
    if (value !== null) return { state: "found", value, source: entry.source };
  }
  return absent();
}

// ── Entry point ──────────────────────────────────────────────────────────

function unreadableFacts(meta: { readAt: string; pagesRead?: number }): OwnSiteFactsCore {
  return {
    schemaVersion: 1,
    readAt: meta.readAt,
    pagesRead: meta.pagesRead ?? 0,
    structuredData: { jsonLdBlocks: 0, jsonLdInvalid: 0, microdataItems: 0 },
    business: {
      address: { state: "unreadable" },
      telephone: { state: "unreadable" },
      openingHours: { state: "unreadable" },
      serviceArea: { state: "unreadable" },
      certifications: { state: "unreadable" },
    },
  };
}

/**
 * What an absent field means for this page. No structured data at all is a
 * different finding from structured data that leaves the field out, and both
 * differ from markup we could not read in full, which is "could not tell".
 */
function absentFor<T>(state: ParseState): FieldState<T> {
  const hasStructuredData = state.blocksParsed > 0 || state.microdataItems > 0;
  if (state.incomplete) return { state: "unreadable" };
  if (!hasStructuredData) return { state: "missing", reason: "no_structured_data" };
  return { state: "missing", reason: "not_in_markup" };
}

/**
 * Parse one page's structured data into the node pool every extractor reads,
 * and record what could not be read in full. Shared by the business facts and
 * the social-proof extractor so both apply the same caps and the same rule for
 * "could not tell". Throws only on a bug; callers wrap it.
 */
function readStructuredData(harvest: OwnSiteHarvest): { nodes: PoolNode[]; state: ParseState } {
  const rawBlocks = Array.isArray(harvest.jsonLdBlocks) ? harvest.jsonLdBlocks : [];
  const blocks = rawBlocks.filter((b): b is string => typeof b === "string").slice(0, MAX_BLOCKS);

  const state: ParseState = {
    blocksHarvested: blocks.length,
    blocksInvalid: 0,
    blocksParsed: 0,
    microdataItems: 0,
    incomplete:
      harvest.microdataTruncated === true ||
      rawBlocks.length > MAX_BLOCKS ||
      (typeof harvest.jsonLdBlocksFound === "number" && harvest.jsonLdBlocksFound > blocks.length),
  };

  const nodes: PoolNode[] = [];
  for (const block of blocks) {
    // A block at the cap was cut off by the harvester, so it cannot be read in full.
    if (block.length >= MAX_BLOCK_CHARS) {
      state.blocksInvalid++;
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      state.blocksInvalid++;
      continue;
    }
    state.blocksParsed++;
    addToPool(parsed, "jsonld", nodes);
  }
  if (state.blocksInvalid > 0) state.incomplete = true;

  // Microdata joins the same pool after the JSON-LD nodes, so JSON-LD wins a
  // tie and the field's source records which markup produced the value.
  const microdata = Array.isArray(harvest.microdata) ? harvest.microdata.slice(0, MAX_MICRODATA_ITEMS) : [];
  const claimed = typeof harvest.microdataCount === "number" ? Math.floor(harvest.microdataCount) : 0;
  state.microdataItems = Math.min(MAX_MICRODATA_ITEMS, Math.max(microdata.length, claimed, 0));
  for (const item of microdata) {
    const node = microdataToNode(item, 0);
    if (node !== null) addToPool(node, "microdata", nodes);
  }

  return { nodes, state };
}

/**
 * Turn a harvest into the business facts (OwnSiteFactsCore). A null harvest
 * means the harvest itself failed. Never throws: a bug here must not fail the
 * scan, so anything unexpected answers "unreadable".
 */
export function extractOwnSiteFacts(
  harvest: OwnSiteHarvest | null,
  meta: { readAt: string; pagesRead?: number }
): OwnSiteFactsCore {
  try {
    if (harvest === null) return unreadableFacts(meta);

    const { nodes, state } = readStructuredData(harvest);
    const ctx: Context = { byId: indexById(nodes) };
    const ordered = businessNodesInPriorityOrder(nodes);

    const business: OwnSiteBusinessFacts = {
      address: pickField(ordered, readAddress, ctx, () => absentFor<OwnSiteAddress>(state)),
      telephone: pickField(ordered, readTelephone, ctx, () => absentFor<OwnSiteTelephone>(state)),
      openingHours: pickField(ordered, readOpeningHours, ctx, () => absentFor<OwnSiteOpeningHours>(state)),
      serviceArea: pickField(
        [...ordered, ...serviceNodes(nodes)],
        readServiceArea,
        ctx,
        () => absentFor<OwnSiteServiceArea>(state)
      ),
      certifications: pickField(ordered, readCertifications, ctx, () => absentFor<OwnSiteCertifications>(state)),
    };

    return {
      schemaVersion: 1,
      readAt: meta.readAt,
      pagesRead: meta.pagesRead ?? 1,
      structuredData: {
        jsonLdBlocks: state.blocksHarvested,
        jsonLdInvalid: state.blocksInvalid,
        microdataItems: state.microdataItems,
      },
      business,
    };
  } catch {
    return unreadableFacts(meta);
  }
}

// ── Social proof (ENG-02) ────────────────────────────────────────────────

/**
 * Matching without a pattern built from data. Page text and profile terms are
 * both untrusted for this purpose: a profile string with regex metacharacters
 * would either throw or become a backtracking pattern run against page text
 * inside the scanner (T-9-14). So both sides are reduced to lower-case words
 * separated by single spaces, and a term matches as a literal sub-string
 * between spaces. Every regular expression in this module is a fixed literal.
 */
function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    // Letters and digits, Latin accents included. No `u` flag: the root tsc target does not allow it.
    .replace(/[^a-z0-9À-ɏ]+/g, " ")
    .trim();
}

/** The term as whole words: "stek" does not match inside "stekker". */
function containsWords(normalizedHaystack: string, normalizedTerm: string): boolean {
  return normalizedTerm !== "" && ` ${normalizedHaystack} `.includes(` ${normalizedTerm} `);
}

/**
 * The term at the start of a word. Dutch compounds put the head word last, so
 * the stems that matter sit at the front of a longer word. The end is left open
 * on purpose. Known cost: a multi-word term also matches as the front of a longer
 * compound, which can over-match a heading of a different kind.
 */
function startsAWord(normalizedHaystack: string, normalizedTerm: string): boolean {
  return normalizedTerm !== "" && ` ${normalizedHaystack}`.includes(` ${normalizedTerm}`);
}

/** Slice terms are untrusted input: bounded in count and length, blanks dropped, normalised once. */
const MAX_SLICE_TERMS = 50;
const MAX_SLICE_TERM_CHARS = 100;
interface TermPair {
  /** As the profile wrote it: what the evidence line quotes. */
  original: string;
  /** Lower-case words separated by single spaces: what is compared. */
  normalized: string;
}
function sliceTerms(terms: readonly string[] | undefined): TermPair[] {
  if (!Array.isArray(terms)) return [];
  const out: TermPair[] = [];
  for (const term of terms.slice(0, MAX_SLICE_TERMS)) {
    if (typeof term !== "string") continue;
    const original = term.slice(0, MAX_SLICE_TERM_CHARS).trim();
    const normalized = normalizeForMatch(original);
    if (normalized !== "" && !out.some((t) => t.normalized === normalized)) out.push({ original, normalized });
  }
  return out;
}

/** Cap on the length of one evidence line, so a long heading cannot bloat the stored value. */
const EVIDENCE_CHARS = 80;
const EVIDENCE_LINES = 20;
function clip(value: string): string {
  const one = value.replace(/\s+/g, " ").trim();
  return one.length > EVIDENCE_CHARS ? `${one.slice(0, EVIDENCE_CHARS)}...` : one;
}

/**
 * Words that mark a heading as being about reviews. Stems, matched at the start
 * of a word, so "reviews", "recensies" and "klantbeoordelingen" all read. These
 * are review words and not trade words; the trade vocabulary lives in the
 * profile.
 */
const REVIEW_HEADING_STEMS = [
  "review",
  "recensie",
  "beoordeling",
  "waardering",
  "ervaringen",
  "klantervaring",
  "klantbeoordeling",
  "klantreview",
  "klantwaardering",
].map(normalizeForMatch);

/**
 * A rating printed for visitors: "4,8/5", "9 van de 10", "4.5 sterren", a star
 * glyph beside a number. Fixed patterns with bounded repeats, run over at most
 * 20,000 characters. The slash forms refuse a neighbouring digit or slash so a
 * date such as 1/5/2026 is not a rating.
 */
const RATING_PATTERNS: readonly RegExp[] = [
  /(?<![\d.,/])(?:10|\d)(?:[.,]\d)?\s{0,2}\/\s{0,2}(?:5|10)(?![\d/])/,
  /(?<![\d.,])(?:10|\d)(?:[.,]\d)?\s{1,2}(?:van de|out of)\s{1,2}(?:5|10)(?!\d)/i,
  /(?<![\d.,])\d(?:[.,]\d)?\s{0,2}(?:sterren|stars)(?![a-zÀ-ɏ])/i,
  /★\s{0,2}\d(?:[.,]\d)?/,
  /(?<![\d.,])\d(?:[.,]\d)?\s{0,2}★/,
];

/** "128 beoordelingen", "1 review": a count printed for visitors. */
const COUNT_PHRASE = /(?<![\d.,])(\d{1,6})\s{1,3}(?:klant)?(?:reviews?|beoordelingen?|recensies?|waarderingen?)(?![a-zÀ-ɏ])/gi;

/** Source rank for ties: markup before visible text, JSON-LD before microdata. */
const SOURCE_RANK: Record<FieldSource, number> = { jsonld: 0, microdata: 1, visible_text: 2 };

/** A non-negative whole number, from a number or a plain digit string. Anything else is null. */
function readCount(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : null;
  if (typeof value === "string" && /^\d{1,9}$/.test(value.trim())) return Number(value.trim());
  return null;
}

interface CountCandidate {
  /** 0 reviewCount, 1 ratingCount, 2 visible text: the fixed order of trust. */
  rank: number;
  value: number;
  source: FieldSource;
}

interface DateCandidate {
  time: number;
  text: string;
  source: FieldSource;
}

/** What one readable page contributed. */
interface PageProof {
  hosts: string[];
  evidence: string[];
  shown: boolean;
  markedUp: boolean;
  counts: CountCandidate[];
  dates: DateCandidate[];
  incomplete: boolean;
  hasStructuredData: boolean;
}

function readPageProof(harvest: OwnSiteHarvest, hostFragments: string[]): PageProof {
  const { nodes, state } = readStructuredData(harvest);
  const ctx: Context = { byId: indexById(nodes) };
  const business = businessNodesInPriorityOrder(nodes);
  const evidence: string[] = [];

  // Review widget hosts: the slice's fragments against the harvested hostnames.
  const hosts: string[] = [];
  const widgetHosts = Array.isArray(harvest.widgetHosts) ? harvest.widgetHosts.slice(0, 100) : [];
  for (const raw of widgetHosts) {
    if (typeof raw !== "string") continue;
    const host = raw.trim().toLowerCase();
    if (host !== "" && hostFragments.some((fragment) => host.includes(fragment))) hosts.push(host);
  }
  for (const host of hosts) evidence.push(`widget host: ${host}`);

  // Markup: an AggregateRating or Review node anywhere, or either property on any node.
  const hasAggregate =
    nodes.some((n) => n.types.includes("aggregaterating")) ||
    nodes.some((n) => candidates(n.node.aggregateRating, ctx.byId).length > 0);
  const hasReview =
    nodes.some((n) => n.types.includes("review")) || nodes.some((n) => candidates(n.node.review, ctx.byId).length > 0);
  if (hasAggregate) evidence.push("markup: AggregateRating");
  if (hasReview) evidence.push("markup: Review");

  // Count: only a rating that belongs to the business, not to a product on its site.
  const counts: CountCandidate[] = [];
  for (const entry of business) {
    for (const rating of candidates(entry.node.aggregateRating, ctx.byId)) {
      if (!isObject(rating)) continue;
      const reviewCount = readCount(rating.reviewCount);
      if (reviewCount !== null) counts.push({ rank: 0, value: reviewCount, source: entry.source });
      const ratingCount = readCount(rating.ratingCount);
      if (ratingCount !== null) counts.push({ rank: 1, value: ratingCount, source: entry.source });
    }
  }

  // Recency: datePublished of reviews that belong to the business. A review is
  // the business's when it hangs off a business node, or when it names the
  // business as the thing reviewed. A review with no itemReviewed that sits
  // anywhere else is not claimed: it may be about a product, and an absent date
  // is the safer error than a borrowed one.
  const reviews = new Map<Json, FieldSource>();
  for (const entry of business) {
    for (const review of candidates(entry.node.review, ctx.byId)) {
      if (isObject(review)) reviews.set(review, entry.source);
    }
  }
  for (const entry of nodes) {
    if (!entry.types.includes("review") || reviews.has(entry.node)) continue;
    const target = deref(entry.node.itemReviewed, ctx.byId);
    if (!isObject(target)) continue;
    const isBusiness =
      business.some((b) => b.node === target) ||
      typesOf(target).some((t) => LOCAL_BUSINESS_FAMILY.has(t) || ORGANIZATION_FALLBACK.has(t));
    if (isBusiness) reviews.set(entry.node, entry.source);
  }
  const dates: DateCandidate[] = [];
  for (const [review, source] of Array.from(reviews)) {
    const text = typeof review.datePublished === "string" ? review.datePublished.trim() : "";
    const time = Date.parse(text);
    if (text !== "" && Number.isFinite(time)) dates.push({ time, text, source });
  }

  // Visible zones: headings, a rating pattern, a count phrase.
  const headings = [
    ...(Array.isArray(harvest.h1) ? harvest.h1 : []),
    ...(Array.isArray(harvest.h2h3) ? harvest.h2h3 : []),
  ].filter((h): h is string => typeof h === "string");
  let headingHits = 0;
  for (const heading of headings) {
    const normalized = normalizeForMatch(heading);
    if (REVIEW_HEADING_STEMS.some((stem) => startsAWord(normalized, stem))) {
      if (headingHits < 3) evidence.push(`heading: ${clip(heading)}`);
      headingHits++;
    }
  }
  const body = typeof harvest.bodyText === "string" ? harvest.bodyText : "";
  let ratingText = false;
  for (const pattern of RATING_PATTERNS) {
    const match = pattern.exec(body);
    if (match) {
      evidence.push(`visible text: ${clip(match[0])}`);
      ratingText = true;
      break;
    }
  }
  let phraseHit = false;
  for (const match of Array.from(body.matchAll(COUNT_PHRASE))) {
    const value = readCount(match[1]);
    if (value === null) continue;
    counts.push({ rank: 2, value, source: "visible_text" });
    if (!phraseHit) evidence.push(`visible text: ${clip(match[0])}`);
    phraseHit = true;
  }

  return {
    hosts,
    evidence,
    shown: hosts.length > 0 || hasAggregate || hasReview || headingHits > 0 || ratingText || phraseHit,
    markedUp: hasAggregate || hasReview,
    counts,
    dates,
    incomplete: state.incomplete,
    hasStructuredData: state.blocksParsed > 0 || state.microdataItems > 0,
  };
}

/**
 * What the site shows about reviews, read across every page of the site.
 *
 * Reading an on-site count is permitted under D-9-R4. The Google restriction
 * covers Maps Platform content obtained through the Maps Platform. A count
 * printed in the business's own JSON-LD or on its own page is read off a public
 * page by our scanner, which calls no Google API and holds no Google key. The
 * caveat travels with it: some review-widget plugins copy Google numbers into
 * on-site markup, so the value is stored as what the site says about itself,
 * with its source recorded as the site's markup or visible text, and is never
 * labelled or presented as a Google figure. This is Joshua's own commercial
 * judgement (assumption A6, decided 2026-11-14), not counsel's opinion. If it is
 * ever withdrawn the narrow fix is to drop count and recency and keep shown and
 * markedUp.
 *
 * `shown` is built from four specific signals and never from hasTrustSignals,
 * whose selector matches class-name substrings and over-matches: a review widget
 * host named in the slice, a review word in a heading, a rating pattern in
 * visible text, and an AggregateRating or Review in the markup.
 *
 * The count is resolved by a fixed order of trust, so two published numbers that
 * disagree never resolve differently from one run to the next: reviewCount
 * first, then ratingCount, then a count phrase in the visible text. Among
 * candidates of the same rank the larger wins, which does not depend on page
 * order. Markup wins over visible text. In a 53-site sample only 2 pages
 * carried a rating pattern and 4 a count phrase, and none carried an
 * AggregateRating, so the usual answer is "missing". That is the finding, not a
 * fault.
 *
 * Recency comes only from datePublished on reviews in markup. Widgets rarely
 * expose a date, so "missing" almost everywhere is expected and is not a bug.
 *
 * Host fragments come from the slice. Nothing here names a platform.
 *
 * Every list in the result is sorted and deduplicated and every tie is broken
 * on the value itself, so the same pages in any order store the same value.
 * A page that failed to harvest (null) or a block that did not parse makes an
 * absence "could not tell", never "not there", while a found signal stays found.
 */
export function extractSocialProof(
  pages: ReadonlyArray<OwnSiteHarvest | null>,
  slice: NicheScanSlice
): OwnSiteSocialProof {
  try {
    // Host fragments keep their punctuation (a hyphen is part of a hostname), so they
    // are lower-cased and trimmed here rather than put through the word normaliser.
    const hostFragments = (Array.isArray(slice?.reviewWidgetHosts) ? slice.reviewWidgetHosts : [])
      .slice(0, MAX_SLICE_TERMS)
      .filter((f): f is string => typeof f === "string")
      .map((f) => f.slice(0, MAX_SLICE_TERM_CHARS).trim().toLowerCase())
      .filter((f) => f !== "");
    const read: PageProof[] = [];
    let failedPages = 0;
    for (const harvest of pages) {
      if (harvest === null || harvest === undefined) {
        failedPages++;
        continue;
      }
      try {
        read.push(readPageProof(harvest, hostFragments));
      } catch {
        failedPages++;
      }
    }
    if (read.length === 0) return { state: "unreadable" };

    const incomplete = failedPages > 0 || read.some((p) => p.incomplete);
    const hasStructuredData = read.some((p) => p.hasStructuredData);
    const absent = <T,>(): FieldState<T> => {
      if (incomplete) return { state: "unreadable" };
      return { state: "missing", reason: hasStructuredData ? "not_in_markup" : "no_structured_data" };
    };

    const counts = read.flatMap((p) => p.counts);
    counts.sort((a, b) => a.rank - b.rank || b.value - a.value || SOURCE_RANK[a.source] - SOURCE_RANK[b.source]);
    const count: FieldState<number> =
      counts.length > 0 ? { state: "found", value: counts[0].value, source: counts[0].source } : absent<number>();

    const dates = read.flatMap((p) => p.dates);
    dates.sort((a, b) => b.time - a.time || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0) || SOURCE_RANK[a.source] - SOURCE_RANK[b.source]);
    const recency: FieldState<string> =
      dates.length > 0 ? { state: "found", value: dates[0].text, source: dates[0].source } : absent<string>();

    const shown = read.some((p) => p.shown);
    const markedUp = read.some((p) => p.markedUp);

    return {
      state: "read",
      shown: shown ? true : incomplete ? null : false,
      evidence: Array.from(new Set(read.flatMap((p) => p.evidence))).sort().slice(0, EVIDENCE_LINES),
      markedUp: markedUp ? true : incomplete ? null : false,
      count,
      recency,
      widgetHosts: Array.from(new Set(read.flatMap((p) => p.hosts))).sort(),
    };
  } catch {
    return { state: "unreadable" };
  }
}

// ── Quote readiness (ENG-05) ─────────────────────────────────────────────

/** The per-trade terms the slice carries. The scanner holds no term list of its own. */
export type TradeChecks = NicheScanSlice["trades"][number]["checks"];

/** A form passes at exactly 2 fillable fields and fails at 1: a single field is a newsletter signup. */
export const MIN_QUOTE_FORM_FIELDS = 2;
/** Images needed beside a project term. A signal, not proof. */
export const MIN_PROJECT_IMAGES = 3;

const NOT_PASSED: OwnSiteCheck = { passed: false, evidence: "" };

/** The zones the checks read, taken once and shape-checked. null means the harvest is not the shape we expect. */
interface Zones {
  headings: string[];
  navTexts: string[];
  internalPaths: string[];
  telHrefs: string[];
  forms: Array<{ fieldCount: number; submitLabel: string }>;
  images: Array<{ alt: string; file: string }>;
  bodyText: string;
}

function strings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((v): v is string => typeof v === "string");
}

function readZones(harvest: OwnSiteHarvest): Zones | null {
  const h1 = strings(harvest.h1);
  const h2h3 = strings(harvest.h2h3);
  const navTexts = strings(harvest.navTexts);
  const internalPaths = strings(harvest.internalPaths);
  const telHrefs = strings(harvest.telHrefs);
  if (!h1 || !h2h3 || !navTexts || !internalPaths || !telHrefs) return null;
  if (!Array.isArray(harvest.formSummaries) || !Array.isArray(harvest.imgHints)) return null;
  if (typeof harvest.bodyText !== "string" || typeof harvest.title !== "string") return null;
  const forms = harvest.formSummaries
    .filter((f) => f !== null && typeof f === "object" && Number.isFinite(f.fieldCount))
    .map((f) => ({ fieldCount: f.fieldCount, submitLabel: typeof f.submitLabel === "string" ? f.submitLabel : "" }));
  const images = harvest.imgHints
    .filter((i) => i !== null && typeof i === "object")
    .map((i) => ({ alt: typeof i.alt === "string" ? i.alt : "", file: typeof i.file === "string" ? i.file : "" }));
  return {
    headings: [harvest.title, ...h1, ...h2h3],
    navTexts,
    internalPaths,
    telHrefs,
    forms,
    images,
    bodyText: harvest.bodyText,
  };
}

/** First term, in profile order, found in the first zone, in zone order: the same page always names the same match. */
function firstTermIn(
  terms: TermPair[],
  zones: Array<{ label: string; texts: string[] }>,
  matches: (haystack: string, term: string) => boolean
): { term: TermPair; label: string } | null {
  for (const term of terms) {
    for (const zone of zones) {
      if (zone.texts.some((text) => matches(normalizeForMatch(text), term.normalized))) return { term, label: zone.label };
    }
  }
  return null;
}

/** Quote form: a form with MIN_QUOTE_FORM_FIELDS or more fields, or a link or button naming a quote term. */
function checkQuoteForm(zones: Zones, terms: TermPair[]): OwnSiteCheck {
  const widest = zones.forms.reduce((max, f) => Math.max(max, Math.floor(f.fieldCount)), 0);
  if (widest >= MIN_QUOTE_FORM_FIELDS) return { passed: true, evidence: `form with ${widest} fillable fields` };
  const sources: Array<{ prefix: string; quote: boolean; texts: string[] }> = [
    { prefix: "link text", quote: true, texts: zones.navTexts },
    { prefix: "link path", quote: false, texts: zones.internalPaths },
    { prefix: "button text", quote: true, texts: zones.forms.map((f) => f.submitLabel) },
  ];
  for (const source of sources) {
    for (const text of source.texts) {
      const normalized = normalizeForMatch(text);
      if (terms.some((t) => startsAWord(normalized, t.normalized))) {
        return { passed: true, evidence: source.quote ? `${source.prefix}: "${clip(text)}"` : `${source.prefix}: ${clip(text)}` };
      }
    }
  }
  return NOT_PASSED;
}

/** Tap-to-call: an anchor whose href is the telephone scheme. Not a mailto, not a number in the text. */
function checkTapToCall(zones: Zones): OwnSiteCheck {
  const href = zones.telHrefs.map((h) => h.trim()).find((h) => h.toLowerCase().startsWith("tel:"));
  return href === undefined ? NOT_PASSED : { passed: true, evidence: `tel link: ${clip(href)}` };
}

/**
 * Project photos: a project term in the nav, an internal link path or a heading,
 * plus MIN_PROJECT_IMAGES images. 34 of 53 sampled pages carried a project word,
 * so this is a signal that a portfolio exists and not proof that it is good.
 */
function checkProjectPhotos(zones: Zones, terms: TermPair[]): OwnSiteCheck {
  if (zones.images.length < MIN_PROJECT_IMAGES) return NOT_PASSED;
  const hit = firstTermIn(
    terms,
    [
      { label: "nav", texts: zones.navTexts },
      { label: "link path", texts: zones.internalPaths },
      { label: "heading", texts: zones.headings },
    ],
    startsAWord
  );
  return hit === null
    ? NOT_PASSED
    : { passed: true, evidence: `"${clip(hit.term.original)}" in ${hit.label}, ${zones.images.length} images` };
}

/**
 * Certifications: whole words, in visible text, headings, nav, link paths and
 * image alt text or file names. Not in class attributes or script bodies, which
 * the harvest never carries. On the measured sample a raw-HTML substring count
 * read one short acronym 10 times, all noise, where visible text with word
 * boundaries read it zero times. Two real scheme mentions lived only in image
 * attributes, which is why those are read.
 */
function checkCertifications(zones: Zones, terms: TermPair[]): OwnSiteCheck {
  const hit = firstTermIn(
    terms,
    [
      { label: "heading", texts: zones.headings },
      { label: "nav", texts: zones.navTexts },
      { label: "visible text", texts: [zones.bodyText] },
      { label: "link path", texts: zones.internalPaths },
      { label: "image alt", texts: zones.images.map((i) => i.alt) },
      { label: "image file name", texts: zones.images.map((i) => i.file) },
    ],
    containsWords
  );
  return hit === null ? NOT_PASSED : { passed: true, evidence: `"${clip(hit.term.original)}" in ${hit.label}` };
}

/**
 * The four quote-readiness checks for one page, with the trade's terms from the
 * slice. A null harvest, a harvest of the wrong shape, or anything that throws
 * is "unreadable" for the page, never four false booleans: an absent check and
 * a failed check mean different things to a later to-do list.
 *
 * Existing detectors are not reused. hasCta has no Dutch quote word at all, and
 * hasContactInfo merges tel links with mailto links and body text, so it cannot
 * answer tap-to-call.
 *
 * Known limit: a full scan reads at most 7 pages and page priority has no entry
 * for quote or project words, so a quote page can go unread. The homepage's own
 * nav and link paths are the substitute evidence this reads.
 */
export function evaluateQuoteReadiness(harvest: OwnSiteHarvest | null, checks: TradeChecks): OwnSiteQuoteReadiness {
  try {
    if (harvest === null || harvest === undefined) return { state: "unreadable" };
    const zones = readZones(harvest);
    if (zones === null) return { state: "unreadable" };
    return {
      state: "evaluated",
      quoteForm: checkQuoteForm(zones, sliceTerms(checks?.quoteTerms)),
      tapToCall: checkTapToCall(zones),
      projectPhotos: checkProjectPhotos(zones, sliceTerms(checks?.projectTerms)),
      certifications: checkCertifications(zones, sliceTerms(checks?.certificationTerms)),
    };
  } catch {
    return { state: "unreadable" };
  }
}

const QUOTE_CHECK_KEYS = ["quoteForm", "tapToCall", "projectPhotos", "certifications"] as const;

/**
 * Fold per-page results into one for the site. A check passes when any page
 * passed it, with the smallest evidence string as its evidence so page order
 * never changes the stored value. A check that no page passed is only reported
 * as not passed when every page was read: a page that failed may have held it,
 * so with any failed page and any unproven check the whole site reads
 * "unreadable". That gives up the checks that did pass; it never states an
 * absence we did not measure.
 */
export function mergeQuoteReadiness(pages: ReadonlyArray<OwnSiteQuoteReadiness>): OwnSiteQuoteReadiness {
  const evaluated = pages.filter((p): p is Extract<OwnSiteQuoteReadiness, { state: "evaluated" }> => p.state === "evaluated");
  if (evaluated.length === 0) return { state: "unreadable" };
  const merged = {} as Record<(typeof QUOTE_CHECK_KEYS)[number], OwnSiteCheck>;
  for (const key of QUOTE_CHECK_KEYS) {
    const passing = evaluated.map((p) => p[key]).filter((c) => c.passed);
    merged[key] = passing.length === 0 ? NOT_PASSED : { passed: true, evidence: passing.map((c) => c.evidence).sort()[0] };
  }
  const failedPages = pages.length - evaluated.length;
  if (failedPages > 0 && QUOTE_CHECK_KEYS.some((k) => !merged[k].passed)) return { state: "unreadable" };
  return { state: "evaluated", ...merged };
}
