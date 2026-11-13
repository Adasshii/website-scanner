// RED-phase scaffold (plan 09-06 Task 1): an inert stub so the integration test
// loads and fails on its planned assertions instead of on a missing module.
// Replaced by the real implementation in the GREEN commit.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScoreableFailureReason } from "@/lib/triage-eligibility";

export interface ScoreabilityRefreshResult {
  considered: number;
  scoreable: number;
  byReason: Record<ScoreableFailureReason, number>;
}

export async function refreshScoreability(_sb: SupabaseClient): Promise<ScoreabilityRefreshResult> {
  return {
    considered: 0,
    scoreable: 0,
    byReason: { no_own_domain: 0, no_unique_match: 0, no_location: 0, permanently_closed: 0 },
  };
}
