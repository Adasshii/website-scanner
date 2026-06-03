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

// ── Voice directive (Adashi brand voice) ──────────────────────────────
//
// Injected at the top of every Gemini prompt that produces user-facing
// copy. Distilled from Adashi voice-principles.md and writing-rules.md.
// Update both files in tandem so the brand voice stays coherent.

const VOICE_DIRECTIVE = `VOICE — write like a clear, thoughtful colleague talking to a smart friend. Warm and efficient. Confident, no hedging. Short, declarative sentences as the default; vary length so paragraphs flow. One idea per sentence, one idea per paragraph.

NEVER use em dashes. Use commas, colons, or periods instead.

NEVER use these words or phrases:
- delve, tapestry, realm, landscape (metaphorical), journey (metaphorical), testament, cornerstone, bedrock, pivotal, underscore (as verb), showcase, meticulous, intricate, enduring, bolster, foster, garner, vibrant, robust, enhance, highlight (meaning emphasize), crucial, transformative, groundbreaking, innovative, cutting-edge, state-of-the-art, seamless, multifaceted, nuanced (without substance), comprehensive (as filler), significant (as filler), substantial (as filler), unprecedented, unparalleled, leverage (as verb)
- truly, certainly, absolutely, undoubtedly, remarkably, incredibly, particularly, especially, indeed
- "It is worth noting that", "It is important to note that", "Notably", "Importantly", "In today's fast-paced/digital world", "At the end of the day"
- "exciting", "powerful", "industry-leading", "world-class", "best-in-class", "game-changing"
- Filler transitions: Additionally, Furthermore, Moreover, Nevertheless, Consequently, In conclusion, To summarize, Moving forward
- Vague attribution: "some say", "many believe", "experts suggest". Either name the source or own the claim.
- Hollow framing: "reflecting the broader trend of", "underscoring the importance of", "a milestone in"

DO:
- Open with the actual point. No throat-clearing ("Certainly!", "Great question!").
- Use "is" and "are", not "serves as" / "stands as" / "acts as".
- Specifics over abstractions: numbers, percentages, named tools, concrete examples.
- State facts plainly. If you can't attribute it, cut it or own it.
- End on the point. No "while challenges remain, the future is bright" closers.
- Reuse the same word when it's the right word. Do not rotate synonyms artificially.
- Use rhetorical questions sparingly to keep the reader engaged.
- Share trade-offs honestly when relevant.`;

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
  visitorExperience: string;
}

export interface DesignAnalysis {
  overallScore: number;
  issues: string[];
}

/** Full per-locale AI pipeline output: comprehensive analysis + per-issue overrides. */
export interface LocaleAiPipelineResult {
  locale: string;
  executiveSummary: string;
  visitorExperience: string;
  costEstimate: CostEstimate;
  quickWins: QuickWin[];
  websitePersonality: string;
  /** Per-issue language-bearing overrides keyed by issue id. */
  issueOverrides: Record<string, {
    title?: string;
    description?: string;
    recommendation?: string;
    whyItMatters?: string;
  }>;
}

/**
 * Run the full locale-specific AI pipeline (comprehensive analysis + issue
 * enhancement + whyItMatters). Used twice in parallel (primary + alt locale)
 * to populate bilingual scan records.
 */
