import { chromium, Browser, Page } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { extractPageData } from "./extractor";
import { analyzeIssues } from "./analyzer";
import { buildOverlayData } from "./screenshots";
import type { PageResult, ScanScores, Issue, IssueOverlay } from "../../types/scanner";
import { scorePage } from "./scoring";

let browser: Browser | null = null;

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
  overlays: IssueOverlay[];
}

/**
 * Scan a single page: load it, run axe-core, extract data, capture screenshot, compute scores.
 */
export async function scanPage(
  options: ScanPageOptions
): Promise<ScanPageResultWithScreenshot> {
  const { url, timeoutMs = 30_000 } = options;
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
    console.log(`  [scanner] Loaded (status ${statusCode}) in ${Date.now() - startTime}ms`);

    // Wait briefly for JS to settle, but don't wait for all network requests
    await page.waitForTimeout(2000);

    const loadTimeMs = Date.now() - startTime;

    // Step 2: Run axe-core accessibility audit
    console.log(`  [scanner] Running axe-core...`);
    const axeResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
      .analyze();
    console.log(`  [scanner] axe-core done: ${axeResults.violations.length} violations`);

    // Step 3: Extract page data
    console.log(`  [scanner] Extracting page data...`);
    const data = await extractPageData(page, url);
    console.log(`  [scanner] Extracted: ${data.wordCount} words, ${data.images.length} images, ${data.links.length} links`);

    // Step 4: Analyze issues
    const issues = analyzeIssues(axeResults, data);
    console.log(`  [scanner] Found ${issues.length} issues`);

    // Step 5: Capture full-page screenshot
    let screenshotBuffer: Buffer | null = null;
    let overlays: IssueOverlay[] = [];
    try {
      console.log(`  [scanner] Capturing screenshot...`);
      screenshotBuffer = await page.screenshot({ fullPage: true, type: "jpeg", quality: 80 }) as Buffer;
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
        url,
        statusCode,
        loadTimeMs,
        data,
        issues,
        scores,
      },
      screenshotBuffer,
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
          hasViewport: false,
          hasFavicon: false,
          pageSize: 0,
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
        scores: { overall: 0, accessibility: 0, content: 0, seo: 0, performance: 0 },
      },
      screenshotBuffer: null,
      overlays: [],
    };
  } finally {
    await context.close();
  }
}
