/**
 * lib/niche-profile/types.ts — Phase 9, NIC-01..NIC-04 (D-9-09, D-9-10, D-9-11).
 *
 * The shape of a niche profile. One profile holds every parameter the
 * engine reads, so changing country, locale, trade, competitor radius or
 * copy is a change to a profile and nothing else. The types are strict on
 * purpose: they turn rules that would otherwise live in review into compile
 * errors.
 *
 *   - A job value cannot exist without a citation (NIC-02, D-9-01, D-9-04):
 *     `citation` sits inside the `JobValue` union, so there is no way to
 *     write a value without one.
 *   - A midpoint value cannot shed its explanation (D-9-20): the
 *     "midpoint-of-range" member makes `citation.note` non-optional.
 *   - "Has a value" and "shows a money line" are two independent fields
 *     (D-9-21): `showMoneyLine` is required on every trade, so modelling the
 *     switch as `jobValue === undefined` is not possible. Central heating has
 *     a value AND shows no money line.
 *
 * Type-only file: no runtime statement, so importing it costs nothing.
 */

/** The six installer trades Phase 9 ships (D-9-03). A typo is a build error. */
export type TradeId =
  | "heat_pump"
  | "solar"
  | "bathroom"
  | "kitchen"
  | "roofing"
  | "central_heating";

/**
 * Locales a profile carries copy for. No exported `Locale` type exists in
 * this repo; a union rather than `string` means a typo in a locale key is a
 * build error (same reasoning as D-9-09's typed module).
 */
export type ProfileLocale = "nl" | "en";

/** Where a number came from. Printed in a prospect-facing report, so exact. */
export interface Citation {
  /** Who published it, e.g. "Milieu Centraal", "Homedeal". */
  source: string;
  /** https URL read on `readOn`. */
  url: string;
  /** The page's own last-updated date, as printed ("23/04/2026"). */
  pageUpdated?: string;
  /** ISO date the figure was read, "2026-11-12". */
  readOn: string;
  /** Free text. Required by the type when derivation is "midpoint-of-range". */
  note?: string;
}

/**
 * An approved default job value (D-9-01, D-9-02: the customer invoice total,
 * not the installer's margin). A discriminated union on `derivation`, so the
 * kitchen case cannot shed its explanation and a published figure carries no
 * range.
 */
export type JobValue =
  | {
      amountEur: number;
      derivation: "published";
      citation: Citation;
      /** ISO date after which the figure should be re-checked (D-9-18). */
      recheckAfter: string;
    }
  | {
      amountEur: number;
      derivation: "midpoint-of-range";
      /** The two endpoints of the published range the amount is the midpoint of. */
      range: readonly [number, number];
      /** The note is non-optional here and only here (D-9-20). */
      citation: Citation & { note: string };
      recheckAfter: string;
    };

/** How a keyword term is matched against normalised text (09-RESEARCH.md Pattern 6). */
export interface KeywordTerm {
  term: string;
  /** substring: long unique stems. prefix: word start (Dutch compounds). word: abbreviations. */
  match: "substring" | "prefix" | "word";
}

/** Per-trade terms for the own-site checks (ENG-05). */
export interface TradeSiteChecks {
  quoteTerms: readonly string[];
  projectTerms: readonly string[];
  certificationTerms: readonly string[];
}

/**
 * The social-proof section of the report (D-9-10, docs/report-copy.md section 4).
 * Every field is required and there is no index signature: a free-form record
 * would let a state go missing at runtime instead of at build time.
 */
export interface SocialProofCopy {
  heading: string;
  /** The sentence under the heading. */
  frame: string;
  /** No reviews on the prospect's site, and nearby installers show theirs. `{count}` is how many. */
  noneHereOthersDo: string;
  /**
   * No reviews on the prospect's site, and none of the nearby installers show
   * theirs either. This state exists because without it the report prints a
   * zero-count sentence claiming nearby businesses show reviews when none do
   * (settled decision 4). `{count}` is how many businesses were looked at.
   */
  noneHereNoneThere: string;
  /** Reviews are visible on the site but not in a form search engines can read. */
  visibleNotReadable: string;
  /** Reviews are visible and machine readable. `{n}` is how many. */
  visibleAndReadable: string;
}

/** The report header: eyebrow above the heading, the score line and the intro under it. */
export interface HeaderCopy {
  /** `{bedrijf}` and `{plaats}` in Dutch, `{business}` and `{city}` in English. */
  eyebrow: string;
  heading: string;
  /** `{score}` and `{gap}`. */
  scoreLine: string;
  intro: string;
}

/** Why a cold-email recipient is reading a page about their own company. */
export interface WhyYouGotThisCopy {
  heading: string;
  /** Two paragraphs in print order. A tuple, so the second cannot go missing. */
  body: readonly [string, string];
}

export interface BusinessFactsCopy {
  heading: string;
  frame: string;
  foundLabel: string;
  notFoundLabel: string;
}

/**
 * Competitors are described and never named (REP-05, settled decision 2).
 * No field here holds a name; `{count}` and the others are numbers filled by code.
 */
export interface CompetitorsCopy {
  heading: string;
  /** States the no-names rule in the copy itself. `{count}`. */
  frame: string;
  /** `{count}`, `{withProof}`, `{withData}` and `{rank}`. */
  standing: string;
}