export async function runLocaleAiPipeline(
  domain: string,
  scores: ScanScores,
  summary: ScanSummary,
  pages: PageResult[],
  issues: Issue[],
  loadTimeMs: number,
  locale: string,
  timeoutMs: number,
): Promise<LocaleAiPipelineResult> {
  const withTimeoutLocal = <T>(p: Promise<T>, fallback: T): Promise<T> => {
    return Promise.race<T>([
      p,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
    ]).catch(() => fallback);
  };

  const [analysis, enhancedIssues, whyItMattersMap] = await Promise.all([
    withTimeoutLocal(generateComprehensiveAnalysis(domain, scores, summary, pages, locale), null as ComprehensiveAnalysis | null),
    withTimeoutLocal(enhanceIssueDescriptions(issues, locale), issues),
    withTimeoutLocal(generateWhyItMatters(domain, issues, locale), {} as Record<string, string>),
  ]);

  const executiveSummary = analysis?.executiveSummary ?? generateFallbackVerdict(scores, summary.criticalIssues, locale);
  const visitorExperience = analysis?.visitorExperience ?? generateFallbackVisitorExperience(scores, summary, locale);
  const costEstimate = analysis?.costEstimate ?? calculateCostEstimateFallback(scores, summary, loadTimeMs, locale);
  const quickWins = analysis?.quickWins ?? generateFallbackQuickWins(issues, locale);
  const websitePersonality = analysis?.websitePersonality ?? generateFallbackWebsitePersonality(scores, locale);

  const issueOverrides: LocaleAiPipelineResult["issueOverrides"] = {};
  const enhancedById = new Map(enhancedIssues.map((i) => [i.id, i]));
  for (const original of issues) {
    const enhanced = enhancedById.get(original.id);
    const why = whyItMattersMap[original.id];
    const override: LocaleAiPipelineResult["issueOverrides"][string] = {};
    if (enhanced && enhanced.title !== original.title) override.title = enhanced.title;
    if (enhanced && enhanced.description !== original.description) override.description = enhanced.description;
    if (enhanced && enhanced.recommendation !== original.recommendation) override.recommendation = enhanced.recommendation;
    if (why) override.whyItMatters = why;
    if (Object.keys(override).length > 0) issueOverrides[original.id] = override;
  }

  return {
    locale,
    executiveSummary,
    visitorExperience,
    costEstimate,
    quickWins,
    websitePersonality,
    issueOverrides,
  };
}

