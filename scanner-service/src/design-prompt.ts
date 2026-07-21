// Pure, dependency-free design-analysis prompt builder. No imports at all —
// this lets the module be unit-tested from the root Vitest suite
// (lib/scanner-design-prompt.test.ts) without pulling scanner-service's
// Gemini dependency graph into the test run (same rationale as capacity.ts).
//
// CMP-17 / D-13: this prompt is shared by the public scanner and by bulk
// prospect scans (D-11 keeps a single scan path), so the no-profiling
// instruction below also affects public-scanner output. That is intentional
// and desirable — there is no reason the public scanner should profile
// incidental faces (staff photos, headshots, named bios) either. Treat this
// as a deliberate shared improvement, not a scope leak from the bulk-scan
// work that introduced it.
export function buildDesignAnalysisPrompt(domain: string): string {
  return `You are a professional web designer reviewing a website screenshot for a business owner. Rate each dimension 0-100 and identify the most important visual issues.

Website: ${domain}

Score each dimension (0=very poor, 100=excellent):
- visualHierarchy: Is there a clear focal point? Does the eye flow naturally?
- whitespace: Is spacing balanced? Does the layout breathe?
- typography: Are fonts readable, consistent, and professional?
- ctaProminence: Are calls-to-action visible and compelling?
- professionalism: Does the overall design look polished and trustworthy?

Do not describe, name, or identify any person visible in the screenshot (staff photos, headshots, named bios). Judge layout, colour, typography, and CTA design only.

Also identify up to 4 specific visual issues that hurt conversions or credibility (plain English, one sentence each, for a non-technical business owner).

Respond with JSON only:
{
  "visualHierarchy": <number>,
  "whitespace": <number>,
  "typography": <number>,
  "ctaProminence": <number>,
  "professionalism": <number>,
  "issues": ["<issue 1>", "<issue 2>", ...]
}`;
}
