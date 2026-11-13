/**
 * lib/niche-profile/installers/checks.ts — Phase 9, ENG-05 / ENG-02 seeds.
 *
 * Per-trade terms for the own-site checks, and the review widget host list.
 * Every list here is a SEED to be confirmed against the real list, the same
 * way EXCLUDED_CATEGORIES was seeded and then confirmed. The measured
 * evidence lives in 09-RESEARCH.md Pattern 5 and Pattern 6 (53 real Dutch
 * homepages, scratch prototype, 2026-11-12).
 *
 * Certification terms carry the MEASURED result, not the raw candidate list.
 * Three candidates were measured as noise that matches nearly every footer
 * and are deliberately absent: the chamber-of-commerce number, the bare word
 * meaning "recognised", and the three-letter international-standard acronym.
 * One more, a four-letter code, matched only inside unrelated words in raw
 * HTML and was entirely noise on visible text. Do not add them back without
 * re-measuring.
 */
import type { TradeId, TradeSiteChecks } from "../types";

// ── Terms shared by every trade ────────────────────────────────────
// 30 of 53 sampled pages carried one of the quote terms; 34 of 53 carried a
// project term. Both are signals, not proof (09-RESEARCH.md Pattern 5).
const QUOTE_TERMS = ["offerte", "prijsopgave", "afspraak", "vrijblijvend"] as const;
const PROJECT_TERMS = ["projecten", "portfolio", "realisaties", "referenties", "ons werk"] as const;

// ── Certification terms ────────────────────────────────────────────
// Energy trades have authoritative schemes (confirmed to exist as certifying
// or industry bodies, 09-RESEARCH.md Pattern 5). The InstallQ solar scheme
// was still a draft concept in the copy found, so the term only proves a
// mention, not a held certificate.
const GENERIC_CERTIFICATION_TERMS = ["keurmerk", "gecertificeerd", "gecertificeerde"] as const;
const ENERGY_BASE_TERMS = ["installq", "techniek nederland"] as const;

// Roofing, bathroom and kitchen: two searches found no authoritative scheme,
// only directory listings, so they carry the generic terms alone. [ASSUMED]
// until sampled on the real list.
export const INSTALLERS_SITE_CHECKS: Readonly<Record<TradeId, TradeSiteChecks>> = {
  heat_pump: {
    quoteTerms: QUOTE_TERMS,
    projectTerms: PROJECT_TERMS,
    certificationTerms: [...ENERGY_BASE_TERMS, "f-gas"],
  },
  solar: {
    quoteTerms: QUOTE_TERMS,
    projectTerms: PROJECT_TERMS,
    certificationTerms: [...ENERGY_BASE_TERMS, "zonnekeur", "holland solar"],
  },
  central_heating: {
    quoteTerms: QUOTE_TERMS,
    projectTerms: PROJECT_TERMS,
    certificationTerms: [...ENERGY_BASE_TERMS],
  },
  roofing: {
    quoteTerms: QUOTE_TERMS,
    projectTerms: PROJECT_TERMS,
    certificationTerms: GENERIC_CERTIFICATION_TERMS,
  },
  bathroom: {
    quoteTerms: QUOTE_TERMS,
    projectTerms: PROJECT_TERMS,
    certificationTerms: GENERIC_CERTIFICATION_TERMS,
  },
  kitchen: {
    quoteTerms: QUOTE_TERMS,
    projectTerms: PROJECT_TERMS,
    certificationTerms: GENERIC_CERTIFICATION_TERMS,
  },
};

// ── Review widget hosts (ENG-02) ───────────────────────────────────
// Hostname fragments of review platforms embedded on a business's own site.
// The first three were observed in the 53-site sample; the last two are
// added as known Dutch platforms. Seed, to be confirmed.
export const REVIEW_WIDGET_HOSTS: readonly string[] = [
  "klantenvertellen",
  "trustpilot",
  "trustindex",
  "kiyoh",
  "feedbackcompany",
];
