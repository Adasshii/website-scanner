// Aggregates prospects + outreach_messages into the funnel counts and
// sent-gate boolean the Reporting tab renders (TRK-01/02/03). Follows
// lib/triage-candidates.ts's convention: an injected SupabaseClient first
// parameter, a typed return, no route-level JSON shaping inside this file.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveLifecycleState,
  FUNNEL_GROUPS,
  REPLY_SIGNAL_AVAILABLE,
  type LifecycleInputs,
} from "@/lib/lifecycle";

export interface FunnelCounts {
  New: number;
  Qualified: number;
  Contacted: number;
  Replied: number;
  Booked: number;
  Rejected: number;
}

export interface ReportingDay {
  date: string;
  imported: number;
  triaged: number;
  scanned: number;
  contacted: number;
  replyRate: number | null;
  booked: number | null;
  bookedByDomain: number | null;
}

export interface ReportingPayload {
  funnel: FunnelCounts;
  sentGateOpen: boolean;
  days: ReportingDay[];
}

const WINDOW_DAYS = 30;

/**
 * UTC calendar day of an ISO timestamp (Pitfall 6). Every timestamp in this
 * database is `timestamptz` stored as UTC, no timezone library is
 * installed, and grouping without naming a zone would silently follow the
 * query engine's session timezone. All five source timestamps that feed
 * `ReportingDay` bucket through this one function, so a row's columns
 * cannot describe different days (T-07-18).
 */
export function utcDay(ts: string): string {
  return new Date(ts).toISOString().slice(0, 10);
}

// A fixed 30-calendar-day window ending today, newest first (D-7-12). Built
// from `now` so every call in a single getReportingData() invocation agrees
// on what "today" means. Never a filtered list of days that had activity —
// all 30 entries exist even when every count is zero.
function build30DayWindow(now: Date): string[] {
  const days: string[] = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(utcDay(d.toISOString()));
  }
  return days;
}

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
  const now = new Date();
  const dayWindow = build30DayWindow(now); // newest first
  const windowStartIso = `${dayWindow[dayWindow.length - 1]}T00:00:00.000Z`;

  const { data: prospectRows, error: prospectError } = await sb
    .from("prospects")
    .select(
      "id, lifecycle_state, triage_checked_at, scan_released_at, scan_status, booked_at, booked_match_method, created_at"
    );
  if (prospectError) throw prospectError;

  const { data: outreachRows, error: outreachError } = await sb
    .from("outreach_messages")
    .select("prospect_id, status, created_at, sent_at")
    .order("created_at", { ascending: true });
  if (outreachError) throw outreachError;

  // scanned (D-7-16's scope line applied to reporting): `.not("prospect_id",
  // "is", null)` excludes the public scanner's own scans, which are not
  // prospect activity. Restricted to the 30-day window via `.gte()` so this
  // query does not widen as the table grows — the funnel queries above stay
  // unbounded because they describe where every prospect stands now, not a
  // per-day rate.
  const { data: scanRows, error: scanError } = await sb
    .from("scans")
    .select("created_at")
    .not("prospect_id", "is", null)
    .gte("created_at", windowStartIso);
  if (scanError) throw scanError;

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

  const dayMap = new Map<string, ReportingDay>();
  for (const date of dayWindow) {
    dayMap.set(date, {
      date,
      imported: 0,
      triaged: 0,
      scanned: 0,
      contacted: 0,
      replyRate: null,
      booked: sentGateOpen ? 0 : null,
      bookedByDomain: sentGateOpen ? 0 : null,
    });
  }

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

    const createdAt = prospect.created_at as string | null;
    if (createdAt) {
      const day = dayMap.get(utcDay(createdAt));
      if (day) day.imported += 1;
    }

    const triagedAt = prospect.triage_checked_at as string | null;
    if (triagedAt) {
      const day = dayMap.get(utcDay(triagedAt));
      if (day) day.triaged += 1;
    }

    // Booked/bookedByDomain stay null while the sent-gate is closed — set
    // above at dayMap construction time — so this only ever mutates a real
    // number once the gate is open.
    if (sentGateOpen) {
      const bookedAt = prospect.booked_at as string | null;
      if (bookedAt) {
        const day = dayMap.get(utcDay(bookedAt));
        if (day) {
          day.booked = (day.booked ?? 0) + 1;
          if (prospect.booked_match_method === "domain") {
            day.bookedByDomain = (day.bookedByDomain ?? 0) + 1;
          }
        }
      }
    }
  }

  for (const scan of scanRows ?? []) {
    const createdAt = scan.created_at as string | null;
    if (!createdAt) continue;
    const day = dayMap.get(utcDay(createdAt));
    if (day) day.scanned += 1;
  }

  for (const message of outreachRows ?? []) {
    const sentAt = message.sent_at as string | null;
    if (!sentAt) continue;
    const day = dayMap.get(utcDay(sentAt));
    if (day) day.contacted += 1;
  }

  // replyRate stays null under any of three independent guards (T-07-16):
  // no reply marker exists anywhere in this codebase (REPLY_SIGNAL_AVAILABLE),
  // nothing has ever sent (sentGateOpen), or the day's contacted count is
  // zero (the division boundary — this is what keeps the computation from
  // ever producing NaN or Infinity). Because no `replied` marker exists
  // until Phase 8 adds one, the numerator below is provably unreachable
  // while REPLY_SIGNAL_AVAILABLE is false; Phase 8 must supply a real
  // per-day replied count here in the same change that flips the constant.
  for (const day of Array.from(dayMap.values())) {
    day.replyRate =
      REPLY_SIGNAL_AVAILABLE && sentGateOpen && day.contacted > 0
        ? 0 / day.contacted
        : null;
  }

  return { funnel, sentGateOpen, days: Array.from(dayMap.values()) };
}
