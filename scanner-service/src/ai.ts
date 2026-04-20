import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  ScanScores,
  Issue,
  ScanSummary,
  PageResult,
  CostEstimate,
  CostFactor,
  QuickWin,
} from "../../types/scanner";

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

// ── Types ─────────────────────────────────────────────────────────────

export interface ComprehensiveAnalysis {
  executiveSummary: string;
  costEstimate: CostEstimate;
  quickWins: QuickWin[];
  websitePersonality: string;
}

export interface DesignAnalysis {
  overallScore: number;
  issues: string[];
}

// ── Effort classification ─────────────────────────────────────────────

function classifyIssueEffort(
  issue: Issue,
  affectedPageCount: number
): { needsDeveloper: boolean; effortHint: string } {
  const title = issue.title.toLowerCase();
  const cat = issue.category;

  if (cat === "security") return { needsDeveloper: true, effortHint: "security config change" };

  if (
    cat === "performance" &&
    (title.includes("server") || title.includes("cache") || title.includes("compress") || title.includes("redirect"))
  ) {
    return { needsDeveloper: true, effortHint: "server or build config" };
  }

  if (
    cat === "content" ||
    (cat === "seo" && (title.includes("meta") || title.includes("title") || title.includes("description")))
  ) {
    const mins = Math.min(affectedPageCount * 5, 120);
    const timeStr = mins < 60 ? `~${mins} min` : `~${Math.round(mins / 60)} hour${mins >= 120 ? "s" : ""}`;
    return { needsDeveloper: false, effortHint: `${timeStr} (${affectedPageCount} page${affectedPageCount !== 1 ? "s" : ""})` };
  }

  if (cat === "accessibility") {
    if (title.includes("alt") || title.includes("label") || title.includes("contrast")) {
      const mins = Math.min(affectedPageCount * 8, 90);
      return { needsDeveloper: false, effortHint: `~${mins} min (${affectedPageCount} page${affectedPageCount !== 1 ? "s" : ""})` };
    }
    return { needsDeveloper: true, effortHint: "accessibility code change" };
  }

  if (cat === "design") return { needsDeveloper: true, effortHint: "design/layout change" };

  return { needsDeveloper: true, effortHint: "code change" };
}

// ── Comprehensive Analysis (replaces generateExecutiveSummary) ────────

/**
 * Generate a comprehensive analysis including executive summary,
 * cost estimate, quick wins, and website personality.
 * Falls back to null if Gemini is unavailable.
 */