export const SUPPORTED_LOCALES: readonly string[] = ["en", "nl"];
export function otherLocale(locale: string): string {
  return locale === "nl" ? "en" : "nl";
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
  pages: PageResult[],
  locale: string = "en"
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
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const languageDirective = locale === "nl"
      ? `LANGUAGE: Respond entirely in natural Dutch (Nederlands). Use clear, direct business Dutch — no jargon, no Anglicisms where a Dutch word fits. All field VALUES in the returned JSON must be in Dutch. JSON keys remain English. Do not translate "Adashi" or other brand names. Numbers and percentages keep their numeric form.\n\n`
      : "";

    const result = await model.generateContent(
      `${VOICE_DIRECTIVE}

${languageDirective}You are a senior website strategist writing a report for a business owner. The reader is not technical. Analyze the following website.

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

Return JSON with these fields:

{
  "executiveSummary": "2 sentences. Lead with the single most important finding. Name the weakest category. Specific, direct, no hedging. No markdown.",

  "costEstimate": {
    "totalLostPercent": <number, estimated percentage of visitors being lost>,
    "factors": [
      {
        "name": "<short factor name>",
        "percentImpact": <number>,
        "explanation": "<1 sentence. State the cause and the cost plainly.>"
      }
    ]
  },

  "quickWins": [
    {
      "title": "<plain language issue>",
      "description": "<what to fix and why, 1-2 sentences. Specific, not generic.>",
      "estimatedTime": "<specific time estimate, e.g. '~10 min', '~1 hour', '~half a day'>",
      "needsDeveloper": <boolean. Copy exact value from effort data above.>,
      "expectedImpact": "<one sentence about the concrete improvement (numbers if you have them).>"
    }
  ],

  "websitePersonality": "3 sentences on how the site comes across to a first-time visitor. Cover tone, professionalism, clarity. Write for a business owner. No filler words.",

  "visitorExperience": "A briefing for a business owner. About 280-360 words, 5 paragraphs separated by \\n\\n. No technical jargon. Each paragraph is 2-4 sentences. Translate everything into business terms.\n\nParagraph 1, First impression and speed: How fast or slow does the site load from a visitor's perspective. Use the load time and Core Web Vitals in plain terms (for example 'visitors wait around X seconds'). Compare to a sensible benchmark. Mention layout stability and mobile if relevant.\n\nParagraph 2, Search visibility: How Google sees this site, based on the SEO score and top SEO issues. Frame it as: how easy is it for new customers to find you through search. Name what is working and what is limiting reach.\n\nParagraph 3, Trust and credibility: What a first-time visitor notices without thinking about it. Security signals, whether the site feels polished, accessibility gaps that affect real users. State what builds or erodes trust.\n\nParagraph 4, Business impact: Tie the above to outcomes. What is this likely costing the business in lost traffic, early exits, missed conversions. Use percentages or numbers when the data supports them.\n\nParagraph 5, Outlook: An honest read on where the site stands and what becomes possible if the top issues are fixed. End on the point, not a generic closing line."
}

Cost estimate benchmarks (industry research):
- Slow page load (avg > 3s): 10-15%. Google/SOASTA: 53% of mobile visitors abandon after 3s. Portent: each extra second reduces conversions ~4.4%.
- Accessibility (score < 80): up to 20%, scaled to how low the score is. CDC: ~26% of adults have a disability. A low score means real users cannot complete tasks on the site.
- Poor readability (content score < 60): 10%. Nielsen Norman: users read ~20% of page text. Buried content drives silent exits.
- Missing or weak CTAs (content score < 70 or CTA issues found): 8%. HubSpot: 70%+ of SMB sites lack a clear CTA.
- Poor SEO (seo score < 50): 12%. ~68% of online experiences start with search.
Present totalLostPercent as the combined impact, capped at 45%.

Quick wins: pick the 3 highest impact-to-effort fixes from the issues above. Each should be a different fix type.
Effort data from the actual scan:
${effortContext}
Use the estimatedTime hint as-is. Use the needsDeveloper value as-is.

Return ONLY valid JSON, no other text.`
    );

    const text = result.response.text().trim();
    const parsed = JSON.parse(text) as ComprehensiveAnalysis;

    // Validate the response shape
    if (
      !parsed.executiveSummary ||
      !parsed.costEstimate ||
      !parsed.quickWins ||
      !parsed.websitePersonality ||
      !parsed.visitorExperience
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
  criticalIssues: number,
  locale: string = "en"
): string {
  const nl = locale === "nl";
  if (scores.overall >= 90) {
    return nl
      ? "Je website is goed gebouwd en presteert sterk in alle categorieën."
      : "Your website is well-built and performs strongly across all categories.";
  }
  if (scores.overall >= 70) {
    const weakest = getWeakestCategory(scores, locale);
    return nl
      ? `Je website is in redelijke vorm. ${weakest.charAt(0).toUpperCase() + weakest.slice(1)} is de zwakste schakel en kost je het meest.`
      : `Your website is in decent shape. ${weakest.charAt(0).toUpperCase() + weakest.slice(1)} is the weak link and costs you the most.`;
  }
  if (scores.overall >= 50) {
    const sev = nl
      ? (criticalIssues > 0 ? "kritieke" : "belangrijke")
      : (criticalIssues > 0 ? "critical" : "major");
    return nl
      ? `Je website heeft meerdere verbeterpunten. De ${sev} problemen oplossen levert de meeste winst op.`
      : `Your website has several areas to improve. Fixing the ${sev} issues delivers the most return.`;
  }
  return nl
    ? "Je website heeft serieuze problemen die je bezoekers en zoekposities kosten. De meeste fixes zijn niet ingewikkeld."
    : "Your website has serious issues that cost you visitors and search rankings. Most fixes are not complicated.";
}

function getWeakestCategory(scores: ScanScores, locale: string = "en"): string {
  const nl = locale === "nl";
  const categories = [
    { name: nl ? "toegankelijkheid" : "accessibility", score: scores.accessibility },
    { name: nl ? "contentkwaliteit" : "content quality", score: scores.content },
    { name: "SEO", score: scores.seo },
    { name: nl ? "prestaties" : "performance", score: scores.performance },
  ];
  categories.sort((a, b) => a.score - b.score);
  return categories[0].name;
}

// ── Fallback visitor experience (template-based) ─────────────────────

export function generateFallbackVisitorExperience(
  scores: ScanScores,
  summary: ScanSummary,
  locale: string = "en"
): string {
  const nl = locale === "nl";
  const paragraphs: string[] = [];

  // First impression and speed
  if (scores.performance >= 80) {
    paragraphs.push(nl
      ? "De site laadt snel. Dat verlaagt het aantal vroege exits en geeft een goede eerste indruk voordat iemand een woord heeft gelezen."
      : "The site loads fast. That cuts early exits and creates a good first impression before anyone reads a word.");
  } else if (scores.performance >= 60) {
    paragraphs.push(nl
      ? "De site laadt op een gemiddeld tempo. Bezoekers op mobiele verbindingen ervaren een merkbare wachttijd. Snellere laadtijd is een van de fixes met het hoogste rendement."
      : "The site loads at an average pace. Visitors on mobile connections wait noticeably before the page is usable. Faster load time is one of the highest-return fixes available.");
  } else {
    paragraphs.push(nl
      ? "De site laadt traag. Google ontdekte dat 53% van de mobiele bezoekers afhaakt op pagina's die langer dan 3 seconden laden. Snelheidsverbeteringen hebben hier direct invloed op hoeveel mensen daadwerkelijk met de site interacteren."
      : "The site is slow to load. Google found 53% of mobile visitors abandon pages that take longer than 3 seconds to load. Speed fixes here directly change how many people actually engage with the site.");
  }

  // Search visibility
  if (scores.seo >= 80) {
    paragraphs.push(nl
      ? "Vanuit zoekoptiek staat de site er goed voor. Google kan de inhoud lezen en begrijpen. Nieuwe bezoekers vinden de site daardoor sneller via organisch verkeer."
      : "From a search perspective, the site is in good shape. Google can read and understand the content. New visitors find the site faster through organic search.");
  } else if (scores.seo >= 50) {
    paragraphs.push(nl
      ? "De vindbaarheid in zoekmachines is gemiddeld. Een aantal signalen dat Google gebruikt om pagina's te ranken ontbreekt of is onvolledig. Dat beperkt hoeveel nieuwe bezoekers de site via zoekopdrachten ontdekken."
      : "Search visibility is average. Several signals Google uses to rank pages are missing or incomplete. That limits how many new visitors discover the site through search.");
  } else {
    paragraphs.push(nl
      ? "De site heeft grote gaten in vindbaarheid. Zonder de juiste technische signalen kan Google de inhoud nauwelijks begrijpen of ranken. Een groot deel van de potentiële bezoekers vindt de site nooit."
      : "The site has large gaps in search visibility. Without the right technical signals, Google can barely understand or rank the content. A large share of potential visitors never finds the site.");
  }

  // Trust and credibility
  if (scores.accessibility >= 80 && (scores.security ?? 0) >= 80) {
    paragraphs.push(nl
      ? "De site komt professioneel en betrouwbaar over. De beveiliging is goed ingericht en de toegankelijkheid is op orde. Bezoekers met een beperking kunnen de site zonder drempels gebruiken."
      : "The site is professional and trustworthy. Security is set up well and accessibility is in order. Visitors with disabilities can use the site without barriers.");
  } else if (scores.accessibility < 60) {
    paragraphs.push(nl
      ? `Toegankelijkheid verdient aandacht. Met een score van ${scores.accessibility}/100 lopen bezoekers die een screenreader of toetsenbordnavigatie gebruiken tegen drempels aan die hen verhinderen de site te gebruiken.`
      : `Accessibility needs attention. With a score of ${scores.accessibility}/100, visitors who use a screen reader or keyboard navigation run into barriers that prevent them from using the site.`);
  } else {
    paragraphs.push(nl
      ? "Er zijn een paar vertrouwens- en geloofwaardigheidsgaten die scherpe bezoekers opvallen. De beveiligings- en toegankelijkheidsproblemen in dit rapport oplossen maakt de site verzorgder en professioneler."
      : "There are trust and credibility gaps that observant visitors will notice. Fixing the security and accessibility issues in this report makes the site feel more polished and professional.");
  }

  // Business impact
  const weakestScore = Math.min(scores.accessibility, scores.seo, scores.performance, scores.content);
  if (summary.criticalIssues > 0) {
    paragraphs.push(nl
      ? `Met ${summary.criticalIssues} kritiek${summary.criticalIssues !== 1 ? "e" : ""} en ${summary.majorIssues} belangrijk${summary.majorIssues !== 1 ? "e" : ""} ${summary.criticalIssues + summary.majorIssues === 1 ? "probleem" : "problemen"} verliest de site een merkbaar deel van bezoekers en conversies. De problemen zijn niet ongewoon voor dit type site, maar vertegenwoordigen echte, meetbare gemiste omzet.`
      : `With ${summary.criticalIssues} critical issue${summary.criticalIssues !== 1 ? "s" : ""} and ${summary.majorIssues} major issue${summary.majorIssues !== 1 ? "s" : ""}, the site is losing a measurable share of visitors and conversions. The issues are not unusual for a site of this type, but they represent real lost revenue.`);
  } else if (weakestScore < 60) {
    paragraphs.push(nl
      ? "De zwakste plekken van de site veroorzaken frictie die bezoekers en conversies kost, ook als bezoekers de oorzaak niet bewust opmerken. Deze problemen oplossen haalt drempels weg tussen de site en betere resultaten."
      : "The weakest areas of the site create friction that costs visitors and conversions, even if visitors don't consciously notice the cause. Fixing these removes barriers between the site and better results.");
  } else {
    paragraphs.push(nl
      ? "Over het geheel presteert de site redelijk. De gevonden problemen zijn niet kritiek, maar oppakken verbetert de ervaring voor een breder publiek en versterkt de positie bij zoekmachines."
      : "Overall the site performs reasonably. The issues are not critical, but addressing them improves the experience for a wider audience and strengthens search rankings.");
  }

  // Outlook
  if (scores.overall >= 80) {
    paragraphs.push(nl
      ? "De site staat er sterk voor. Een gerichte ronde verbeteringen op de resterende punten brengt hem naar uitstekend niveau en geeft een duidelijk voordeel ten opzichte van vergelijkbare sites."
      : "The site is in strong shape. A focused round of fixes on the remaining points brings it to excellent and gives a clear edge over comparable sites.");
  } else if (scores.overall >= 60) {
    paragraphs.push(nl
      ? "Solide basis, duidelijke ruimte om te groeien. Eerst de quick wins aanpakken levert de snelste resultaten. Een grondiger verbetertraject tilt de algehele ervaring merkbaar omhoog."
      : "Solid foundation, clear room to grow. The quick wins deliver the fastest results. A more thorough improvement pass lifts the overall experience noticeably.");
  } else {
    paragraphs.push(nl
      ? "Er is werk te doen, maar de meeste problemen zijn oplosbaar. Eerst de kritieke punten oppakken levert direct impact op. Elke verbetering bouwt door op de vorige tot een merkbaar betere ervaring voor bezoekers."
      : "There is work to do, but most issues are fixable. Tackling the critical items first delivers immediate impact. Each fix builds on the last toward a noticeably better experience for visitors.");
  }

  return paragraphs.join("\n\n");
}

// ── Fallback cost estimate (deterministic) ───────────────────────────

export function calculateCostEstimateFallback(
  scores: ScanScores,
  summary: ScanSummary,
  avgLoadTimeMs: number,
  locale: string = "en"
): CostEstimate {
  const nl = locale === "nl";
  const factors: CostFactor[] = [];
  let total = 0;

  if (scores.accessibility < 80) {
    const impact = Math.min(Math.round((80 - scores.accessibility) * 0.25), 20);
    if (impact > 0) {
      factors.push({
        name: nl ? "Toegankelijkheidsdrempels" : "Accessibility barriers",
        percentImpact: impact,
        explanation: nl
          ? `Een toegankelijkheidsscore van ${scores.accessibility}/100 betekent dat sommige bezoekers je site niet volledig kunnen gebruiken.`
          : `Accessibility score of ${scores.accessibility}/100 means some visitors cannot fully use your site.`,
      });
      total += impact;
    }
  }

  if (scores.content < 60) {
    factors.push({
      name: nl ? "Leesbaarheid van content" : "Content readability",
      percentImpact: 10,
      explanation: nl
        ? "Je content is mogelijk lastig te lezen of te begrijpen, waardoor bezoekers afhaken."
        : "Your content may be hard to read or understand, causing visitors to leave.",
    });
    total += 10;
  }

  const ctaIssues = summary.topIssues.filter(
    (i) => i.title.toLowerCase().includes("cta") || i.title.toLowerCase().includes("call to action")
  );
  if (ctaIssues.length > 0 || scores.content < 70) {
    const impact = 8;
    factors.push({
      name: nl ? "Zwakke calls-to-action" : "Weak calls-to-action",
      percentImpact: impact,
      explanation: nl
        ? "Bezoekers weten mogelijk niet welke stap ze moeten zetten, waardoor conversies dalen."
        : "Visitors may not know what step to take next, reducing conversions.",
    });
    total += impact;
  }

  if (avgLoadTimeMs > 3000) {
    factors.push({
      name: nl ? "Trage laadtijd" : "Slow page load",
      percentImpact: 12,
      explanation: nl
        ? "Pagina's die langer dan 3 seconden laden, zorgen ervoor dat veel bezoekers vertrekken voor ze je content zien."
        : "Pages loading over 3 seconds cause many visitors to leave before seeing your content.",
    });
    total += 12;
  }

  if (scores.seo < 50) {
    factors.push({
      name: nl ? "Lage vindbaarheid in zoekmachines" : "Poor search visibility",
      percentImpact: 12,
      explanation: nl
        ? "Een lage SEO-score betekent dat minder bezoekers je site via zoekmachines vinden."
        : "Low SEO score means fewer visitors find your site through search engines.",
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
  issues: Issue[],
  locale: string = "en"
): Promise<Issue[]> {
  const ai = getClient();
  if (!ai || issues.length === 0) return issues;

  // Enhance more when translating so the lower-priority bucket isn't half-English
  const toEnhance = issues.slice(0, locale === "nl" ? 25 : 15);

  try {
    const issueList = toEnhance
      .map(
        (issue, i) =>
          `${i + 1}. [${issue.severity}/${issue.category}] "${issue.title}"\n   Description: ${issue.description}\n   Recommendation: ${issue.recommendation}`
      )
      .join("\n\n");

    const model = ai.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const languageBlock = locale === "nl"
      ? `LANGUAGE: Rewrite the title, description, and recommendation in natural business Dutch. No Anglicisms where a Dutch word fits. Do not translate code, HTML tags, CSS selectors, file names, brand names, or quoted attribute values — leave them as-is.\n\n`
      : "";

    const fieldsForResponse = locale === "nl"
      ? `{"index": <number>, "title": "<short Dutch title>", "description": "<plain Dutch description>", "recommendation": "<plain Dutch recommendation>"}`
      : `{"index": <number>, "description": "<plain language description>", "recommendation": "<plain language recommendation>"}`;

    const result = await model.generateContent(
      `${VOICE_DIRECTIVE}

${languageBlock}You are rewriting website audit findings for a small business owner who is NOT technical.

For each issue below, rewrite the description and recommendation in plain language. Be specific about what is wrong and what to do. Description: 1 sentence. Recommendation: 1-2 sentences. State the action directly, no hedging.${locale === "nl" ? " Also provide a short Dutch title (max 60 characters)." : ""}

${issueList}

Respond with ONLY a JSON array. Each element must have: ${fieldsForResponse}`
    );

    const text = result.response.text().trim();

    // Parse the JSON response
    const enhanced: Array<{
      index: number;
      title?: string;
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
          title: item.title || updatedIssues[idx].title,
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

    const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent(
      `${VOICE_DIRECTIVE}

You are a sales strategist preparing a brief for the Adashi agency owner before a potential client call. Based on the scan results below, write a concise brief.

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
- The site's top 3 weaknesses, in plain language
- Services they likely need (website redesign, SEO, accessibility fixes, content rewrite, automation/integration)
- Talking points for the call: what to lead with, which pain points to reference
- Project scope estimate: small fix (1-2 days), medium project (1-2 weeks), or full rebuild (4-8 weeks)

Under 300 words. Bullet points, not paragraphs. Direct, specific, no padding.`
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
  issues: Issue[],
  locale: string = "en"
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

    const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });

    const languageBlock = locale === "nl"
      ? `LANGUAGE: Write each one-sentence impact in natural business Dutch. No Anglicisms where a Dutch word fits.\n\n`
      : "";

    const result = await model.generateContent(
      `${VOICE_DIRECTIVE}

${languageBlock}You are writing plain-language business impact summaries for a website audit report shown to non-technical business owners.

For each issue below, write exactly one sentence explaining WHY it matters to the business. Focus on real consequences: lost visitors, lower Google rankings, accessibility barriers, lost revenue, security risk. Reference the domain "${domain}" where it makes the summary more specific. Direct and concrete. No jargon. No hedging. No padding.

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

// ── Fallback quick wins (derived from scan issues) ────────────────────

export function generateFallbackQuickWins(issues: Issue[], locale: string = "en"): QuickWin[] {
  const nl = locale === "nl";
  const valid = issues.filter((i) => i.id !== "scan-error");
  const easy = valid.filter((i) => i.difficulty === "easy");
  const source = easy.length >= 3
    ? easy
    : [...valid].sort((a, b) => a.impact - b.impact);
  return source.slice(0, 3).map((issue) => ({
    title: issue.title,
    description: issue.description,
    estimatedTime: nl
      ? (issue.difficulty === "easy" ? "~15 min" : issue.difficulty === "hard" ? "~halve dag" : "~1 uur")
      : (issue.difficulty === "easy" ? "~15 min" : issue.difficulty === "hard" ? "~half a day" : "~1 hour"),
    needsDeveloper: issue.difficulty === "hard",
    expectedImpact: issue.whyItMatters ?? (nl
      ? "Dit oplossen verhoogt je totaalscore."
      : "Fixing this lifts your overall site score."),
  }));
}

// ── Fallback website personality (template-based) ─────────────────────

export function generateFallbackWebsitePersonality(scores: ScanScores, locale: string = "en"): string {
  const nl = locale === "nl";
  const weakest = getWeakestCategory(scores, locale);
  if (scores.overall >= 80) {
    return nl
      ? "De site is professioneel en betrouwbaar, met een heldere structuur waarin bezoekers vinden wat ze zoeken. Eerste bezoekers voelen zich vertrouwd genoeg om in actie te komen."
      : "The site is professional and trustworthy, with a clear structure that helps visitors find what they need. First-time visitors feel confident enough to take action.";
  }
  if (scores.overall >= 60) {
    return nl
      ? `Solide basis. Problemen rond ${weakest} laten sommige bezoekers twijfelen. De belangrijkste punten in dit rapport oplossen versterkt de indruk die de site achterlaat merkbaar.`
      : `Solid foundation. ${weakest.charAt(0).toUpperCase() + weakest.slice(1)} issues cause some visitors to hesitate. Fixing the top items in this report noticeably raises the impression the site leaves.`;
  }
  return nl
    ? `In zijn huidige staat creëert de site frictie voor eerste bezoekers, vooral rond ${weakest}. De quick wins hieronder maken een merkbaar verschil in hoe de site wordt ervaren.`
    : `In its current state, the site creates friction for first-time visitors, especially around ${weakest}. The quick wins below make a noticeable difference in how the site is experienced.`;
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
      model: "gemini-2.5-flash",
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
