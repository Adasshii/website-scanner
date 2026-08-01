// Single tunable constants block for the prospect data retention job
// (Phase 7, D-7-17). Every value below is read once at module scope, and no
// second copy of any of them exists anywhere in this phase. Mirrors
// lib/triage-constants.ts and lib/bulk-scan-constants.ts.

/**
 * The three modes the retention job (lib/retention.ts) can run in.
 * `dry-run` is the only mode this plan implements; `anonymize` and `delete`
 * are wired through runRetention()'s branch but throw until plan 07-07.
 */
export type RetentionMode = "anonymize" | "delete" | "dry-run";

const VALID_RETENTION_MODES: readonly RetentionMode[] = ["anonymize", "delete", "dry-run"];

/** Type guard, not a cast — narrows a raw string to RetentionMode only after
 * checking membership in the closed enum. Never a bare `process.env...
 * as RetentionMode` cast (07-RESEARCH.md's sketch uses one; this
 * deliberately does not, per the Security Domain's V5 row: a cast would
 * pass any string through unchecked). */
function isRetentionMode(value: string): value is RetentionMode {
  return (VALID_RETENTION_MODES as readonly string[]).includes(value);
}

/**
 * Resolved from `process.env.RETENTION_MODE` against the closed three-value
 * enum above — validated at read time via the type guard, never a cast. An
 * unset or unrecognised value falls back to "dry-run" with a warning. The
 * fallback direction is deliberate and one-way: an unreadable value must
 * resolve to the mode that writes nothing, never to one that writes.
 */
function resolveRetentionMode(): RetentionMode {
  const raw = process.env.RETENTION_MODE;
  if (raw === undefined) return "dry-run";
  if (isRetentionMode(raw)) return raw;
  console.warn(`[retention-constants] Unrecognised RETENTION_MODE "${raw}" — falling back to "dry-run"`);
  return "dry-run";
}

export const RETENTION_MODE: RetentionMode = resolveRetentionMode();

/**
 * The retention window in months. CMP-13's 12-month default is a
 * placeholder pending the LIA and not a legal fact (D-7-R3) — it is config
 * precisely so counsel's answer changes this value and no code. D-7-15's
 * deferred second window for never-contacted prospects would arrive as a
 * sibling constant here rather than as a redesign.
 */
function resolveRetentionMonths(): number {
  const raw = process.env.RETENTION_MONTHS;
  if (raw === undefined) return 12;
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed >= 1) return parsed;
  console.warn(`[retention-constants] Invalid RETENTION_MONTHS "${raw}" — falling back to 12`);
  return 12;
}

export const RETENTION_MONTHS: number = resolveRetentionMonths();

/**
 * Every table lib/retention.ts is allowed to open, and no other. Every
 * query in that module goes through the one guarded accessor keyed on this
 * list (retentionFrom()) — an out-of-list table is a compile error via the
 * derived RetentionTable union, and a runtime check catches a value cast
 * past the compiler (D-7-19).
 *
 * `suppressions` is deliberately absent and can never be added: suppression
 * rows key on email independently of any prospect row and must survive
 * every retention pass permanently (CMP-15). Removing one recreates exactly
 * the re-contact risk suppression exists to prevent. This comment documents
 * the rule; the integration test in lib/retention.integration.test.ts
 * (Task 2) is what enforces it (D-7-19).
 *
 * `leads` is absent for the same class of reason: it belongs to the public
 * scanner, which D-7-R5 puts outside this job's blast radius.
 */
export const RETENTION_TABLE_ALLOWLIST = ["prospects", "outreach_messages", "scans"] as const;

export type RetentionTable = (typeof RETENTION_TABLE_ALLOWLIST)[number];

/**
 * Hard cap on one candidate select. PostgREST caps an unbounded select at
 * its own default page size, so a run that silently processed only the
 * first page would expire a partial set and report a number that looked
 * complete. selectExpiringProspects() asserts against this cap instead of
 * paging. At 10-50 prospects per week (D-7-R4) a single monthly run
 * reaching 1000 expiring prospects is not reachable; if it ever is, someone
 * must look, and the upgrade path is to page the candidate query rather
 * than to raise this number.
 */
export const RETENTION_MAX_BATCH = 1000;

/**
 * Max ids per `.in("prospect_id", ids)` call in lib/retention.ts's contact
 * and scan lookups. PostgREST URL-encodes an `.in()` filter into the GET
 * request's query string, so a candidate set anywhere near
 * RETENTION_MAX_BATCH overflows the gateway's URL length limit in one
 * call — confirmed by a real `{ months: 0 }` run against this project's
 * local dev prospects table (711 rows, "URI too long"). 150 UUIDs is
 * comfortably under any gateway's URL limit; raise only if profiling shows
 * it costs meaningfully more round trips than it saves.
 */
export const RETENTION_ID_CHUNK_SIZE = 150;
