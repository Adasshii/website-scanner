// Prospects that Atrium owns (decision 2026-11-12). Atrium finds the
// business and its generic address itself, then registers it here so the
// scanner's opt-out link and page work for it unchanged.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAggregatorDomain, normalizeDomain } from "@/lib/domain-normalize";
import { isSuppressed } from "@/lib/suppression";

export interface AtriumRegistration {
  name: string;
  websiteUrl: string;
  domain: string;
  contactEmail: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;

export function parseRegisterBody(
  body: unknown
): { ok: true; value: AtriumRegistration } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "body must be a JSON object" };
  const b = body as Record<string, unknown>;

  if (typeof b.name !== "string" || b.name.trim() === "") return { ok: false, error: "name is required" };
  if (typeof b.website !== "string" || b.website.trim() === "") return { ok: false, error: "website is required" };
  if (b.country !== "NL") return { ok: false, error: 'country must be "NL"' };
  if (b.contactEmailType !== "generic") return { ok: false, error: 'contactEmailType must be "generic"' };
  if (typeof b.contactEmail !== "string" || !EMAIL_RE.test(b.contactEmail.trim())) {
    return { ok: false, error: "contactEmail must be an email address" };
  }

  const website = b.website.trim();
  if (isAggregatorDomain(website)) return { ok: false, error: "website must be the business's own domain" };
  const domain = normalizeDomain(website);
  if (!domain) return { ok: false, error: "website has no registrable domain" };

  const contactEmail = b.contactEmail.trim().toLowerCase();
  if (normalizeDomain(contactEmail.split("@")[1]) !== domain) {
    return { ok: false, error: "contactEmail must be on the website's own domain" };
  }

  const websiteUrl = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  return { ok: true, value: { name: b.name.trim(), websiteUrl, domain, contactEmail } };
}

export type RegisterResult =
  | { kind: "registered"; prospectId: string; created: boolean }
  | { kind: "scanner_owned" }
  | { kind: "suppressed" };

/**
 * An address or domain on the suppression list is refused first, before any
 * write. Then upsert by normalised domain. A row the scanner owns is never taken over:
 * the result is scanner_owned and nothing is written (Atrium skips that
 * lead). A row Atrium already owns returns the same id, and its
 * contact_email becomes the address Atrium now sends to, because the
 * opt-out page suppresses prospects.contact_email. name, website_url and
 * country of an existing row are left as they are.
 */
export async function registerAtriumProspect(
  sb: SupabaseClient,
  input: AtriumRegistration
): Promise<RegisterResult> {
  if (await isSuppressed(sb, input.contactEmail)) return { kind: "suppressed" };

  const existing = await findByDomain(sb, input.domain);
  if (existing) return reuseExisting(sb, existing, input.contactEmail);

  const { data, error } = await sb
    .from("prospects")
    .insert({
      domain: input.domain,
      name: input.name,
      country: "NL",
      website_url: input.websiteUrl,
      lifecycle_state: "new",
      owner: "atrium",
      contact_email: input.contactEmail,
      contact_email_type: "generic",
    })
    .select("id")
    .single();

  if (error) {
    // 23505: a second request inserted the same domain between our lookup
    // and our insert. Treat it as the existing-row case.
    if (error.code === "23505") {
      const raced = await findByDomain(sb, input.domain);
      if (raced) return reuseExisting(sb, raced, input.contactEmail);
    }
    throw error;
  }

  return { kind: "registered", prospectId: data.id as string, created: true };
}

interface ExistingProspect {
  id: string;
  owner: string;
}

async function findByDomain(sb: SupabaseClient, domain: string): Promise<ExistingProspect | null> {
  const { data, error } = await sb.from("prospects").select("id, owner").eq("domain", domain).maybeSingle();
  if (error) throw error;
  return data ? { id: data.id as string, owner: data.owner as string } : null;
}

async function reuseExisting(
  sb: SupabaseClient,
  existing: ExistingProspect,
  contactEmail: string
): Promise<RegisterResult> {
  if (existing.owner !== "atrium") return { kind: "scanner_owned" };

  // The .eq("owner", "atrium") filter keeps this write off a scanner row
  // even if the owner changed since the lookup.
  const { error } = await sb
    .from("prospects")
    .update({ contact_email: contactEmail, contact_email_type: "generic", updated_at: new Date().toISOString() })
    .eq("id", existing.id)
    .eq("owner", "atrium");
  if (error) throw error;
  return { kind: "registered", prospectId: existing.id, created: false };
}
