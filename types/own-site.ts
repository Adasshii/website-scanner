/**
 * types/own-site.ts: Phase 9, ENG-01 (D-9-13).
 *
 * What the scanner reads off a prospect's own site, and how a missing field is
 * represented. Type-only, and under types/ on purpose: scanner-service/Dockerfile
 * already copies types/ and scanner-service/tsconfig.json already includes it,
 * which is what lets D-9-13 hold with no Dockerfile or tsconfig edit.
 *
 * Every business field is a FieldState with exactly one of three states, and
 * every key is always present in the stored object, so "which fields are
 * missing" is answerable in plain SQL without knowing which fields a given
 * schemaVersion produced.
 *
 *   found       the site publishes a value; source says which markup carried it
 *   missing     we could read the markup and the value is not there
 *   unreadable  we could not tell: markup existed that did not parse, or the
 *               harvest itself failed. Never read this as missing.
 */

/** Which markup carried a found value. JSON-LD wins when both exist. */
export type FieldSource = "jsonld" | "microdata";

/**
 * Why a field reads missing. The two reasons mean different things to a later
 * to-do list: no_structured_data means the site has no markup at all, while
 * not_in_markup means it has markup that leaves this field out.
 */
export type FieldMissingReason = "no_structured_data" | "not_in_markup";

export type FieldState<T> =
  | { state: "found"; value: T; source: FieldSource }
  | { state: "missing"; reason: FieldMissingReason }
  | { state: "unreadable" };

/** A published postal address. Absent parts are null so the key set is stable. */
export interface OwnSiteAddress {
  streetAddress: string | null;
  postalCode: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  /** Set when the site gave the whole address as one plain string. */
  text: string | null;
}

/**
 * Raw material the browser returns. Harvested in the page, parsed Node-side:
 * the browser context stays a thin harvester, the same split ContactExtraction
 * uses. Every list here is bounded by the caps in own-site-harvest.ts.
 */
export interface OwnSiteHarvest {
  /** Raw textContent of each JSON-LD script block, never parsed in the browser. */
  jsonLdBlocks: string[];
  /** How many JSON-LD blocks the page held before the block cap was applied. */
  jsonLdBlocksFound: number;
}

/** The business facts ENG-01 asks for, one FieldState per field. */
export interface OwnSiteBusinessFacts {
  address: FieldState<OwnSiteAddress>;
}

/** The stored shape. Plans 09-07 and 09-08 add their own members beside business. */
export interface OwnSiteFacts {
  schemaVersion: 1;
  /** ISO timestamp the facts were read. Injected by the caller, never taken from a clock here. */
  readAt: string;
  pagesRead: number;
  structuredData: {
    /** JSON-LD blocks harvested (after the cap). */
    jsonLdBlocks: number;
    /** Of those, how many failed to parse. */
    jsonLdInvalid: number;
    microdataItems: number;
  };
  business: OwnSiteBusinessFacts;
}
