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
  generateComprehensiveAnalysis,
  generateFallbackVerdict,
  calculateCostEstimateFallback,
  enhanceIssueDescriptions,
  generateSalesBrief,
} from "./ai";
import { uploadScreenshot } from "./screenshots";
import type { ScanRequest, PageResult, ScanScores, ScanSummary, Issue, ScreenshotInfo } from "../../types/scanner";
import { SCORE_WEIGHTS } from "../../types/scanner";

// Supabase client for async scan DB updates
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
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

// ── Quick scan: single page ────────────────────────────────────────

app.post("/api/scan/quick", async (req, res) => {
  const { url } = req.body as Pick<ScanRequest, "url">;

  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    console.log(`[quick-scan] Starting: ${url}`);
    const { result, screenshotBuffer, overlays } = await scanPage({ url });
    console.log(`[quick-scan] Done: ${url} — score ${result.scores.overall}`);

    const summary = buildSummary([result]);

    // Upload screenshot if available
    let screenshots: Record<string, ScreenshotInfo> | null = null;
    if (screenshotBuffer) {
      try {
        const supabase = getSupabase();
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

    // Enhance with AI (non-blocking — falls back to originals on failure)
    const domain = new URL(url).hostname;
    const [analysis, enhancedIssues] = await Promise.all([
      generateComprehensiveAnalysis(domain, result.scores, summary, [result]),
      enhanceIssueDescriptions(result.issues),
    ]);

    summary.verdict = analysis?.executiveSummary ?? generateFallbackVerdict(result.scores, summary.criticalIssues);
    const enhancedResult = { ...result, issues: enhancedIssues };
    summary.topIssues = enhancedIssues.slice(0, 10);

    const costEstimate = analysis?.costEstimate ?? calculateCostEstimateFallback(result.scores, summary, result.loadTimeMs);
    const quickWins = analysis?.quickWins ?? null;
    const websitePersonality = analysis?.websitePersonality ?? null;

    console.log(`[quick-scan] AI enhanced: ${url}`);

    res.json({
      pages: [enhancedResult],
      scores: result.scores,
      summary,
      screenshots,
      costEstimate,
      quickWins,
      websitePersonality,
    });
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
  const { url, maxPages = 10 } = req.body as Pick<ScanRequest, "url" | "maxPages">;

  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  const pageLimit = Math.min(maxPages ?? 10, 25); // Hard cap at 25

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
  const { url, scanId, maxPages = 10 } = req.body as {
    url: string;
    scanId: string;
    maxPages?: number;
  };

  if (!url || !scanId) {
    res.status(400).json({ error: "url and scanId are required" });
    return;
  }

  // Return immediately — scan runs in background
  res.json({ accepted: true, scanId });

  // Run full scan in background
  const pageLimit = Math.min(maxPages, 25);
  const supabase = getSupabase();

  try {
    console.log(`[full-scan-async] Starting: ${url} (scan ${scanId}, max ${pageLimit} pages)`);

    const pageUrls = await discoverPages({ startUrl: url, maxPages: pageLimit });
    console.log(`[full-scan-async] Discovered ${pageUrls.length} pages`);

    const scanResults: ScanPageResultWithScreenshot[] = [];
    for (const pageUrl of pageUrls) {
      console.log(`[full-scan-async] Scanning: ${pageUrl}`);
      const scanResult = await scanPage({ url: pageUrl });
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

    // Enhance with AI
    const domain = new URL(url).hostname;
    const allIssues = results.flatMap((r) => r.issues);
    const avgLoadTime = results.length > 0
      ? results.reduce((sum, r) => sum + r.loadTimeMs, 0) / results.length
      : 0;

    const [analysis, enhancedIssues, salesBrief] = await Promise.all([
      generateComprehensiveAnalysis(domain, scores, summary, results),
      enhanceIssueDescriptions(allIssues),
      generateSalesBrief(domain, scores, summary, results),
    ]);

    summary.verdict = analysis?.executiveSummary ?? generateFallbackVerdict(scores, summary.criticalIssues);
    summary.topIssues = enhancedIssues.slice(0, 10);

    const costEstimate = analysis?.costEstimate ?? calculateCostEstimateFallback(scores, summary, avgLoadTime);
    const quickWins = analysis?.quickWins ?? null;
    const websitePersonality = analysis?.websitePersonality ?? null;

    // Map enhanced issues back to their pages
    const issueMap = new Map<string, Issue>();
    for (const issue of enhancedIssues) {
      issueMap.set(issue.id, issue);
    }
    const enhancedResults = results.map((page) => ({
      ...page,
      issues: page.issues.map((issue) => issueMap.get(issue.id) || issue),
    }));

    console.log(`[full-scan-async] AI enhanced: ${url}`);

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
        sales_brief: salesBrief,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", scanId);

    console.log(`[full-scan-async] Completed: ${url} — overall ${scores.overall}`);

    // Notify the Next.js app to send the report-ready email
    const callbackUrl = process.env.CALLBACK_URL;
    const apiKey = process.env.SCANNER_API_KEY;
    if (callbackUrl && apiKey) {
      fetch(`${callbackUrl.replace(/\/$/, "")}/api/internal/scan-complete`, {
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
    return { overall: 0, accessibility: 0, content: 0, seo: 0, performance: 0 };
  }

  const avg = (key: keyof ScanScores) =>
    Math.round(pages.reduce((sum, p) => sum + p.scores[key], 0) / pages.length);

  const accessibility = avg("accessibility");
  const content = avg("content");
  const seo = avg("seo");
  const performance = avg("performance");

  const overall = Math.round(
    accessibility * SCORE_WEIGHTS.accessibility +
    content * SCORE_WEIGHTS.content +
    seo * SCORE_WEIGHTS.seo +
    performance * SCORE_WEIGHTS.performance
  );

  return { overall, accessibility, content, seo, performance };
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
  await closeBrowser();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
