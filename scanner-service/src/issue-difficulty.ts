import type { Issue } from "../../types/scanner";

const difficulty: Record<string, Issue["difficulty"]> = {
  // Content
  "content-no-h1": "easy",
  "content-multiple-h1": "easy",
  "content-thin": "hard",
  "content-short": "medium",
  "content-heading-skip": "easy",
  "content-no-favicon": "easy",

  // SEO
  "seo-no-title": "easy",
  "seo-title-short": "easy",
  "seo-title-long": "easy",
  "seo-no-description": "easy",
  "seo-description-short": "easy",
  "seo-images-no-alt": "easy",
  "seo-no-lang": "easy",
  "seo-no-viewport": "easy",
  "seo-no-canonical": "easy",
  "seo-missing-og-tags": "easy",
  "seo-missing-twitter-card": "easy",
  "seo-no-structured-data": "medium",
  "seo-schema-missing": "medium",
  "seo-schema-no-org": "medium",
  "seo-schema-invalid-json": "easy",
  "seo-schema-no-webpage": "hard",
  "seo-no-robots": "easy",
  "seo-no-sitemap": "easy",
  "seo-broken-links": "medium",
  "seo-redirect-chains": "medium",

  // Performance
  "perf-page-heavy": "hard",
  "perf-page-large": "medium",
  "perf-images-no-dimensions": "easy",
  "perf-image-format": "medium",
  "perf-render-blocking": "medium",
  "perf-no-compression": "medium",
  "perf-no-cache": "medium",
  "perf-lcp-poor": "hard",
  "perf-lcp-needs-improvement": "hard",
  "perf-cls-poor": "hard",
  "perf-cls-needs-improvement": "medium",
  "perf-tbt-poor": "hard",
  "perf-tbt-needs-improvement": "medium",
  "perf-fcp-poor": "hard",
  "perf-fcp-needs-improvement": "medium",

  // Accessibility (custom checks)
  "a11y-no-skip-link": "easy",
  "a11y-vague-links": "easy",
  "a11y-video-no-captions": "medium",
  "a11y-audio-no-transcript": "medium",
  "a11y-inputs-no-autocomplete": "easy",
  "a11y-iframe-no-title": "easy",
  "a11y-table-no-headers": "easy",
  "a11y-empty-buttons": "easy",

  // Security
  "sec-no-https": "hard",
  "sec-no-hsts": "easy",
  "sec-no-xframe": "easy",
  "sec-no-xcto": "easy",
  "sec-no-csp": "medium",
  "sec-mixed-content": "medium",

  // Design
  "design-no-cta": "medium",
  "design-unclear-headline": "easy",
  "design-no-nav": "easy",
  "design-no-contact-footer": "easy",
  "design-form-friction": "easy",
  "design-no-contact-info": "easy",
  "design-cookie-banner": "medium",

  // New content checks
  "content-low-readability": "medium",
  "content-no-subheadings": "easy",

  // New performance check
  "perf-no-lazy-images": "easy",
};

export function getIssueDifficulty(id: string): Issue["difficulty"] {
  return difficulty[id] ?? "medium";
}
