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

    // Structured data (JSON-LD or microdata)
    const hasStructuredData = !!(
      doc.querySelector('script[type="application/ld+json"]') ||
      doc.querySelector("[itemscope]")
    );

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
      hasSkipLink,
      vagueLinkCount,
      videosWithoutCaptions,
      audioElements,
      inputsMissingAutocomplete,
      iframesWithoutTitle,
      tablesWithoutHeaders,
      emptyButtons,
      renderBlockingScripts,
      pageSize,
    };
  }, baseUrl.origin);

  return data as PageData;
}