export async function generateComprehensiveAnalysis(
  domain: string,
  scores: ScanScores,
  summary: ScanSummary,
  pages: PageResult[]
): Promise<ComprehensiveAnalysis | null> {
  const ai = getClient();
  if (!ai) return null;

  try {
    const topIssueList = summary.topIssues
      .slice(0, 10)
      .map((i) => `- [${i.severity}/${i.category}] ${i.title}: ${i.description}`)
      .join("\n");

    // Compute how many pages each top issue appears on
    const issuePageCounts = new Map<string, number>();
    for (const page of pages) {
      for (const issue of page.issues) {
        issuePageCounts.set(issue.id, (issuePageCounts.get(issue.id) ?? 0) + 1);
      }
    }

    // Pre-compute effort classifications for the top issues
    const effortData = summary.topIssues.slice(0, 10).map((issue) => ({
      issue,
      ...classifyIssueEffort(issue, issuePageCounts.get(issue.id) ?? 1),
    }));

    const effortContext = effortData
      .map((e, idx) => `  ${idx + 1}. "${e.issue.title}" [${e.issue.category}]: needsDeveloper=${e.needsDeveloper}, estimatedTime hint="${e.effortHint}"`)
      .join("\n");

    // Build page data summary for the AI
    const pageDataSummary = pages
      .slice(0, 5)
      .map((p) => {
        const ctas = p.data.links.filter(
          (l) =>
            l.text.length > 0 &&
            /contact|book|call|get started|sign up|try|demo|free|schedule/i.test(l.text)
        );
        return `Page: ${p.url}
  Title: ${p.data.title}
  Description: ${p.data.description || "(none)"}
  H1: ${p.data.h1.join(", ") || "(none)"}
  Word count: ${p.data.wordCount}
  Images without alt: ${p.data.images.filter((img) => !img.hasAlt).length}/${p.data.images.length}
  Load time: ${p.data.pageSize > 0 ? Math.round(p.loadTimeMs) + "ms" : "N/A"}
  CTAs found: ${ctas.length > 0 ? ctas.map((c) => `"${c.text}"`).join(", ") : "(none)"}`;
      })
      .join("\n\n");

    const avgLoadTime = pages.length > 0
      ? Math.round(pages.reduce((sum, p) => sum + p.loadTimeMs, 0) / pages.length)
      : 0;

    const model = ai.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const result = await model.generateContent(
      `You are a senior website strategist writing a report for a business owner. The reader is not technical. Analyze the following website and provide a comprehensive analysis.

Website: ${domain}
Overall score: ${scores.overall}/100
Accessibility: ${scores.accessibility}/100
Content: ${scores.content}/100
SEO: ${scores.seo}/100
Performance: ${scores.performance}/100
Total issues: ${summary.totalIssues} (${summary.criticalIssues} critical, ${summary.majorIssues} major)
Pages scanned: ${summary.totalPages}
Average load time: ${avgLoadTime}ms

Top issues:
${topIssueList}

Page details:
${pageDataSummary}

Provide your analysis as JSON with these exact fields:

{
  "executiveSummary": "2-3 sentence summary. Lead with the most important finding. Mention the weakest category. Be direct, specific, encouraging. No jargon or markdown.",

  "costEstimate": {
    "totalLostPercent": <number, estimated percentage of visitors being lost>,
    "factors": [
      {
        "name": "<factor name>",
        "percentImpact": <number>,
        "explanation": "<1 sentence explaining this factor's impact>"
      }
    ]
  },

  "quickWins": [
    {
      "title": "<plain language issue>",
      "description": "<what to fix and why, 1-2 sentences>",
      "estimatedTime": "<specific time estimate, e.g. '~10 min', '~1 hour', '~half a day'>",
      "needsDeveloper": <boolean — copy exact value from effort data above>,
      "expectedImpact": "<one sentence about expected improvement>"
    }
  ],

  "websitePersonality": "3-4 sentences describing how the site comes across to a first-time visitor. Cover tone, warmth, professionalism, clarity. Write for a business owner."
}

Cost estimate benchmarks — grounded in industry research:
- Slow page load (avg > 3s): 10-15%. Google/SOASTA: 53% of mobile visitors abandon after 3s; Portent: each extra second reduces conversions ~4.4%.
- Accessibility (score < 80): up to 20% based on how low the score is. ~26% of adults have a disability; a low score means real users cannot complete tasks on the site.
- Poor content / readability (content score < 60): 10%. Nielsen Norman: users read ~20% of page text. Buried content drives silent exits.
- Missing or weak CTAs (content score < 70 or CTA issues found): 8%. HubSpot: 70%+ of SMB sites lack a clear CTA.
- Poor SEO (seo score < 50): 12%. ~68% of online experiences start with search. Poor SEO means fewer visitors arrive.
Present totalLostPercent as the combined impact, capped at 45%.

Quick wins: Select the 3 highest impact-to-effort fixes from the issues above. Each should be a different fix type.
Effort data pre-computed from the actual scan:
${effortContext}
Use the estimatedTime hint for each selected issue as-is. Use the needsDeveloper value as-is.

Return ONLY valid JSON, no other text.`
    );

    const text = result.response.text().trim();
    const parsed = JSON.parse(text) as ComprehensiveAnalysis;

    // Validate the response shape
    if (
      !parsed.executiveSummary ||
      !parsed.costEstimate ||
      !parsed.quickWins ||
      !parsed.websitePersonality
    ) {
      console.error("[ai] Comprehensive analysis returned incomplete data");
      return null;
    }

    return parsed;
  } catch (error) {
    console.error("[ai] Comprehensive analysis generation failed:", error);
    return null;
  }
}

