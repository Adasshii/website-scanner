// The prospect data retention job (Phase 7, CMP-13/14/15). Owns the job's
// scope, clock and mode branch. Takes an injected SupabaseClient as every
// function's first parameter and never constructs one, so its integration
// test can drive it against a local test client (mirrors lib/scan-queue.ts's
// armBatch() convention). Never performs HTTP.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ANONYMIZED_OUTREACH_FIELDS,
  ANONYMIZED_PROSPECT_FIELDS,
  ANONYMIZED_SCAN_FIELDS,
  RETENTION_ID_CHUNK_SIZE,
  RETENTION_MAX_BATCH,
  RETENTION_MODE,
  RETENTION_MONTHS,
  RETENTION_TABLE_ALLOWLIST,
  type RetentionMode,
  type RetentionTable,
} from "@/lib/retention-constants";

function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export interface ExpiringProspect {
  id: string;
  clock: string;
  latestScanId: string | null;
}

export interface RetentionResult {
  mode: RetentionMode;
  months: number;
  cutoff: string;
  candidates: number;
  expiring: number;
  prospectsAnonymized: number;
  prospectsDeleted: number;
  outreachAnonymized: number;
  scansAnonymized: number;
  scansDeleted: number;
  sourcesAnonymized: number;
}

/**
 * Clones `now`, subtracts `months` from its UTC month, returns the ISO
 * string. JavaScript month arithmetic rolls over at month-end (subtracting
 * one month from the 31st can land in the following month) — at the
 * default of 12 months this is exact (12 UTC months back always lands on
 * the same day-of-month a year earlier), and at any window the resulting
 * error is bounded by a few days on a job whose unit is months.
 */
export function retentionCutoff(now: Date, months: number): string {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff.toISOString();
}

/**
 * The single place in this module allowed to open a table. The type
 * parameter already makes an out-of-list table a compile error; the
 * runtime check exists for the one case the compiler cannot see — a value
 * cast past the compiler. This is what makes D-7-19's allowlist structural
 * rather than documentation. Every query in this file goes through it;
 * there is no other table access.
 */
export function retentionFrom(sb: SupabaseClient, table: RetentionTable) {
  if (!(RETENTION_TABLE_ALLOWLIST as readonly string[]).includes(table)) {
    throw new Error(`retentionFrom: table "${table}" is not in RETENTION_TABLE_ALLOWLIST`);
  }
  return sb.from(table);
}

interface CandidateProspect {
  id: string;
  created_at: string;
  latest_scan_id: string | null;
}

/**
 * Shared by the exported selectExpiringProspects() and runRetention() so
 * both the final (clock-filtered) set and the raw pre-filter candidate
 * count are available without issuing the candidate/contact/scan queries
 * twice.
 */
