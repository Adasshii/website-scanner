import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { validateUrlSafe, UrlValidationError } from "@/lib/url-validation.server";
import { extractDomain } from "@/lib/url-validation";
import { ScannerClient } from "@/lib/scanner-client";
import { createServerClient } from "@/lib/supabase";
import type { ScanRow } from "@/types/scanner";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel function timeout (seconds) — Lighthouse needs ~60-90s

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawUrl = body.url;

    if (!rawUrl || typeof rawUrl !== "string") {
      return NextResponse.json(
        { error: "Please provide a URL to scan." },
        { status: 400 }
      );
    }

    // Validate URL (format + SSRF protection)
    let url: string;
    try {
      url = await validateUrlSafe(rawUrl);
    } catch (error) {
      if (error instanceof UrlValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    const domain = extractDomain(url);

    // Hash the IP for rate limiting (never store raw IP — GDPR)
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "unknown";
    const ipHash = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);

    // Rate limit: max 5 scans per IP per hour (skipped in development)
    const supabase = createServerClient();

    if (process.env.NODE_ENV !== "development") {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const { count } = await supabase
        .from("scans")
        .select("*", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", oneHourAgo);

      if (count !== null && count >= 5) {
        return NextResponse.json(
          { error: "You've reached the scan limit. Please try again in an hour." },
          { status: 429 }
        );
      }
    }

    // Check for a recent scan of the same domain (cache: 1 hour)
    const oneHourAgoCache = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: cached } = await supabase
      .from("scans")
      .select("id, url, domain, type, status, scores, pages, summary, started_at, completed_at, screenshots, cost_estimate, quick_wins, website_personality")
      .eq("domain", domain)
      .in("status", ["quick_done", "completed"])
      .gte("created_at", oneHourAgoCache)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (cached && cached.scores) {
      return NextResponse.json({
        id: cached.id,
        url: cached.url,
        domain: cached.domain,
        type: cached.type as "quick" | "full",
        status: cached.status as "quick_done" | "completed",
        startedAt: cached.started_at,
        completedAt: cached.completed_at,
        scores: cached.scores,
        pages: cached.pages,
        summary: cached.summary,
        screenshots: cached.screenshots,
        costEstimate: cached.cost_estimate,
        quickWins: cached.quick_wins,
        websitePersonality: cached.website_personality,
        cached: true,
      });
    }

    // Create scan row in Supabase with status "scanning"
    const scanId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    const { error: insertError } = await supabase.from("scans").insert({
      id: scanId,
      url,
      domain,
      type: "quick",
      status: "scanning",
      scores: null,
      summary: null,
      pages: [],
      started_at: startedAt,
      completed_at: null,
      ip_hash: ipHash,
      email: null,
      error_message: null,
      updated_at: startedAt,
      screenshots: null,
      cost_estimate: null,
      quick_wins: null,
      website_personality: null,
      sales_brief: null,
      design_ai_analysis: null,
      design_ai_analyzed_at: null,
    } satisfies Omit<ScanRow, "created_at">);

    if (insertError) {
      console.error("Failed to create scan row:", insertError);
      return NextResponse.json(
        { error: "Failed to start scan. Please try again." },
        { status: 500 }
      );
    }

    // Call the scanner service — pass scanId so scanner can update design score async
    const scanner = new ScannerClient();
    const result = await scanner.quickScan(url, scanId);

    // Update the scan row with results
    const completedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("scans")
      .update({
        status: "quick_done",
        scores: result.scores,
        summary: result.summary,
        pages: result.pages,
        screenshots: result.screenshots || null,
        cost_estimate: result.costEstimate || null,
        quick_wins: result.quickWins || null,
        website_personality: result.websitePersonality || null,
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq("id", scanId);

    if (updateError) {
      console.error("Failed to update scan row:", updateError);
    }

    // Return results to the frontend
    return NextResponse.json({
      id: scanId,
      url,
      domain,
      type: "quick" as const,
      status: "quick_done" as const,
      startedAt,
      completedAt,
      scores: result.scores,
      pages: result.pages,
      summary: result.summary,
    });
  } catch (error) {
    console.error("Scan API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
      },
      { status: 500 }
    );
  }
}
