import { chromium } from "playwright";
import type { CoreWebVitals } from "../../types/scanner";

/**
 * Run a Lighthouse performance audit against a URL.
 * Uses Playwright's bundled Chromium so no second browser install is needed.
 * Returns null if the audit fails for any reason (network issues, timeouts, etc.).
 * The timeout is enforced INSIDE this function so Chrome is always killed on exit.
 */
export async function runLighthouse(url: string, timeoutMs = 45_000): Promise<CoreWebVitals | null> {
  // Dynamic imports: lighthouse 13+ is ESM-only, chrome-launcher is CJS.
  // Dynamic import() from a CJS module works in Node 12+ for ESM packages.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [lighthouseModule, chromeLauncherModule] = await Promise.all([
    import("lighthouse") as Promise<any>,
    import("chrome-launcher") as Promise<any>,
  ]);
  const lighthouse = lighthouseModule.default ?? lighthouseModule;
  const chromeLauncher = chromeLauncherModule.default ?? chromeLauncherModule;

  const chromePath = chromium.executablePath();
  console.log(`  [lighthouse] Chrome path: ${chromePath}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chrome: any;
  try {
    chrome = await chromeLauncher.launch({
      chromeFlags: [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
      chromePath,
    });

    console.log(`  [lighthouse] Chrome launched on port ${chrome.port}`);

    // Timeout races INSIDE the function so the finally block always runs and kills Chrome
    const result = await Promise.race([
      lighthouse(url, {
        port: chrome.port,
        output: "json",
        logLevel: "error",
        onlyCategories: ["performance"],
        formFactor: "desktop",
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
          requestLatencyMs: 0,
          downloadThroughputKbps: 0,
          uploadThroughputKbps: 0,
        },
        screenEmulation: {
          mobile: false,
          width: 1280,
          height: 720,
          deviceScaleFactor: 1,
          disabled: false,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Lighthouse timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);

    const audits = result?.lhr?.audits;
    if (!audits) {
      console.warn("  [lighthouse] No audits in result");
      return null;
    }

    return {
      lcp: Math.round(audits["largest-contentful-paint"]?.numericValue ?? 0),
      cls: Number((audits["cumulative-layout-shift"]?.numericValue ?? 0).toFixed(3)),
      fcp: Math.round(audits["first-contentful-paint"]?.numericValue ?? 0),
      tbt: Math.round(audits["total-blocking-time"]?.numericValue ?? 0),
      si: Math.round(audits["speed-index"]?.numericValue ?? 0),
    };
  } catch (err) {
    console.error("  [lighthouse] Failed:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    try { if (chrome) await chrome.kill(); } catch { /* ignore */ }
  }
}
