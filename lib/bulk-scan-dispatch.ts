// Dispatch path for claimed prospects (Phase 4): re-validates the stored
// URL, pre-flights robots.txt, creates the linked scans row, then calls the
// scanner service under a concurrency bound with inter-dispatch spacing.
// Every outcome (skip, accept, refuse, throw) maps to the right prospect
// state via lib/scan-queue.ts — this file never writes prospects directly
// with anything other than those library functions, and never calls a
// write shaped like an insert on prospects.
import pLimit from "p-limit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateUrlSafe as defaultValidateUrlSafe } from "@/lib/url-validation.server";
import { isHomepageDisallowed, type TriageFetchImpl } from "@/lib/triage-fetch";
import {
  BULK_DISPATCH_CONCURRENCY,
  BULK_DISPATCH_SPACING_MS,
  BULK_SCAN_IP_HASH,
  BULK_USER_AGENT,
} from "@/lib/bulk-scan-constants";
import { markScanFailed, requeueToQueued, type ClaimedProspect } from "@/lib/scan-queue";
import { ScannerClient } from "@/lib/scanner-client";
import { getNicheProfile, toScannerSlice } from "@/lib/niche-profile";
import {
  scoreableFailureReason,
  type ScoreableRow,
  type ScoreableSource,
} from "@/lib/triage-eligibility";

export type DispatchOutcome = { id: string; dispatched: boolean; reason?: string };

type Sleep = (ms: number) => Promise<void>;

const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

type ValidateUrlSafe = (input: string) => Promise<string>;

interface DispatchDeps {
  client?: Pick<ScannerClient, "fullScanBulk">;
  fetchImpl?: TriageFetchImpl;
  sleep?: Sleep;
  // Not part of the plan's documented dep surface, but injected the same
  // way lib/triage-fetch.ts's TriageDeps and scripts/import-prospects.ts's
  // ImportDeps already do — a real DNS-resolving validateUrlSafe() would
  // make this library's own unit tests non-deterministic and network-
  // dependent. Defaults to the real implementation everywhere else.
  validateUrlSafe?: ValidateUrlSafe;
}

/**
 * Dispatches a batch of already-claimed prospects under
 * `BULK_DISPATCH_CONCURRENCY` simultaneous in-flight calls, spacing each
 * attempt by `BULK_DISPATCH_SPACING_MS` so a tick paces itself rather than
 * bursting (Pitfall 2, SCAN-06). `deps` are injectable so the test suite
 * runs instantly with no real timers or network.
 */
export async function dispatchClaimedProspects(
  sb: SupabaseClient,
  claimed: ClaimedProspect[],
  deps: DispatchDeps = {}
): Promise<DispatchOutcome[]> {
  const client = deps.client ?? new ScannerClient();
  const sleep = deps.sleep ?? defaultSleep;
  const limit = pLimit(BULK_DISPATCH_CONCURRENCY);

  const outcomes = await Promise.all(
    claimed.map((prospect) =>
      limit(async () => {
        const outcome = await dispatchOne(sb, prospect, client, deps.fetchImpl, deps.validateUrlSafe);
        await sleep(BULK_DISPATCH_SPACING_MS);
        return outcome;
      })
    )
  );

  return outcomes;
}