// ── Fallback executive summary (template-based) ──────────────────────

export function generateFallbackVerdict(
  scores: ScanScores,
  criticalIssues: number
): string {
  if (scores.overall >= 90) {
    return "Great job! Your website is well-built and performs strongly across all categories.";
  }
  if (scores.overall >= 70) {
    const weakest = getWeakestCategory(scores);
    return `Your website is in decent shape, but ${weakest} needs attention to reach its full potential.`;
  }
  if (scores.overall >= 50) {
    return `Your website has several areas for improvement. Addressing the ${criticalIssues > 0 ? "critical" : "major"} issues would make a real difference.`;
  }
  return "Your website has significant issues that are likely costing you visitors and search rankings. The good news: most fixes are straightforward.";
}

function getWeakestCategory(scores: ScanScores): string {
  const categories = [
    { name: "accessibility", score: scores.accessibility },
    { name: "content quality", score: scores.content },
    { name: "SEO", score: scores.seo },
    { name: "performance", score: scores.performance },
  ];
  categories.sort((a, b) => a.score - b.score);
  return categories[0].name;
}

// ── Fallback cost estimate (deterministic) ───────────────────────────

export function calculateCostEstimateFallback(
  scores: ScanScores,
  summary: ScanSummary,
  avgLoadTimeMs: number
): CostEstimate {
  const factors: CostFactor[] = [];
  let total = 0;

  // Accessibility impact: derived from score, not just critical issue count.
  // CDC: ~26% of adults have a disability. A score of 0 means near-total exclusion.
  if (scores.accessibility < 80) {
    const impact = Math.min(Math.round((80 - scores.accessibility) * 0.25), 20);
    if (impact > 0) {
      factors.push({
        name: "Accessibility barriers",
        percentImpact: impact,
        explanation: `Accessibility score of ${scores.accessibility}/100 means some visitors cannot fully use your site.`,
      });
      total += impact;
    }
  }

  // Poor readability (content score < 60): 10%
  if (scores.content < 60) {
    factors.push({
      name: "Content readability",
      percentImpact: 10,
      explanation: "Your content may be hard to read or understand, causing visitors to leave.",
    });
    total += 10;
  }

  // Weak CTAs: check if few CTAs across all issues
  const ctaIssues = summary.topIssues.filter(
    (i) => i.title.toLowerCase().includes("cta") || i.title.toLowerCase().includes("call to action")
  );
  if (ctaIssues.length > 0 || scores.content < 70) {
    const impact = 8;
    factors.push({
      name: "Weak calls-to-action",
      percentImpact: impact,
      explanation: "Visitors may not know what step to take next, reducing conversions.",
    });
    total += impact;
  }

  // Slow load time (>3 seconds): 12% (Google/SOASTA: 53% of mobile visitors abandon at 3s)
  if (avgLoadTimeMs > 3000) {
    factors.push({
      name: "Slow page load",
      percentImpact: 12,
      explanation: "Pages loading over 3 seconds cause many visitors to leave before seeing your content.",
    });
    total += 12;
  }

  // Poor SEO: 12% (68% of online experiences start with search)
  if (scores.seo < 50) {
    factors.push({
      name: "Poor search visibility",
      percentImpact: 12,
      explanation: "Low SEO score means fewer visitors find your site through search engines.",
    });
    total += 12;
  }

  return {
    totalLostPercent: Math.min(total, 45),
    factors,
  };
}

// ── Issue enhancement (unchanged) ────────────────────────────────────

/**
 * Rewrite issue descriptions and recommendations in plain language.
 * Processes issues in a single batch call for efficiency.
 * Falls back to original descriptions if Gemini is unavailable.
 */
