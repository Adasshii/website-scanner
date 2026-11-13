import type { Page } from "playwright";
import type { NicheScanSlice } from "../../types/niche-scan-slice";
import type { OwnSiteHarvest, OwnSiteHarvestOutcome } from "../../types/own-site";

/**
 * own-site-harvest.ts: Phase 9, ENG-01. The thin, bounded browser-side
 * harvester. It only walks the DOM and returns raw strings; all parsing
 * happens Node-side in own-site-facts.ts, the same split ContactExtraction and
 * lib/contact-extraction.ts use.
 *
 * It is a SEPARATE page.evaluate from the one in extractor.ts, on purpose. A
 * throw inside extractPageData's evaluate fails the page for every scan,
 * public scans included. Keeping the new code out of that block means a bug
 * here cannot do that (D-9-R6). The page is never fetched a second time: this
 * rides the page the scan already loaded (D-5-R1).
 *
 * Every byte harvested is untrusted input from a site we did not write, so
 * everything is capped. The caps travel in as the evaluate argument because the
 * browser function is serialised and cannot close over module constants.
 */

/** Hard caps on what one page may contribute. Each has a test that exceeds it. */
export const HARVEST_CAPS = {
  /** JSON-LD script blocks read per page. */
  jsonLdBlocks: 20,
  /** Characters kept from each JSON-LD block. */
  jsonLdChars: 200_000,
} as const;

export type HarvestCaps = typeof HARVEST_CAPS;

export interface HarvestArgs {
  caps: HarvestCaps;
}

/**
 * The browser function body. Takes one serialisable argument and reads the
 * global document. Keep it self-contained: it is serialised into the page, so
 * it cannot reference anything outside itself.
 */
export function harvestOwnSiteInBrowser(args: HarvestArgs): OwnSiteHarvest {
  const caps = args.caps;
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  const jsonLdBlocks = scripts
    .slice(0, caps.jsonLdBlocks)
    .map((s) => (s.textContent || "").slice(0, caps.jsonLdChars));
  return { jsonLdBlocks, jsonLdBlocksFound: scripts.length };
}

/**
 * Harvest own-site material from the page the scan already loaded.
 *
 * Returns null, without touching the page, when the request carried no niche
 * slice: public scans do no own-site work at all. When a slice was requested, a
 * failure is returned as { state: "unreadable" } and never thrown.
 */
export async function harvestOwnSite(
  page: Page,
  slice: NicheScanSlice | null | undefined
): Promise<OwnSiteHarvestOutcome | null> {
  if (!slice) return null;
  try {
    const harvest = await page.evaluate(harvestOwnSiteInBrowser, { caps: HARVEST_CAPS });
    return { state: "harvested", harvest };
  } catch (err) {
    console.error(
      `[own-site-harvest] harvest failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return { state: "unreadable" };
  }
}
