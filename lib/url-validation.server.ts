import dns from "dns/promises";
import { validateUrlFormat, UrlValidationError } from "./url-validation";

export { UrlValidationError, extractDomain } from "./url-validation";

// Private/reserved IP ranges to block (SSRF protection)
const BLOCKED_IP_RANGES = [
  // IPv4 private (RFC 1918)
  { check: (ip: string) => ip.startsWith("10.") },
  {
    check: (ip: string) => {
      const parts = ip.split(".");
      const second = parseInt(parts[1], 10);
      return parts[0] === "172" && second >= 16 && second <= 31;
    },
  },
  { check: (ip: string) => ip.startsWith("192.168.") },
  // Loopback
  { check: (ip: string) => ip.startsWith("127.") },
  // Link-local (cloud metadata endpoints)
  { check: (ip: string) => ip.startsWith("169.254.") },
  // Current network
  { check: (ip: string) => ip.startsWith("0.") },
];

const BLOCKED_HOSTNAMES = [
  "metadata.google.internal",
  "metadata.google.com",
  "localhost",
];

function isPrivateIPv4(ip: string): boolean {
  return BLOCKED_IP_RANGES.some((range) => range.check(ip));
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80")
  );
}

/**
 * Server-side URL validation with SSRF protection.
 * Validates format, resolves DNS, and blocks private/reserved IPs.
 */
export async function validateUrlSafe(input: string): Promise<string> {
  const url = validateUrlFormat(input);
  const parsed = new URL(url);

  // Block known metadata hostnames
  if (BLOCKED_HOSTNAMES.includes(parsed.hostname.toLowerCase())) {
    throw new UrlValidationError("This hostname is not allowed.");
  }

  // Resolve DNS and check IP addresses
  try {
    const ipv4Addresses = await dns.resolve4(parsed.hostname).catch(() => []);
    const ipv6Addresses = await dns.resolve6(parsed.hostname).catch(() => []);

    if (ipv4Addresses.length === 0 && ipv6Addresses.length === 0) {
      throw new UrlValidationError(
        "Could not resolve this domain. Please check the URL and try again."
      );
    }

    for (const ip of ipv4Addresses) {
      if (isPrivateIPv4(ip)) {
        throw new UrlValidationError(
          "This URL points to a private network and cannot be scanned."
        );
      }
    }

    for (const ip of ipv6Addresses) {
      if (isPrivateIPv6(ip)) {
        throw new UrlValidationError(
          "This URL points to a private network and cannot be scanned."
        );
      }
    }
  } catch (error) {
    if (error instanceof UrlValidationError) throw error;
    throw new UrlValidationError(
      "Could not resolve this domain. Please check the URL and try again."
    );
  }

  return url;
}
