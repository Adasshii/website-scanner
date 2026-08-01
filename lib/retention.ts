// The prospect data retention job (Phase 7, CMP-13/14/15). Owns the job's
// scope, clock and mode branch. Takes an injected SupabaseClient as every
// function's first parameter and never constructs one, so its integration
// test can drive it against a local test client (mirrors lib/scan-queue.ts's
// armBatch() convention). Never performs HTTP.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
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
 * Resolves mode/months as `opts.mode ?? RETENTION_MODE` / `opts.months ??
 * RETENTION_MONTHS` — the same `??` override shape armBatch() uses for its
 * ceiling. Production calls this with no options and gets the environment
 * values; the integration test drives every mode and window without
 * re-evaluating a module-scope read.
 *
 * The dry-run arm returns the result with all five write counters at 0 and
 * issues no write of any kind. The other two arms throw — deliberately, not
 * a silent no-op: a job that accepted a writing mode and expired nothing
 * would look healthy and be doing nothing, which is the same
 * plausible-looking absence D-7-13 rejects elsewhere in this phase.
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
  };

  if (mode === "dry-run") {
    return result;
  }

  throw new Error(`runRetention: mode "${mode}" is not implemented until plan 07-07`);
}
