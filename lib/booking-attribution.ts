/**
 * lib/booking-attribution.ts — D-7-06/07/08's booking-to-prospect matcher.
 * Called from exactly one place: the guarded post-step inside
 * `POST /api/webhooks/fillout`, after the existing leads update has already
 * run and returned. This module is the only writer of `prospects.booked_at`
 * and `prospects.booked_match_method` in the codebase — that column pair is
 * the marker `deriveLifecycleState()` reads for its `booked` rung (Reporting
 * Booked card, plan 07-02; Shortlist Stage pill, plan 07-04).
 *
 * `failed` is never returned by this module. The route's own catch block
 * sets it when this module throws or rejects, so the response can report a
 * swallowed error without this module pretending to have an opinion about
 * HTTP status codes (D-7-09).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeDomain, isAggregatorDomain } from "@/lib/domain-normalize";

export type BookingAttributionOutcome =
  | "attributed"
  | "already_booked"
  | "no_match"
  | "no_sent_outreach"
  | "ambiguous"
  | "failed";

export interface BookingAttribution {
  outcome: BookingAttributionOutcome;
  prospectId: string | null;
  matchMethod: "email" | "domain" | null;
}

const NO_MATCH: BookingAttribution = { outcome: "no_match", prospectId: null, matchMethod: null };

/**
 * Resolves a booking email to at most one prospect and, if the D-7-08
 * sent-gate allows it, writes that prospect's `booked_at`/`booked_match_method`.
 *
 * Candidate resolution:
 *   1. Email-exact match on `contact_email` — an unbounded array query
 *      (07-09, closing 07-REVIEW.md WR-01), never a Supabase terminator that
 *      throws on >1 row: `contact_email` carries no unique index, so a
 *      shared mailbox is an ordinary data state, not an anomaly. This closes
 *      FA-TRK-04.
 *   2. Only when step 1 finds nothing: domain fallback on `domain`, also an
 *      unbounded array query, screened through the same aggregator-domain
 *      helper `upsertOverturePlace()` uses so this module never grows a
 *      second denylist.
 * A found-but-not-attributable prospect from step 1 is not a miss — this
 * never falls through to step 2 once step 1 found rows, even if the contact
 * gate below then rejects them. Falling through would hand the booking to a
 * different prospect that merely shares the domain.
 *
 * Neither candidate query is capped. Ambiguity is a property of the
 * post-gate candidate set (`gatedIds.size` below), not of a query limit — a
 * `.limit(2)` here could return two ungated rows while the one genuinely
 * gated prospect fell outside the fetched set, silently reporting
 * `no_sent_outreach` or crediting the wrong prospect once 3+ prospects share
 * an email (07-REVIEW.md WR-01). The candidate set this removal exposes the
 * function to is bounded honestly, not left unbounded: it is as large as the
 * number of prospects sharing one mailbox address, which at 10-50 prospects
 * a week over roughly 800 rows is a handful — well under
 * SHORTLIST_ID_CHUNK_SIZE, the threshold lib/triage-candidates.ts documents
 * for the same `.in()` shape elsewhere. That is the accepted reason no
 * chunking is added here; revisit only if a single address is ever observed
 * on more than a few dozen prospects.
 */
export async function attributeBookingToProspect(
  sb: SupabaseClient,
  email: string,
  now: string
): Promise<BookingAttribution> {
  const address = email.trim().toLowerCase();

  // Step 1: email-exact. contact_email is stored lowercased by
  // lib/contact-extraction.ts, which is what makes this comparison valid.
  const { data: emailMatches, error: emailError } = await sb
    .from("prospects")
    .select("id")
    .eq("contact_email", address);
  if (emailError) throw emailError;

  let candidateIds: string[];
  let matchMethod: "email" | "domain";

  if (emailMatches && emailMatches.length > 0) {
    candidateIds = emailMatches.map((row) => row.id as string);
    matchMethod = "email";
  } else {
    // Step 2: domain fallback, only on an email miss.
    const atIndex = address.indexOf("@");
    const addressDomain = atIndex >= 0 ? address.slice(atIndex + 1) : "";
    const domain = normalizeDomain(addressDomain);
    if (!domain || isAggregatorDomain(domain)) {
      return NO_MATCH;
    }

    const { data: domainMatches, error: domainError } = await sb
      .from("prospects")
      .select("id")
      .eq("domain", domain);
    if (domainError) throw domainError;

    if (!domainMatches || domainMatches.length === 0) {
      return NO_MATCH;
    }
    candidateIds = domainMatches.map((row) => row.id as string);
    matchMethod = "domain";
  }

  // Contact gate + disambiguation (D-7-08), one query serving both: only a
  // candidate with a `sent` outreach row can be credited, and more than one
  // surviving candidate is ambiguous rather than a guess.
  const { data: sentRows, error: sentError } = await sb
    .from("outreach_messages")
    .select("prospect_id")
    .in("prospect_id", candidateIds)
    .eq("status", "sent");
  if (sentError) throw sentError;

  const gatedIds = new Set((sentRows ?? []).map((row) => row.prospect_id as string));

  if (gatedIds.size === 0) {
    return { outcome: "no_sent_outreach", prospectId: null, matchMethod: null };
  }
  if (gatedIds.size > 1) {
    console.warn(
      `[booking-attribution] ambiguous match: ${gatedIds.size} candidates via ${matchMethod}`
    );
    return { outcome: "ambiguous", prospectId: null, matchMethod: null };
  }

  const prospectId = Array.from(gatedIds)[0];

  // Write, first-write-wins (same idiom as the leads update at route.ts:50).
  const { data: written, error: writeError } = await sb
    .from("prospects")
    .update({ booked_at: now, booked_match_method: matchMethod })
    .eq("id", prospectId)
    .is("booked_at", null)
    .select("id");
  if (writeError) throw writeError;

  if (written && written.length > 0) {
    return { outcome: "attributed", prospectId, matchMethod };
  }
  return { outcome: "already_booked", prospectId, matchMethod };
}
