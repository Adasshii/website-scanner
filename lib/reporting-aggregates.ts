// Aggregates prospects + outreach_messages into the funnel counts and
// sent-gate boolean the Reporting tab renders (TRK-01/02/03). Follows
// lib/triage-candidates.ts's convention: an injected SupabaseClient first
// parameter, a typed return, no route-level JSON shaping inside this file.
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
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

// PostgREST silently caps an unbounded select at this many rows per page and
// returns HTTP 200 with no error — the same cap RETENTION_MAX_BATCH's doc
// comment (lib/retention-constants.ts) names as PostgREST's default page
// size. Retention asserts against that cap because a partial expiry run must
// fail loudly; the Reporting tab has the opposite requirement — it must keep
// working past 1000 rows, not go dark — so this file pages through the cap
// instead of refusing at it.
const REPORTING_PAGE_SIZE = 1000;

/**
 * Pages through `queryPage(from, to)` until an EMPTY page comes back,
 * accumulating every row. Throws on the first page-level error rather than
 * returning a partial result.
 *
 * Terminating on an empty page rather than on a short one is deliberate. A
 * short page is ambiguous: it means either "this is the end" or "the server's
 * own `max-rows` is smaller than what I asked for". Breaking on `page.length <
 * REPORTING_PAGE_SIZE` reads the second case as the first and silently drops
 * every remaining row — the exact class of bug this helper exists to close,
 * one level down. Supabase's default `max-rows` is 1000 so the two agree
 * today, but that is a server setting, not a guarantee.
 *
 * `from` therefore advances by the rows actually returned, never by the page
 * size requested. Cost: one extra round trip at the end.
 */
export async function fetchAllPages<Row>(
  queryPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: Row[] | null; error: PostgrestError | null }>
): Promise<Row[]> {
  const rows: Row[] = [];
  let from = 0;
  while (true) {
    const to = from + REPORTING_PAGE_SIZE - 1;
    const { data, error } = await queryPage(from, to);
    if (error) throw error;
    const page = data ?? [];
    if (page.length === 0) break;
    rows.push(...page);
    from += page.length;
  }
  return rows;
}

/**
 * Reads every prospect and every outreach_messages row, derives each
 * prospect's fine lifecycle state via `deriveLifecycleState()`, and tallies
 * through `FUNNEL_GROUPS`. Both reads are paginated (see
 * `REPORTING_PAGE_SIZE`) — the counting itself still happens in TypeScript,
 * but PostgREST silently truncates an unbounded select, so a single
 * `.select()` cannot be trusted once either table crosses the cap.
 * `sentGateOpen` is a read-time gate (D-7-13) — never a stored flag —
 * derived from whether any fetched outreach_messages row has
 * `status === "sent"`.
 */
export async function getReportingData(sb: SupabaseClient): Promise<ReportingPayload> {
  const now = new Date();
  const dayWindow = build30DayWindow(now); // newest first
  const windowStartIso = `${dayWindow[dayWindow.length - 1]}T00:00:00.000Z`;

  const prospectRows = await fetchAllPages((from, to) =>
    sb
      .from("prospects")
      .select(
        "id, lifecycle_state, triage_checked_at, scan_released_at, scan_status, booked_at, booked_match_method, created_at"
      )
      .order("id", { ascending: true })
      .range(from, to)
  );

  // `created_at` alone is not unique, so a second `order("id")` tiebreak is
  // required before `.range()` — otherwise rows sharing a `created_at` can
  // straddle a page boundary and be skipped or duplicated, leaving the
  // newest-wins fold wrong in a quieter way than an outright undercount.
  // Ties resolve in `id` order — arbitrary but deterministic, which is all
  // the fold needs.
  const outreachRows = await fetchAllPages((from, to) =>
    sb
      .from("outreach_messages")
      .select("prospect_id, status, created_at, sent_at")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );

  // scanned (D-7-16's scope line applied to reporting): `.not("prospect_id",
  // "is", null)` excludes the public scanner's own scans, which are not
  // prospect activity. Restricted to the 30-day window via `.gte()`, but a
  // time window bounds *when* a row was created, not *how many* rows exist
  // in it — this project's local dev DB alone holds over 1000 scans in the
  // last 30 days, so this read hits the identical PostgREST cap the other
  // two reads do and must page the same way, ordered by `id` (migration
  // 001's uuid primary key) as the unique tiebreaker.
  const scanRows = await fetchAllPages<{ created_at: string | null }>((from, to) =>
    sb
      .from("scans")
      .select("created_at")
      .not("prospect_id", "is", null)
      .gte("created_at", windowStartIso)
      .order("id", { ascending: true })
      .range(from, to)
  );

  // Keep the LAST write per prospect (ascending order + Map overwrite),
  // which yields the newest row — migration 012 declares no UNIQUE
  // constraint on prospect_id (Pitfall 4), so .single()/.maybeSingle() per
  // prospect would be unsafe here.
  const latestOutreachStatus = new Map<string, LifecycleInputs["outreachStatus"]>();
  let sentGateOpen = false;
  for (const message of outreachRows) {
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

  for (const prospect of prospectRows) {
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

  for (const scan of scanRows) {
    const createdAt = scan.created_at as string | null;
    if (!createdAt) continue;
    const day = dayMap.get(utcDay(createdAt));
    if (day) day.scanned += 1;
  }

  for (const message of outreachRows) {
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
