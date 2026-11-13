import type { Page } from "playwright";
import type { NicheScanSlice } from "../../types/niche-scan-slice";
import type {
  MicrodataItem,
  MicrodataValue,
  OwnSiteHarvest,
  OwnSiteHarvestOutcome,
} from "../../types/own-site";

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
  /** Microdata items read per page, nested items included. */
  microdataItems: 50,
  /** Nesting depth of microdata items. The root item is depth 1. */
  microdataDepth: 4,
  /** Elements the microdata walk may visit in total: the real bound on a huge DOM. */
  microdataVisits: 5_000,
  /** Characters kept from one microdata value. */
  microdataValueChars: 1_000,
  /** Distinct property names kept per microdata item. */
  microdataPropsPerItem: 50,
  /** Values kept per property name. */
  microdataValuesPerProp: 20,
  /** Link hrefs kept per list: internal paths, tel hrefs and nav texts. */
  linkHrefs: 100,
  /** Anchors examined when collecting internal paths. */
  linkScan: 2_000,
  /** Distinct script and iframe hostnames kept. */
  widgetHosts: 100,
  /** Script and iframe elements examined, so a page with a million of them cannot hold a slot. */
  widgetElements: 1_000,
  /** Characters of visible text kept. */
  bodyText: 20_000,
  /** Characters kept from a short text item: a heading, a label, an alt. */
  textChars: 200,
  /** Headings kept per list. */
  headings: 50,
  /** Forms summarised. */
  forms: 20,
  /** Image hints kept. */
  imgHints: 50,
} as const;

export type HarvestCaps = typeof HARVEST_CAPS;

export interface HarvestArgs {
  /** The page origin, to tell internal anchors from external ones. */
  origin: string;
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

  // Microdata: walk [itemscope] roots that are not themselves a property of
  // another item. Iterative on purpose, with no named inner functions: the body
  // is serialised into the page, and a tool that wraps named functions (tsx)
  // would inject a helper the page does not have.
  const items: MicrodataItem[] = [];
  let count = 0;
  let visits = 0;
  let truncated = false;
  const roots = Array.from(document.querySelectorAll("[itemscope]"));
  rootLoop: for (const root of roots) {
    if (root.hasAttribute("itemprop")) continue;
    if (count >= caps.microdataItems) {
      truncated = true;
      break;
    }
    const rootItem: MicrodataItem = { type: root.getAttribute("itemtype") || "", props: Object.create(null) };
    count++;
    items.push(rootItem);
    const frames: Array<{ el: Element; item: MicrodataItem; depth: number }> = [
      { el: root, item: rootItem, depth: 1 },
    ];
    while (frames.length > 0) {
      const frame = frames.pop() as { el: Element; item: MicrodataItem; depth: number };
      const stack: Element[] = Array.from(frame.el.children).reverse();
      while (stack.length > 0) {
        visits++;
        if (visits > caps.microdataVisits) {
          truncated = true;
          break rootLoop;
        }
        const el = stack.pop() as Element;
        const names = (el.getAttribute("itemprop") || "").split(/\s+/).filter((n) => n !== "" && n !== "__proto__");
        const isScope = el.hasAttribute("itemscope");
        if (names.length === 0) {
          // A scope with no itemprop is a separate root, found by the query above.
          if (!isScope) for (const child of Array.from(el.children).reverse()) stack.push(child);
          continue;
        }
        let value: MicrodataValue | null = null;
        if (isScope) {
          if (frame.depth >= caps.microdataDepth || count >= caps.microdataItems) {
            truncated = true;
          } else {
            const nested: MicrodataItem = { type: el.getAttribute("itemtype") || "", props: Object.create(null) };
            count++;
            frames.push({ el, item: nested, depth: frame.depth + 1 });
            value = nested;
          }
        } else {
          const tag = el.tagName.toLowerCase();
          let attr: string | null = null;
          if (tag === "meta") attr = el.getAttribute("content");
          else if (tag === "a" || tag === "link") attr = el.getAttribute("href");
          else if (tag === "img" || tag === "source") attr = el.getAttribute("src");
          else if (tag === "time") attr = el.getAttribute("datetime");
          else if (tag === "data" || tag === "meter") attr = el.getAttribute("value");
          value = (attr !== null ? attr : el.textContent || "").trim().slice(0, caps.microdataValueChars);
          for (const child of Array.from(el.children).reverse()) stack.push(child);
        }
        if (value === null) continue;
        for (const name of names) {
          const known = name in frame.item.props;
          if (!known && Object.keys(frame.item.props).length >= caps.microdataPropsPerItem) continue;
          if (!known) frame.item.props[name] = [];
          if (frame.item.props[name].length < caps.microdataValuesPerProp) frame.item.props[name].push(value);
        }
      }
    }
  }

