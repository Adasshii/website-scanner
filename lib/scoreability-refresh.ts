// Marker refresh (ENG-06, D-9-17): persists WHY a business was dropped.
//
// This module records a decision, it never makes one. The reason written to
// prospects.not_scoreable_reason is the value scoreableFailureReason returns
// (lib/triage-eligibility.ts), which is the same function isReleasable gates on,
// so the stored explanation cannot drift from the release rule. No condition of
// the rule is evaluated here: do not add one (D-9-R1, D-9-14).
//
// Only un-released prospects are touched. A prospect that already carries
// scan_released_at keeps whatever marker it had, so its history is not
// rewritten (D-9-17). Consequence: a prospect released before migration 022
// never receives a marker from this module, which is why the dispatch-time
// check in lib/bulk-scan-dispatch.ts reads the stored marker and cannot, on its
// own, catch such a prospect (see the 09-06 SUMMARY).
//
// STALENESS: the stored reason is computed from MIN_MATCH_CONFIDENCE
// (lib/triage-constants.ts). Changing that constant, or any input of the rule,
// leaves every stored reason stale until a refresh runs. The import and triage
// scripts run it at the end of every non-dry run; after editing the constant,
// run one of them or call refreshScoreability directly.
//
// The per-reason count is logged on every run. Assumption A8 (09-RESEARCH.md)
// is unmeasured: an Overture GERS id that changes between releases could insert
// a second prospect_sources row for one business and turn one match into two. A
// jump in no_unique_match after a re-import is the detector for that.
import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkIds } from "@/lib/chunk-ids";
import {
  scoreableFailureReason,
  type ScoreableFailureReason,
  type ScoreableRow,
  type ScoreableSource,
} from "@/lib/triage-eligibility";

export interface ScoreabilityRefreshResult {
  /** Un-released prospects the call looked at. Always equals scoreable plus the sum of byReason. */
  considered: number;
  scoreable: number;
  byReason: Record<ScoreableFailureReason, number>;
}

/** Ids per chunked `.in()` write. An unchunked `.in()` already failed with "URI too long" in this project. */
const REFRESH_ID_CHUNK_SIZE = 150; // tunable default
/** PostgREST returns at most this many rows per request, so the read pages instead of truncating silently. */
const REFRESH_PAGE_SIZE = 1000;

// Same columns and prospect_sources embed lib/triage-release.ts reads for the
// rule. The embed works because prospect_sources.prospect_id references
// prospects(id) (migration 011).
const REFRESH_SELECT =
  "id, domain, website_url, address, latitude, longitude, prospect_sources(raw_confidence, raw_operating_status)";

type RefreshRow = Omit<ScoreableRow, "sources"> & {
  id: string;
  prospect_sources: ScoreableSource[] | null;
};

async function readUnreleased(sb: SupabaseClient): Promise<Array<ScoreableRow & { id: string }>> {
  const rows: Array<ScoreableRow & { id: string }> = [];
  for (let from = 0; ; from += REFRESH_PAGE_SIZE) {
    const { data, error } = await sb
      .from("prospects")
      .select(REFRESH_SELECT)
      .is("scan_released_at", null)
      .order("id", { ascending: true })
      .range(from, from + REFRESH_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as RefreshRow[];
    // A missing embed becomes an empty list, which is not one match: it fails closed.
    for (const { prospect_sources, ...row } of page) {
      rows.push({ ...row, sources: prospect_sources ?? [] });
    }
    if (page.length < REFRESH_PAGE_SIZE) return rows;
  }
}

/**
 * Writes `not_scoreable_reason` and `scoreable_checked_at` for every un-released
 * prospect and returns a per-reason count. A prospect that has become scoreable
 * has its reason cleared to null rather than left stale.
 */
export async function refreshScoreability(sb: SupabaseClient): Promise<ScoreabilityRefreshResult> {
  const rows = await readUnreleased(sb);

  // Group ids by outcome so each group is one chunked statement per chunk
  // instead of one statement per row.
  const idsByReason = new Map<ScoreableFailureReason | null, string[]>();
  for (const row of rows) {
    const reason = scoreableFailureReason(row);
    const ids = idsByReason.get(reason);
    if (ids) ids.push(row.id);
    else idsByReason.set(reason, [row.id]);
  }

  const checkedAt = new Date().toISOString();
  for (const [reason, ids] of Array.from(idsByReason)) {
    for (const chunk of chunkIds(ids, REFRESH_ID_CHUNK_SIZE)) {
      const { error } = await sb
        .from("prospects")
        .update({ not_scoreable_reason: reason, scoreable_checked_at: checkedAt })
        .in("id", chunk);
      if (error) throw error;
    }
  }

  const result: ScoreabilityRefreshResult = {
    considered: rows.length,
    scoreable: idsByReason.get(null)?.length ?? 0,
    byReason: {
      no_own_domain: idsByReason.get("no_own_domain")?.length ?? 0,
      no_unique_match: idsByReason.get("no_unique_match")?.length ?? 0,
      no_location: idsByReason.get("no_location")?.length ?? 0,
      permanently_closed: idsByReason.get("permanently_closed")?.length ?? 0,
    },
  };

  console.log(
    `[scoreability-refresh] ${result.considered} un-released prospects: ${result.scoreable} scoreable, ` +
      `no_own_domain=${result.byReason.no_own_domain} no_unique_match=${result.byReason.no_unique_match} ` +
      `no_location=${result.byReason.no_location} permanently_closed=${result.byReason.permanently_closed}`
  );

  return result;
}
