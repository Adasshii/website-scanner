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

/**
 * Which part of the site carried a found value. JSON-LD wins when both markups
 * exist. "visible_text" is a value read from a sentence the site prints for its
 * visitors (a review count phrase), used only when no markup carried the value.
 */
export type FieldSource = "jsonld" | "microdata" | "visible_text";

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
  /** Top-level microdata items, converted to the JSON-LD-like pool Node-side. */
  microdata: MicrodataItem[];
  /** Microdata items harvested in total, nested ones included, after the cap. */
  microdataCount: number;
  /** True when a microdata cap cut the walk short, so an absence may be "could not tell". */
  microdataTruncated: boolean;

  // Zones plans 09-07 and 09-08 read. Harvested now so neither has to reopen
  // the browser boundary. Not persisted: they travel in memory beside the page
  // result, the way the screenshot buffers do.
  title: string;
  h1: string[];
  h2h3: string[];
  /** Anchor text inside nav, [role=navigation] and header. */
  navTexts: string[];
  /** Pathnames of internal anchors, deduped. */
  internalPaths: string[];
  /** First 20,000 characters of the visible text. */
  bodyText: string;
  telHrefs: string[];
  formSummaries: OwnSiteFormSummary[];
  imgHints: OwnSiteImgHint[];
  /** Hostnames of script[src] and iframe[src]. */
  widgetHosts: string[];
}

export interface OwnSiteFormSummary {
  /** Visible input, select and textarea fields; hidden and button-like inputs do not count. */
  fieldCount: number;
  submitLabel: string;
}

export interface OwnSiteImgHint {
  alt: string;
  /** The filename part of the src, without path or query. */
  file: string;
}

/** A microdata value is trimmed text or a nested item. */
export type MicrodataValue = string | MicrodataItem;

/** Raw microdata item as the browser reads it: itemtype plus its itemprop values. */
export interface MicrodataItem {
  /** The raw itemtype attribute, possibly several space-separated URLs. */
  type: string;
  props: Record<string, MicrodataValue[]>;
}

/** Published telephone numbers, each with at least 9 digits. */
export interface OwnSiteTelephone {
  numbers: string[];
}

export interface OwnSiteOpeningHoursEntry {
  /** Lower-case full day names, e.g. "monday". */
  days: string[];
  opens: string | null;
  closes: string | null;
  /** The original string when the entry came from an openingHours string. */
  raw: string | null;
}

export interface OwnSiteOpeningHours {
  entries: OwnSiteOpeningHoursEntry[];
  /**
   * True when every day of the week spans midnight to one minute before
   * midnight. That is a plugin placeholder seen in the real sample, not
   * published hours. Stored rather than discarded so Phases 11 and 12 decide
   * its weight.
   */
  looksDefault: boolean;
}

export interface OwnSiteServiceArea {
  names: string[];
  /** Set when the site gave a GeoShape or GeoCircle. */
  geoShape: { latitude: number | null; longitude: number | null; radius: string | null } | null;
}

export interface OwnSiteCertifications {
  names: string[];
}

/**
 * What harvestOwnSite() answers when a slice was requested. A failure in the
 * harvest is a value, not an exception: it must never fail the page.
 */
export type OwnSiteHarvestOutcome =
  | { state: "harvested"; harvest: OwnSiteHarvest }
  | { state: "unreadable" };

/** The business facts ENG-01 asks for, one FieldState per field. */
export interface OwnSiteBusinessFacts {
  address: FieldState<OwnSiteAddress>;
  telephone: FieldState<OwnSiteTelephone>;
  openingHours: FieldState<OwnSiteOpeningHours>;
  serviceArea: FieldState<OwnSiteServiceArea>;
  certifications: FieldState<OwnSiteCertifications>;
}

/**
 * What the site shows about reviews (ENG-02). Read as a whole, across every
 * page of the site, so the host list and the resolved count do not depend on
 * which page was read first.
 *
 * Three honest states, the same discipline as FieldState:
 *   unreadable  no page could be read at all, so nothing is claimed
 *   read        pages were read; shown and markedUp are true when a signal was
 *               found, false when every page was read in full and none was
 *               found, and null when a signal was not found but something
 *               (a JSON-LD block that did not parse, a cap, a failed page)
 *               means it may have been there. null is "could not tell", never
 *               "not there".
 *
 * count and recency are FieldState values. Their source records where the
 * number came from: the site's own markup or its own visible text. It is what
 * the site says about itself and is never a Google figure (D-9-R4).
 */
export type OwnSiteSocialProof =
  | { state: "unreadable" }
  | {
      state: "read";
      shown: boolean | null;
      /** What matched, one short line each, sorted and deduplicated. */
      evidence: string[];
      /** An AggregateRating or Review node exists in the site's markup. */
      markedUp: boolean | null;
      /** Review count; reviewCount is trusted before ratingCount, then visible text. */
      count: FieldState<number>;
      /** Date of the newest review that carries a datePublished in markup. */
      recency: FieldState<string>;
      /** Hostnames of review widgets found, sorted and deduplicated. */
      widgetHosts: string[];
    };

/** One quote-readiness check: whether it passed and what matched. Evidence is "" when nothing did, never null. */
export interface OwnSiteCheck {
  passed: boolean;
  evidence: string;
}

/**
 * Whether a customer can actually ask for a quote (ENG-05): four checks, each a
 * boolean with its evidence, computed from integer counts and literal term
 * matches only, so no rounding or tie-breaking contract exists.
 *
 * "unreadable" is a whole-page state, not four false booleans: the harvest for
 * the page failed, so an absent check and a failed check must not look alike.
 * A later to-do list proposes a fix only for what is genuinely missing.
 */
export type OwnSiteQuoteReadiness =
  | { state: "unreadable" }
  | {
      state: "evaluated";
      /** A form with at least 2 fillable fields, or a link or button naming a quote term. */
      quoteForm: OwnSiteCheck;
      /** An anchor whose href is the telephone scheme. Not a number in the text, not a mailto. */
      tapToCall: OwnSiteCheck;
      /** A project term in nav, a link path or a heading, plus enough images. A signal, not proof. */
      projectPhotos: OwnSiteCheck;
      /** A trade certification term as whole words in text, link paths or image attributes. */
      certifications: OwnSiteCheck;
    };

/**
 * What one invocation of the business-fact extractor produces. The stored
 * OwnSiteFacts adds the members other extractors own.
 */
export interface OwnSiteFactsCore {
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

/**
 * The stored shape. Still awaited, so a partially populated type is not read as
 * an oversight: `trade` arrives in plan 09-08 (trade detection), and plan 09-09
 * owns the aggregation across pages and the persistence that assembles these
 * members into one stored value.
 */
export interface OwnSiteFacts extends OwnSiteFactsCore {
  socialProof: OwnSiteSocialProof;
  quoteReadiness: OwnSiteQuoteReadiness;
}
