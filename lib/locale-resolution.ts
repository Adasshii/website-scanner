/**
 * lib/locale-resolution.ts — the single place a visitor's locale is decided
 * (QUICK-260730-oiy). Used by i18n/request.ts's getRequestConfig, which runs
 * on every request, so nothing in this file may throw.
 *
 * Precedence, first hit wins:
 *   1. The `NEXT_LOCALE` cookie (the EN/NL toggle). A deliberate choice
 *      always wins.
 *   2. The prospect's country, for `/report/<id>` requests only. The report
 *      must match the Dutch outreach email the prospect just read,
 *      deterministically, even when their browser is set to English.
 *   3. Accept-Language, negotiated by q-value. It sits below prospect
 *      country because a prospect's browser locale can lag or differ from
 *      the country the outreach email was actually sent in.
 *   4. `defaultLocale` ("en").
 *
 * Pure module: no Supabase import, no `next/headers` import. The Supabase
 * lookup is injected as `lookupProspectLocale` (see lib/report-locale.ts) so
 * this file stays unit-testable with no database.
 *
 * `Locale` is imported from `@/i18n/config`, not redeclared here.
 * lib/draft-prompt.ts declares a structurally identical `Locale` union — the
 * two staying identical is what keeps report language and outreach email
 * language in lockstep.
 */
import { defaultLocale, isLocale, locales, type Locale } from "@/i18n/config";

/**
 * Parses an Accept-Language header into the best supported locale, honoring
 * q-value negotiation (RFC 4647): a missing q defaults to 1.0, `q=0` means
 * "not acceptable", and equal q-values keep document order (a stable sort).
 * Never throws; returns null for null, empty, or unparseable input, or when
 * no supported tag survives.
 */
export function parseAcceptLanguage(
  header: string | null | undefined,
): Locale | null {
  if (!header) return null;

  try {
    const candidates: Array<{ tag: Locale; q: number }> = [];

    for (const rawEntry of header.split(",")) {
      const entry = rawEntry.trim();
      if (!entry) continue;

      const parts = entry.split(";");
      const rawTag = parts[0]?.trim().toLowerCase();
      if (!rawTag || rawTag === "*") continue;

      const baseTag = rawTag.split("-")[0];
      if (!baseTag || !(locales as readonly string[]).includes(baseTag)) {
        continue;
      }

      let q = 1.0;
      for (const param of parts.slice(1)) {
        const trimmedParam = param.trim();
        if (!trimmedParam.startsWith("q=")) continue;
        const parsed = Number.parseFloat(trimmedParam.slice(2));
        q = Number.isNaN(parsed) ? 0 : parsed;
      }
      if (q < 0) q = 0;
      if (q <= 0) continue;

      candidates.push({ tag: baseTag as Locale, q });
    }

    if (candidates.length === 0) return null;

    // Stable sort (Node 18+) keeps equal-q entries in document order.
    candidates.sort((a, b) => b.q - a.q);

    return candidates[0].tag;
  } catch {
    return null;
  }
}

/**
 * Extracts the scan id from a `/report/<id>` pathname (an optional single
 * trailing slash is the same page). Returns null for anything else,
 * including `/reports`, `/report`, and `/report/<id>/anything`.
 */
export function reportScanIdFromPathname(
  pathname: string | null | undefined,
): string | null {
  if (!pathname) return null;

  const match = pathname.match(/^\/report\/([^/]+)\/?$/);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export interface ResolveVisitorLocaleInput {
  cookieLocale?: string | null;
  pathname?: string | null;
  acceptLanguage?: string | null;
  lookupProspectLocale: (scanId: string) => Promise<Locale | null>;
}

/**
 * Resolves the visitor's locale from four signals, first hit wins. Never
 * rejects: a failing lookup degrades to the next signal.
 */
export async function resolveVisitorLocale(
  input: ResolveVisitorLocaleInput,
): Promise<Locale> {
  const { cookieLocale, pathname, acceptLanguage, lookupProspectLocale } =
    input;

  if (isLocale(cookieLocale)) {
    return cookieLocale;
  }

  const scanId = reportScanIdFromPathname(pathname);
  if (scanId) {
    try {
      const prospectLocale = await lookupProspectLocale(scanId);
      if (prospectLocale) return prospectLocale;
    } catch {
      // Fail open: fall through to the next signal.
    }
  }

  const acceptLanguageLocale = parseAcceptLanguage(acceptLanguage);
  if (acceptLanguageLocale) return acceptLanguageLocale;

  return defaultLocale;
}
