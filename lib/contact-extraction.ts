/**
 * lib/contact-extraction.ts — pure aggregation + classification of contact
 * material harvested by scanner-service/src/extractor.ts (PageData.contactExtraction).
 * No Supabase client, no I/O — mirrors the injectable/pure-function style of
 * scripts/legal-basis.ts and lib/domain-normalize.ts, fully unit-testable
 * over literal fixtures (CON-02/03/04/06/07).
 *
 * Boundary note (Phase 6): keeping named-person prospects OUT of the default
 * outreach flow is Phase 6's draft-eligibility filter on
 * `contact_email_type = 'named-person'` — not this module's job (CON-05).
 */
import type { PageResult } from "@/types/scanner";
import { normalizeDomain } from "@/lib/domain-normalize";

// ── Types ────────────────────────────────────────────────────────────────

export type ContactEmailType = "generic" | "named-person";
export type SoleProprietorshipSignal = "yes" | "no" | "unknown";
/** Internal classification result — "excluded" (noreply@ etc.) never becomes a stored ContactEmailType. */
type LocalPartClass = ContactEmailType | "excluded";

export interface ContactCandidate {
  email: string;
  source: "mailto" | "cfemail" | "body";
}

export interface ContactResult {
  contactEmail: string | null;
  contactEmailType: ContactEmailType | null;
  commercialContactInvited: boolean;
  soleProprietorship: SoleProprietorshipSignal;
}

// ── Constants ────────────────────────────────────────────────────────────

/** RFC 5321 max mailbox length (Security V5) — anything longer is discarded. */
export const MAX_EMAIL_LEN = 254;

export const GENERIC_LOCALS = new Set([
  "info", "contact", "contactus", "hello", "hallo", "welkom", "mail",
  "admin", "administratie", "kantoor", "receptie", "secretariaat",
  "verkoop", "sales", "support", "klantenservice", "service", "help",
  "vragen", "afspraak", "afspraken", "aanmelden", "inschrijven",
  "boekingen", "reserveren", "reservations", "bookings", "praktijk",
  "office", "team", "general", "algemeen", "privacy", "marketing",
]);

/** Never a business contact address, regardless of match (dropped upstream). */
export const EXCLUDED_LOCALS = new Set([
  "noreply", "no-reply", "postmaster", "webmaster", "mailer-daemon",
]);

/** Retina-asset / stylesheet extensions (Pitfall 1 — "logo@2x.png" false positives). */
const ASSET_EXTENSIONS = new Set(["png", "jpg", "jpeg", "svg", "webp", "gif", "css", "js"]);

/** The ONLY positive eenmanszaak signal (D-5-01): literal string match. */
export const EENMANSZAAK_PATTERN = /eenmanszaak/i;
/** Negative signal (counter-evidence): explicit company form. */
export const COMPANY_FORM_PATTERN = /\b(B\.?V\.?|N\.?V\.?|besloten vennootschap|naamloze vennootschap)\b/i;

/** Small NL+EN keyword set inviting business/commercial contact (CON-06). */
export const COMMERCIAL_INVITE_PATTERN =
  /\b(offerte|zakelijk\w*|samenwerk\w*|partner(?:ship)?|adverteren|sponsor(?:ing)?|wholesale|reseller|dealer|vraag een demo|request a demo|business inquir\w*|quote aanvragen|request a quote)\b/i;

/** Reuses discovery.ts's own pagePriority() contact-path vocabulary — no second regex. */
export const CONTACT_PAGE_PATTERN = /\/(contact|kontakt|contacto|reach|get-in-touch)/i;

const BODY_EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// ── Pure extraction/decoding functions ──────────────────────────────────

/**
 * Decodes a Cloudflare `data-cfemail` token (XOR, first byte pair is the
 * key). Returns null for a garbage token (sanity-checked against a loose
 * email shape) — never throws.
 */
export function decodeCfEmail(token: string): string | null {
  if (!token || token.length < 4 || token.length % 2 !== 0) return null;
  const key = parseInt(token.substring(0, 2), 16);
  if (Number.isNaN(key)) return null;
  let email = "";
  for (let i = 2; i < token.length; i += 2) {
    const byte = parseInt(token.substring(i, i + 2), 16);
    if (Number.isNaN(byte)) return null;
    email += String.fromCharCode(byte ^ key);
  }
  const lower = email.trim().toLowerCase();
  return /.+@.+\..+/.test(lower) ? lower : null;
}

/**
 * Parses a raw `mailto:` href attribute value into a lowercased address:
 * strips the scheme, drops any query string, decodes percent-encoding.
 * Returns null when the remainder doesn't look like an address.
 */
export function parseMailtoHref(href: string): string | null {
  if (!href) return null;
  const withoutScheme = href.replace(/^mailto:/i, "");
  const withoutQuery = withoutScheme.split("?")[0] ?? "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    decoded = withoutQuery;
  }
  const email = decoded.trim().toLowerCase();
  return /.+@.+\..+/.test(email) ? email : null;
}

/**
 * Finds plain-text addresses in visible page text, plus obfuscated
 * "info [at] praktijk [dot] nl" / "(at)/(dot)" variants normalized to real
 * addresses. Discards any match whose domain ends in an image/asset
 * extension (Pitfall 1 — never scans outerHTML, but this is a second line
 * of defense).
 */
