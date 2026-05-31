import type { Page } from "playwright";
import type {
  PageData,
  HeadingNode,
  LinkInfo,
  ImageInfo,
} from "../../types/scanner";

/**
 * Extract structured data from a loaded Playwright page.
 */
export async function extractPageData(
  page: Page,
  pageUrl: string
): Promise<PageData> {
  const baseUrl = new URL(pageUrl);

  const data = await page.evaluate((origin: string) => {
    const doc = document;

    // Title & description
    const title = doc.title || "";
    const descMeta = doc.querySelector('meta[name="description"]');
    const description = descMeta?.getAttribute("content") || "";

    // Headings
    const headings: { level: number; text: string }[] = [];
    const h1s: string[] = [];
    doc.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
      const level = parseInt(el.tagName[1], 10);
      const text = (el.textContent || "").trim();
      headings.push({ level, text });
      if (level === 1) h1s.push(text);
    });

    // Links
    const links: {
      href: string;
      text: string;
      isInternal: boolean;
      isExternal: boolean;
      rel: string;
    }[] = [];
    doc.querySelectorAll("a[href]").forEach((a) => {
      const anchor = a as HTMLAnchorElement;
      const href = anchor.href;
      const text = (anchor.textContent || "").trim();
      const rel = anchor.getAttribute("rel") || "";
      let isInternal = false;
      let isExternal = false;
      try {
        const linkUrl = new URL(href);
        if (
          linkUrl.protocol === "http:" ||
          linkUrl.protocol === "https:"
        ) {
          isInternal = linkUrl.origin === origin;
          isExternal = !isInternal;
        }
      } catch {
        // Relative or malformed — treat as internal
        isInternal = true;
      }
      links.push({ href, text, isInternal, isExternal, rel });
    });

    // Images
    const images: {
      src: string;
      alt: string;
      width?: number;
      height?: number;
      hasAlt: boolean;
      hasDimensions: boolean;
      isLazy: boolean;
    }[] = [];
    doc.querySelectorAll("img").forEach((img) => {
      const width = img.naturalWidth || img.width || undefined;
      const height = img.naturalHeight || img.height || undefined;
      images.push({
        src: img.src,
        alt: img.alt,
        width,
        height,
        hasAlt: img.hasAttribute("alt") && img.alt.trim().length > 0,
        hasDimensions: !!(
          img.getAttribute("width") && img.getAttribute("height")
        ),
        isLazy: img.getAttribute("loading") === "lazy",
      });
    });

    // Word count (visible text)
    const bodyText = doc.body?.innerText || "";
    const wordCount = bodyText
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    // Language
    const language =
      doc.documentElement.getAttribute("lang") || "";

    // Canonical
    const canonicalEl = doc.querySelector('link[rel="canonical"]');
    const canonical = canonicalEl?.getAttribute("href") || "";

    // Open Graph tags
    const ogTags: Record<string, string> = {};
    doc
      .querySelectorAll('meta[property^="og:"]')
      .forEach((meta) => {
        const property = meta.getAttribute("property") || "";
        const content = meta.getAttribute("content") || "";
        if (property && content) {
          ogTags[property.replace("og:", "")] = content;
        }
      });

    // Viewport meta
    const hasViewport = !!doc.querySelector('meta[name="viewport"]');

    // Favicon
    const hasFavicon = !!(
      doc.querySelector('link[rel="icon"]') ||
      doc.querySelector('link[rel="shortcut icon"]')
    );

    // Twitter Card tags
    const twitterTags: Record<string, string> = {};
    doc.querySelectorAll('meta[name^="twitter:"]').forEach((meta) => {
      const name = meta.getAttribute("name") || "";
      const content = meta.getAttribute("content") || "";
      if (name && content) twitterTags[name.replace("twitter:", "")] = content;
    });

    // Schema.org detection — JSON-LD
    const schemaTypes: string[] = [];
    let schemaInvalidCount = 0;
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try {
        const parsed = JSON.parse(script.textContent || "");
        const entries = Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed];
        for (const entry of entries) {
          if (entry["@type"]) {
            const types: string[] = Array.isArray(entry["@type"]) ? entry["@type"] : [entry["@type"]];
            types.forEach((t: string) => { if (t && !schemaTypes.includes(t)) schemaTypes.push(t); });
          }
        }
      } catch {
        schemaInvalidCount++;
      }
    });

    // Microdata types (schema.org URLs only)
    doc.querySelectorAll("[itemtype]").forEach((el) => {
      const itemtype = el.getAttribute("itemtype") || "";
      const match = itemtype.match(/schema\.org\/(.+)/);
      if (match && match[1]) {
        const t = match[1].replace(/\/$/, "");
        if (!schemaTypes.includes(t)) schemaTypes.push(t);
      }
    });

    const hasStructuredData = schemaTypes.length > 0 || schemaInvalidCount > 0 ||
      !!doc.querySelector('script[type="application/ld+json"]') ||
      !!doc.querySelector("[itemscope]");

    // Skip navigation link
    const hasSkipLink = Array.from(doc.querySelectorAll('a[href^="#"]')).some((a) => {
      const text = (a.textContent || "").toLowerCase();
      return text.includes("skip") || text.includes("jump to main") || text.includes("go to content");
    });

    // Vague link text
    const vagueTerms = ["click here", "read more", "here", "learn more", "more", "this", "link"];
    const vagueLinkCount = Array.from(doc.querySelectorAll("a")).filter((a) => {
      return vagueTerms.includes((a.textContent || "").trim().toLowerCase());
    }).length;

    // Videos without captions
    const videosWithoutCaptions = Array.from(doc.querySelectorAll("video")).filter((v) => {
      return !v.querySelector('track[kind="captions"]') && !v.querySelector('track[kind="subtitles"]');
    }).length;

    // Audio elements
    const audioElements = doc.querySelectorAll("audio").length;

    // Inputs missing autocomplete (name / email / phone fields)
    const inputsMissingAutocomplete = Array.from(
      doc.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input:not([type])')
    ).filter((input) => {
      const ac = (input as HTMLInputElement).getAttribute("autocomplete");
      return !ac || ac === "off";
    }).length;

    // iframes without title
    const iframesWithoutTitle = Array.from(doc.querySelectorAll("iframe")).filter((iframe) => {
      const title = iframe.getAttribute("title");
      return !title || title.trim() === "";
    }).length;

    // Tables without headers
    const tablesWithoutHeaders = Array.from(doc.querySelectorAll("table")).filter((table) => {
      return !table.querySelector("th");
    }).length;

    // Empty buttons (no text, no aria-label, no aria-labelledby)
    const emptyButtons = Array.from(doc.querySelectorAll("button")).filter((btn) => {
      return (
        !(btn.textContent || "").trim() &&
        !btn.getAttribute("aria-label") &&
        !btn.getAttribute("aria-labelledby")
      );
    }).length;

    // Render-blocking scripts (sync scripts in <head>)
    const renderBlockingScripts = Array.from(
      doc.querySelectorAll("head script[src]")
    ).filter((s) => !s.hasAttribute("async") && !s.hasAttribute("defer")).length;

    // Page size (rough: serialized HTML length)
    const pageSize = new Blob([doc.documentElement.outerHTML]).size;

    // ── Usability / UX & Conversion signals ──────────────────────────

    // Navigation: a <nav> or role="navigation" landmark
    const hasNav = !!doc.querySelector('nav, [role="navigation"]');

    // Form friction: count fillable fields in the form that has the most.
    // Excludes hidden/submit/button/reset/image inputs, which aren't user-filled.
    const fillableSelector =
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea';
    let formFieldCount = 0;
    doc.querySelectorAll("form").forEach((form) => {
      const count = form.querySelectorAll(fillableSelector).length;
      if (count > formFieldCount) formFieldCount = count;
    });

    // Contact info: a tel:/mailto: link, or an email/phone pattern in visible text.
    const hasContactLink = !!doc.querySelector('a[href^="tel:"], a[href^="mailto:"]');
    const visibleText = doc.body?.innerText || "";
    const emailPattern = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
    // Phone: 7+ digits with common separators/extensions, optionally a leading +
    const phonePattern = /(\+?\d[\d\s().-]{6,}\d)/;
    const hasContactText = emailPattern.test(visibleText) || phonePattern.test(visibleText);
    const hasContactInfo = hasContactLink || hasContactText;

    // Cookie banner: known consent platforms, or a banner-ish element whose text
    // mentions cookies. Presence only — whether it blocks content is a later pass.
    const knownCmpSelectors = [
      "#onetrust-banner-sdk",
      "#onetrust-consent-sdk",
      "#CybotCookiebotDialog",
      "#cookiebanner",
      "#cookie-banner",
      "#cookie-notice",
      "#cookie-consent",
      ".cookie-banner",
      ".cookie-consent",
      ".cookie-notice",
      ".cc-window", // Cookie Consent by Osano / cookieconsent
      "#usercentrics-root",
      "#cmpbox", // Consentmanager
      '[aria-label*="cookie" i]',
      '[id*="cookie" i][class*="consent" i]',
    ];
    let hasCookieBanner = !!doc.querySelector(knownCmpSelectors.join(","));
    if (!hasCookieBanner) {
      const cookieTextPattern = /(we use cookies|this (?:website|site) uses cookies|accept (?:all )?cookies|cookie policy|manage cookies|your privacy choices)/i;
      // Look only at plausible banner containers to avoid matching body copy / privacy pages.
      const candidates = Array.from(
        doc.querySelectorAll('div[class*="cookie" i], div[id*="cookie" i], aside, [role="dialog"], [role="alertdialog"]')
      );
      hasCookieBanner = candidates.some((el) => cookieTextPattern.test((el as HTMLElement).innerText || ""));
    }

    return {
      title,
      description,
      h1: h1s,
      headings,
      links,
      images,
      wordCount,
      language,
      canonical,
      ogTags,
      twitterTags,
      hasViewport,
      hasFavicon,
      hasStructuredData,
      schemaTypes,
      schemaInvalidCount,
      hasSkipLink,
      vagueLinkCount,
      videosWithoutCaptions,
      audioElements,
      inputsMissingAutocomplete,
      iframesWithoutTitle,
      tablesWithoutHeaders,
      emptyButtons,
      renderBlockingScripts,
      hasNav,
      formFieldCount,
      hasContactInfo,
      hasCookieBanner,
      pageSize,
    };
  }, baseUrl.origin);

  return data as PageData;
}
