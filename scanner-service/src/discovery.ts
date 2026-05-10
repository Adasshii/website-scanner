import { getBrowser } from "./scanner";

export interface DiscoveryOptions {
  startUrl: string;
  maxPages: number;
  timeoutMs?: number;
}

/**
 * Discover internal pages by loading the homepage and extracting its links.
 * Returns a priority-sorted list capped at maxPages, favouring high-value
 * pages (home, about, contact, services, pricing) over blog/tag pages.
 */
export async function discoverPages(
  options: DiscoveryOptions
): Promise<string[]> {
  const { startUrl, maxPages, timeoutMs = 15_000 } = options;
  const baseUrl = new URL(startUrl);
  const origin = baseUrl.origin;
  const homepageNorm = normalizeUrl(startUrl);

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "AdashiScanner/1.0 (+https://scan.adashi.io) — accessibility & SEO checker",
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  });

  const seen = new Set<string>([homepageNorm]);
  const candidates: string[] = [];

  try {
    const page = await context.newPage();
    await page.goto(startUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    const links = await page.evaluate((orig: string) => {
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      return anchors
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((href) => {
          try {
            const u = new URL(href);
            return u.origin === orig && u.protocol.startsWith("http");
          } catch {
            return false;
          }
        });
    }, origin);

    await page.close();

    for (const link of links) {
      const norm = normalizeUrl(link);
      if (!seen.has(norm)) {
        seen.add(norm);
        candidates.push(link);
      }
    }
  } catch {
    // Homepage failed to load — return just the start URL
    return [startUrl];
  } finally {
    await context.close();
  }

  // Sort candidates by business value, then take the top (maxPages - 1)
  candidates.sort((a, b) => pagePriority(a) - pagePriority(b));

  return [startUrl, ...candidates.slice(0, maxPages - 1)];
}

/**
 * Lower score = higher priority. Homepage is always first (index 0).
 * Includes common non-English slug variants for international clients.
 */
function pagePriority(url: string): number {
  const path = new URL(url).pathname.toLowerCase().replace(/\/$/, "");
  if (/\/(about|over-ons|uber-uns|acerca|a-propos)/.test(path)) return 1;
  if (/\/(contact|kontakt|contacto|reach|get-in-touch)/.test(path)) return 2;
  if (/\/(pricing|prices|plans|tarif|preise|packages)/.test(path)) return 3;
  if (/\/(services|service|diensten|leistungen|solutions|what-we-do)/.test(path)) return 4;
  if (/\/(team|staff|people|who-we-are|over-het-team)/.test(path)) return 5;
  if (/\/(faq|help|support)/.test(path)) return 6;
  if (/\/(work|portfolio|cases|projects|clients)/.test(path)) return 7;
  return 99;
}

/**
 * Normalize a URL for deduplication:
 * - Remove trailing slash
 * - Remove fragment
 * - Remove common tracking params
 * - Lowercase
 */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    // Remove common tracking parameters
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
    ];
    for (const param of trackingParams) {
      u.searchParams.delete(param);
    }
    let normalized = u.toString().toLowerCase();
    // Remove trailing slash (but keep root /)
    if (normalized.endsWith("/") && u.pathname !== "/") {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url.toLowerCase();
  }
}