  // The zones trade scoring and the own-site checks need. One browser round
  // trip, so plans 09-07 and 09-08 never reopen the boundary.
  const h1 = Array.from(document.querySelectorAll("h1"))
    .slice(0, caps.headings)
    .map((e) => (e.textContent || "").trim().slice(0, caps.textChars));
  const h2h3 = Array.from(document.querySelectorAll("h2, h3"))
    .slice(0, caps.headings)
    .map((e) => (e.textContent || "").trim().slice(0, caps.textChars));
  const navTexts = Array.from(document.querySelectorAll('nav a, [role="navigation"] a, header a'))
    .slice(0, caps.linkHrefs)
    .map((e) => (e.textContent || "").trim().slice(0, caps.textChars));

  const internalPaths: string[] = [];
  for (const a of Array.from(document.querySelectorAll("a[href]")).slice(0, caps.linkScan)) {
    if (internalPaths.length >= caps.linkHrefs) break;
    try {
      const u = new URL(a.getAttribute("href") || "", args.origin);
      if (u.origin === args.origin && !internalPaths.includes(u.pathname)) internalPaths.push(u.pathname);
    } catch {
      // An unparseable href is simply not an internal path.
    }
  }

  const telHrefs = Array.from(document.querySelectorAll('a[href^="tel:"]'))
    .slice(0, caps.linkHrefs)
    .map((e) => (e.getAttribute("href") || "").trim().slice(0, caps.textChars));

  const formSummaries = Array.from(document.querySelectorAll("form"))
    .slice(0, caps.forms)
    .map((form) => {
      const fields = Array.from(form.querySelectorAll("input, select, textarea"))
        .slice(0, 200)
        .filter((f) => {
          if (f.tagName.toLowerCase() !== "input") return true;
          const type = (f.getAttribute("type") || "text").toLowerCase();
          return !["hidden", "submit", "button", "image", "reset"].includes(type);
        });
      const button = Array.from(form.querySelectorAll('button, input[type="submit"]'))[0];
      const label = button
        ? (button.tagName.toLowerCase() === "input" ? button.getAttribute("value") : button.textContent) || ""
        : "";
      return { fieldCount: fields.length, submitLabel: label.trim().slice(0, caps.textChars) };
    });

  const imgHints = Array.from(document.querySelectorAll("img"))
    .slice(0, caps.imgHints)
    .map((img) => ({
      alt: (img.getAttribute("alt") || "").trim().slice(0, caps.textChars),
      file: ((img.getAttribute("src") || "").split("#")[0].split("?")[0].split("/").pop() || "").slice(
        0,
        caps.textChars
      ),
    }));

  const widgetHosts: string[] = [];
  for (const el of Array.from(document.querySelectorAll("script[src], iframe[src]")).slice(0, caps.widgetElements)) {
    if (widgetHosts.length >= caps.widgetHosts) break;
    try {
      const host = new URL(el.getAttribute("src") || "", args.origin).hostname;
      if (host !== "" && !widgetHosts.includes(host)) widgetHosts.push(host);
    } catch {
      // An unparseable src has no host to report.
    }
  }

  return {
    jsonLdBlocks,
    jsonLdBlocksFound: scripts.length,
    microdata: items,
    microdataCount: count,
    microdataTruncated: truncated,
    title: (document.title || "").trim().slice(0, caps.textChars),
    h1,
    h2h3,
    navTexts,
    internalPaths,
    bodyText: ((document.body && document.body.innerText) || "").slice(0, caps.bodyText),
    telHrefs,
    formSummaries,
    imgHints,
    widgetHosts,
  };
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
    const origin = new URL(page.url()).origin;
    const harvest = await page.evaluate(harvestOwnSiteInBrowser, { origin, caps: HARVEST_CAPS });
    return { state: "harvested", harvest };
  } catch (err) {
    console.error(
      `[own-site-harvest] harvest failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return { state: "unreadable" };
  }
}
