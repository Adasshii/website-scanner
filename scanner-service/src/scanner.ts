import { chromium, Browser, Page } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { extractPageData } from "./extractor";
import { analyzeIssues } from "./analyzer";
import { buildOverlayData } from "./screenshots";
import type { PageResult, ScanScores, Issue, IssueOverlay } from "../../types/scanner";
import { scorePage } from "./scoring";
import { runLighthouse } from "./lighthouse";

let browser: Browser | null = null;

/** Fetch robots.txt and sitemap.xml existence for a given page URL */
async function checkSiteFiles(pageUrl: string): Promise<{ hasRobotsTxt: boolean; hasSitemap: boolean }> {
  let hasRobotsTxt = false;
  let hasSitemap = false;
  let robotsText = "";

  try {
    const origin = new URL(pageUrl).origin;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${origin}/robots.txt`, { signal: controller.signal });
    clearTimeout(timer);
    hasRobotsTxt = res.status === 200;
    if (hasRobotsTxt) robotsText = await res.text();
  } catch { /* ignore */ }

  try {
    const origin = new URL(pageUrl).origin;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${origin}/sitemap.xml`, { method: "HEAD", signal: controller.signal });
    clearTimeout(timer);
    hasSitemap = res.status === 200;
  } catch { /* ignore */ }

  if (!hasSitemap && robotsText) {
    hasSitemap = /^Sitemap:/im.test(robotsText);
  }

  return { hasRobotsTxt, hasSitemap };
}

/** HEAD-check internal links for 4xx errors and redirect chains (max 15, 5 concurrent) */
async function checkInternalLinks(
  links: Array<{ href: string; isInternal: boolean }>,
  origin: string
): Promise<{
  brokenLinks: Array<{ href: string; statusCode: number }>;
  redirectChains: Array<{ href: string; hops: number; finalUrl: string }>;
}> {
  const brokenLinks: Array<{ href: string; statusCode: number }> = [];
  const redirectChains: Array<{ href: string; hops: number; finalUrl: string }> = [];

  const seen = new Set<string>();
  const toCheck: string[] = [];
  for (const link of links) {
    if (!link.isInternal) continue;
    try {
      const u = new URL(link.href);
      if (u.origin !== origin) continue;
      u.hash = "";
      const clean = u.toString();
      if (!seen.has(clean)) {
        seen.add(clean);
        toCheck.push(clean);
      }
    } catch { continue; }
    if (toCheck.length >= 15) break;
  }

  for (let i = 0; i < toCheck.length; i += 5) {
    const batch = toCheck.slice(i, i + 5);
    await Promise.all(batch.map(async (href) => {
      let current = href;
      let hops = 0;
      let status = 0;
      try {
        for (let r = 0; r < 8; r++) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          try {
            const res = await fetch(current, {
              method: "HEAD",
              redirect: "manual",
              signal: controller.signal,
              headers: { "User-Agent": "AdashiScanner/1.0" },
            });
            clearTimeout(timer);
            status = res.status;
            if (status >= 300 && status < 400) {
              const loc = res.headers.get("location");
              if (!loc) break;
              current = new URL(loc, current).toString();
              hops++;
            } else {
              break;
            }
          } catch { clearTimeout(timer); break; }
        }
        if (status >= 400 && status < 500) {
          brokenLinks.push({ href, statusCode: status });
        } else if (hops >= 2) {
          redirectChains.push({ href, hops, finalUrl: current });
        }
      } catch { /* skip */ }
    }));
  }

  return { brokenLinks, redirectChains };
}

/**
 * Attempt to dismiss cookie/consent banners before taking a screenshot.
 * Tries common accept button selectors first; falls back to CSS hiding.
 */
async function dismissCookieBanner(page: Page): Promise<void> {
  const acceptSelectors = [
    // OneTrust
    "#onetrust-accept-btn-handler",
    ".onetrust-accept-btn-handler",
    // Cookiebot
    "#CybotCookiebotDialogBodyButtonAccept",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    // Complianz (common on Dutch WordPress sites)
    ".cmplz-btn.cmplz-accept",
    ".cmplz-accept",
    // Cookie Notice / Cookie Law Info
    ".cn-accept-cookie",
    "#cookie-law-info-bar .cookie_action_close_header",
    // Generic patterns
    "[data-accept-cookies]",
    "[data-cookie-consent-accept]",
    "button[class*='accept-all']",
    "button[class*='acceptAll']",
    "button[class*='accept_all']",
    // Text-based (Dutch + English)
    "button:has-text('Accepteer alles')",
    "button:has-text('Alles accepteren')",
    "button:has-text('Akkoord')",
    "button:has-text('Accept all')",
    "button:has-text('Accept All')",
    "button:has-text('Allow all')",
    "button:has-text('I accept')",
    "button:has-text('Agree')",
  ];

  for (const selector of acceptSelectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await el.click();
        await page.waitForTimeout(600);
        return;
      }
    } catch { /* try next */ }
  }

  // Fallback: hide common consent overlay containers via CSS injection
  try {
    await page.addStyleTag({
      content: `
        #onetrust-banner-sdk, .onetrust-pc-dark-filter,
        #CybotCookiebotDialog, #CybotCookiebotDialogBodyUnderlay,
        .cmplz-cookiebanner, .cmplz-overlay,
        .cc-window, .cc-overlay,
        [id*="cookie-banner"], [class*="cookie-banner"],
        [id*="cookiebanner"], [class*="cookiebanner"],
        [id*="consent-banner"], [class*="consent-banner"],
        [id*="cookie-notice"], [class*="cookie-notice"],
        [id*="gdpr-banner"], [class*="gdpr-banner"]
        { display: none !important; }
        body { overflow: auto !important; }
      `,
    });
  } catch { /* ignore */ }
}

