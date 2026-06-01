import type { Browser } from "playwright";
import type { Issue } from "../../types/scanner";
import { getIssueDifficulty } from "./issue-difficulty";

/**
 * Lightweight mobile usability pass.
 *
 * Loads the page once more at a phone viewport and checks the handful of things
 * that most often break the mobile experience for a business owner's customers:
 *   - content wider than the screen (forces horizontal scrolling / zooming out)
 *   - tap targets too small to hit reliably with a thumb
 *   - body text too small to read without pinch-zooming
 *
 * This is deliberately NOT a full second scan: no axe, no Lighthouse, no
 * screenshots. It adds a few seconds, not a doubling of scan cost. Any failure
 * returns an empty list so the mobile pass can never break the main scan.
 *
 * Findings are emitted as `design` issues, so they fold into the UX & Conversion
 * score rather than spawning a separate mobile score.
 */
export async function checkMobileUsability(
  browser: Browser,
  url: string,
  timeoutMs = 20_000
): Promise<Issue[]> {
  let context = null;
  try {
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 AdashiScanner/1.0",
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    // Let layout and any responsive JS settle.
    await page.waitForTimeout(1500);

    const findings = await page.evaluate(() => {
      const result = {
        overflowPx: 0,
        smallTapTargets: 0,
        baseFontPx: 16,
      };

      const viewportWidth = window.innerWidth || 390;

      // 1. Horizontal overflow: content wider than the screen.
      const docWidth = Math.max(
        document.documentElement.scrollWidth,
        document.body ? document.body.scrollWidth : 0
      );
      result.overflowPx = Math.max(0, docWidth - viewportWidth);

      // 2. Tap targets: count clearly-too-small interactive controls.
      // Restrict to button-like controls (not inline text links) to keep this
      // conservative and avoid flagging ordinary in-paragraph links.
      const controls = Array.from(
        document.querySelectorAll(
          'button, [role="button"], input[type="submit"], input[type="button"], a[class*="btn" i], a[class*="button" i]'
        )
      );
      result.smallTapTargets = controls.filter((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false; // hidden
        // Apple/Google guidance is ~44px. Flag clearly-small targets.
        return rect.width < 40 || rect.height < 40;
      }).length;

      // 3. Base font size: body computed font size.
      if (document.body) {
        const fs = parseFloat(window.getComputedStyle(document.body).fontSize);
        if (!Number.isNaN(fs) && fs > 0) result.baseFontPx = fs;
      }

      return result;
    });

    const issues: Issue[] = [];

    if (findings.overflowPx > 8) {
      issues.push({
        id: "design-mobile-overflow",
        category: "design",
        severity: "major",
        title: "Content is wider than the phone screen",
        description: `On a phone, the page is about ${Math.round(findings.overflowPx)}px wider than the screen, so visitors have to scroll sideways or pinch to see it all.`,
        recommendation: "Make the layout responsive so content fits the screen width. Usually an oversized image, table, or fixed-width element is the cause.",
        impact: 8,
      });
    }

    if (findings.smallTapTargets >= 3) {
      issues.push({
        id: "design-mobile-tap-targets",
        category: "design",
        severity: "minor",
        title: "Buttons are too small to tap easily",
        description: `${findings.smallTapTargets} buttons or links are under 40px on a phone, which makes them fiddly to tap accurately.`,
        recommendation: "Give buttons and key links a minimum tap size of around 44x44px with a bit of spacing between them.",
        impact: 5,
      });
    }

    if (findings.baseFontPx < 13) {
      issues.push({
        id: "design-mobile-small-text",
        category: "design",
        severity: "minor",
        title: "Body text is too small on mobile",
        description: `The main text renders at about ${Math.round(findings.baseFontPx)}px on a phone, below the ~16px most people can read comfortably without zooming.`,
        recommendation: "Set a base font size of at least 16px on mobile so visitors can read without pinch-zooming.",
        impact: 4,
      });
    }

    for (const issue of issues) {
      if (!issue.difficulty) issue.difficulty = getIssueDifficulty(issue.id);
    }

    return issues;
  } catch (err) {
    console.warn(
      `  [mobile] Mobile usability pass skipped: ${err instanceof Error ? err.message : err}`
    );
    return [];
  } finally {
    if (context) await context.close().catch(() => {});
  }
}