export function extractEmailsFromText(text: string): string[] {
  const deobfuscated = text
    .replace(/\s*\[at\]\s*|\s*\(at\)\s*|\s+at\s+/gi, "@")
    .replace(/\s*\[dot\]\s*|\s*\(dot\)\s*|\s+dot\s+/gi, ".");

  const raw = [
    ...(text.match(BODY_EMAIL_PATTERN) || []),
    ...(deobfuscated.match(BODY_EMAIL_PATTERN) || []),
  ].map((e) => e.toLowerCase());

  const seen = new Set<string>();
  const result: string[] = [];
  for (const email of raw) {
    if (seen.has(email)) continue;
    seen.add(email);
    const domain = email.split("@")[1] ?? "";
    const ext = domain.split(".").pop() ?? "";
    if (ASSET_EXTENSIONS.has(ext)) continue;
    result.push(email);
  }
  return result;
}

/**
 * Negative-space classification: NOT positively parsing "firstname.lastname"
 * (fragile for NL double surnames like "van der berg") — anything not on
 * the curated generic list (or a generic-/generic. prefix) is treated as
 * identifying a person. EXCLUDED_LOCALS return "excluded" so callers drop
 * them upstream — never a business contact address.
 */
export function classifyLocalPart(localPart: string): LocalPartClass {
  const normalized = localPart.toLowerCase().split("+")[0] ?? "";
  if (EXCLUDED_LOCALS.has(normalized)) return "excluded";
  if (GENERIC_LOCALS.has(normalized)) return "generic";
  const hasGenericPrefix = Array.from(GENERIC_LOCALS).some(
    (generic) => normalized.startsWith(`${generic}-`) || normalized.startsWith(`${generic}.`)
  );
  if (hasGenericPrefix) return "generic";
  return "named-person";
}

/**
 * Three-state resolution (D-5-01): "eenmanszaak" literal -> yes; explicit
 * company form ("B.V." etc.) with no eenmanszaak -> no; neither -> unknown.
 * Bare KVK/BTW numbers are deliberately never a signal (Pitfall 6).
 */
export function detectSoleProprietorship(text: string): SoleProprietorshipSignal {
  if (EENMANSZAAK_PATTERN.test(text)) return "yes";
  if (COMPANY_FORM_PATTERN.test(text)) return "no";
  return "unknown";
}

/** CON-06 — defaults false; true only when the page text invites business contact. */
export function detectCommercialInvite(text: string): boolean {
  return COMMERCIAL_INVITE_PATTERN.test(text);
}

// ── Aggregation (CON-01/03/04) ──────────────────────────────────────────

interface ScoredCandidate {
  email: string;
  classification: ContactEmailType;
  score: number;
}

/** Pattern 3 priority scoring: same-domain, generic, contact-page, structural source. */
function scoreCandidate(
  candidate: ContactCandidate,
  classification: ContactEmailType,
  pageUrl: string,
  siteDomain: string | null
): number {
  let score = 0;
  const emailDomain = normalizeDomain(candidate.email.split("@")[1] ?? "");
  if (siteDomain && emailDomain === siteDomain) score += 100; // same-domain (Pitfall 2)
  if (classification === "generic") score += 50; // CON-04
  try {
    if (CONTACT_PAGE_PATTERN.test(new URL(pageUrl).pathname)) score += 20;
  } catch {
    // Malformed page URL — no contact-page bonus, not a fatal error.
  }
  if (candidate.source === "mailto" || candidate.source === "cfemail") score += 10;
  return score;
}

/**
 * Walks each page's raw `contactExtraction`, builds classified candidates
 * from mailto/cfemail/body sources, discards excluded locals and oversized
 * emails (Security V5), scores and picks a single winner (CON-04: generic
 * beats named-person on a tie in kind), and rolls up soleProprietorship /
 * commercialContactInvited across every visited page's text. Pages without
 * `contactExtraction` (legacy scans) contribute nothing — never throws.
 */
export function aggregateContacts(pages: PageResult[], siteDomain: string | null): ContactResult {
  const scored: ScoredCandidate[] = [];
  const allText: string[] = [];

  for (const page of pages) {
    const extraction = page.data?.contactExtraction;
    if (!extraction) continue;
    allText.push(extraction.contactText || "");

    const candidates: ContactCandidate[] = [
      ...(extraction.mailtoHrefs || [])
        .map((href) => parseMailtoHref(href))
        .filter((email): email is string => email !== null)
        .map((email) => ({ email, source: "mailto" as const })),
      ...(extraction.cfemailTokens || [])
        .map((token) => decodeCfEmail(token))
        .filter((email): email is string => email !== null)
        .map((email) => ({ email, source: "cfemail" as const })),
      ...extractEmailsFromText(extraction.contactText || "").map((email) => ({
        email,
        source: "body" as const,
      })),
    ];

    for (const candidate of candidates) {
      if (candidate.email.length > MAX_EMAIL_LEN) continue; // Security V5
      const localPart = candidate.email.split("@")[0] ?? "";
      const classification = classifyLocalPart(localPart);
      if (classification === "excluded") continue;

      scored.push({
        email: candidate.email,
        classification,
        score: scoreCandidate(candidate, classification, page.url, siteDomain),
      });
    }
  }

  let winner: ScoredCandidate | null = null;
  for (const candidate of scored) {
    if (!winner || candidate.score > winner.score) winner = candidate; // first-seen wins ties
  }

  const combinedText = allText.join("\n");

  return {
    contactEmail: winner?.email ?? null,
    contactEmailType: winner?.classification ?? null,
    commercialContactInvited: detectCommercialInvite(combinedText),
    soleProprietorship: detectSoleProprietorship(combinedText),
  };
}
