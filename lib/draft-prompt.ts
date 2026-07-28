/**
 * lib/draft-prompt.ts — D-6-10: the versioned record of the Prospect Radar
 * cold-outreach pitch. The tone brief, the DRA-04 helpful-not-insulting
 * guardrails, and the Article 14 legal notice text all live in this one
 * reviewable file, so `git log` on this path is the record of how the pitch
 * evolved as real reply rates come in. Future per-country variants hang off
 * this same file.
 *
 * Legal note: ARTICLE_14_NOTICE_EN and ARTICLE_14_NOTICE_NL are drafted from
 * docs/legal/lia/LIA-v1.md §4's eight required disclosure elements, and
 * inherit that document's "DRAFT — pending counsel review" status. Neither
 * LIA-v1 nor this app has a hosted, linkable URL yet — a hosted LIA/privacy
 * page is an open Phase 8 dependency (see 06-03-SUMMARY.md), so the notices
 * point the reader at the controller contact address instead of a URL.
 *
 * Pure module: no Supabase client, no fetch, no environment reads. The
 * builder here composes text only — it never calls Gemini itself
 * (that is lib/draft-generator.ts, 06-04).
 */
import type { CitableMetric } from "@/lib/draft-metric-selector";

export type Locale = "en" | "nl";

// ── D-6-09: country -> locale ───────────────────────────────────────────

/**
 * A named tunable constant in the EXCLUDED_CATEGORIES / TRIAGE_USER_AGENT
 * tradition (lib/triage-constants.ts) — deliberately not a database table
 * for a lookup with only two possible outputs.
 */
export const COUNTRY_LOCALE_MAP: Record<string, Locale> = {
  NL: "nl",
};

/** Case-insensitive; anything unmapped or nullish defaults to "en". */
export function localeForCountry(country: string | null | undefined): Locale {
  if (!country) return "en";
  return COUNTRY_LOCALE_MAP[country.toUpperCase()] ?? "en";
}

// ── D-6-10 / DRA-04: tone brief ─────────────────────────────────────────

/**
 * Layered on top of the same voice rules scanner-service/src/ai.ts already
 * enforces (VOICE_DIRECTIVE) — the banned-word list below is copied from
 * that constant rather than invented fresh, so the two prompts do not drift
 * on wording that already works.
 */
export const TONE_BRIEF = `TONE — write as one specific person, Joshua from Adashi, writing directly to one specific person at the business being addressed. This is cold outreach: name what the scan measured on the reader's own site, never judge the business or its owner. Never imply the reader is incompetent, that the site is embarrassing, or that they should feel bad about it. Offer the hosted scan report as evidence the reader can check for themselves, not as a threat or an ultimatum. Keep the message under roughly 150 words. No em dashes: use commas, colons, or periods instead. No marketing filler, no exclamation marks, no bullet lists: plain sentences only. No closing hard sell, no "act now", no artificial urgency.

NEVER use these words or phrases: delve, tapestry, realm, landscape (metaphorical), journey (metaphorical), testament, cornerstone, bedrock, pivotal, underscore (as verb), showcase, meticulous, intricate, enduring, bolster, foster, garner, vibrant, robust, enhance, highlight (meaning emphasize), crucial, transformative, groundbreaking, innovative, cutting-edge, state-of-the-art, seamless, multifaceted, nuanced (without substance), comprehensive (as filler), significant (as filler), substantial (as filler), unprecedented, unparalleled, leverage (as verb)
- truly, certainly, absolutely, undoubtedly, remarkably, incredibly, particularly, especially, indeed
- "It is worth noting that", "It is important to note that", "Notably", "Importantly", "In today's fast-paced/digital world", "At the end of the day"
- "exciting", "powerful", "industry-leading", "world-class", "best-in-class", "game-changing"
- Filler transitions: Additionally, Furthermore, Moreover, Nevertheless, Consequently, In conclusion, To summarize, Moving forward
- Vague attribution: "some say", "many believe", "experts suggest". Either name the source or own the claim.
- Hollow framing: "reflecting the broader trend of", "underscoring the importance of", "a milestone in"`;

// ── D-6-12 / DRA-05: Article 14 notice, drafted from LIA-v1 §4 ─────────

/**
 * Mirrors lib/email.ts's FROM_EMAIL default. That constant is not exported
 * and reads process.env, and this module must stay a pure function of its
 * inputs (no environment reads) — so the literal is duplicated here rather
 * than imported.
 */
const CONTROLLER_CONTACT_EMAIL = "scan@adashi.io";

export const ARTICLE_14_NOTICE_EN = `This message is sent by Adashi (Joshua Annan), reachable at ${CONTROLLER_CONTACT_EMAIL}. We are contacting you because a scan of your own public website identified specific issues we believe are worth fixing, and this email evaluates and pitches that work to your business. We process your business contact email, and where only a named-person address was published, that name, on the basis of our legitimate interest in reaching businesses whose own websites show room for improvement. The source of this data is your business's own public website. This message passes through our email-delivery provider, acting as a data processor. We keep this data only for as long as it takes to complete this outreach and any resulting engagement; outreach that goes nowhere is deleted after a limited retention period. You can object to this processing at any time, and you have the right to access, rectify, or erase your data, and to lodge a complaint with your national data protection supervisory authority. Reply to this address to exercise any of these rights or to request the underlying legitimate-interest assessment.`;

