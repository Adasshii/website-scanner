// Shared run-state plumbing for the local-only Pipeline admin tab
// (app/api/admin/pipeline/*, components/admin/pipeline-*). Task 1 provides
// just the run lock, shared by all three routes so a double-click can never
// launch two importers/triage runs against the same DB at once (T-ntm-05,
// D-single-tenant: one lock, not per-action locks — simpler to reason about
// at this project's scale). Task 2 extends this file with the NDJSON
// streaming helper (streamPipelineRun).
//
// The lock is stored on `globalThis` under a namespaced key, not a plain
// module-level `let`, so it survives Next dev's HMR module re-evaluation —
// a naive module-level flag resets to false on every hot-reloaded edit to
// this file, silently defeating the lock mid-development.

const LOCK_KEY = "__gsd_260806_ntm_pipeline_run_lock__";

interface PipelineLockState {
  locked: boolean;
}

function lockState(): PipelineLockState {
  const g = globalThis as unknown as Record<string, PipelineLockState | undefined>;
  if (!g[LOCK_KEY]) {
    g[LOCK_KEY] = { locked: false };
  }
  return g[LOCK_KEY]!;
}

/**
 * Attempts to acquire the single pipeline run lock. Returns false — never
 * throws — when a run is already in flight, so callers can respond with a
 * 409 rather than crash.
 */
export function acquirePipelineLock(): boolean {
  const state = lockState();
  if (state.locked) return false;
  state.locked = true;
  return true;
}

/** Releases the pipeline run lock. Safe to call even if never acquired. */
export function releasePipelineLock(): void {
  lockState().locked = false;
}
