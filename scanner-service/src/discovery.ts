import { getBrowser } from "./scanner";

export interface DiscoveryOptions {
  startUrl: string;
  maxPages: number;
  timeoutMs?: number;
}

/**
 * Discover internal pages by crawling links from the start URL.
 * Returns a deduplicated list of page URLs to scan.
 */
export async function discoverPages(
  options: DiscoveryOptions
): Promise<string[]> {
  const { startUrl, maxPages, timeoutMs = 15_000 } = options;
  const baseUrl = new URL(startUrl);
  const origin = baseUrl.origin;

  const visited = new Set<string>();
  const queue: string[] = [normalizeUrl(startUrl)];
  const discovered: string[] = [];

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "AdashiScanner/1.0 (+https://scan.adashi.io) — accessibility & SEO checker",
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  });

  try {
    while (queue.length > 0 && discovered.length < maxPages) {
      const url = queue.shift()!;
      const normalized = normalizeUrl(url);

      if (visited.has(normalized)) continue;
      visited.add(normalized);
      discovered.push(url);

      // Only crawl links from the pages we visit (BFS)
      if (discovered.length < maxPages) {
        try {
          const page = await context.newPage();
          await page.goto(url, {
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

          // Add new links to queue
          for (const link of links) {
            const norm = normalizeUrl(link);
            if (!visited.has(norm) && !queue.includes(link)) {
              queue.push(link);
            }
          }

          await page.close();
        } catch {
          // Skip pages that fail to load during discovery
        }
      }
    }
  } finally {
    await context.close();
  }

  return discovered;
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
