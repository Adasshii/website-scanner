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
