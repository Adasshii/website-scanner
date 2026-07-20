// Shared triage type contract (Phase 3). Every downstream triage module
// (fetch, scorer, candidates, release, CLI script, admin API/UI) imports
// these — do not redefine them elsewhere (D-02).

/** Raw fetch-derived signals for one prospect's homepage (TRI-02..05). */
export interface TriageSignals {
  reachable: boolean;
  https: boolean;
  finalStatus: number | null;
  redirectChain: Array<{ url: string; status: number }>;
  hasViewport: boolean;
  bytes: number | null;
  truncated: boolean;
  responseMs: number | null;
  robotsBlocked: boolean;
  /** Set when the D-01 gate fires before a fetch was even attempted. */
  gateReason: "unreachable" | "no-https" | null;
}

/**
 * TriageSignals plus the computed verdict (TRI-06). Stored verbatim in
 * prospects.triage_score (jsonb) — D-02: the score AND every raw signal.
 *
 * Score direction: 0-100, LOWER = worse (mirrors lib/scoring.ts's existing
 * convention, but this is a separate, browserless scorer — never import
 * lib/scoring.ts here, it operates on PageResult[] from a full scan).
 *
 * D-01 gate rule: gated = !reachable || !https. A gated prospect's score is
 * still computed for display consistency, but ranking sorts gated DESC
 * ahead of score ASC — the gate is a boolean short-circuit, never folded
 * into the numeric score (Pitfall 1).
 */
export interface TriageScore extends TriageSignals {
  score: number;
  gated: boolean;
}
