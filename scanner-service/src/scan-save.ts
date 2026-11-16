// Completed-scan save helpers. supabase-js returns database errors instead of
// throwing them, so an unread error on the completed update left a finished scan
// stuck in a running status once its fifteen-minute timer was cleared, and
// nothing in the logs said why. These helpers read the error, log it in full,
// and turn the hang into a failed scan. No package imports, so the root Vitest
// and type-check trees can load this file.

export interface DbErrorLike {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export interface DbWriteResult {
  error: DbErrorLike | null;
}

export const COMPLETED_SAVE_REASON_MAX = 300;

const COMPLETED_SAVE_PREFIX = "Could not save the completed scan: ";

/** One line of JSON with message, code, details and hint (missing fields as null). */
export function formatDbError(error: DbErrorLike): string {
  return JSON.stringify({
    message: error.message ?? null,
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Runs the completed update and reads its returned error. A refused save is
 * logged once (full error, Railway log only) and the scan is marked failed with
 * a short reason built from the Supabase message alone: error_message is public
 * to anyone holding the scan id, and details/hint can quote row values.
 * A write that rejects is not caught here; the route's catch path owns that.
 */
export async function saveCompletedScan(
  scanId: string,
  deps: {
    write: () => PromiseLike<DbWriteResult>;
    markFailed: (reason: string) => Promise<void>;
    log?: (line: string) => void;
  }
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { error } = await deps.write();
  if (!error) return { ok: true };

  const reason = clip(
    `${COMPLETED_SAVE_PREFIX}${error.message || "unknown error"}`,
    COMPLETED_SAVE_REASON_MAX
  );
  const log = deps.log ?? ((line: string) => console.error(line));
  log(`[full-scan-async] Completed save failed for scan ${scanId}: ${formatDbError(error)}`);
  await deps.markFailed(reason);
  return { ok: false, reason };
}
