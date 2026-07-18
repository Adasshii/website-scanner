import { getDomain } from "tldts";

export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainValidationError";
  }
}

/**
 * Reduces a URL/hostname to its registrable domain (public-suffix aware).
 * Returns null when tldts finds no registrable domain (IPs, localhost,
 * malformed/empty input) — never throws on bad Overture data (IMP-04).
 */
export function normalizeDomain(input: string): string | null {
  if (!input || !input.trim()) return null;
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const domain = getDomain(withScheme);
  return domain ? domain.toLowerCase() : null;
}

/**
 * Aggregator/directory/social registrable domains that must never become a
 * prospect's identity (D-01 audit follow-up). If every restaurant on
 * TripAdvisor listed `tripadvisor.com` as its "website", they would all
 * collapse into one wrong prospect via the domain-collapse branch of
 * upsertOverturePlace() — an aggregator link is not the business's own site.
 */
export const AGGREGATOR_DOMAINS = new Set([
  "tripadvisor.com",
  "facebook.com",
  "instagram.com",
  "linktr.ee",
  "google.com",
  "thuisbezorgd.nl",
  "ubereats.com",
  "deliveroo.nl",
  "yelp.com",
  "foursquare.com",
  "booking.com",
]);

/**
 * True when a URL/hostname's registrable domain (via normalizeDomain) is a
 * known aggregator/directory/social domain — never the business's own site.
 */
export function isAggregatorDomain(input: string): boolean {
  const domain = normalizeDomain(input);
  return domain !== null && AGGREGATOR_DOMAINS.has(domain);
}
