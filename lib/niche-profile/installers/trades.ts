/**
 * lib/niche-profile/installers/trades.ts — Phase 9, D-9-03 / D-9-18 / D-9-21.
 *
 * The seven installer trades with their approved job values, citations and
 * keyword terms. The numbers are copied from 09-JOB-VALUES.md (the first six
 * approved by Joshua on 2026-11-12, plumbing on 2026-11-16) and never
 * re-derived here; when a number changes,
 * that file changes first and this one follows. profile.test.ts asserts each
 * amount against a literal table written out in the test, so an edit here
 * without a matching edit there fails the build (T-9-04).
 *
 * The array order is not load-bearing: every consumer looks a trade up by its
 * `TradeId`, or sorts by `tieBreakRank`, never by index (D-9-07).
 *
 * KEYWORD TERMS ARE A SEED to be confirmed against the real list, matching how
 * EXCLUDED_CATEGORIES was seeded then confirmed (09-RESEARCH.md Pattern 6).
 * They carry the corrections measured on 53 real Dutch homepages rather than
 * the obvious guesses:
 *   - solar uses the stem `zonnepane` because the singular and the plural
 *     change vowel, so neither full form matches the other;
 *   - roofing matches `dak` by prefix because Dutch compounds put the head
 *     word last, and a real roofer scored zero on the compound `dakreparatie`
 *     before prefix matching;
 *   - central heating never carries the bare two-letter abbreviation for the
 *     boiler, because it also abbreviates a curriculum vitae on every
 *     vacancy block;
 *   - plumbing carries the full word for a plumber and never the bare
 *     four-letter stem that also names the metal, because a measured zinc and
 *     roof firm wrote that stem six times and is a genuine roofer;
 *   - the plumbing gutter term is a shortened stem, because the singular and
 *     the plural of the Dutch word for a roof gutter diverge after five
 *     letters, the same reason the solar term is shortened;
 *   - the plumbing leak term is shared in effect with roofing, which keeps its
 *     own prefix term untouched: a leak word is counted for both trades and the
 *     rest of the site decides, which is the honest reading of a word both
 *     trades really use.
 */
import type { TradeProfile } from "../types";
import { INSTALLERS_SITE_CHECKS } from "./checks";
import { EMPTY_AI_QUESTIONS } from "./categories";

const READ_ON = "2026-11-12";
// Re-check twelve months after the read date: the re-check 09-JOB-VALUES.md
// asks for, so a stale number becomes visible rather than silently wrong.
const RECHECK_AFTER = "2027-11-12"; // tunable default
// Second read, for plumbing (quick task 261116-rjk), added after the first six.
const PLUMBING_READ_ON = "2026-11-16";
const PLUMBING_RECHECK_AFTER = "2027-11-16"; // tunable default

