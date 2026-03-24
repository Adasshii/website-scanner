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

  return issues;
}
