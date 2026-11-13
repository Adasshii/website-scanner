import type {
  FieldState,
  FieldSource,
  OwnSiteAddress,
  OwnSiteBusinessFacts,
  OwnSiteCertifications,
  OwnSiteFactsCore,
  OwnSiteHarvest,
  OwnSiteOpeningHours,
  OwnSiteOpeningHoursEntry,
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

/** Skeleton: replaced by the implementation in the GREEN commit. */
export function extractSocialProof(
  pages: ReadonlyArray<OwnSiteHarvest | null>,
  slice: NicheScanSlice
): OwnSiteSocialProof {
  void pages;
  void slice;
  return { state: "unreadable" };
}
