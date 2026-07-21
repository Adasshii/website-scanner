import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { authMiddleware } from "./middleware/auth";
import { scanPage, closeBrowser } from "./scanner";
import type { ScanPageResultWithScreenshot } from "./scanner";
import { discoverPages } from "./discovery";
import {
  runLocaleAiPipeline,
  otherLocale,
  generateSalesBrief,
  generateDesignAnalysis,
  type DesignAnalysis,
} from "./ai";
import { uploadScreenshot } from "./screenshots";
import type { ScanRequest, PageResult, ScanScores, ScanSummary, Issue, IssueSeverity, ScreenshotInfo } from "../../types/scanner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAtCapacity, CAPACITY_RETRY_AFTER_SECONDS } from "./capacity";

/** Race a promise against a timer; resolve to `fallback` if it times out */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(timer)), timeout]);
}

/**
 * Drop AI-vision design issues that just restate a cookie-banner problem our own
 * HTML checks already flagged. The DOM checks (design-cookie-banner-blocking /
 * design-cookie-banner) are precise about whether the banner blocks content, so
 * when one of those is present we suppress any vision sentence about the cookie
 * banner to avoid showing the owner three cards for the same problem.
 */
function dedupeCookieAiIssues(aiIssues: Issue[], existingIssues: Issue[]): Issue[] {
  const hasHtmlCookieIssue = existingIssues.some(
    (iss) => iss.id === "design-cookie-banner-blocking" || iss.id === "design-cookie-banner"
  );
  if (!hasHtmlCookieIssue) return aiIssues;
  return aiIssues.filter(
    (iss) => !/cookie/i.test(`${iss.title} ${iss.description}`)
  );
}

// Supabase client for async scan DB updates
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Track in-flight full scans so SIGTERM/crash can mark them failed
const activeFullScans = new Map<string, SupabaseClient>();

async function failScan(scanId: string, supabase: SupabaseClient, reason: string) {
  try {
    await supabase
      .from("scans")
      .update({ status: "failed", error_message: reason, updated_at: new Date().toISOString() })
      .eq("id", scanId);
  } catch (err) {
    console.error(`[scan-recovery] DB update failed for ${scanId}:`, err);
  }
}

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(",") || "*" }));
app.use(express.json());

// ── Health check (no auth) ─────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "adashi-scanner", timestamp: new Date().toISOString() });
});

// ── All scan routes require auth ───────────────────────────────────

app.use("/api", authMiddleware);

// ── Background design analysis (async, updates Supabase directly) ──

