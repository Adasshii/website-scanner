/**
 * lib/google-content-guard.ts: Phase 9, ENG-07 (D-9-R4). Vocabulary and
 * detectors behind lib/google-content-guard.test.ts.
 *
 * The rule (Maps Platform Terms, section 3.2.3): nothing Google returns is
 * stored, except the place_id. No Google call exists in this phase. The guard
 * ships first so that Phase 12 inherits a rule that is already enforced.
 *
 * Honest limit: a static token ban cannot catch a write that copies a Google
 * response object wholesale. Two controls cover that gap:
 *   1. The endpoint allowlist in the test confines any Google call to the one
 *      file named in ALLOWED_GOOGLE_CLIENT_FILES (empty today; Phase 12 adds
 *      exactly one entry).
 *   2. toStorableGooglePlace is a runtime allowlist that client must call. It
 *      builds its result field by field from GOOGLE_STORABLE_FIELDS and never
 *      spreads the raw object, so a response that grows new fields cannot
 *      carry them through it into a write.
 *
 * Generic words that Overture already owns (name, address, rating, reviews,
 * latitude, longitude) are deliberately NOT banned as free-standing source
 * tokens: the own-site trust-signal code and the D-9-16 coordinates use them
 * legitimately. `displayName` is not banned either: React sets it on its own
 * components, and banning it buys nothing.
 *
 * This file names the banned tokens, so the test excludes it from its own scan.
 */

/** The only Google-derived value that may be written anywhere. */
export const GOOGLE_STORABLE_FIELDS = ["place_id"] as const;

/** Distinctive Places field names, in camelCase and snake_case spellings. */
export const GOOGLE_BANNED_FIELD_TOKENS: readonly string[] = [
  "userRatingCount",
  "user_ratings_total",
  "formattedAddress",
  "formatted_address",
  "shortFormattedAddress",
  "regularOpeningHours",
  "currentOpeningHours",
  "internationalPhoneNumber",
  "international_phone_number",
  "nationalPhoneNumber",
  "national_phone_number",
  "websiteUri",
  "editorialSummary",
  "generativeSummary",
  "reviewSummary",
  "googleMapsUri",
  "businessStatus",
  "priceLevel",
  "addressComponents",
  "address_components",
  "plusCode",
  "pureServiceAreaBusiness",
];

/**
 * Snake_case column names a Supabase table must never carry. Matched as whole
 * identifiers, so the Overture-owned columns (name, address, raw_address,
 * raw_name) are not reached. place_id is the only permitted Google-derived one.
 */
export const GOOGLE_BANNED_COLUMN_TOKENS: readonly string[] = [
  "formatted_address",
  "short_formatted_address",
  "user_ratings_total",
  "user_rating_count",
  "regular_opening_hours",
  "current_opening_hours",
  "opening_hours",
  "international_phone_number",
  "national_phone_number",
  "website_uri",
  "editorial_summary",
  "generative_summary",
  "review_summary",
  "google_maps_uri",
  "business_status",
  "price_level",
  "address_components",
  "plus_code",
  "display_name",
  "rating",
  "reviews",
  "google_rating",
  "place_rating",
];

/** Google endpoint hosts, header and env-var names. Matched case-insensitively. */
export const GOOGLE_ENDPOINT_TOKENS: readonly string[] = [
  "places.googleapis",
  "maps.googleapis",
  "X-Goog",
  "GOOGLE_PLACES",
  "GOOGLE_MAPS",
];

/** The one file allowed to talk to a Google endpoint. Phase 12 adds exactly one entry. */
export const ALLOWED_GOOGLE_CLIENT_FILES: readonly string[] = [];

/**
 * Scanned explicitly, never the repo root: .claude/worktrees/ holds full repo
 * copies and scanner-service/dist holds compiled output.
 */
export const GUARDED_SOURCE_ROOTS: readonly string[] = ["lib", "app", "scanner-service/src", "scripts", "types"];

const LINE_COMMENT_MARKER = "//";
const BLOCK_COMMENT_CONTINUATION_MARKER = "*";

/**
 * Drops every line whose trimmed form begins with a line-comment marker or a
 * block-comment continuation marker (copied from lib/outreach-isolation.test.ts).
 * A matcher that read comments would fail on its own documentation.
 */
function stripCommentLines(source: string): string[] {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) => line.length > 0 && !line.startsWith(LINE_COMMENT_MARKER) && !line.startsWith(BLOCK_COMMENT_CONTINUATION_MARKER)
    );
}

