// Every state transition `prospects` goes through during the bulk scan
// queue (Phase 4). Mirrors lib/triage-release.ts's select-then-update shape,
// injectable SupabaseClient parameter, and explicit return types.
//
// D-06 invariant: only a prospect with scan_status = 'done' AND a non-null
// latest_scan_id carries the hosted report that later outreach cites, so a
// 'failed' prospect drops out of the outreach flow by construction — no
// function in this file ever sets scan_status to 'done' without also having
// a real scans row behind latest_scan_id (reconcileInFlightScans is the only
// writer of 'done', and it only does so from a completed scans row).
//
// Every write in this file is a targeted .update()+.eq()/.in() call, never
// a call shaped like an insert — country is NOT NULL with no default
// (migration 010), so a write that also attempts an insert tuple fails even
// on update-only intent (Pitfall 3, same reasoning as lib/triage-release.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { BULK_ARM_CEILING, BULK_BATCH_SIZE } from "@/lib/bulk-scan-constants";

export interface ClaimedProspect {
  id: string;
  domain: string | null;
  website_url: string | null;
  scan_attempts: number;
}

/**
 * D-07's human-gated arming write: selects released, not-yet-armed, has-a-
 * website prospects (scan_released_at set, scan_status still null,
 * website_url present), oldest release first, slices to `opts.ceiling ??
 * BULK_ARM_CEILING` in JavaScript, then arms them (scan_status: "queued",
 * scan_attempts: 0). Returns the armed ids.
 *
 * This is what makes D-07 structural rather than advisory: the drain
 * (claimNextScanBatch) only ever claims 'queued' rows, so a released-but-
 * unarmed prospect is never scanned without a human clicking "Run batch"
 * (RESEARCH.md Open Question 1).
 */
export async function armBatch(
  sb: SupabaseClient,
  opts: { ceiling?: number } = {}
): Promise<string[]> {
  const { data, error } = await sb
    .from("prospects")
    .select("id")
    .not("scan_released_at", "is", null)
    .is("scan_status", null)
    .not("website_url", "is", null)
    .order("scan_released_at", { ascending: true });
  if (error) throw error;

  const ceiling = opts.ceiling ?? BULK_ARM_CEILING;
  const ids = (data ?? []).map((row) => row.id as string).slice(0, ceiling);
  if (ids.length === 0) return [];

  const { error: updateError } = await sb
    .from("prospects")
    .update({ scan_status: "queued", scan_attempts: 0, scan_status_reason: null })
    .in("id", ids);
  if (updateError) throw updateError;

  return ids;
}

/**
 * Thin wrapper over the claim_next_scan_batch RPC — the one place in this
 * phase where the write lives inside SQL rather than a `.update()`, because
 * `FOR UPDATE SKIP LOCKED` cannot be expressed through PostgREST. The RPC
 * itself clamps batch_size server-side (defence-in-depth, migration 017);
 * this wrapper only passes the size through and throws on error.
 */
export async function claimNextScanBatch(
  sb: SupabaseClient,
  batchSize: number = BULK_BATCH_SIZE
): Promise<ClaimedProspect[]> {
  const { data, error } = await sb.rpc("claim_next_scan_batch", { batch_size: batchSize });
  if (error) throw error;
  return (data ?? []) as ClaimedProspect[];
}

/**
 * Marks a prospect failed with a recorded reason (T-04-09 — repudiation
 * mitigation: a robots/SSRF skip is always distinguishable from a dispatch
 * failure after the fact). `attemptSpent` decides whether scan_attempts is
 * set to 1: a pre-flight skip (robots, SSRF) never attempted a scan, so it
 * passes `attemptSpent: false`; a dispatch error did attempt one, so it
 * passes `true` (D-04's single-attempt rule).
 */
export async function markScanFailed(
  sb: SupabaseClient,
  id: string,
  reason: string,
  opts: { attemptSpent?: boolean } = {}
): Promise<void> {
  const { error } = await sb
    .from("prospects")
    .update({
      scan_status: "failed",
      scan_status_reason: reason,
      ...(opts.attemptSpent ? { scan_attempts: 1 } : {}),
    })
    .eq("id", id);
  if (error) throw error;
}

/**
 * The capacity-refusal path (D-08 with D-04): a 503 from the scanner
 * service is a structural outcome of reserved headroom, not a failure of
 * the prospect's site, so it must not consume the single attempt.
 * scan_attempts is deliberately left out of this update payload.
 */
export async function requeueToQueued(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("prospects").update({ scan_status: "queued" }).eq("id", id);
  if (error) throw error;
}

/**
 * D-05's human-gated re-queue from the Shortlist. Moves a failed row back
 * to queued, resets scan_attempts to 0, and clears the stored reason. The
 * second `.eq("scan_status", "failed")` filter makes this a no-op on any
 * non-failed row — nothing but a human clicking "requeue" on a failed row
 * can put a spent prospect back in the queue (SCAN-04's "never retried
 * indefinitely").
 */
export async function requeueProspect(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb
    .from("prospects")
    .update({ scan_status: "queued", scan_attempts: 0, scan_status_reason: null })
    .eq("id", id)
    .eq("scan_status", "failed");
  if (error) throw error;
}

/**
 * The status write-back path — the only place prospects.scan_status moves
 * to 'done' or 'failed' from a completed scan (the scanner service never
 * touches prospects; it already marks its own scans row terminal on
 * completion, on its 15-minute timeout, and on its crash/SIGTERM handlers,
 * so reading that row is a complete signal and needs no new callback and no
 * prospects knowledge inside the service).
 *
 * Ignores prospects in 'scanning' with no latest_scan_id (claimed within
 * the current tick, not yet dispatched — dispatchClaimedProspects sets
 * latest_scan_id, so this join has nothing to reconcile yet).
 */
export async function reconcileInFlightScans(
  sb: SupabaseClient
): Promise<{ done: string[]; failed: string[] }> {
  const { data: inFlight, error: inFlightError } = await sb
    .from("prospects")
    .select("id, latest_scan_id")
    .eq("scan_status", "scanning")
    .not("latest_scan_id", "is", null);
  if (inFlightError) throw inFlightError;

  const rows = (inFlight ?? []) as { id: string; latest_scan_id: string }[];
  if (rows.length === 0) return { done: [], failed: [] };

  const scanIds = rows.map((r) => r.latest_scan_id);
  const { data: scans, error: scansError } = await sb
    .from("scans")
    .select("id, status, error_message")
    .in("id", scanIds);
  if (scansError) throw scansError;

  const scanById = new Map((scans ?? []).map((s) => [s.id as string, s]));

  const doneIds: string[] = [];
  const failedIds: string[] = [];
  const failedReasons = new Map<string, string | null>();

  for (const row of rows) {
    const scan = scanById.get(row.latest_scan_id);
    if (!scan) continue;
    if (scan.status === "completed") {
      doneIds.push(row.id);
    } else if (scan.status === "failed") {
      failedIds.push(row.id);
      failedReasons.set(row.id, (scan.error_message as string | null) ?? null);
    }
    // status === "scanning" (still in flight) leaves the prospect untouched.
  }

  if (doneIds.length > 0) {
    const { error } = await sb.from("prospects").update({ scan_status: "done" }).in("id", doneIds);
    if (error) throw error;
  }

  // Grouped by distinct reason so each update carries the right error text.
  for (const id of failedIds) {
    const { error } = await sb
      .from("prospects")
      .update({ scan_status: "failed", scan_status_reason: failedReasons.get(id) ?? null })
      .eq("id", id);
    if (error) throw error;
  }

  return { done: doneIds, failed: failedIds };
}