async function runDesignAnalysisBackground(
  supabase: SupabaseClient,
  scanId: string,
  domain: string,
  screenshotUrl: string | null,
  designScreenshotBuffer: Buffer | null,
  htmlDesignScore: number,
  currentScores: ScanScores,
): Promise<void> {
  console.log(`[design-bg] Starting for scan ${scanId}`);

  const markDone = async (updates?: Record<string, unknown>) => {
    try {
      await supabase.from("scans").update({
        design_ai_analyzed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...updates,
      }).eq("id", scanId);
    } catch (err) {
      console.error(`[design-bg] DB update failed for ${scanId}:`, err);
    }
  };

  try {
    // Check 24h cache first
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: cachedScan } = await supabase
      .from("scans")
      .select("design_ai_analysis, design_ai_analyzed_at")
      .eq("domain", domain)
      .not("design_ai_analysis", "is", null)
      .gte("design_ai_analyzed_at", twentyFourHoursAgo)
      .order("design_ai_analyzed_at", { ascending: false })
      .limit(1)
      .single();

    const designAnalysis: DesignAnalysis | null =
      cachedScan?.design_ai_analysis
        ? (cachedScan.design_ai_analysis as DesignAnalysis)
        : await withTimeout(
            generateDesignAnalysis(domain, screenshotUrl ?? "", designScreenshotBuffer),
            60_000,
            null
          );

    if (!designAnalysis) {
      console.log(`[design-bg] No result for ${scanId}, keeping HTML score`);
      await markDone();
      return;
    }

    const designScore = Math.max(0, Math.min(100, Math.round(htmlDesignScore * 0.4 + designAnalysis.overallScore * 0.6)));
    const overall = Math.round(
      (currentScores.performance ?? 0) * 0.25 +
      (currentScores.seo ?? 0) * 0.25 +
      (currentScores.accessibility ?? 0) * 0.15 +
      (currentScores.content ?? 0) * 0.15 +
      (currentScores.security ?? 0) * 0.10 +
      designScore * 0.10
    );

    const aiScore = designAnalysis.overallScore;
    const aiSeverity: IssueSeverity = aiScore < 50 ? "major" : aiScore < 70 ? "minor" : "info";
    const aiDesignIssues: Issue[] = designAnalysis.issues.map((sentence, i) => ({
      id: `design-ai-${i + 1}`,
      category: "design" as const,
      severity: aiSeverity,
      title: sentence.split(".")[0].trim().slice(0, 80) || "Visual design issue",
      description: sentence,
      recommendation: "Review the visual design of this page with a designer.",
      impact: aiSeverity === "major" ? 8 : aiSeverity === "minor" ? 3 : 1,
    }));

    // Fetch current pages + summary so we can update both consistently
    const { data: currentScan } = await supabase
      .from("scans")
      .select("pages, summary")
      .eq("id", scanId)
      .single();

    const updatedPages = Array.isArray(currentScan?.pages) && currentScan.pages.length > 0
      ? currentScan.pages.map((page: PageResult, i: number) =>
          i === 0
            ? {
                ...page,
                issues: [...page.issues, ...dedupeCookieAiIssues(aiDesignIssues, page.issues)],
                scores: { ...page.scores, design: designScore, overall },
              }
            : page
        )
      : currentScan?.pages ?? [];

    // Rebuild summary from updated pages, preserving the AI-generated verdict
    const freshSummary = buildSummary(updatedPages);
    const existingVerdict = (currentScan?.summary as ScanSummary | null)?.verdict;
    const updatedSummary: ScanSummary = existingVerdict
      ? { ...freshSummary, verdict: existingVerdict }
      : freshSummary;

    await markDone({
      scores: { ...currentScores, design: designScore, overall },
      pages: updatedPages,
      summary: updatedSummary,
      design_ai_analysis: designAnalysis,
    });

    console.log(`[design-bg] Done for scan ${scanId}: design=${designScore}, overall=${overall}`);
  } catch (err) {
    console.error(`[design-bg] Failed for scan ${scanId}:`, err);
    await markDone();
  }
}

// ── Quick scan: single page ────────────────────────────────────────