export async function enhanceIssueDescriptions(
  issues: Issue[]
): Promise<Issue[]> {
  const ai = getClient();
  if (!ai || issues.length === 0) return issues;

  // Only enhance top issues to stay fast and cheap
  const toEnhance = issues.slice(0, 15);

  try {
    const issueList = toEnhance
      .map(
        (issue, i) =>
          `${i + 1}. [${issue.severity}/${issue.category}] "${issue.title}"\n   Description: ${issue.description}\n   Recommendation: ${issue.recommendation}`
      )
      .join("\n\n");

    const model = ai.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const result = await model.generateContent(
      `You are rewriting website audit findings for a small business owner who is NOT technical.

For each issue below, rewrite the description and recommendation in plain language. Be specific about what's wrong and what to do. Keep each description to 1 sentence and each recommendation to 1-2 sentences.

${issueList}

Respond with ONLY a JSON array. Each element must have: {"index": <number>, "description": "<plain language description>", "recommendation": "<plain language recommendation>"}`
    );

    const text = result.response.text().trim();

    // Parse the JSON response
    const enhanced: Array<{
      index: number;
      description: string;
      recommendation: string;
    }> = JSON.parse(text);

    // Apply enhancements back to the issues
    const updatedIssues = [...issues];
    for (const item of enhanced) {
      const idx = item.index - 1; // 1-based to 0-based
      if (idx >= 0 && idx < updatedIssues.length) {
        updatedIssues[idx] = {
          ...updatedIssues[idx],
          description: item.description || updatedIssues[idx].description,
          recommendation: item.recommendation || updatedIssues[idx].recommendation,
        };
      }
    }

    return updatedIssues;
  } catch (error) {
    console.error("[ai] Issue enhancement failed:", error);
    return issues;
  }
}

// ── Sales Brief ──────────────────────────────────────────────────────

/**
 * Generate an AI sales brief for the admin/sales team.
 * Returns a plain-text brief (<300 words, bullet points).
 */
export async function generateSalesBrief(
  domain: string,
  scores: ScanScores,
  summary: ScanSummary,
  pages: PageResult[]
): Promise<string | null> {
  const ai = getClient();
  if (!ai) return null;

  try {
    // Extract what we can about the business from page data
    const homePage = pages[0];
    const pageInfo = pages
      .slice(0, 3)
      .map(
        (p) =>
          `${p.url}: Title="${p.data.title}", Desc="${p.data.description}", H1="${p.data.h1.join(", ")}"`
      )
      .join("\n");

    const topIssueList = summary.topIssues
      .slice(0, 5)
      .map((i) => `- [${i.severity}] ${i.title}: ${i.description}`)
      .join("\n");

    const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent(
      `You are a sales strategist preparing a brief for a web design agency owner before a potential client call. Based on the following website scan results, write a concise sales brief.

Website: ${domain}
Overall score: ${scores.overall}/100
Accessibility: ${scores.accessibility}/100
Content: ${scores.content}/100
SEO: ${scores.seo}/100
Performance: ${scores.performance}/100
Issues: ${summary.totalIssues} total (${summary.criticalIssues} critical)

Page info:
${pageInfo}

Top issues:
${topIssueList}

Include:
- Company name and what they appear to do (infer from website content)
- Their current website's biggest weaknesses (top 3, in plain language)
- What services they likely need (website redesign, SEO, accessibility fixes, content rewrite, automation/integration)
- Suggested talking points for a strategy call (what to lead with, what pain points to reference)
- Estimated project scope: small fix (1-2 days), medium project (1-2 weeks), or full rebuild (4-8 weeks)

Keep it under 300 words. Write it as bullet points, not paragraphs. Be direct and actionable.`
    );

    const text = result.response.text().trim();
    return text || null;
  } catch (error) {
    console.error("[ai] Sales brief generation failed:", error);
    return null;
  }
}

// ── Why It Matters ────────────────────────────────────────────────────

/**
 * Generate a one-sentence plain-English business impact for each issue.
 * Returns a map of { issueId: sentence }. Silently returns {} on failure.
 */