export const INSTALLERS_TRADES: readonly TradeProfile[] = [
  {
    id: "heat_pump",
    // D-9-02: the value is what the customer pays the installer, so the
    // pre-subsidy invoice total. The ISDE subsidy is claimed back separately.
    jobValue: {
      amountEur: 12000,
      derivation: "published",
      recheckAfter: RECHECK_AFTER,
      citation: {
        source: "Milieu Centraal",
        url: "https://www.milieucentraal.nl/energie-besparen/duurzaam-verwarmen-en-koelen/welke-warmtepompen-zijn-er/",
        readOn: READ_ON,
        note: "all-electric air-to-water heat pump, 8 kW, energy label A+++, including VAT and installation, before the ISDE subsidy",
      },
    },
    showMoneyLine: true,
    tieBreakRank: 1, // heat pump outranks central heating on an exact tie (09-RESEARCH.md A7)
    keywords: [
      { term: "warmtepomp", match: "substring" },
      { term: "lucht water", match: "substring" },
      { term: "bodem water", match: "substring" },
      { term: "hybride warmtepomp", match: "substring" },
    ],
    siteChecks: INSTALLERS_SITE_CHECKS.heat_pump,
    aiQuestions: EMPTY_AI_QUESTIONS,
  },
  {
    id: "solar",
    jobValue: {
      amountEur: 3200,
      derivation: "published",
      recheckAfter: RECHECK_AFTER,
      citation: {
        source: "Milieu Centraal",
        url: "https://www.milieucentraal.nl/energie-besparen/zonnepanelen/zonnepanelen-kopen/",
        readOn: READ_ON,
        note: "a set of 8 panels, including installation and inverter; the page states its own price date, January 2026",
      },
    },
    showMoneyLine: true,
    // D-9-20: eight panels is a small set by current practice, so the number
    // must never be read as a claim about every job. A Phase 12 obligation.
    copyObligation:
      "The report copy for solar must name the basis of the figure: a set of 8 panels, including installation and inverter (Milieu Centraal, price January 2026).",
    tieBreakRank: 2,
    keywords: [
      { term: "zonnepane", match: "substring" },
      { term: "zonne energie", match: "substring" },
      { term: "omvormer", match: "substring" },
      { term: "thuisbatterij", match: "substring" },
    ],
    siteChecks: INSTALLERS_SITE_CHECKS.solar,
    aiQuestions: EMPTY_AI_QUESTIONS,
  },
  {
    id: "bathroom",
    jobValue: {
      amountEur: 7500,
      derivation: "published",
      recheckAfter: RECHECK_AFTER,
      citation: {
        source: "Homedeal",
        url: "https://www.homedeal.nl/badkamerspecialist/badkamer-renoveren-kosten/",
        pageUpdated: "23/04/2026",
        readOn: READ_ON,
        note: "the page's stated average for a bathroom renovation in the Netherlands",
      },
    },
    showMoneyLine: true,
    tieBreakRank: 3,
    keywords: [
      { term: "badkamer", match: "substring" },
      { term: "sanitair", match: "substring" },
      { term: "inloopdouche", match: "substring" },
    ],
    siteChecks: INSTALLERS_SITE_CHECKS.bathroom,
    aiQuestions: EMPTY_AI_QUESTIONS,
  },
  {
    id: "kitchen",
    // No source states 11000 outright, so the type forces the note (D-9-20).
    jobValue: {
      amountEur: 11000,
      derivation: "midpoint-of-range",
      range: [7000, 15000],
      recheckAfter: RECHECK_AFTER,
      citation: {
        source: "Homedeal",
        url: "https://www.homedeal.nl/keukenspecialist/keuken-prijzen/",
        pageUpdated: "05/01/2026",
        readOn: READ_ON,
        note: "midpoint of the 7.000 to 15.000 euro range Homedeal states for a new kitchen including fitting and appliances, page last updated 05/01/2026, read 2026-11-12",
      },
    },
    showMoneyLine: true,
    tieBreakRank: 4,
    keywords: [{ term: "keuken", match: "substring" }],
    siteChecks: INSTALLERS_SITE_CHECKS.kitchen,
    aiQuestions: EMPTY_AI_QUESTIONS,
  },
  {
    id: "roofing",
    jobValue: {
      amountEur: 5700,
      derivation: "published",
      recheckAfter: RECHECK_AFTER,
      citation: {
        source: "Homedeal",
        url: "https://www.homedeal.nl/dakbedekking/nieuw-dak-kosten/",
        pageUpdated: "22/06/2026",
        readOn: READ_ON,
        note: "the page's stated average for a complete new roof; roof size drives this trade more than finish does",
      },
    },
    showMoneyLine: true,
    tieBreakRank: 5,
    keywords: [
      { term: "dak", match: "prefix" },
      { term: "dakdekk", match: "prefix" },
      { term: "dakbedekking", match: "prefix" },
      { term: "bitumen", match: "substring" },
      { term: "epdm", match: "word" },
    ],
    siteChecks: INSTALLERS_SITE_CHECKS.roofing,
    aiQuestions: EMPTY_AI_QUESTIONS,
  },
  {
    id: "central_heating",
    // D-9-21: the value is known and approved, and it does not support the
    // "pays for itself with one extra job" claim, because a boiler swap at
    // 2100 does not clear an Adashi project. So this trade has a value AND
    // prints no money line. Two independent fields, never one switch.
    jobValue: {
      amountEur: 2100,
      derivation: "published",
      recheckAfter: RECHECK_AFTER,
      citation: {
        source: "Milieu Centraal",
        url: "https://www.milieucentraal.nl/energie-besparen/verwarmen-met-gas/cv-ketel-vervangen/",
        readOn: READ_ON,
        note: "a new boiler including installation, stated as the average",
      },
    },
    showMoneyLine: false,
    tieBreakRank: 6,
    keywords: [
      { term: "cv ketel", match: "prefix" },
      { term: "cv installatie", match: "prefix" },
      { term: "centrale verwarming", match: "substring" },
      { term: "hr ketel", match: "word" },
      { term: "gasketel", match: "substring" },
    ],
    siteChecks: INSTALLERS_SITE_CHECKS.central_heating,
    aiQuestions: EMPTY_AI_QUESTIONS,
  },
  {
    id: "plumbing",
    // D-9-21: the value is known and approved, and at 300 it does not support
    // the "pays for itself with one extra job" claim, so this trade has a value
    // AND prints no money line. Two independent fields, never one switch.
    // The second trade in that state, after central_heating.
    jobValue: {
      amountEur: 300,
      derivation: "published",
      recheckAfter: PLUMBING_RECHECK_AFTER,
      citation: {
        source: "Homedeal",
        url: "https://www.homedeal.nl/prijsgidsen/lekkage-opsporen-kosten/",
        readOn: PLUMBING_READ_ON,
        note: "leak detection, taken as the page's stated average: the page header gives an average of 300 with a minimum of 150 and a maximum of 500, but the same page's body states 200 to 400 and its FAQ 300 to 500, so the page disagrees with itself and 300 was taken because the page labels it the average; the page shows a publication date of 30/12/2025 rather than a last-updated label, which is why pageUpdated is absent",
      },
    },
    showMoneyLine: false,
    // Appended rather than inserted so no existing rank is renumbered. Last is
    // also the honest place: plumbing's vocabulary is the most likely of the
    // seven to appear incidentally on another trade's site, so on an exact tie
    // the other trade is the better read.
    tieBreakRank: 7,
    keywords: [
      { term: "loodgieter", match: "substring" },
      { term: "lekkage", match: "substring" },
      { term: "dakgo", match: "prefix" },
      { term: "waterleiding", match: "substring" },
    ],
    siteChecks: INSTALLERS_SITE_CHECKS.plumbing,
    aiQuestions: EMPTY_AI_QUESTIONS,
  },
];
