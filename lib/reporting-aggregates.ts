// Aggregates prospects + outreach_messages into the funnel counts and
// sent-gate boolean the Reporting tab renders (TRK-01/02/03). Follows
// lib/triage-candidates.ts's convention: an injected SupabaseClient first
// parameter, a typed return, no route-level JSON shaping inside this file.
import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveLifecycleState, FUNNEL_GROUPS, type LifecycleInputs } from "@/lib/lifecycle";

export interface FunnelCounts {
  New: number;
  Qualified: number;
  Contacted: number;
  Replied: number;
  Booked: number;
  Rejected: number;
}

export interface ReportingPayload {
  funnel: FunnelCounts;
  sentGateOpen: boolean;
}
// Plan 07-03 extends this interface with `days: ReportingDay[]` — left room
// for it, not invented here.

/**
 * Reads every prospect and every outreach_messages row (all rows; ~800
 * prospects at this project's scale, so counting in TypeScript is correct
 * per CONTEXT.md's Claude's Discretion), derives each prospect's fine
 * lifecycle state via `deriveLifecycleState()`, and tallies through
 * `FUNNEL_GROUPS`. `sentGateOpen` is a read-time gate (D-7-13) — never a
 * stored flag — derived from whether any fetched outreach_messages row has
 * `status === "sent"`.
 */
export async function getReportingData(sb: SupabaseClient): Promise<ReportingPayload> {
  const { data: prospectRows, error: prospectError } = await sb
    .from("prospects")
    .select("id, lifecycle_state, triage_checked_at, scan_released_at, scan_status, booked_at");
  if (prospectError) throw prospectError;

  const { data: outreachRows, error: outreachError } = await sb
    .from("outreach_messages")
    .select("prospect_id, status, created_at")
    .order("created_at", { ascending: true });
  if (outreachError) throw outreachError;

  // Keep the LAST write per prospect (ascending order + Map overwrite),
  // which yields the newest row — migration 012 declares no UNIQUE
  // constraint on prospect_id (Pitfall 4), so .single()/.maybeSingle() per
  // prospect would be unsafe here.
  const latestOutreachStatus = new Map<string, LifecycleInputs["outreachStatus"]>();
  let sentGateOpen = false;
  for (const message of outreachRows ?? []) {
    latestOutreachStatus.set(
      message.prospect_id as string,
      message.status as LifecycleInputs["outreachStatus"]
    );
    if (message.status === "sent") sentGateOpen = true;
  }

  const funnel: FunnelCounts = {
    New: 0,
    Qualified: 0,
    Contacted: 0,
    Replied: 0,
    Booked: 0,
    Rejected: 0,
  };

  for (const prospect of prospectRows ?? []) {
    const fine = deriveLifecycleState({
      lifecycle_state: prospect.lifecycle_state as string,
      triage_checked_at: prospect.triage_checked_at as string | null,
      scan_released_at: prospect.scan_released_at as string | null,
      scan_status: prospect.scan_status as LifecycleInputs["scan_status"],
      booked_at: prospect.booked_at as string | null,
      outreachStatus: latestOutreachStatus.get(prospect.id as string) ?? null,
    });
    funnel[FUNNEL_GROUPS[fine]] += 1;
  }

  return { funnel, sentGateOpen };
}
