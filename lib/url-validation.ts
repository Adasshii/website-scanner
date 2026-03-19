export class UrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlValidationError";
  }
}

/**
 * Client-side URL format validation and normalization.
 * Returns a normalized URL string or throws UrlValidationError.
 */
export function validateUrlFormat(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new UrlValidationError("Please enter a website URL.");
  }

  // Add protocol if missing
  let urlString = trimmed;
  if (!/^https?:\/\//i.test(urlString)) {
    urlString = `https://${urlString}`;
  }

  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new UrlValidationError(
      "That doesn't look like a valid URL. Try something like example.com"
    );
  }

  // Only allow HTTP(S)
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new UrlValidationError("Only HTTP and HTTPS URLs are supported.");
  }

  // Reject URLs with credentials
  if (url.username || url.password) {
    throw new UrlValidationError("URLs with credentials are not supported.");
  }

  // Must have a valid hostname with a dot (no bare words like "localhost")
  if (!url.hostname.includes(".") && url.hostname !== "localhost") {
    throw new UrlValidationError(
      "Please enter a complete URL like example.com"
    );
  }

  return url.toString();
}

/**
 * Extract the domain (hostname without www.) from a URL string.
 */
export function extractDomain(url: string): string {
  const parsed = new URL(url);
  return parsed.hostname.replace(/^www\./, "");
}
