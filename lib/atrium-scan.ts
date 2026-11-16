// Route 2 of the Atrium contract: start a full scan at once. Same steps as
// lib/bulk-scan-dispatch.ts dispatchOne() (URL safety check, robots.txt,
// scans row, full-async call with source "bulk"), but for one Atrium
// prospect, with no claim and no wait for the drain-scan-queue cron.
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateUrlSafe } from "@/lib/url-validation.server";
import { isHomepageDisallowed } from "@/lib/triage-fetch";
import { BULK_SCAN_IP_HASH, BULK_USER_AGENT } from "@/lib/bulk-scan-constants";
import { ScannerClient } from "@/lib/scanner-client";
import { isSuppressed } from "@/lib/suppression";
import { errorMessage } from "@/lib/atrium-admin";
import { INSTALLERS_PROFILE, toScannerSlice } from "@/lib/niche-profile";

/** The scan service fails its own scans after 15 minutes; 20 covers any live scan. */
export const SCAN_RUNNING_WINDOW_MS = 20 * 60 * 1000;

const RUNNING_STATUSES = new Set(["pending", "scanning", "quick_done", "processing"]);

export type StartScanResult =
  | { kind: "started"; scanId: string }
  | { kind: "not_found" }
  | { kind: "not_atrium" }
  | { kind: "suppressed" }
  | { kind: "scan_running"; scanId: string }
  | { kind: "at_capacity" }
  | { kind: "dispatch_failed"; reason: string };

export async function startAtriumScan(sb: SupabaseClient, prospectId: string): Promise<StartScanResult> {
  const { data: prospect, error } = await sb
    .from("prospects")
    .select("id, owner, domain, website_url, contact_email")
    .eq("id", prospectId)
    .maybeSingle();
  if (error) throw error;
  if (!prospect) return { kind: "not_found" };
  if (prospect.owner !== "atrium") return { kind: "not_atrium" };

  const domain = prospect.domain as string | null;
  // Route 1 always sets contact_email. The fallback still checks the domain.
  const email = (prospect.contact_email as string | null) ?? `info@${domain}`;
  if (await isSuppressed(sb, email)) return { kind: "suppressed" };

  const runningScanId = await findRunningScan(sb, prospectId);
  if (runningScanId) return { kind: "scan_running", scanId: runningScanId };

  const rawUrl = (prospect.website_url as string | null) ?? `https://${domain}`;
  const scanId = crypto.randomUUID();

  // A URL can be repointed after registration, so check it again here.
  let url: string;
  try {
    url = await validateUrlSafe(rawUrl);
  } catch {
    await recordRefusedScan(sb, prospectId, scanId, rawUrl, domain, "url_validation_failed");
    return { kind: "started", scanId };
  }

  if (await isHomepageDisallowed(new URL(url).origin, BULK_USER_AGENT)) {
    await recordRefusedScan(sb, prospectId, scanId, url, domain, "robots_disallowed");
    return { kind: "started", scanId };
  }

  const { error: insertError } = await sb.from("scans").insert({
    id: scanId,
    url,
    domain: domain ?? new URL(url).hostname,
    type: "full",
    status: "scanning",
    pages: [],
    started_at: new Date().toISOString(),
    ip_hash: BULK_SCAN_IP_HASH,
    prospect_id: prospectId,
  });
  if (insertError) throw insertError;

  let accepted: boolean;
  try {
    // Built only here, right before dispatch, so the earlier refusals never
    // need SCANNER_SERVICE_URL or SCANNER_API_KEY.
    const client = new ScannerClient();
    ({ accepted } = await client.fullScanBulk(url, {
      scanId,
      prospectId,
      userAgent: BULK_USER_AGENT,
      // Phase 9 (D-9-12): the slice rides the request, exactly as
      // lib/bulk-scan-dispatch.ts sends it. Without it the scanner's
      // storeOwnSiteFacts returns "skipped" and scans.own_site_facts stays null,
      // so an Atrium-started scan would yield a thinner report than a
      // scanner-started one for the same business.
      nicheSlice: toScannerSlice(INSTALLERS_PROFILE),
    }));
  } catch (err) {
    const reason = errorMessage(err);
    const now = new Date().toISOString();
    const { error: failError } = await sb
      .from("scans")
      .update({ status: "failed", error_message: reason, completed_at: now, updated_at: now })
      .eq("id", scanId);
    if (failError) throw failError;
    return { kind: "dispatch_failed", reason };
  }

  if (!accepted) {
    // At capacity is not a failure of this site: remove the row so the scan
    // does not count against the lead.
    const { error: deleteError } = await sb.from("scans").delete().eq("id", scanId);
    if (deleteError) throw deleteError;
    return { kind: "at_capacity" };
  }

  const { error: updateError } = await sb
    .from("prospects")
    .update({ latest_scan_id: scanId, scan_status: "scanning", scan_status_reason: null })
    .eq("id", prospectId);
  if (updateError) throw updateError;

  return { kind: "started", scanId };
}

/**
 * The newest running scan of this prospect started inside the window. Reads
 * scans, not prospects.latest_scan_id: that column is written only after the
 * scan service accepts the job, so it lags a scan that is still being set up.
 */
async function findRunningScan(sb: SupabaseClient, prospectId: string): Promise<string | null> {
  const { data, error } = await sb
    .from("scans")
    .select("id, started_at, created_at")
    .eq("prospect_id", prospectId)
    .in("status", Array.from(RUNNING_STATUSES))
    .order("started_at", { ascending: false, nullsFirst: true })
    .limit(1);
  if (error) throw error;
  const scan = data?.[0];
  if (!scan) return null;
  const startedMs = Date.parse((scan.started_at ?? scan.created_at) as string | null ?? "");
  // No usable timestamp at all: assume it is running rather than start a duplicate.
  if (Number.isNaN(startedMs)) return scan.id as string;
  return Date.now() - startedMs < SCAN_RUNNING_WINDOW_MS ? (scan.id as string) : null;
}

/** A scan refused before it reached the scan service. Route 3 reads it as failed. */
async function recordRefusedScan(
  sb: SupabaseClient,
  prospectId: string,
  scanId: string,
  url: string,
  domain: string | null,
  reason: string
): Promise<void> {
  const now = new Date().toISOString();
  const { error: insertError } = await sb.from("scans").insert({
    id: scanId,
    url,
    domain: domain ?? url,
    type: "full",
    status: "failed",
    error_message: reason,
    pages: [],
    started_at: now,
    completed_at: now,
    ip_hash: BULK_SCAN_IP_HASH,
    prospect_id: prospectId,
  });
  if (insertError) throw insertError;

  const { error: updateError } = await sb
    .from("prospects")
    .update({ latest_scan_id: scanId, scan_status: "failed", scan_status_reason: reason })
    .eq("id", prospectId);
  if (updateError) throw updateError;
}
