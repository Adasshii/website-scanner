# Design: Design Category + Backlog Completion

**Date:** 2026-04-17
**Status:** Approved

---

## Context

The scanner covers Accessibility (now "Usability"), Content, SEO, Performance, and Security — but nothing about how the website looks or how well it converts. This is a gap competitors also miss. Adding a Design category gives Adashi a differentiating signal: AI-powered visual assessment + structural HTML checks, combined into a 6th score ring.

The remaining backlog item (readability score) is included alongside this.

---

## Scope

1. Rename "Accessibility" → "Usability" (display label only, internal ID stays `"accessibility"` for Supabase backwards compatibility)
2. Add a new **Design** scoring category (HTML checks + Gemini Vision analysis)
3. Add **Readability score** check (Flesch reading ease)
4. Update score weights to 6-category model

---

## Score Weights (new)

| Category | Weight |
|---|---|
| Performance | 0.25 |
| SEO | 0.25 |
| Accessibility (display: Usability) | 0.15 |
| Content | 0.15 |
| Security | 0.10 |
| Design | 0.10 |
| **Total** | **1.00** |

---

## HTML-Based Design Checks

Four new issues in `analyzer.ts` with `category: "design"`:

| ID | Severity | Trigger |
|---|---|---|
| `design-no-cta` | major | No `<button>` or `<a>` with action-oriented text (get started, contact, book, try, sign up, schedule, quote, free, demo) |
| `design-unclear-headline` | major | H1 is missing, fewer than 4 words, or matches generic patterns: "welcome", "home", just the domain name |
| `design-no-nav` | minor | No `<nav>` element found in the page |
| `design-no-contact-footer` | minor | Footer (last 20% of page links) contains no email pattern, phone pattern, or link to /contact |

---

## Readability Check

One new issue in `analyzer.ts` with `category: "content"`:

| ID | Severity | Trigger |
|---|---|---|
| `content-low-readability` | minor | Body text Flesch Reading Ease score < 50 (college-level difficulty). Computed from average sentence length and syllable count. |

Use a lightweight inline implementation (no npm package needed) — Flesch formula:
`206.835 − (1.015 × avg_words_per_sentence) − (84.6 × avg_syllables_per_word)`

---

## AI Visual Design Analysis

New function `generateDesignAnalysis(domain, screenshotUrl)` in `ai.ts`:

1. Fetch screenshot bytes from Supabase URL → base64
2. Call Gemini Vision (`gemini-2.0-flash`) with inline image data
3. Prompt asks for: visual hierarchy (0–100), whitespace/spacing (0–100), typography (0–100), CTA prominence (0–100), overall professionalism (0–100), and up to 4 plain-English issue sentences for non-technical owners
4. Returns: `{ overallScore: number, issues: string[] }` — overall = average of the 5 dimension scores
5. Silently returns `null` on any error

The AI issues become `Issue` objects with `category: "design"`, `severity` mapped from score (< 50 → major, < 70 → minor, ≥ 70 → info), and `impact` proportional to deduction.

---

## Design Score Calculation

In `scoring.ts`, extend `scorePage()`:
- Start design at 100
- Apply deductions for HTML design issues (same system as other categories)
- If AI analysis returned a score: blend: `design = (htmlScore × 0.4 + aiScore × 0.6)`
- If no AI: `design = htmlScore`
- Clamp 0–100

The AI score is stored on `PageResult` temporarily so `scorePage` can access it, then discarded.

---

## Files to Change

| File | Change |
|---|---|
| `types/scanner.ts` | Add `"design"` to `IssueCategory`; add `design?: number` to `ScanScores`; update `SCORE_WEIGHTS` |
| `scanner-service/src/analyzer.ts` | Add 4 HTML design checks + readability check |
| `scanner-service/src/issue-difficulty.ts` | Add difficulty for new issue IDs |
| `scanner-service/src/scoring.ts` | Add `"design"` category scoring; update overall weight calc |
| `scanner-service/src/ai.ts` | Add `generateDesignAnalysis()` with Gemini Vision |
| `scanner-service/src/index.ts` | Call `generateDesignAnalysis` after screenshot upload; pass AI score to scorer; merge AI issues |
| `components/scan/issue-card.tsx` | Add `"design"` to `categoryLabels`; rename `accessibility` label to `"Usability"` |
| `components/report/full-report.tsx` | Add `"design"` to `categoryMeta`; rename accessibility label to `"Usability"` |
| `lib/scoring.ts` (frontend) | Update `SCORE_WEIGHTS` reference (or inherit from types) |

---

## Extractor Note

The current `PageData` has `links[]` (with text) and `h1[]` / `headings[]`. No footer-specific extraction exists. For `design-no-contact-footer`: check the last 30% of `links[]` by position (approximate), or extract from raw HTML using a footer selector. CTA detection uses `links[]` text patterns. No new extractor fields needed.

---

## Verification

1. Scan a site locally — confirm `design` score appears in response JSON
2. Check issue list — confirm HTML design checks fire correctly on a minimal test page
3. Check AI call — confirm Gemini Vision runs and `whyItMatters` sentences appear on design issues
4. Scan a site with no screenshot (Playwright fails) — confirm scan still completes with HTML-only design score
5. Open report — confirm 6 score rings including Design, "Accessibility" label reads "Usability"
6. Check score weights — confirm they sum to 1.0 in `SCORE_WEIGHTS`
