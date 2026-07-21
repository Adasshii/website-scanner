import type { PageResult, ScanScores, ScanSummary, ScreenshotInfo, CostEstimate, QuickWin, AiContentAlt, IssuesAlt } from "@/types/scanner";
import { BULK_MAX_PAGES } from "@/lib/bulk-scan-constants";

/** Response shape from the scanner service */
export interface ScannerResponse {
  pages: PageResult[];
  scores: ScanScores;
  summary: ScanSummary;
  screenshots?: Record<string, ScreenshotInfo> | null;
  costEstimate?: CostEstimate | null;
  quickWins?: QuickWin[] | null;
  websitePersonality?: string | null;
  visitorExperience?: string | null;
  /** Other-language version of the AI content (always populated; persisted into ai_content_alt) */
  aiContentAlt?: AiContentAlt | null;
  /** Other-language overrides for per-issue text (persisted into issues_alt) */
  issuesAlt?: IssuesAlt | null;
  /** True when design AI analysis is running in the background */
  designAnalysisPending?: boolean;
}

/**
 * HTTP client for the scanner service.
 * Used by Next.js API routes to request scans.
 */
export class ScannerClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    const baseUrl = process.env.SCANNER_SERVICE_URL;
    const apiKey = process.env.SCANNER_API_KEY;

    if (!baseUrl) throw new Error("SCANNER_SERVICE_URL not configured");
    if (!apiKey) throw new Error("SCANNER_API_KEY not configured");

    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  /** Run a quick scan (single page). Pass scanId to enable async design analysis. */
  async quickScan(url: string, scanId?: string, locale?: string): Promise<ScannerResponse> {
    const body: Record<string, unknown> = { url };
    if (scanId) body.scanId = scanId;
    if (locale) body.locale = locale;
    return this.request("/api/scan/quick", body);
  }

  /** Run a full scan (multi-page) */
  async fullScan(url: string, maxPages = 10, locale?: string): Promise<ScannerResponse> {
    const body: Record<string, unknown> = { url, maxPages };
    if (locale) body.locale = locale;
    return this.request("/api/scan/full", body);
  }

  /**
   * Run a bulk full-async scan (Phase 4). Posts to /api/scan/full-async with
   * `source: "bulk"`, the bulk crawl identity, and the claimed prospect's
   * id, so the request-body contract in scanner-service/src/index.ts (plan
   * 04-02) resolves the reserved-headroom ceiling and the crawl UA.
   *
   * Cannot reuse the private request() helper: request() throws on any
   * non-ok response, but a 503 here is an expected structural outcome (the
   * capacity guard, D-08) — not a failure of this prospect's site. This
   * method only awaits the immediate accept-or-refuse, never the scan
   * itself, so it uses a short 30s timeout instead of request()'s 3-minute
   * one. Locale is deliberately omitted, not hardcoded — geography/locale
   * are parameters on this project, and omitting the field lets the
   * scans.locale column default apply.
   */
  async fullScanBulk(
    url: string,
    opts: { scanId: string; prospectId: string; userAgent: string; maxPages?: number }
  ): Promise<{ accepted: boolean }> {
    const res = await fetch(`${this.baseUrl}/api/scan/full-async`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        url,
        scanId: opts.scanId,
        maxPages: opts.maxPages ?? BULK_MAX_PAGES,
        source: "bulk",
        userAgent: opts.userAgent,
        prospectId: opts.prospectId,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (res.status === 503) return { accepted: false };

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: "Unknown error" }));
      throw new Error(
        `Scanner service error (${res.status}): ${error.message || error.error || "Unknown"}`
      );
    }

    return { accepted: true };
  }

  /** Check if the scanner service is healthy */
  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async request(path: string, body: Record<string, unknown>): Promise<ScannerResponse> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000), // 3 minute timeout
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: "Unknown error" }));
      throw new Error(
        `Scanner service error (${res.status}): ${error.message || error.error || "Unknown"}`
      );
    }

    return res.json();
  }
}