export interface WebsiteOnPhoneCopy {
  heading: string;
  frame: string;
  /** Label and value joined, `{seconds}`. */
  loadTimeLine: string;
  /** Label and value joined, `{citation}`. A citation is required, never our own assertion. */
  citationLine: string;
}

export interface QuoteRequestCopy {
  heading: string;
  frame: string;
  checklist: {
    quoteForm: string;
    clickToCall: string;
    projectPhotos: string;
    certifications: string;
  };
}

/**
 * AI visibility reads as a frequency band, never as a score (AIV-04).
 * Other installers are counted and never named (REP-05).
 */
export interface AiVisibilityCopy {
  heading: string;
  /** `{date}`. */
  frame: string;
  /** `{question}` and `{hits}`. */
  perQuestionLine: string;
  /** `{others}`. A count, never a name (REP-05, settled decision 2). */
  othersNamedLine: string;
}

/**
 * The money-line template (D-9-21). It prints only for a trade whose
 * `showMoneyLine` is true, so central heating prints nothing. The copy carries
 * no price: no starting figure is anchored before the call (settled decision 3).
 */
export interface MoneyLineCopy {
  /** `{amount}`. */
  line: string;
  /** `{source}` and `{date}`. */
  provenance: string;
  followUp: string;
}

export interface TodoCopy {
  heading: string;
  ordering: string;
}

export interface AskCopy {
  heading: string;
  body: string;
  buttonLabel: string;
}

/** The footer: provenance, the one-step opt-out, and the Article 14 slot. */
export interface FooterCopy {
  /** `{bedrijf}` in Dutch, `{business}` in English, and `{date}`. */
  provenance: string;
  /** The opt-out has to be fast, free and one step (project legal constraint). */
  optOut: string;
  optOutLinkLabel: string;
  /** Label plus `{counsel_wording}`. No legal sentence exists yet, so the placeholder stays. */
  article14: string;
}

/** The report sections that carry an "Adashi fixes this" line. */
export type AdashiFixSection =
  | "businessFacts"
  | "socialProof"
  | "websiteOnPhone"
  | "quoteRequest"
  | "aiVisibility";

/**
 * Report copy the profile owns (D-9-10). The public scanner's own UI copy stays in messages/*.json.
 *
 * One field per report section, in the order of docs/report-copy.md, which is
 * the approved source. Phase 12 owns the report and may reshape these fields;
 * the names follow the document's sections so the mapping stays readable.
 */
export interface ProfileCopy {
  header: HeaderCopy;
  whyYouGotThis: WhyYouGotThisCopy;
  businessFacts: BusinessFactsCopy;
  /** The social-proof section, one required string per state. */
  socialProof: SocialProofCopy;
  competitors: CompetitorsCopy;
  websiteOnPhone: WebsiteOnPhoneCopy;
  quoteRequest: QuoteRequestCopy;
  aiVisibility: AiVisibilityCopy;
  moneyLine: MoneyLineCopy;
  todo: TodoCopy;
  ask: AskCopy;
  footer: FooterCopy;
  /** "Adashi fixes this" line, one required key per section that carries one. */
  adashiFixes: Readonly<Record<AdashiFixSection, string>>;
  /**
   * The to-do item texts (D-9-10). Empty today: the approved document gives the
   * to-do heading and its ordering line, not the five items. An empty field is
   * the honest state, the same call D-9-24 made for `aiQuestions`.
   */
  tips: Readonly<Partial<Record<AdashiFixSection, string>>>;
}

export interface TradeProfile {
  id: TradeId;
  /** Optional per D-9-04: no approved value means no money line. */
  jobValue?: JobValue;
  /** D-9-21: independent of whether `jobValue` is present. Required. */
  showMoneyLine: boolean;
  /** Wording a report MUST carry for this trade (D-9-20: solar names its 8-panel basis). */
  copyObligation?: string;
  /** Lower wins an exact score tie (heat pump 1 outranks central heating 6). */
  tieBreakRank: number;
  keywords: readonly KeywordTerm[];
  siteChecks: TradeSiteChecks;
  /** Templates read in Phase 10. Empty today: nothing in Phase 9 fires a question (D-9-24). */
  aiQuestions: Record<ProfileLocale, readonly string[]>;
}

export interface NicheProfile {
  id: "installers";
  /** ISO country code. Never hardcoded in engine files (NIC-03). */
  country: string;
  locales: readonly ProfileLocale[];
  defaultLocale: ProfileLocale;
  currency: "EUR";
  /** Positive Overture import list (D-9-11). Must not intersect EXCLUDED_CATEGORIES. */
  overtureCategories: readonly string[];
  /** Region keys for `--region=random`; each must resolve through resolveBbox. */
  regions: readonly string[];
  /** Phase 10 reads these; Phase 9 only holds them (D-9-23). */
  competitor: { radiusKm: number; maxCompetitors: number };
  trades: readonly TradeProfile[];
  /** Hostname fragments of review-widget platforms the own-site check looks for (ENG-02). */
  reviewWidgetHosts: readonly string[];
  copy: Record<ProfileLocale, ProfileCopy>;
  /** The two trade-scoring thresholds. Code counts matches, no model is involved (D-9-06). */
  scoring: { minTradeScore: number; dominanceRatio: number };
}