async function dispatchOne(
  sb: SupabaseClient,
  prospect: ClaimedProspect,
  client: Pick<ScannerClient, "fullScanBulk">,
  fetchImpl?: TriageFetchImpl,
  validateUrlSafe: ValidateUrlSafe = defaultValidateUrlSafe
): Promise<DispatchOutcome> {
  // ENG-06, T-9-12: a prospect that fails the scoreable rule is never scanned,
  // including one released or queued before the rule existed, which carries no
  // stored marker (the marker refresh only ever touches un-released prospects).
  // So the verdict is computed fresh here, from the prospect's own columns and
  // prospect_sources, by scoreableFailureReason: the one place the rule and
  // MIN_MATCH_CONFIDENCE live (D-9-R1). This file evaluates no condition itself,
  // and the stored prospects.not_scoreable_reason is not consulted: it is the
  // readable explanation the Shortlist shows (D-9-17), not what dispatch trusts.
  // Checked before any network call.
  const { data: fresh, error: freshError } = await sb
    .from("prospects")
    .select(
      "domain, website_url, address, latitude, longitude, prospect_sources(raw_confidence, raw_operating_status)"
    )
    .eq("id", prospect.id)
    .single();

  // Fail closed: with no readable row there is no verdict, and no verdict is
  // never read as a pass. No attempt is spent, so a re-queue can retry.
  if (freshError || !fresh) {
    await markScanFailed(sb, prospect.id, "scoreable_check_failed", { attemptSpent: false });
    return { id: prospect.id, dispatched: false, reason: "scoreable_check_failed" };
  }

  // A missing embed becomes an empty list, which is not one match: it fails closed.
  const { prospect_sources, ...columns } = fresh as unknown as Omit<ScoreableRow, "sources"> & {
    prospect_sources: ScoreableSource[] | null;
  };
  if (scoreableFailureReason({ ...columns, sources: prospect_sources ?? [] }) !== null) {
    // Recorded the way the robots and SSRF pre-flight skips are (no attempt
    // spent, a reason that tells it apart from a dispatch failure): the schema
    // has no skipped state, and returning without a write would strand the row
    // in 'scanning'. No scans row is created, so nothing the scanner's own
    // monitoring reads is touched.
    await markScanFailed(sb, prospect.id, "not_scoreable", { attemptSpent: false });
    return { id: prospect.id, dispatched: false, reason: "not_scoreable" };
  }

  // T-04-08: a URL that passed validation at import time can have been
  // repointed since (DNS can change) — re-validate here, not assumed safe.
  let validatedUrl: string;
  try {
    validatedUrl = await validateUrlSafe(prospect.website_url ?? "");
  } catch {
    await markScanFailed(sb, prospect.id, "url_validation_failed", { attemptSpent: false });
    return { id: prospect.id, dispatched: false, reason: "url_validation_failed" };
  }

  const origin = new URL(validatedUrl).origin;

  // D-10: a robots-disallowed prospect is marked failed and the scanner
  // service is never called for it — kept on the Next.js tier so
  // scanner-service needs no change for this concern (Phase 3 convention).
  const disallowed = await isHomepageDisallowed(origin, BULK_USER_AGENT, fetchImpl);
  if (disallowed) {
    await markScanFailed(sb, prospect.id, "robots_disallowed", { attemptSpent: false });
    return { id: prospect.id, dispatched: false, reason: "robots_disallowed" };
  }

  const scanId = crypto.randomUUID();
  const domain = prospect.domain ?? new URL(validatedUrl).hostname;

  // scans.ip_hash is NOT NULL and the public scanner's per-IP hourly limit
  // counts rows by ip_hash — bulk rows sit under their own sentinel key so
  // they can never inflate a real visitor's count (T-04-11).
  const { error: insertError } = await sb.from("scans").insert({
    id: scanId,
    url: validatedUrl,
    domain,
    type: "full",
    status: "scanning",
    pages: [],
    started_at: new Date().toISOString(),
    ip_hash: BULK_SCAN_IP_HASH,
    prospect_id: prospect.id,
  });
  if (insertError) throw insertError;

  try {
    const profile = getNicheProfile("installers");
    const { accepted } = await client.fullScanBulk(validatedUrl, {
      scanId,
      prospectId: prospect.id,
      userAgent: BULK_USER_AGENT,
      // Phase 9 (D-9-12): the profile slice rides the request, so the Railway
      // scanner reads what a prospect's site publishes inside this scan. Bulk
      // scans only: the public scanner never sends one and does no own-site work.
      nicheSlice: toScannerSlice(profile),
    });

    if (accepted) {
      const { error } = await sb
        .from("prospects")
        .update({ latest_scan_id: scanId, scan_attempts: 1 })
        .eq("id", prospect.id);
      if (error) throw error;
      return { id: prospect.id, dispatched: true };
    }

    // 503 capacity refusal (D-08 with D-04): not a failure of this
    // prospect's site — delete the just-inserted scans row and return the
    // prospect to queued without spending its attempt.
    const { error: deleteError } = await sb.from("scans").delete().eq("id", scanId);
    if (deleteError) throw deleteError;
    await requeueToQueued(sb, prospect.id);
    return { id: prospect.id, dispatched: false, reason: "at_capacity" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown dispatch error";
    await markScanFailed(sb, prospect.id, message, { attemptSpent: true });
    return { id: prospect.id, dispatched: false, reason: message };
  }
}
