// Route 4 of the Atrium contract: opt-outs since a point in time. Atrium
// passes the last `now` as the next `since`. Only active rows (not lifted).
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * created_at comes from the database clock, `now` from this server's clock.
 * Moving `now` back by this much means a row written just before the read is
 * read again next time instead of missed. Atrium sees it twice and its stop
 * list ignores the duplicate.
 */
export const SUPPRESSION_SYNC_OVERLAP_MS = 60_000;

// PostgREST returns at most 1000 rows per request and says nothing when it
// cuts a result short, so read in pages ordered by the unique primary key.
const PAGE_SIZE = 1000;

export interface AtriumSuppression {
  email: string | null;
  domain: string | null;
  createdAt: string;
}

export async function listSuppressionsSince(
  sb: SupabaseClient,
  since: string,
  now: Date = new Date()
): Promise<{ now: string; suppressions: AtriumSuppression[] }> {
  const sinceMs = Date.parse(since);
  const cursor = new Date(Math.max(sinceMs, now.getTime() - SUPPRESSION_SYNC_OVERLAP_MS)).toISOString();
  const sinceIso = new Date(sinceMs).toISOString();

  const rows: { email: string | null; domain: string | null; created_at: string }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sb
      .from("suppressions")
      .select("id, email, domain, created_at")
      .gte("created_at", sinceIso)
      .is("lifted_at", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const suppressions = rows
    .map((r) => ({ email: r.email, domain: r.domain, createdAt: new Date(r.created_at).toISOString() }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return { now: cursor, suppressions };
}