export async function generateWhyItMatters(
  domain: string,
  issues: Issue[]
): Promise<Record<string, string>> {
  const ai = getClient();
  if (!ai) return {};

  // Deduplicate by id
  const unique = Array.from(new Map(issues.map((i) => [i.id, i])).values());
  if (unique.length === 0) return {};

  try {
    const issueList = unique
      .map((i, idx) => `${idx + 1}. id="${i.id}" title="${i.title}"`)
      .join("\n");

    const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent(
      `You are writing plain-English business impact summaries for a website audit report shown to non-technical business owners.

For each issue below, write exactly one sentence explaining WHY it matters to the business — focus on real consequences: lost visitors, lower Google rankings, accessibility barriers, lost revenue, security risk, etc. Reference the domain "${domain}" where it makes the summary more specific and credible. Be direct and concrete. No jargon.

Issues:
${issueList}

Respond with valid JSON only — an object mapping each issue id to its one-sentence impact. Example format:
{
  "seo-no-title": "Without a page title, Google has nothing to display in search results, making ${domain} invisible to people searching for your services.",
  "perf-lcp-poor": "Slow load times cause more than half of mobile visitors to leave before your page finishes loading."
}

Return only the JSON object, no other text.`
    );

    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    return JSON.parse(jsonMatch[0]) as Record<string, string>;
  } catch (error) {
    console.error("[ai] Why it matters generation failed:", error);
    return {};
  }
}

// ── Design Analysis (Gemini Vision) ──────────────────────────────────

/**
 * Analyze a website screenshot using Gemini Vision.
 * Returns an overall design score (0-100) and up to 4 plain-English issue sentences.
 * Silently returns null on any error or if screenshot URL is unavailable.
 */
export async function generateDesignAnalysis(
  domain: string,
  screenshotUrl: string,
  screenshotBuffer?: Buffer | null
): Promise<DesignAnalysis | null> {
  const ai = getClient();
  if (!ai) return null;

  try {
    let base64: string;
    let mimeType: string;

    if (screenshotBuffer) {
      // Use the pre-captured buffer directly — no HTTP round-trip needed
      base64 = screenshotBuffer.toString("base64");
      mimeType = "image/jpeg";
    } else {
      if (!screenshotUrl) return null;
      const response = await fetch(screenshotUrl, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      base64 = Buffer.from(arrayBuffer).toString("base64");
      mimeType = response.headers.get("content-type") || "image/png";
    }

    const model = ai.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: base64,
        },
      },
      `You are a professional web designer reviewing a website screenshot for a business owner. Rate each dimension 0-100 and identify the most important visual issues.

Website: ${domain}

Score each dimension (0=very poor, 100=excellent):
- visualHierarchy: Is there a clear focal point? Does the eye flow naturally?
- whitespace: Is spacing balanced? Does the layout breathe?
- typography: Are fonts readable, consistent, and professional?
- ctaProminence: Are calls-to-action visible and compelling?
- professionalism: Does the overall design look polished and trustworthy?

Also identify up to 4 specific visual issues that hurt conversions or credibility (plain English, one sentence each, for a non-technical business owner).

Respond with JSON only:
{
  "visualHierarchy": <number>,
  "whitespace": <number>,
  "typography": <number>,
  "ctaProminence": <number>,
  "professionalism": <number>,
  "issues": ["<issue 1>", "<issue 2>", ...]
}`,
    ]);

    const text = result.response.text().trim();
    const parsed = JSON.parse(text) as {
      visualHierarchy: number;
      whitespace: number;
      typography: number;
      ctaProminence: number;
      professionalism: number;
      issues: string[];
    };

    const scores = [
      parsed.visualHierarchy,
      parsed.whitespace,
      parsed.typography,
      parsed.ctaProminence,
      parsed.professionalism,
    ].filter((s) => typeof s === "number");

    if (scores.length === 0) return null;

    const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    return {
      overallScore: Math.max(0, Math.min(100, overallScore)),
      issues: (parsed.issues || []).slice(0, 4),
    };
  } catch (error) {
    console.error("[ai] Design analysis failed:", error);
    return null;
  }
}