async function computeExpiringProspects(
  sb: SupabaseClient,
  cutoffIso: string
): Promise<{ candidateCount: number; expiring: ExpiringProspect[] }> {
  // 1. Candidate read. The `.lt("created_at", cutoffIso)` pre-filter is
  // exact rather than an approximation: the clock computed below is a
  // maximum over a set that always contains `created_at`, so a prospect
  // created after the cutoff cannot possibly have a clock before it.
  const { data: candidates, error: candidatesError } = await retentionFrom(sb, "prospects")
    .select("id, created_at, latest_scan_id")
    .lt("created_at", cutoffIso)
    .range(0, RETENTION_MAX_BATCH - 1);
  if (candidatesError) throw candidatesError;

  const candidateRows = (candidates ?? []) as CandidateProspect[];

  // A truncated run must fail loudly rather than expire a partial set.
  if (candidateRows.length === RETENTION_MAX_BATCH) {
    throw new Error(
      `computeExpiringProspects: candidate set reached RETENTION_MAX_BATCH (${RETENTION_MAX_BATCH}) — refusing a truncated run`
    );
  }

  if (candidateRows.length === 0) {
    return { candidateCount: 0, expiring: [] };
  }

  const ids = candidateRows.map((row) => row.id);

  // Both lookups below filter on `.in("prospect_id", ids)`. PostgREST
  // URL-encodes an `.in()` filter into the GET request's query string, so a
  // candidate set anywhere near RETENTION_MAX_BATCH (1000 ids) overflows
  // the gateway's URL length limit in one call ("URI too long" — surfaced
  // by a real `{ months: 0 }` run against this project's 711-row local
  // dev prospects table). Chunking keeps every call well under that limit
  // regardless of how many candidates the pre-filter returns.
  const idChunks = chunkIds(ids, RETENTION_ID_CHUNK_SIZE);

  // 2. Contact lookup. Only a message at status "sent" counts as contact
  // per D-7-15 — widening it to any other status would make a drafted but
  // never sent prospect look freshly contacted and keep its data alive
  // indefinitely.
  const contactByProspect = new Map<string, string>();
  for (const idChunk of idChunks) {
    const { data: outreachRows, error: outreachError } = await retentionFrom(sb, "outreach_messages")
      .select("prospect_id, sent_at")
      .in("prospect_id", idChunk)
      .eq("status", "sent")
      .not("sent_at", "is", null);
    if (outreachError) throw outreachError;

    for (const row of (outreachRows ?? []) as { prospect_id: string; sent_at: string }[]) {
      const existing = contactByProspect.get(row.prospect_id);
      if (!existing || Date.parse(row.sent_at) > Date.parse(existing)) {
        contactByProspect.set(row.prospect_id, row.sent_at);
      }
    }
  }

  // 3. Scan lookup. The `.not("prospect_id", "is", null)` filter is
  // D-7-16's scope line expressed in the query rather than in a
  // convention: a public-scanner scan carries a null prospect_id forever
  // (migration 013) and can never enter this working set.
  const scanByProspect = new Map<string, string>();
  for (const idChunk of idChunks) {
    const { data: scanRows, error: scansError } = await retentionFrom(sb, "scans")
      .select("prospect_id, created_at")
      .in("prospect_id", idChunk)
      .not("prospect_id", "is", null);
    if (scansError) throw scansError;

    for (const row of (scanRows ?? []) as { prospect_id: string; created_at: string }[]) {
      const existing = scanByProspect.get(row.prospect_id);
      if (!existing || Date.parse(row.created_at) > Date.parse(existing)) {
        scanByProspect.set(row.prospect_id, row.created_at);
      }
    }
  }

  // 4. Clock = latest of created_at, contact, scan. Keep candidates whose
  // clock is strictly before the cutoff. Return them with the clock that
  // decided it, so the dry-run output is auditable per row rather than a
  // bare count.
  const expiring: ExpiringProspect[] = [];
  for (const row of candidateRows) {
    let clock = row.created_at;
    const contact = contactByProspect.get(row.id);
    if (contact && Date.parse(contact) > Date.parse(clock)) clock = contact;
    const scan = scanByProspect.get(row.id);
    if (scan && Date.parse(scan) > Date.parse(clock)) clock = scan;

    if (Date.parse(clock) < Date.parse(cutoffIso)) {
      expiring.push({ id: row.id, clock, latestScanId: row.latest_scan_id ?? null });
    }
  }

  return { candidateCount: candidateRows.length, expiring };
}

/**
 * Selects prospects whose D-7-15 clock (the latest of contact, scan, and
 * created_at) is strictly before `cutoffIso`. See computeExpiringProspects
 * for the full selection logic; this is the public read-only contract.
 */
export async function selectExpiringProspects(
  sb: SupabaseClient,
  cutoffIso: string
): Promise<ExpiringProspect[]> {
  return (await computeExpiringProspects(sb, cutoffIso)).expiring;
}

/**
 * Anonymise mode (D-7-17, Task 1). Three updates against the id set
 * `selectExpiringProspects()` already bounded, each opened through
 * `retentionFrom` and each ending in `.select("id")` so the affected count
 * is real rather than assumed. Returns `{ prospects: 0, outreach: 0, scans:
 * 0 }` immediately on an empty `ids`, so an empty run issues no queries at
 * all.
 *
 * Chunked at `RETENTION_ID_CHUNK_SIZE` like `computeExpiringProspects()`'s
 * own `.in()` lookups: PostgREST encodes an `.in()` filter into the request
 * URL for UPDATE/DELETE exactly as it does for SELECT, so a candidate set
 * near `RETENTION_MAX_BATCH` (1000) overflows the same "URI too long" limit
 * 07-06 found for reads — the id set here is the same one, just later in
 * the same run.
 *
 * The pass is idempotent by construction: every write assigns a constant
 * value rather than deriving one from the row's current state, so a repeat
 * run over the same ids writes the same values again and reports the same
 * counters. This matters because D-7-17 deliberately preserves every
 * timestamp the D-7-15 clock reads — an anonymised prospect re-qualifies on
 * every later run (07-RESEARCH.md Pitfall #5 claims the opposite; that
 * claim is wrong under this design, and this comment is the correction).
 * Re-processing an already-anonymised row is harmless for exactly that
 * reason, and it is what makes the job safe against Vercel's best-effort
 * cron delivery with no lock or dedup logic.
 *
 * Also deletes this id set's `prospect_sources` rows (FA-CMP-13-SOURCES,
 * Task 1 decision: B-delete-source-rows — see
 * 07-DECISION-RECORD.md). `overture_gers_id` is `not null unique`
 * (migration 011) and cannot be nulled in place, so clearing the row is the
 * only way to remove the public identifier it holds; a field-list update
 * like the three tables above would leave that identifier — and, via
 * `upsertOverturePlace`'s re-import match on it, the raw name/address/URL
 * columns too — intact and reachable again by the next regional import.
 * Accepted cost: deleting the row breaks IMP-03 idempotency for this
 * prospect, so a later import of the same region creates a second,
 * unlinked prospect row for the same business rather than matching this
 * one. This is the one exception to "anonymise never deletes" in this
 * module.
 */
