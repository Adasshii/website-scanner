/**
 * lib/report-locale.ts — the injected `lookupProspectLocale` dependency for
 * lib/locale-resolution.ts's resolveVisitorLocale() (QUICK-260730-oiy). This
 * is the only Supabase-touching piece of the locale-resolution chain, kept
 * separate so the resolver itself stays pure and unit-testable with no
 * database.
 *
 * Never throws to its caller, matching the lib/draft-generator.ts
 * convention: any failure (missing scan, missing prospect, malformed id,
 * Supabase error) returns null and the resolver falls through to the next
 * signal.
 */
import { localeForCountry } from "@/lib/draft-prompt";
import { createServerClient } from "@/lib/supabase";
import type { Locale } from "@/i18n/config";

/**
 * Looks up the locale implied by a scan's prospect's country. Returns null
 * on any failure, including a non-uuid `scanId` from a hand-typed URL, which
 * makes Postgres error on the uuid comparison — the catch below turns that
 * into null and therefore into the English fallback.
 */
export async function lookupProspectLocale(
  scanId: string,
): Promise<Locale | null> {
  try {
    const supabase = createServerClient();

    const { data: scan, error: scanError } = await supabase
      .from("scans")
      .select("prospect_id")
      .eq("id", scanId)
      .maybeSingle();

    if (scanError || !scan?.prospect_id) return null;

    const { data: prospect, error: prospectError } = await supabase
      .from("prospects")
      .select("country")
      .eq("id", scan.prospect_id)
      .maybeSingle();

    if (prospectError || !prospect?.country) return null;

    return localeForCountry(prospect.country);
  } catch {
    return null;
  }
}
