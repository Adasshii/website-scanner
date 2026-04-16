import type { AxeResults } from "axe-core";
import type { Issue, IssueSeverity, PageData } from "../../types/scanner";

/** Map axe-core impact levels to our severity scale */
function mapAxeSeverity(impact: string | null | undefined): IssueSeverity {
  switch (impact) {
    case "critical":
      return "critical";
    case "serious":
      return "major";
    case "moderate":
      return "minor";
    default:
      return "info";
  }
}

/** Impact score deduction per severity level */
const SEVERITY_IMPACT: Record<IssueSeverity, number> = {
  critical: 15,
  major: 8,
  minor: 3,
  info: 1,
};

/**
 * Analyze a page and produce a flat list of issues.
 * Combines axe-core accessibility violations with content/SEO/performance checks.
 */
export function analyzeIssues(
  axeResults: AxeResults,
  data: PageData
): Issue[] {
  const issues: Issue[] = [];

  // ── Accessibility issues from axe-core ───────────────────────────
  for (const violation of axeResults.violations) {
    const severity = mapAxeSeverity(violation.impact);
    // Create one issue per violation (not per node) to avoid overwhelming output
    const nodeCount = violation.nodes.length;
    const firstSelector = violation.nodes[0]?.target?.join(" > ") ?? "";

    issues.push({
      id: `axe-${violation.id}`,
      category: "accessibility",
      severity,
      title: violation.help,
      description:
        violation.description +
        (nodeCount > 1 ? ` (found on ${nodeCount} elements)` : ""),
      recommendation: violation.helpUrl
        ? `Learn more: ${violation.helpUrl}`
        : "Fix the highlighted element to meet WCAG standards.",
      selector: firstSelector,
      axeRuleId: violation.id,
      impact: SEVERITY_IMPACT[severity] * Math.min(nodeCount, 5),
    });
  }

  // ── Content quality checks ───────────────────────────────────────

  if (data.h1.length === 0) {
    issues.push({
      id: "content-no-h1",
      category: "content",
      severity: "major",
      title: "Missing H1 heading",
      description:
        "The page has no H1 heading. Every page should have one main heading that describes its content.",
      recommendation:
        "Add a single, descriptive H1 heading near the top of the page.",
      impact: 10,
    });
  } else if (data.h1.length > 1) {
    issues.push({
      id: "content-multiple-h1",
      category: "content",
      severity: "minor",
      title: "Multiple H1 headings",
      description: `Found ${data.h1.length} H1 headings. Most pages should have exactly one.`,
      recommendation:
        "Keep one H1 for the main topic, and use H2-H6 for sub-sections.",
      impact: 3,
    });
  }

  if (data.wordCount < 100) {
    issues.push({
      id: "content-thin",
      category: "content",
      severity: "major",
      title: "Very little text content",
      description: `Only ${data.wordCount} words found. Search engines and visitors expect substantive content.`,
      recommendation:
        "Add meaningful text that explains what your business offers and why visitors should care.",
      impact: 10,
    });
  } else if (data.wordCount < 300) {
    issues.push({
      id: "content-short",
      category: "content",
      severity: "minor",
      title: "Limited text content",
      description: `Only ${data.wordCount} words found. Consider adding more detail to improve engagement and SEO.`,
      recommendation:
        "Aim for at least 300 words of useful content on key pages.",
      impact: 5,
    });
  }

  // Check heading hierarchy (skipping levels)
  const headingLevels = data.headings.map((h) => h.level);
  for (let i = 1; i < headingLevels.length; i++) {
    if (headingLevels[i] - headingLevels[i - 1] > 1) {
      issues.push({
        id: "content-heading-skip",
        category: "content",
        severity: "minor",
        title: "Heading levels are skipped",
        description: `Heading jumps from H${headingLevels[i - 1]} to H${headingLevels[i]}. This confuses screen readers and hurts SEO.`,
        recommendation:
          "Use headings in order: H1, then H2, then H3, etc. Don't skip levels.",
        impact: 4,
      });
      break; // One issue is enough
    }
  }

  // ── SEO checks ───────────────────────────────────────────────────

  if (!data.title) {
    issues.push({
      id: "seo-no-title",
      category: "seo",
      severity: "critical",
      title: "Missing page title",
      description:
        "The page has no <title> tag. This is the most important on-page SEO element.",
      recommendation:
        "Add a unique, descriptive title tag (50-60 characters) that includes your main keyword.",
      impact: 20,
    });
  } else if (data.title.length < 20) {
    issues.push({
      id: "seo-title-short",
      category: "seo",
      severity: "minor",
      title: "Page title is very short",
      description: `Title is only ${data.title.length} characters. Aim for 50-60 characters.`,
      recommendation:
        "Write a more descriptive title that explains the page content and includes relevant keywords.",
      impact: 5,
    });
  } else if (data.title.length > 70) {
    issues.push({
      id: "seo-title-long",
      category: "seo",
      severity: "minor",
      title: "Page title is too long",
      description: `Title is ${data.title.length} characters. Google typically truncates after 60.`,
      recommendation:
        "Shorten the title to under 60 characters so it displays fully in search results.",
      impact: 3,
    });
  }

  if (!data.description) {
    issues.push({
      id: "seo-no-description",
      category: "seo",
      severity: "major",
      title: "Missing meta description",
      description:
        "No meta description found. Search engines show this as the snippet in results.",
      recommendation:
        "Add a compelling meta description (120-160 characters) that summarizes the page.",
      impact: 10,
    });
  } else if (data.description.length < 70) {
    issues.push({
      id: "seo-description-short",
      category: "seo",
      severity: "minor",
      title: "Meta description is too short",
      description: `Description is only ${data.description.length} characters. Aim for 120-160.`,
      recommendation:
        "Write a longer meta description that includes your main keyword and a call to action.",
      impact: 3,
    });
  }

  // Images without alt text (SEO perspective)
  const imagesWithoutAlt = data.images.filter((img) => !img.hasAlt);
  if (imagesWithoutAlt.length > 0) {
    issues.push({
      id: "seo-images-no-alt",
      category: "seo",
      severity: "major",
      title: "Images missing alt text",
      description: `${imagesWithoutAlt.length} image(s) have no alt text. Alt text helps search engines understand your images.`,
      recommendation:
        "Add descriptive alt attributes to all meaningful images. Use alt=\"\" only for decorative images.",
      impact: Math.min(imagesWithoutAlt.length * 3, 15),
    });
  }

  if (!data.language) {
    issues.push({
      id: "seo-no-lang",
      category: "seo",
      severity: "minor",
      title: 'Missing language attribute',
      description:
        'The <html> tag has no "lang" attribute. This helps search engines and screen readers.',
      recommendation:
        'Add lang="en" (or the appropriate language code) to the <html> tag.',
      impact: 3,
    });
  }

  if (!data.hasViewport) {
    issues.push({
      id: "seo-no-viewport",
      category: "seo",
      severity: "major",
      title: "Missing viewport meta tag",
      description:
        "No viewport meta tag found. The page may not display correctly on mobile devices.",
      recommendation:
        'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the <head>.',
      impact: 10,
    });
  }

  if (!data.canonical) {
    issues.push({
      id: "seo-no-canonical",
      category: "seo",
      severity: "minor",
      title: "Missing canonical URL",
      description:
        "No canonical link found. This can cause duplicate content issues.",
      recommendation:
        'Add <link rel="canonical" href="..."> pointing to the preferred URL for this page.',
      impact: 3,
    });
  }

  // ── Performance checks (basic, from page data) ──────────────────

  if (data.pageSize > 3_000_000) {
    issues.push({
      id: "perf-page-heavy",
      category: "performance",
      severity: "major",
      title: "Page HTML is very large",
      description: `Page HTML is ${(data.pageSize / 1_000_000).toFixed(1)}MB. Large pages load slowly, especially on mobile.`,
      recommendation:
        "Reduce HTML size by removing unnecessary inline styles, scripts, or content. Consider lazy loading.",
      impact: 10,
    });
  } else if (data.pageSize > 1_000_000) {
    issues.push({
      id: "perf-page-large",
      category: "performance",
      severity: "minor",
      title: "Page HTML is fairly large",
      description: `Page HTML is ${(data.pageSize / 1_000).toFixed(0)}KB. Consider optimizing.`,
      recommendation: "Review the page for unnecessary scripts or inline content.",
      impact: 5,
    });
  }

  const imagesWithoutDimensions = data.images.filter(
    (img) => !img.hasDimensions
  );
  if (imagesWithoutDimensions.length > 3) {
    issues.push({
      id: "perf-images-no-dimensions",
      category: "performance",
      severity: "minor",
      title: "Images missing width/height attributes",
      description: `${imagesWithoutDimensions.length} images don't have explicit width and height. This causes layout shifts as images load.`,
      recommendation:
        "Set width and height attributes on <img> tags to prevent Cumulative Layout Shift (CLS).",
      impact: 5,
    });
  }

  const oldFormatImages = data.images.filter((img) => {
    try {
      const path = new URL(img.src).pathname.toLowerCase();
      return /\.(jpe?g|png|gif|bmp|tiff?)(\?|$)/.test(path);
    } catch { return false; }
  });
  if (oldFormatImages.length > 0) {
    issues.push({
      id: "perf-image-format",
      category: "performance",
      severity: "minor",
      title: "Images not using modern formats",
      description: `${oldFormatImages.length} image(s) use older formats (JPG, PNG, GIF). Modern formats like WebP or AVIF are 25-50% smaller.`,
      recommendation: "Convert images to WebP or AVIF to reduce page weight and improve load times.",
      impact: Math.min(oldFormatImages.length * 2, 10),
    });
  }

  if (data.renderBlockingScripts > 0) {
    issues.push({
      id: "perf-render-blocking",
      category: "performance",
      severity: "minor",
      title: "Render-blocking scripts in <head>",
      description: `${data.renderBlockingScripts} script(s) in <head> load synchronously, delaying when the page becomes visible.`,
      recommendation: "Add async or defer attribute to <script> tags that don't need to run before page render.",
      impact: Math.min(data.renderBlockingScripts * 4, 12),
    });
  }

  // ── Content checks (additional) ──────────────────────────────────

  if (!data.hasFavicon) {
    issues.push({
      id: "content-no-favicon",
      category: "content",
      severity: "minor",
      title: "Missing favicon",
      description: "No favicon found. Favicons appear in browser tabs and bookmarks and reinforce your brand.",
      recommendation: 'Add <link rel="icon" href="/favicon.ico"> to your <head>, or use a PNG/SVG favicon.',
      impact: 3,
    });
  }

  // ── SEO checks (additional) ──────────────────────────────────────

  const missingOgTags = (["title", "description", "image"] as const).filter(
    (tag) => !data.ogTags[tag]
  );
  if (missingOgTags.length > 0) {
    issues.push({
      id: "seo-missing-og-tags",
      category: "seo",
      severity: "minor",
      title: "Missing Open Graph tags",
      description: `Missing og:${missingOgTags.join(", og:")}. These control how your page appears when shared on social media.`,
      recommendation: "Add Open Graph meta tags to your <head> so links look great when shared on LinkedIn, Facebook, and Slack.",
      impact: missingOgTags.length * 2,
    });
  }

  if (!data.twitterTags["card"]) {
    issues.push({
      id: "seo-missing-twitter-card",
      category: "seo",
      severity: "minor",
      title: "Missing Twitter Card tags",
      description: "No twitter:card meta tag found. Without it, links shared on X (Twitter) show as plain text with no image or preview.",
      recommendation: 'Add <meta name="twitter:card" content="summary_large_image"> and matching twitter:title and twitter:image tags.',
      impact: 3,
    });
  }

  if (!data.hasStructuredData) {
    issues.push({
      id: "seo-no-structured-data",
      category: "seo",
      severity: "minor",
      title: "No structured data found",
      description: "No JSON-LD or Schema.org markup detected. Structured data helps search engines understand your content and can unlock rich results.",
      recommendation: "Add JSON-LD structured data for your business type (LocalBusiness, Organization, etc.) using schema.org.",
      impact: 4,
    });
  }

  // ── Accessibility checks (beyond axe-core) ───────────────────────

  if (!data.hasSkipLink) {
    issues.push({
      id: "a11y-no-skip-link",
      category: "accessibility",
      severity: "minor",
      title: "Missing skip navigation link",
      description: "No skip navigation link found. Keyboard and screen reader users must tab through the entire navigation on every page.",
      recommendation: 'Add a "Skip to main content" link as the first focusable element on the page, pointing to your main content area.',
      impact: 4,
    });
  }

  if (data.vagueLinkCount > 0) {
    issues.push({
      id: "a11y-vague-links",
      category: "accessibility",
      severity: "minor",
      title: "Links with vague text",
      description: `${data.vagueLinkCount} link(s) use non-descriptive text like "click here" or "read more". Screen readers read links out of context, making these meaningless.`,
      recommendation: "Replace vague link text with a description of what the link leads to, e.g. 'Read our accessibility guide' instead of 'Read more'.",
      impact: Math.min(data.vagueLinkCount * 2, 8),
    });
  }

  if (data.videosWithoutCaptions > 0) {
    issues.push({
      id: "a11y-video-no-captions",
      category: "accessibility",
      severity: "major",
      title: "Videos without captions",
      description: `${data.videosWithoutCaptions} video(s) have no captions or subtitles. Deaf and hard-of-hearing users cannot access this content.`,
      recommendation: "Add a <track kind='captions'> element to each video, or use a video platform that provides automatic captions.",
      impact: data.videosWithoutCaptions * 8,
    });
  }

  if (data.audioElements > 0) {
    issues.push({
      id: "a11y-audio-no-transcript",
      category: "accessibility",
      severity: "major",
      title: "Audio content may lack transcripts",
      description: `${data.audioElements} audio element(s) found. Audio content needs a text transcript to be accessible to deaf users.`,
      recommendation: "Provide a full text transcript alongside each audio element.",
      impact: data.audioElements * 6,
    });
  }

  if (data.inputsMissingAutocomplete > 0) {
    issues.push({
      id: "a11y-inputs-no-autocomplete",
      category: "accessibility",
      severity: "minor",
      title: "Form inputs missing autocomplete",
      description: `${data.inputsMissingAutocomplete} input(s) are missing the autocomplete attribute. This makes forms harder for users with cognitive disabilities and slower for everyone.`,
      recommendation: "Add appropriate autocomplete values (e.g. autocomplete='email', 'name', 'tel') to all personal data inputs.",
      impact: Math.min(data.inputsMissingAutocomplete * 2, 6),
    });
  }

  if (data.iframesWithoutTitle > 0) {
    issues.push({
      id: "a11y-iframe-no-title",
      category: "accessibility",
      severity: "minor",
      title: "iframes missing title attribute",
      description: `${data.iframesWithoutTitle} iframe(s) have no title. Screen readers cannot tell users what the embedded content is.`,
      recommendation: "Add a descriptive title attribute to every <iframe>, e.g. title='Google Maps location'.",
      impact: data.iframesWithoutTitle * 3,
    });
  }

  if (data.tablesWithoutHeaders > 0) {
    issues.push({
      id: "a11y-table-no-headers",
      category: "accessibility",
      severity: "major",
      title: "Tables missing header cells",
      description: `${data.tablesWithoutHeaders} table(s) have no <th> header cells. Screen readers cannot convey the meaning of each column or row.`,
      recommendation: "Add <th> elements to define column and row headers. Use scope='col' or scope='row' to make relationships explicit.",
      impact: data.tablesWithoutHeaders * 7,
    });
  }

  if (data.emptyButtons > 0) {
    issues.push({
      id: "a11y-empty-buttons",
      category: "accessibility",
      severity: "major",
      title: "Buttons with no accessible label",
      description: `${data.emptyButtons} button(s) have no text, aria-label, or aria-labelledby. Screen readers will announce these as 'button' with no context.`,
      recommendation: "Add visible text or an aria-label to every button so users know what it does.",
      impact: data.emptyButtons * 8,
    });
  }

  return issues;
}