export async function anonymizeProspects(
  sb: SupabaseClient,
  ids: string[]
): Promise<{ prospects: number; outreach: number; scans: number; sources: number }> {
  if (ids.length === 0) return { prospects: 0, outreach: 0, scans: 0, sources: 0 };

  const idChunks = chunkIds(ids, RETENTION_ID_CHUNK_SIZE);
  let prospects = 0;
  let outreach = 0;
  let scans = 0;
  let sources = 0;

  for (const idChunk of idChunks) {
    const { data: prospectRows, error: prospectError } = await retentionFrom(sb, "prospects")
      .update(ANONYMIZED_PROSPECT_FIELDS)
      .in("id", idChunk)
      .select("id");
    if (prospectError) throw prospectError;
    prospects += (prospectRows ?? []).length;

    const { data: outreachRows, error: outreachError } = await retentionFrom(sb, "outreach_messages")
      .update(ANONYMIZED_OUTREACH_FIELDS)
      .in("prospect_id", idChunk)
      .select("id");
    if (outreachError) throw outreachError;
    outreach += (outreachRows ?? []).length;

    // The `.not("prospect_id", "is", null)` filter is redundant by one
    // layer — SQL `IN` already excludes nulls — but it stays because it is
    // D-7-16's scope line written where a reader and a grep can both find
    // it.
    const { data: scanRows, error: scansError } = await retentionFrom(sb, "scans")
      .update(ANONYMIZED_SCAN_FIELDS)
      .in("prospect_id", idChunk)
      .not("prospect_id", "is", null)
      .select("id");
    if (scansError) throw scansError;
    scans += (scanRows ?? []).length;

    const { data: sourceRows, error: sourcesError } = await retentionFrom(sb, "prospect_sources")
      .delete()
      .in("prospect_id", idChunk)
      .select("id");
    if (sourcesError) throw sourcesError;
    sources += (sourceRows ?? []).length;
  }

  return { prospects, outreach, scans, sources };
}

/**
 * Delete mode (D-7-16, Task 2). Three separate PostgREST calls, in this
 * order and no other:
 *
 * 1. Null `prospects.latest_scan_id` for every id — clears one of the two
 *    inbound references from an expiring prospect's rows to its own scan.
 * 2. Delete this id set's `outreach_messages` — clears the other one,
 *    `outreach_messages.scan_id`, and is why no step here relies on the
 *    migration-012 cascade.
 * 3. Delete the scans this id set owns — now safe, since steps 1 and 2
 *    cleared both columns that could still point at them.
 * 4. Delete the prospects themselves.
 *
 * The order is not a style choice: migration 013 added `scans.prospect_id`
 * and `prospects.latest_scan_id` as reciprocal foreign keys with no
 * `ON DELETE` clause, so both default to Postgres `NO ACTION` and together
 * form a two-table reference cycle. A prospect's `latest_scan_id` only ever
 * points at its own scan, so step 1 makes step 3 safe for every row in the
 * same id set. `lib/retention.integration.test.ts` proves the naive order
 * (deleting scans first) actually raises a foreign-key error — a dry-run
 * can never surface this, because a SELECT never trips a foreign key.
 *
 * Step 2 exists because `outreach_messages` holds a SECOND no-action foreign
 * key onto `scans` — `scan_id`, declared inline in migration 012 with no
 * `ON DELETE` clause. The migration-012 cascade only covers the
 * `prospect_id` edge, and it only fires once the prospects go, which is
 * after the scans delete. So leaving outreach to that cascade meant step 3
 * ran while outreach rows still pointed at the very scans it was deleting,
 * raising `outreach_messages_scan_id_fkey`. That is not a rare shape:
 * `lib/draft-on-scan-complete.ts` sets `scan_id` on every draft it inserts,
 * so every prospect that reached the draft stage carries one.
 *
 * Not atomic, and not claimed to be: these are three separate PostgREST
 * calls and nothing spans them. A failure between steps leaves prospects
 * whose `latest_scan_id` is already null and whose scans are already gone;
 * the next monthly run re-selects them (neither step moves the D-7-15
 * clock) and completes. Self-healing is the claim; atomic is not.
 *
 * Do not reach for the two retention SQL functions defined in
 * `supabase/migrations/001_create_scans_and_leads.sql` at lines 43 and 51,
 * for atomicity or as a pattern — both are dead
 * code that predates `scans.prospect_id` and carries no prospect-ownership
 * filter (07-PATTERNS.md Q7); using or imitating either would delete
 * public-scanner scans and the whole `leads` table.
 */