const IDENTIFIER_CHAR = "A-Za-z0-9_";

function containsWholeIdentifier(text: string, token: string): boolean {
  const pattern = new RegExp(`(?<![${IDENTIFIER_CHAR}])${token}(?![${IDENTIFIER_CHAR}])`);
  return pattern.test(text);
}

/** Non-comment lines of `source` that name a banned Places field, as `token: line`. */
export function findGoogleFieldViolations(source: string): string[] {
  const violations: string[] = [];
  for (const line of stripCommentLines(source)) {
    for (const token of GOOGLE_BANNED_FIELD_TOKENS) {
      if (containsWholeIdentifier(line, token)) violations.push(`${token}: ${line}`);
    }
  }
  return violations;
}

/** Non-comment lines of `source` that name a Google endpoint host, header or env var, as `token: line`. */
export function findGoogleEndpointViolations(source: string): string[] {
  const violations: string[] = [];
  for (const line of stripCommentLines(source)) {
    const lowered = line.toLowerCase();
    for (const token of GOOGLE_ENDPOINT_TOKENS) {
      if (lowered.includes(token.toLowerCase())) violations.push(`${token}: ${line}`);
    }
  }
  return violations;
}

function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** The text between the parenthesis opened at `openIndex` and its match, or null when unbalanced. */
function readBalancedBody(sql: string, openIndex: number): string | null {
  let depth = 0;
  for (let i = openIndex; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") {
      depth--;
      if (depth === 0) return sql.slice(openIndex + 1, i);
    }
  }
  return null;
}

/** Splits a create-table body on commas that sit at parenthesis depth zero. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "(") depth++;
    else if (body[i] === ")") depth--;
    else if (body[i] === "," && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  return parts;
}

const TABLE_CONSTRAINT_KEYWORDS = new Set(["constraint", "primary", "foreign", "unique", "check", "exclude", "like"]);

/** Column identifiers from `create table` bodies, `add column` and `rename column ... to` statements. */
function extractColumnNames(sql: string): string[] {
  const clean = stripSqlComments(sql);
  const columns: string[] = [];

  const createPattern = /create\s+(?:unlogged\s+|temp(?:orary)?\s+)?table\s+(?:if\s+not\s+exists\s+)?[^\s(]+\s*\(/gi;
  for (const match of Array.from(clean.matchAll(createPattern))) {
    const openIndex = match.index + match[0].length - 1;
    const body = readBalancedBody(clean, openIndex);
    if (body === null) continue;
    for (const item of splitTopLevel(body)) {
      const first = item.trim().match(/^"?([A-Za-z_][A-Za-z0-9_]*)"?/);
      if (!first) continue;
      if (TABLE_CONSTRAINT_KEYWORDS.has(first[1].toLowerCase())) continue;
      columns.push(first[1].toLowerCase());
    }
  }

  const addColumnPattern = /add\s+column\s+(?:if\s+not\s+exists\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;
  for (const match of Array.from(clean.matchAll(addColumnPattern))) {
    columns.push(match[1].toLowerCase());
  }
  const renameColumnPattern = /rename\s+column\s+"?[A-Za-z_][A-Za-z0-9_]*"?\s+to\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;
  for (const match of Array.from(clean.matchAll(renameColumnPattern))) {
    columns.push(match[1].toLowerCase());
  }
  return columns;
}

/** Banned column names declared by the SQL, matched as whole identifiers, as `column "name"`. */
export function findGoogleColumnViolations(sql: string): string[] {
  const banned = new Set(GOOGLE_BANNED_COLUMN_TOKENS);
  return extractColumnNames(sql)
    .filter((column) => banned.has(column))
    .map((column) => `column "${column}"`);
}

/**
 * Runtime allowlist for a Google Places response. Built field by field from
 * GOOGLE_STORABLE_FIELDS, never by spreading `raw`, so new fields Google adds
 * cannot pass through this helper into a write. Throws when place_id is not a
 * non-empty string, because a row without it has nothing to key on.
 */
export function toStorableGooglePlace(raw: Record<string, unknown>): { place_id: string } {
  const stored: Record<string, unknown> = {};
  for (const field of GOOGLE_STORABLE_FIELDS) {
    stored[field] = raw[field];
  }
  const placeId = stored.place_id;
  if (typeof placeId !== "string" || placeId.length === 0) {
    throw new Error("toStorableGooglePlace: raw response carries no place_id");
  }
  return { place_id: placeId };
}
