import type { PageResult, ScanScores, ScanSummary, ScreenshotInfo, CostEstimate, QuickWin } from "@/types/scanner";

/** Response shape from the scanner service */
export interface ScannerResponse {
  pages: PageResult[];
  scores: ScanScores;
  summary: ScanSummary;
  screenshots?: Record<string, ScreenshotInfo> | null;
  costEstimate?: CostEstimate | null;
  quickWins?: QuickWin[] | null;
  websitePersonality?: string | null;
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

  /** Run a quick scan (single page) */
  async quickScan(url: string): Promise<ScannerResponse> {
    return this.request("/api/scan/quick", { url });
  }

  /** Run a full scan (multi-page) */
  async fullScan(url: string, maxPages = 10): Promise<ScannerResponse> {
    return this.request("/api/scan/full", { url, maxPages });
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
      signal: AbortSignal.timeout(120_000), // 2 minute timeout for full scans
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