export async function deleteProspects(
  sb: SupabaseClient,
  ids: string[]
): Promise<{ prospects: number; outreach: number; scans: number }> {
  if (ids.length === 0) return { prospects: 0, outreach: 0, scans: 0 };

  const idChunks = chunkIds(ids, RETENTION_ID_CHUNK_SIZE);
  let prospects = 0;
  let outreach = 0;
  let scans = 0;

  for (const idChunk of idChunks) {
    // 1. Clear one of the two inbound references from these prospects'
    // rows to their own scans.
    const { error: nullError } = await retentionFrom(sb, "prospects")
      .update({ latest_scan_id: null })
      .in("id", idChunk);
    if (nullError) throw nullError;

    // 2. Delete this id set's outreach, clearing the other one
    // (outreach_messages.scan_id). Deleted explicitly rather than left to
    // the migration-012 cascade, which fires too late to unblock step 3.
    // The returned rows are the exact set removed, so this doubles as the
    // count the caller reports.
    const { data: outreachRows, error: outreachError } = await retentionFrom(sb, "outreach_messages")
      .delete()
      .in("prospect_id", idChunk)
      .select("id");
    if (outreachError) throw outreachError;
    outreach += (outreachRows ?? []).length;

    // 3. Delete the scans this id set owns.
    const { data: scanRows, error: scansError } = await retentionFrom(sb, "scans")
      .delete()
      .in("prospect_id", idChunk)
      .not("prospect_id", "is", null)
      .select("id");
    if (scansError) throw scansError;
    scans += (scanRows ?? []).length;

    // 4. Delete the prospects.
    const { data: prospectRows, error: prospectError } = await retentionFrom(sb, "prospects")
      .delete()
      .in("id", idChunk)
      .select("id");
    if (prospectError) throw prospectError;
    prospects += (prospectRows ?? []).length;
  }

  return { prospects, outreach, scans };
}

/**
 * Resolves mode/months as `opts.mode ?? RETENTION_MODE` / `opts.months ??
 * RETENTION_MONTHS` — the same `??` override shape armBatch() uses for its
 * ceiling. Production calls this with no options and gets the environment
 * values; the integration test drives every mode and window without
 * re-evaluating a module-scope read.
 *
 * The dry-run arm returns the result with all five write counters at 0 and
 * issues no write of any kind. Both writing arms now run — a job that
 * accepted a writing mode and expired nothing would look healthy and be
 * doing nothing, the same plausible-looking absence D-7-13 rejects
 * elsewhere in this phase, which is why no arm silently no-ops.
 */
export async function runRetention(
  sb: SupabaseClient,
  opts: { mode?: RetentionMode; months?: number } = {}
): Promise<RetentionResult> {
  const mode = opts.mode ?? RETENTION_MODE;
  const months = opts.months ?? RETENTION_MONTHS;
  const cutoff = retentionCutoff(new Date(), months);

  const { candidateCount, expiring } = await computeExpiringProspects(sb, cutoff);

  const result: RetentionResult = {
    mode,
    months,
    cutoff,
    candidates: candidateCount,
    expiring: expiring.length,
    prospectsAnonymized: 0,
    prospectsDeleted: 0,
    outreachAnonymized: 0,
    scansAnonymized: 0,
    scansDeleted: 0,
    sourcesAnonymized: 0,
  };

  if (mode === "dry-run") {
    return result;
  }

  if (mode === "anonymize") {
    const ids = expiring.map((row) => row.id);
    const { prospects, outreach, scans, sources } = await anonymizeProspects(sb, ids);
    result.prospectsAnonymized = prospects;
    result.outreachAnonymized = outreach;
    result.scansAnonymized = scans;
    result.sourcesAnonymized = sources;
    return result;
  }

  // mode === "delete" (RetentionMode is a closed 3-value union and the two
  // arms above already handled the other two). RetentionResult carries a
  // single outreach counter (`outreachAnonymized`) shared by both writing
  // modes rather than a second `outreachDeleted` field — delete mode's
  // cascaded outreach count is mapped onto it here.
  const ids = expiring.map((row) => row.id);
  const { prospects, outreach, scans } = await deleteProspects(sb, ids);
  result.prospectsDeleted = prospects;
  result.outreachAnonymized = outreach;
  result.scansDeleted = scans;
  return result;
}