app.post("/api/scan/quick", async (req, res) => {
  const { url, scanId, locale = "en" } = req.body as { url: string; scanId?: string; locale?: string };

  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    console.log(`[quick-scan] Starting: ${url}`);
    const { result, screenshotBuffer, designScreenshotBuffer, overlays } = await scanPage({ url });
    console.log(`[quick-scan] Done: ${url} — score ${result.scores.overall}`);

    const summary = buildSummary([result]);

    // Upload screenshot if available
    const supabase = getSupabase();
    let screenshots: Record<string, ScreenshotInfo> | null = null;
    if (screenshotBuffer) {
      try {
        const uploaded = await uploadScreenshot(supabase, "quick-" + Date.now(), 0, screenshotBuffer);
        if (uploaded) {
          screenshots = {
            [result.url]: { path: uploaded.path, url: uploaded.url, overlays },
          };
        }
      } catch (err) {
        console.error("[quick-scan] Screenshot upload failed:", err);
      }
    }

    const domain = new URL(url).hostname;
    const screenshotUrl = screenshots?.[result.url]?.url ?? null;

    // Compute HTML-only design score (no AI — that runs async in background)
    const hasScanError = result.issues.some((i) => i.id === "scan-error");
    const htmlDesignIssues = result.issues.filter((iss) => iss.category === "design");
    const htmlDeduction = htmlDesignIssues.reduce((sum, iss) => sum + iss.impact, 0);
    const htmlDesignScore = Math.max(0, Math.min(100, Math.round(100 - htmlDeduction)));
    const designScore = hasScanError ? 0 : htmlDesignScore;

    const overall = Math.round(
      (result.scores.performance ?? 0) * 0.25 +
      (result.scores.seo ?? 0) * 0.25 +
      result.scores.accessibility * 0.15 +
      result.scores.content * 0.15 +
      (result.scores.security ?? 0) * 0.10 +
      designScore * 0.10
    );

    const resultWithDesign = {
      ...result,
      scores: { ...result.scores, design: designScore, overall },
    };

    // Bilingual AI pipeline: run primary + alt locale in parallel so the language
    // toggle on the resulting report works without re-scanning.
    const AI_CALL_TIMEOUT = 30_000;
    const altLocale = otherLocale(locale);
    const [primaryAi, altAi] = await Promise.all([
      runLocaleAiPipeline(domain, resultWithDesign.scores, summary, [resultWithDesign], result.issues, resultWithDesign.loadTimeMs, locale, AI_CALL_TIMEOUT),
      runLocaleAiPipeline(domain, resultWithDesign.scores, summary, [resultWithDesign], result.issues, resultWithDesign.loadTimeMs, altLocale, AI_CALL_TIMEOUT),
    ]);

    // Primary content goes into the existing columns (legacy schema preserved).
    summary.verdict = primaryAi.executiveSummary;
    const issuesWithContext = result.issues.map((issue) => {
      const ov = primaryAi.issueOverrides[issue.id];
      if (!ov) return issue;
      return {
        ...issue,
        ...(ov.title ? { title: ov.title } : {}),
        ...(ov.description ? { description: ov.description } : {}),
        ...(ov.recommendation ? { recommendation: ov.recommendation } : {}),
        ...(ov.whyItMatters ? { whyItMatters: ov.whyItMatters } : {}),
      };
    });
    const enhancedResult = { ...resultWithDesign, issues: issuesWithContext };
    summary.topIssues = issuesWithContext.slice(0, 10);

    const costEstimate = primaryAi.costEstimate;
    const quickWins = primaryAi.quickWins;
    const websitePersonality = primaryAi.websitePersonality;
    const visitorExperience = primaryAi.visitorExperience;

    // Alt-language mirror payloads — persisted by the Next.js side along with the rest.
    const aiContentAlt = {
      locale: altAi.locale,
      executiveSummary: altAi.executiveSummary,
      visitorExperience: altAi.visitorExperience,
      costEstimate: altAi.costEstimate,
      quickWins: altAi.quickWins,
      websitePersonality: altAi.websitePersonality,
    };
    const issuesAlt = {
      locale: altAi.locale,
      byId: altAi.issueOverrides,
    };

    // Design analysis runs asynchronously — scanId required to update DB when done
    const designAnalysisPending = !hasScanError && !!scanId && !!(screenshotUrl || designScreenshotBuffer);

    console.log(`[quick-scan] AI enhanced: ${url} (primary=${locale}, alt=${altLocale})${designAnalysisPending ? " (design pending)" : ""}`);

    res.json({
      pages: [enhancedResult],
      scores: resultWithDesign.scores,
      summary,
      screenshots,
      costEstimate,
      quickWins,
      websitePersonality,
      visitorExperience,
      aiContentAlt,
      issuesAlt,
      designAnalysisPending,
    });

    // Fire background design analysis after responding — Railway keeps the process alive
    if (designAnalysisPending) {
      setImmediate(() => {
        runDesignAnalysisBackground(
          supabase,
          scanId!,
          domain,
          screenshotUrl,
          designScreenshotBuffer,
          htmlDesignScore,
          resultWithDesign.scores,
        ).catch((err) => console.error("[design-bg] Uncaught error:", err));
      });
    }
  } catch (error) {
    console.error(`[quick-scan] Error:`, error);
    res.status(500).json({
      error: "Scan failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ── Full scan: discover + scan multiple pages ──────────────────────

app.post("/api/scan/full", async (req, res) => {
  const { url, maxPages = 7 } = req.body as Pick<ScanRequest, "url" | "maxPages">;

  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  const pageLimit = Math.min(maxPages ?? 7, 7); // Hard cap at 7

  try {
    console.log(`[full-scan] Discovering pages: ${url} (max ${pageLimit})`);
    const pageUrls = await discoverPages({
      startUrl: url,
      maxPages: pageLimit,
    });
    console.log(`[full-scan] Found ${pageUrls.length} pages`);

    const scanResults: ScanPageResultWithScreenshot[] = [];
    for (const pageUrl of pageUrls) {
      console.log(`[full-scan] Scanning: ${pageUrl}`);
      const scanResult = await scanPage({ url: pageUrl });
      scanResults.push(scanResult);
    }

    const results = scanResults.map((s) => s.result);
    const scores = aggregateScores(results);
    const summary = buildSummary(results);

    console.log(`[full-scan] Done: ${url} — overall ${scores.overall}`);

    res.json({ pages: results, scores, summary });
  } catch (error) {
    console.error(`[full-scan] Error:`, error);
    res.status(500).json({
      error: "Scan failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ── Async full scan: fire-and-forget, updates DB directly ─────────

app.post("/api/scan/full-async", async (req, res) => {
  const { url, scanId, maxPages = 7, locale = "en", source, userAgent, prospectId } = req.body as {
    url: string;
    scanId: string;
    maxPages?: number;
    locale?: string;
    source?: "bulk";
    userAgent?: string;
    // Accepted and logged only — the service does not write to the `prospects`
    // table. Status write-back is reconciled on the Next.js side (plan 04-04).
    prospectId?: string;
  };

  if (!url || !scanId) {
    res.status(400).json({ error: "url and scanId are required" });
    return;
  }

  // Capacity guard (D-08, SCAN-02, T-04-04): refuse bulk work above the
  // reserved-headroom ceiling before it is ever registered as in-flight.
  // `source` and `userAgent` are untrusted labels — they select a ceiling and
  // a crawl identity, never authorisation (T-04-06). The refusal body carries
  // no internal counts or ceilings (T-04-05); those stay in Railway logs.
  if (isAtCapacity(activeFullScans.size, source)) {
    console.log(`[full-scan-async] refused: scanId=${scanId} source=${source ?? "public"} prospectId=${prospectId ?? "n/a"} (at capacity)`);
    res.status(503).json({ error: "At capacity", retryAfterSeconds: CAPACITY_RETRY_AFTER_SECONDS });
    return;
  }

  // Return immediately — scan runs in background
  res.json({ accepted: true, scanId });

  // Run full scan in background
  const pageLimit = Math.min(maxPages, 7);
  const supabase = getSupabase();

  // Register so shutdown/crash handlers can mark this scan failed
  activeFullScans.set(scanId, supabase);

  // Hard ceiling: mark failed if not finished within 15 minutes
  const scanTimeout = setTimeout(async () => {
    if (activeFullScans.has(scanId)) {
      console.error(`[full-scan-async] Scan ${scanId} timed out after 15 minutes`);
      activeFullScans.delete(scanId);
      await failScan(scanId, supabase, "Full scan timed out after 15 minutes");
    }
  }, 15 * 60 * 1000);

  try {
    console.log(`[full-scan-async] Starting: ${url} (scan ${scanId}, max ${pageLimit} pages)`);

    const pageUrls = await discoverPages({ startUrl: url, maxPages: pageLimit, userAgent });
    console.log(`[full-scan-async] Discovered ${pageUrls.length} pages`);

    const scanResults: ScanPageResultWithScreenshot[] = [];
    for (const pageUrl of pageUrls) {
      console.log(`[full-scan-async] Scanning: ${pageUrl}`);
      const scanResult = await scanPage({ url: pageUrl, userAgent });
      scanResults.push(scanResult);
    }

    const results = scanResults.map((s) => s.result);
    const scores = aggregateScores(results);
    const summary = buildSummary(results);

    // Upload screenshots
    let screenshots: Record<string, ScreenshotInfo> | null = null;
    try {
      const screenshotEntries: [string, ScreenshotInfo][] = [];
      for (let i = 0; i < scanResults.length; i++) {
        const { result: pageResult, screenshotBuffer, overlays } = scanResults[i];
        if (!screenshotBuffer) continue;
        const uploaded = await uploadScreenshot(supabase, scanId, i, screenshotBuffer);
        if (uploaded) {
          screenshotEntries.push([
            pageResult.url,
            { path: uploaded.path, url: uploaded.url, overlays },
          ]);
        }
      }
      if (screenshotEntries.length > 0) {
        screenshots = Object.fromEntries(screenshotEntries);
      }
      console.log(`[full-scan-async] Uploaded ${screenshotEntries.length} screenshots`);
    } catch (err) {
      console.error("[full-scan-async] Screenshot upload failed:", err);
    }

    // ── Design AI analysis (with 24h domain cache) ────────────────────
    const domain = new URL(url).hostname;
    let designAnalysis: DesignAnalysis | null = null;

    // Use the first page's design screenshot buffer (viewport-only, ~150KB) to avoid
    // fetching a large image from Supabase. Fall back to URL if buffer unavailable.
    const firstDesignBuffer = scanResults[0]?.designScreenshotBuffer ?? null;
    const firstScreenshotUrl = screenshots
      ? Object.values(screenshots)[0]?.url ?? null
      : null;

    if (firstDesignBuffer || firstScreenshotUrl) {
      // Check cache: look for a recent design analysis for this domain (within 24h)
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: cachedScan } = await supabase
        .from("scans")
        .select("design_ai_analysis, design_ai_analyzed_at")
        .eq("domain", domain)
        .not("design_ai_analysis", "is", null)
        .gte("design_ai_analyzed_at", twentyFourHoursAgo)
        .order("design_ai_analyzed_at", { ascending: false })
        .limit(1)
        .single();

      if (cachedScan?.design_ai_analysis) {
        designAnalysis = cachedScan.design_ai_analysis as DesignAnalysis;
        console.log(`[full-scan-async] Design AI cache hit for ${domain}`);
      } else {
        designAnalysis = await generateDesignAnalysis(domain, firstScreenshotUrl ?? "", firstDesignBuffer);
        console.log(`[full-scan-async] Design AI analysis: score=${designAnalysis?.overallScore ?? "null"}`);
      }
    }

    // Merge AI design issues into results and re-compute design scores
    const aiScore = designAnalysis?.overallScore ?? 100;
    const aiSeverity: IssueSeverity = aiScore < 50 ? "major" : aiScore < 70 ? "minor" : "info";
    const aiDesignIssues: Issue[] = (designAnalysis?.issues ?? []).map((sentence, i) => ({
      id: `design-ai-${i + 1}`,
      category: "design" as const,
      severity: aiSeverity,
      title: sentence.split(".")[0].trim().slice(0, 80) || "Visual design issue",
      description: sentence,
      recommendation: "Review the visual design of this page with a designer.",
      impact: aiSeverity === "major" ? 8 : aiSeverity === "minor" ? 3 : 1,
    }));

    // Apply AI design score to page scores (first page gets AI score, others get HTML-only)
    const resultsWithDesign = results.map((page, i) => {
      const htmlDesignIssues = page.issues.filter((iss) => iss.category === "design");
      const htmlDeduction = htmlDesignIssues.reduce((sum, iss) => sum + iss.impact, 0);
      const htmlDesignScore = Math.max(0, Math.min(100, Math.round(100 - htmlDeduction)));

      let designScore: number;
      if (i === 0 && designAnalysis) {
        designScore = Math.round(htmlDesignScore * 0.4 + designAnalysis.overallScore * 0.6);
      } else {
        designScore = htmlDesignScore;
      }
      designScore = Math.max(0, Math.min(100, designScore));

      // Merge AI issues into first page only
      const mergedIssues = i === 0
        ? [...page.issues, ...dedupeCookieAiIssues(aiDesignIssues, page.issues)]
        : page.issues;

      const overall = Math.round(
        page.scores.performance! * 0.25 +
        (page.scores.seo ?? 0) * 0.25 +
        page.scores.accessibility * 0.15 +
        page.scores.content * 0.15 +
        (page.scores.security ?? 0) * 0.10 +
        designScore * 0.10
      );

      return {
        ...page,
        issues: mergedIssues,
        scores: { ...page.scores, design: designScore, overall },
      };
    });

    // Enhance with AI
    const allIssues = resultsWithDesign.flatMap((r) => r.issues);
    const avgLoadTime = resultsWithDesign.length > 0
      ? resultsWithDesign.reduce((sum, r) => sum + r.loadTimeMs, 0) / resultsWithDesign.length
      : 0;

    const AI_CALL_TIMEOUT = 45_000; // full scan allows a bit more time per call
    const altLocale = otherLocale(locale);
    const [primaryAi, altAi, salesBrief] = await Promise.all([
      runLocaleAiPipeline(domain, scores, summary, resultsWithDesign, allIssues, avgLoadTime, locale, AI_CALL_TIMEOUT),
      runLocaleAiPipeline(domain, scores, summary, resultsWithDesign, allIssues, avgLoadTime, altLocale, AI_CALL_TIMEOUT),
      withTimeout(generateSalesBrief(domain, scores, summary, resultsWithDesign), AI_CALL_TIMEOUT, null),
    ]);

    summary.verdict = primaryAi.executiveSummary;

    // Apply primary-locale issue overrides to pages
    const enhancedResults = resultsWithDesign.map((page) => ({
      ...page,
      issues: page.issues.map((issue) => {
        const ov = primaryAi.issueOverrides[issue.id];
        if (!ov) return issue;
        return {
          ...issue,
          ...(ov.title ? { title: ov.title } : {}),
          ...(ov.description ? { description: ov.description } : {}),
          ...(ov.recommendation ? { recommendation: ov.recommendation } : {}),
          ...(ov.whyItMatters ? { whyItMatters: ov.whyItMatters } : {}),
        };
      }),
    }));

    summary.topIssues = enhancedResults.flatMap((p) => p.issues).slice(0, 10);

    const costEstimate = primaryAi.costEstimate;
    const quickWins = primaryAi.quickWins;
    const websitePersonality = primaryAi.websitePersonality;
    const visitorExperience = primaryAi.visitorExperience;

    const aiContentAlt = {
      locale: altAi.locale,
      executiveSummary: altAi.executiveSummary,
      visitorExperience: altAi.visitorExperience,
      costEstimate: altAi.costEstimate,
      quickWins: altAi.quickWins,
      websitePersonality: altAi.websitePersonality,
    };
    const issuesAlt = {
      locale: altAi.locale,
      byId: altAi.issueOverrides,
    };

    console.log(`[full-scan-async] AI enhanced: ${url} (primary=${locale}, alt=${altLocale})`);

    await supabase
      .from("scans")
      .update({
        status: "completed",
        scores,
        summary,
        pages: enhancedResults,
        screenshots,
        cost_estimate: costEstimate,
        quick_wins: quickWins,
        website_personality: websitePersonality,
        visitor_experience: visitorExperience,
        ai_content_alt: aiContentAlt,
        issues_alt: issuesAlt,
        sales_brief: salesBrief,
        design_ai_analysis: designAnalysis,
        design_ai_analyzed_at: designAnalysis ? new Date().toISOString() : null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", scanId);

    clearTimeout(scanTimeout);
    activeFullScans.delete(scanId);
    console.log(`[full-scan-async] Completed: ${url} — overall ${scores.overall}`);

    // Notify the Next.js app to send the report-ready email
    const callbackUrl = process.env.CALLBACK_URL;
    const apiKey = process.env.SCANNER_API_KEY;
    if (callbackUrl && apiKey) {
      fetch(callbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ scanId }),
        signal: AbortSignal.timeout(10_000),
      }).catch((err) => {
        console.error("[full-scan-async] Failed to trigger report email:", err);
      });
    }
  } catch (error) {
    clearTimeout(scanTimeout);
    activeFullScans.delete(scanId);
    console.error(`[full-scan-async] Failed:`, error);
    await supabase
      .from("scans")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Full scan failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", scanId);
  }
});

// ── Helpers ────────────────────────────────────────────────────────

function aggregateScores(pages: PageResult[]): ScanScores {
  if (pages.length === 0) {
    return { overall: 0, accessibility: 0, content: 0, seo: 0, performance: 0, security: 0, design: 0 };
  }

  const avg = (key: keyof ScanScores) =>
    Math.round(pages.reduce((sum, p) => sum + (p.scores[key] ?? 0), 0) / pages.length);

  const accessibility = avg("accessibility");
  const content = avg("content");
  const seo = avg("seo");
  const performance = avg("performance");
  const security = avg("security");
  const design = avg("design");

  const overall = Math.round(
    performance * 0.25 +
    seo * 0.25 +
    accessibility * 0.15 +
    content * 0.15 +
    security * 0.10 +
    design * 0.10
  );

  return { overall, accessibility, content, seo, performance, security, design };
}

function buildSummary(pages: PageResult[]): ScanSummary {
  const allIssues = pages.flatMap((p) => p.issues);
  const criticalIssues = allIssues.filter((i) => i.severity === "critical").length;
  const majorIssues = allIssues.filter((i) => i.severity === "major").length;

  // Deduplicate issues by ID and take top ones sorted by impact
  const seen = new Set<string>();
  const topIssues: Issue[] = [];
  const sorted = [...allIssues].sort((a, b) => b.impact - a.impact);
  for (const issue of sorted) {
    if (!seen.has(issue.id) && topIssues.length < 10) {
      seen.add(issue.id);
      topIssues.push(issue);
    }
  }

  // Generate a plain-language verdict
  const scores = pages.length === 1 ? pages[0].scores : aggregateScores(pages);
  const verdict = generateVerdict(scores, criticalIssues);

  return {
    totalPages: pages.length,
    totalIssues: allIssues.length,
    criticalIssues,
    majorIssues,
    topIssues,
    verdict,
  };
}

function generateVerdict(scores: ScanScores, criticalCount: number): string {
  if (scores.overall >= 90) {
    return "Great job! Your website is well-built and performs strongly across all categories.";
  }
  if (scores.overall >= 70) {
    const weakest = getWeakestCategory(scores);
    return `Your website is in decent shape, but ${weakest} needs attention to reach its full potential.`;
  }
  if (scores.overall >= 50) {
    return `Your website has several areas for improvement. Addressing the ${criticalCount > 0 ? "critical" : "major"} issues would make a real difference.`;
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

// ── Server startup ─────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`Scanner service running on port ${PORT}`);
});

// Graceful shutdown
async function shutdown() {
  console.log("Shutting down...");
  for (const [id, sb] of activeFullScans) {
    console.log(`[shutdown] Marking scan ${id} as failed (service restarting)`);
    await failScan(id, sb, "Service restarted during scan");
  }
  activeFullScans.clear();
  await closeBrowser();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

process.on("uncaughtException", async (err) => {
  console.error("[process] Uncaught exception:", err);
  for (const [id, sb] of activeFullScans) {
    await failScan(id, sb, "Service crashed during scan");
  }
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[process] Unhandled rejection:", reason);
});
