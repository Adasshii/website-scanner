// Pure gate-then-weighted triage score (TRI-06, D-01). Operates ONLY on
// TriageSignals from lib/triage-fetch.ts — never lib/scoring.ts, which
// operates on PageResult[] from a full Playwright scan and is the exact
// coupling trap CONTEXT.md forbids for triage.
import type { TriageSignals, TriageScore } from "@/types/triage";
import {
  VIEWPORT_MISSING_DEDUCTION,
  REDIRECT_HOPS_HIGH_THRESHOLD,
  REDIRECT_HOPS_HIGH_DEDUCTION,
  REDIRECT_HOPS_LOW_THRESHOLD,
  REDIRECT_HOPS_LOW_DEDUCTION,
  PAGE_WEIGHT_HIGH_BYTES,
  PAGE_WEIGHT_HIGH_DEDUCTION,
  PAGE_WEIGHT_LOW_BYTES,
  PAGE_WEIGHT_LOW_DEDUCTION,
  RESPONSE_TIME_HIGH_MS,
  RESPONSE_TIME_HIGH_DEDUCTION,
  RESPONSE_TIME_LOW_MS,
  RESPONSE_TIME_LOW_DEDUCTION,
} from "@/lib/triage-constants";

/**
 * Deterministic, monotonic, gate-dominant score over one prospect's raw
 * triage signals.
 *
 * Gate (D-01, Pitfall 1): `gated = !reachable || !https` is stored as an
 * explicit boolean, never folded into the numeric score — ranking sorts
 * `gated DESC, score ASC`, so a gated prospect always tops the worst-first
 * list regardless of its (still-computed, for display) numeric score.
 *
 * SPA blind spot: `hasViewport` is a raw-HTML regex check (lib/triage-
 * fetch.ts's VIEWPORT_RE). A client-rendered site that injects its viewport
 * meta tag via JS after hydration scores `hasViewport: false` here even
 * though a real browser would find it — an inherent no-browser limitation
 * (TRI-01 forbids a browser), not a scoring bug.
 */
export function computeTriageScore(signals: TriageSignals): TriageScore {
  const gated = !signals.reachable || !signals.https;

  let score = 100;

  if (!signals.hasViewport) {
    score -= VIEWPORT_MISSING_DEDUCTION;
  }

  const hops = Math.max(signals.redirectChain.length - 1, 0);
  if (hops >= REDIRECT_HOPS_HIGH_THRESHOLD) {
    score -= REDIRECT_HOPS_HIGH_DEDUCTION;
  } else if (hops >= REDIRECT_HOPS_LOW_THRESHOLD) {
    score -= REDIRECT_HOPS_LOW_DEDUCTION;
  }

  const bytes = signals.bytes ?? 0;
  if (signals.truncated || bytes > PAGE_WEIGHT_HIGH_BYTES) {
    score -= PAGE_WEIGHT_HIGH_DEDUCTION;
  } else if (bytes > PAGE_WEIGHT_LOW_BYTES) {
    score -= PAGE_WEIGHT_LOW_DEDUCTION;
  }

  const responseMs = signals.responseMs ?? 0;
  if (responseMs > RESPONSE_TIME_HIGH_MS) {
    score -= RESPONSE_TIME_HIGH_DEDUCTION;
  } else if (responseMs > RESPONSE_TIME_LOW_MS) {
    score -= RESPONSE_TIME_LOW_DEDUCTION;
  }

  score = Math.max(0, Math.min(100, score));

  return { ...signals, score, gated };
}