export const ARTICLE_14_NOTICE_NL = `Dit bericht wordt verstuurd door Adashi (Joshua Annan), te bereiken via ${CONTROLLER_CONTACT_EMAIL}. Wij nemen contact met u op omdat een scan van uw eigen openbare website specifieke punten heeft blootgelegd die naar onze mening de moeite waard zijn om aan te pakken, en deze e-mail evalueert en biedt dat werk aan uw bedrijf aan. Wij verwerken uw zakelijke contact e-mailadres, en indien alleen een naamgebonden adres gepubliceerd was, die naam, op basis van ons gerechtvaardigd belang om bedrijven te bereiken waarvan de eigen website ruimte voor verbetering laat zien. De bron van deze gegevens is de eigen openbare website van uw bedrijf. Dit bericht loopt via onze e-maildienstverlener, die optreedt als verwerker. Wij bewaren deze gegevens alleen zolang nodig is om deze outreach en een eventueel vervolgtraject af te ronden; outreach zonder resultaat wordt na een beperkte bewaartermijn verwijderd. U kunt te allen tijde bezwaar maken tegen deze verwerking en u heeft het recht op inzage, rectificatie of verwijdering van uw gegevens, en het recht om een klacht in te dienen bij uw nationale toezichthoudende autoriteit voor gegevensbescherming. Antwoord op dit adres om een van deze rechten uit te oefenen of om de onderliggende belangenafweging op te vragen.`;

/**
 * Joins body and the locale's notice with a blank-line separator.
 * Idempotent: returns body unchanged if it already ends with that notice,
 * so a second call never duplicates it (D-6-12).
 */
export function appendArticle14Notice(body: string, locale: Locale): string {
  const notice = locale === "nl" ? ARTICLE_14_NOTICE_NL : ARTICLE_14_NOTICE_EN;
  if (body.endsWith(notice)) return body;
  return `${body}\n\n${notice}`;
}

// ── Prompt + subject builders ────────────────────────────────────────────

export interface DraftPromptInput {
  businessName: string;
  domain: string;
  locale: Locale;
  /** The DRA-02 evidence number, chosen by lib/draft-metric-selector.ts. */
  metric: CitableMetric;
  /** The consolidated verdict string from lib/scoring.ts's computeVerdict(). */
  verdict: string;
  /** Resolved by the caller (lib/i18n-helpers.ts) — this module never reads scans.issues_alt directly. */
  topIssueTitles: string[];
  reportUrl: string;
}

const LANGUAGE_DIRECTIVE_NL = `LANGUAGE: Respond entirely in natural Dutch (Nederlands). Use clear, direct business Dutch, no jargon, no Anglicisms where a Dutch word fits naturally. Do not translate "Adashi" or other brand names.`;

/**
 * Composes, in order: the tone brief, the Dutch language directive (nl
 * only), the business context, the required figure with an instruction to
 * reproduce it exactly, the report URL, and the output contract. Never
 * includes the Article 14 notice text — that is appended by code after
 * generation (D-6-12), never requested from the model.
 */
export function buildDraftPrompt(input: DraftPromptInput): string {
  const { businessName, domain, locale, metric, verdict, topIssueTitles, reportUrl } = input;
  const languageDirective = locale === "nl" ? `\n\n${LANGUAGE_DIRECTIVE_NL}` : "";
  const issuesList = topIssueTitles.length > 0 ? topIssueTitles.join("; ") : "(none listed)";

  return `${TONE_BRIEF}${languageDirective}

BUSINESS CONTEXT: You are writing to ${businessName} (${domain}). A scan of their website produced this verdict: "${verdict}". The top issues found: ${issuesList}.

REQUIRED FIGURE: ${metric.displayText}. You must reproduce this exact figure, "${metric.displayValue}", character for character somewhere in the message. Never round it, restate it in different units, or paraphrase the number away.

REPORT LINK: Include this exact URL exactly once in the message, so the reader can verify every claim themselves: ${reportUrl}

OUTPUT CONTRACT: Write the plain text body of the email only. No subject line, no markdown formatting, no greeting placeholder tokens like "[Name]". Do not write any privacy notice, legal disclosure, data-source explanation, or unsubscribe instructions of your own: that text is added afterward by the system, and writing your own would duplicate or contradict it.`;
}

/**
 * Code template, no model call. RESEARCH open question 2: templating the
 * subject line keeps the verbatim-figure problem confined to the body.
 */
export function buildDraftSubject(domain: string, locale: Locale): string {
  return locale === "nl" ? `Snelle observatie over ${domain}` : `A quick observation about ${domain}`;
}