/** Get or launch a shared browser instance */
export async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
  }
  return browser;
}

/** Graceful shutdown */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export interface ScanPageOptions {
  url: string;
  timeoutMs?: number;
}

/** Extended result with screenshot data — only used internally, not stored in DB */
export interface ScanPageResultWithScreenshot {
  result: PageResult;
  screenshotBuffer: Buffer | null;
  designScreenshotBuffer: Buffer | null;
  overlays: IssueOverlay[];
}

/**
 * Scan a single page: load it, run axe-core, extract data, capture screenshot, compute scores.
 */
export async function scanPage(
  options: ScanPageOptions
): Promise<ScanPageResultWithScreenshot> {
  const { url, timeoutMs = 30_000 } = options;
  let effectiveUrl = url;
  const b = await getBrowser();
  const context = await b.newContext({
    userAgent:
      "AdashiScanner/1.0 (+https://scan.adashi.io) — accessibility & SEO checker",
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  const startTime = Date.now();
  let statusCode = 0;

  try {
    // Step 1: Load the page
    console.log(`  [scanner] Loading: ${url}`);
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    statusCode = response?.status() ?? 0;
    const responseHeaders = response?.headers() ?? {};
    console.log(`  [scanner] Loaded (status ${statusCode}) in ${Date.now() - startTime}ms`);

    // Wait briefly for JS to settle, but don't wait for all network requests
    await page.waitForTimeout(2000);

    // Detect cross-domain redirect; auto-retry with www. if bare domain was submitted
    const finalUrl = page.url();
    const inputHost = new URL(effectiveUrl).hostname.replace(/^www\./, "");
    const finalHost = new URL(finalUrl).hostname.replace(/^www\./, "");
    if (finalHost !== inputHost) {
      const inputHostname = new URL(effectiveUrl).hostname;
      if (!inputHostname.startsWith("www.")) {
        const wwwUrl = effectiveUrl.replace(/^(https?:\/\/)/, "$1www.");
        console.log(`  [scanner] Cross-domain redirect detected, retrying with www: ${wwwUrl}`);
        const wwwResponse = await page.goto(wwwUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        statusCode = wwwResponse?.status() ?? 0;
        await page.waitForTimeout(2000);
        const wwwFinalHost = new URL(page.url()).hostname.replace(/^www\./, "");
        if (wwwFinalHost !== inputHost) {
          throw new Error(
            `This domain (including www.${inputHost}) redirects to a different website. ` +
            `The site may not be live yet or may be pointing to a hosting provider page. ` +
            `Check your DNS settings and try again.`
          );
        }
        effectiveUrl = wwwUrl;
      } else {
        throw new Error(
          `This domain redirected to ${new URL(finalUrl).hostname}. ` +
          `The site may not be live yet or may be pointing to a hosting provider page. ` +
          `Check your DNS settings and try again.`
        );
      }
    }

    const loadTimeMs = Date.now() - startTime;

    // Step 2: Run axe-core accessibility audit (30s cap — can stall on complex pages)
    console.log(`  [scanner] Running axe-core...`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emptyAxeResults: any = { violations: [], incomplete: [], passes: [], inapplicable: [] };
    const axeResults = await Promise.race([
      new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
        .analyze(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("axe-core timeout")), 30_000)
      ),
    ]).catch((err) => {
      console.warn(`  [scanner] axe-core failed: ${err instanceof Error ? err.message : err}`);
      return emptyAxeResults;
    });
    console.log(`  [scanner] axe-core done: ${axeResults.violations.length} violations`);

    // Step 3: Extract page data
    console.log(`  [scanner] Extracting page data...`);
    const data = await extractPageData(page, effectiveUrl);
    data.responseHeaders = responseHeaders;
    console.log(`  [scanner] Extracted: ${data.wordCount} words, ${data.images.length} images, ${data.links.length} links`);

    // Step 4a: External URL checks (Phase 3)
    console.log(`  [scanner] Checking robots.txt, sitemap, and internal links...`);
    const pageOrigin = new URL(effectiveUrl).origin;
    const [siteFiles, linkCheck] = await Promise.all([
      checkSiteFiles(url),
      checkInternalLinks(data.links, pageOrigin),
    ]);
    data.hasRobotsTxt = siteFiles.hasRobotsTxt;
    data.hasSitemap = siteFiles.hasSitemap;
    data.brokenLinks = linkCheck.brokenLinks;
    data.redirectChains = linkCheck.redirectChains;
    console.log(`  [scanner] robots=${siteFiles.hasRobotsTxt}, sitemap=${siteFiles.hasSitemap}, broken=${linkCheck.brokenLinks.length}, chains=${linkCheck.redirectChains.length}`);

    // Step 4c: Core Web Vitals via Lighthouse (Phase 4) — sequential to avoid two Chrome instances at once
    // Timeout enforced inside runLighthouse so Chrome is always killed even on timeout
    console.log(`  [scanner] Running Lighthouse CWV audit...`);
    const cwv = await runLighthouse(effectiveUrl);
    data.coreWebVitals = cwv ?? undefined;
    console.log(`  [scanner] Lighthouse done: LCP=${cwv?.lcp ?? "n/a"}ms, CLS=${cwv?.cls ?? "n/a"}, TBT=${cwv?.tbt ?? "n/a"}ms`);

    // Step 4d: Analyze issues
    const issues = analyzeIssues(axeResults, data);
    console.log(`  [scanner] Found ${issues.length} issues`);

    // Step 5: Dismiss cookie banners, then capture screenshots
    await dismissCookieBanner(page);
    let screenshotBuffer: Buffer | null = null;
    let designScreenshotBuffer: Buffer | null = null;
    let overlays: IssueOverlay[] = [];
    try {
      console.log(`  [scanner] Capturing screenshot...`);
      screenshotBuffer = await page.screenshot({ fullPage: true, type: "jpeg", quality: 80 }) as Buffer;
      // Viewport-only, low-quality image for Gemini Vision — much smaller payload than the full-page display screenshot
      designScreenshotBuffer = await page.screenshot({ fullPage: false, type: "jpeg", quality: 50 }) as Buffer;
      overlays = await buildOverlayData(page, issues);
      console.log(`  [scanner] Screenshot captured, ${overlays.length} overlays`);
    } catch (err) {
      console.error(`  [scanner] Screenshot capture failed:`, err);
    }

    // Step 6: Compute scores
    const scores = scorePage(issues, data, loadTimeMs);
    console.log(`  [scanner] Scores: overall=${scores.overall} a11y=${scores.accessibility} content=${scores.content} seo=${scores.seo} perf=${scores.performance}`);

    return {
      result: {
        url: effectiveUrl,
        statusCode,
        loadTimeMs,
        data,
        issues,
        scores,
      },
      screenshotBuffer,
      designScreenshotBuffer,
      overlays,
    };
  } catch (error) {
    const loadTimeMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`  [scanner] FAILED after ${loadTimeMs}ms: ${errorMsg}`);
    if (error instanceof Error && error.stack) {
      console.error(`  [scanner] Stack: ${error.stack.split("\n").slice(0, 3).join("\n")}`);
    }

    // Return a failed page result rather than throwing
    return {
      result: {
        url,
        statusCode,
        loadTimeMs,
        data: {
          title: "",
          description: "",
          h1: [],
          headings: [],
          links: [],
          images: [],
          wordCount: 0,
          language: "",
          canonical: "",
          ogTags: {},
          twitterTags: {},
          hasViewport: false,
          hasFavicon: false,
          hasStructuredData: false,
          hasSkipLink: false,
          vagueLinkCount: 0,
          videosWithoutCaptions: 0,
          audioElements: 0,
          inputsMissingAutocomplete: 0,
          iframesWithoutTitle: 0,
          tablesWithoutHeaders: 0,
          emptyButtons: 0,
          renderBlockingScripts: 0,
          responseHeaders: {},
          pageSize: 0,
          hasRobotsTxt: false,
          hasSitemap: false,
          brokenLinks: [],
          redirectChains: [],
        },
        issues: [
          {
            id: "scan-error",
            category: "performance",
            severity: "critical",
            title: "Page could not be loaded",
            description: errorMsg,
            recommendation:
              "Ensure the page is accessible and responds within 30 seconds.",
            impact: 100,
          },
        ],
        scores: { overall: 0, accessibility: 0, content: 0, seo: 0, performance: 0, security: 0 },
      },
      screenshotBuffer: null,
      designScreenshotBuffer: null,
      overlays: [],
    };
  } finally {
    await context.close();
  }
}
