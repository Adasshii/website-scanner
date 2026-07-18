import type { SupabaseClient } from "@supabase/supabase-js";
import type { OverturePlaceRow } from "@/types/scanner";
import { isAggregatorDomain, normalizeDomain } from "./domain-normalize";

interface ProspectIdentitySnapshot {
  lifecycle_state: string;
  website_url: string | null;
  country: string;
}

/**
 * GERS-first-then-domain identity resolution (RESEARCH.md Pattern 1).
 *
 * A single Overture place row is either:
 *   1. A known source (same overture_gers_id seen before) — idempotent update (IMP-03).
 *   2. A domain collapse (new gersId, same registrable domain) — attaches a new
 *      prospect_sources row to the existing prospect (IMP-04).
 *   3. Brand new — inserts both prospects and prospect_sources (D-06/D-07).
 *
 * Postgres cannot express this as one INSERT ... ON CONFLICT (two arbiter
 * indexes on two different tables), so the branching lives here, in
 * application code; each branch is a single-table write.
 *
 * D-04 (freeze-by-omission): lifecycle_state, triage_score, triage_checked_at,
 * latest_scan_id, contact_email, contact_email_type are NEVER written by any
 * branch here except the brand-new INSERT. Re-import cannot touch Joshua's work.
 */
export async function upsertOverturePlace(
  sb: SupabaseClient,
  place: OverturePlaceRow,
  campaignTag: string | null
): Promise<{ prospectId: string; created: boolean }> {
  // Aggregator/directory links (tripadvisor.com, facebook.com, ...) must
  // never become prospect identity (D-01 audit follow-up, D-11 fix) — treat
  // them as no-website: null domain, null website_url on `prospects`. The
  // raw aggregator URL is still preserved below in every prospect_sources
  // raw_website_url write (place.websiteUrl, untouched), so nothing is lost.
  const isAggregator = place.websiteUrl ? isAggregatorDomain(place.websiteUrl) : false;
  const effectiveWebsiteUrl = isAggregator ? null : place.websiteUrl;
  const domain = effectiveWebsiteUrl ? normalizeDomain(effectiveWebsiteUrl) : null;

  // 1. Idempotency (IMP-03): have we imported this exact Overture record before?
  const { data: existingSource, error: sourceLookupError } = await sb
    .from("prospect_sources")
    .select("prospect_id")
    .eq("overture_gers_id", place.gersId)
    .maybeSingle();
  if (sourceLookupError) throw sourceLookupError;

  if (existingSource) {
    const { data: prospect, error: prospectError } = await sb
      .from("prospects")
      .select("lifecycle_state, website_url, country")
      .eq("id", existingSource.prospect_id)
      .single();
    if (prospectError) throw prospectError;

    const { error: sourceUpdateError } = await sb
      .from("prospect_sources")
      .update({
        raw_name: place.name,
        raw_address: place.address,
        raw_category: place.category,
        raw_region: place.region,
        raw_country: place.country,
        raw_website_url: place.websiteUrl,
        raw_confidence: place.confidence,
        last_seen_at: new Date().toISOString(),
      })
      .eq("overture_gers_id", place.gersId);
    if (sourceUpdateError) throw sourceUpdateError;
    // D-04: no write to prospects' work columns here, ever.

    // D-05/D-14: refresh website_url while 'new'; otherwise (including
    // no_website prospects, which are never 'new') flag it as pending —
    // this is also how a no_website prospect gaining a website is recorded,
    // without ever touching domain or lifecycle_state.
    await maybeRefreshWebsiteUrl(sb, existingSource.prospect_id, effectiveWebsiteUrl, prospect);
    // D-13: country is frozen always, even while 'new' — stricter than website_url.
    await maybeFlagCountry(sb, existingSource.prospect_id, place.country, prospect.country);

    return { prospectId: existingSource.prospect_id, created: false };
  }

  // 2. Collapse (IMP-04): does this domain already have a prospect?
  if (domain) {
    const { data: existingProspect, error: domainLookupError } = await sb
      .from("prospects")
      .select("id, lifecycle_state, website_url, country")
      .eq("domain", domain)
      .maybeSingle();
    if (domainLookupError) throw domainLookupError;

    if (existingProspect) {
      const { error: sourceInsertError } = await sb.from("prospect_sources").insert({
        prospect_id: existingProspect.id,
        overture_gers_id: place.gersId,
        raw_name: place.name,
        raw_address: place.address,
        raw_category: place.category,
        raw_region: place.region,
        raw_country: place.country,
        raw_website_url: place.websiteUrl,
        raw_confidence: place.confidence,
      });
      if (sourceInsertError) throw sourceInsertError;
      // D-03: first-seen wins — display fields NOT touched here.

      await maybeRefreshWebsiteUrl(sb, existingProspect.id, effectiveWebsiteUrl, existingProspect);
      await maybeFlagCountry(sb, existingProspect.id, place.country, existingProspect.country);

      return { prospectId: existingProspect.id, created: false };
    }
  }

  // 3. Brand new prospect (has-domain -> 'new', no-website -> 'no_website'; D-06/D-07).
  const { data: newProspect, error: insertError } = await sb
    .from("prospects")
    .insert({
      domain, // null for no-website prospects — partial unique index allows many NULLs
      name: place.name,
      address: place.address,
      category: place.category,
      region: place.region,
      country: place.country,
      website_url: effectiveWebsiteUrl,
      lifecycle_state: domain ? "new" : "no_website",
      campaign_tag: campaignTag,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  const { error: sourceInsertError } = await sb.from("prospect_sources").insert({
    prospect_id: newProspect.id,
    overture_gers_id: place.gersId,
    raw_name: place.name,
    raw_address: place.address,
    raw_category: place.category,
    raw_region: place.region,
    raw_country: place.country,
    raw_website_url: place.websiteUrl,
    raw_confidence: place.confidence,
  });
  if (sourceInsertError) throw sourceInsertError;

  return { prospectId: newProspect.id, created: true };
}

/**
 * D-05: website_url freezes once lifecycle_state leaves 'new'; a later change
 * is recorded as website_url_pending / website_url_changed_at for review,
 * never auto-applied.
 *
 * D-14 falls out of this same rule without special-casing: a no_website
 * prospect is never 'new', so a gained website always lands in the pending
 * branch below — domain and lifecycle_state are never written by this
 * function, so they stay untouched exactly as D-14 requires.
 */
async function maybeRefreshWebsiteUrl(
  sb: SupabaseClient,
  prospectId: string,
  incomingUrl: string | null,
  current: ProspectIdentitySnapshot
) {
  if (!incomingUrl || incomingUrl === current.website_url) return;

  if (current.lifecycle_state === "new") {
    const { error } = await sb
      .from("prospects")
      .update({ website_url: incomingUrl, updated_at: new Date().toISOString() })
      .eq("id", prospectId);
    if (error) throw error;
  } else {
    const { error } = await sb
      .from("prospects")
      .update({
        website_url_pending: incomingUrl,
        website_url_changed_at: new Date().toISOString(),
      })
      .eq("id", prospectId);
    if (error) throw error;
  }
}

/**
 * D-13: country is first-seen-wins AND frozen, always — even while 'new'
 * (stricter than website_url, which may refresh during 'new'). A differing
 * incoming country is recorded as country_pending / country_changed_at for
 * review; `country` itself is never written by an UPDATE.
 */
async function maybeFlagCountry(
  sb: SupabaseClient,
  prospectId: string,
  incomingCountry: string,
  currentCountry: string
) {
  if (!incomingCountry || incomingCountry === currentCountry) return;

  const { error } = await sb
    .from("prospects")
    .update({
      country_pending: incomingCountry,
      country_changed_at: new Date().toISOString(),
    })
    .eq("id", prospectId);
  if (error) throw error;
}
