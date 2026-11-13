import type {
  FieldState,
  FieldSource,
  OwnSiteAddress,
  OwnSiteBusinessFacts,
  OwnSiteFacts,
  OwnSiteHarvest,
} from "../../types/own-site";

/**
 * own-site-facts.ts: Phase 9, ENG-01. The pure Node-side parser that turns the
 * raw material harvestOwnSite() returns into OwnSiteFacts.
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

function unreadableFacts(meta: { readAt: string; pagesRead?: number }): OwnSiteFacts {
  return {
    schemaVersion: 1,
    readAt: meta.readAt,
    pagesRead: meta.pagesRead ?? 0,
    structuredData: { jsonLdBlocks: 0, jsonLdInvalid: 0, microdataItems: 0 },
    business: { address: { state: "unreadable" } },
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
 * Turn a harvest into OwnSiteFacts. A null harvest means the harvest itself
 * failed. Never throws: a bug here must not fail the scan, so anything
 * unexpected answers "unreadable".
 */
export function extractOwnSiteFacts(
  harvest: OwnSiteHarvest | null,
  meta: { readAt: string; pagesRead?: number }
): OwnSiteFacts {
  try {
    if (harvest === null) return unreadableFacts(meta);

    const rawBlocks = Array.isArray(harvest.jsonLdBlocks) ? harvest.jsonLdBlocks : [];
    const blocks = rawBlocks.filter((b): b is string => typeof b === "string").slice(0, MAX_BLOCKS);

    const state: ParseState = {
      blocksHarvested: blocks.length,
      blocksInvalid: 0,
      blocksParsed: 0,
      microdataItems: 0,
      incomplete:
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

    const ctx: Context = { byId: indexById(nodes) };
    const ordered = businessNodesInPriorityOrder(nodes);

    const business: OwnSiteBusinessFacts = {
      address: pickField(ordered, readAddress, ctx, () => absentFor<OwnSiteAddress>(state)),
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
