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
 * Post-review revision (2026-07-28): Joshua read the first real generated
 * drafts and judged the pitch weak. The prior TONE_BRIEF was prohibition-
 * heavy (a banned-word list and a length ceiling) with no stated goal, no
 * worked example, and no explained cost to the reader for ignoring the
 * email. buildDraftPrompt() was rewritten to a ROLE / STRUCTURE / TONE /
 * HARD LIMITS / EXAMPLE / OUTPUT CONTRACT shape, and the model now authors
 * its own subject line (parsed by parseDraftResponse(), with a
 * buildDraftSubject() fallback) instead of always receiving a templated
 * one. See 06-03-SUMMARY.md and 06-04-SUMMARY.md Deviations for the full
 * record.
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
 * ROLE + STRUCTURE + TONE + HARD LIMITS: the fixed, input-independent part
 * of the prompt (2026-07-28 post-review rewrite). Kept as one exported
 * constant, as before, so a caller (and this file's own tests) can still
 * assert its exact text is present verbatim in the composed prompt.
 */
export const TONE_BRIEF = `ROLE
You are Joshua, founder of Adashi, a web design and automation studio. You are writing one short cold email to one business owner, based on a scan of their own website. Your only goal is to earn a reply or a short call. Never try to close the sale in the email.

STRUCTURE — plain sentences in this order, no headings, no lists
1. One specific, true observation about their site. One finding, never several.
2. What it costs them, in plain terms: visitors leaving, enquiries not arriving, being hard to find.
3. The report link, once, as evidence they can check for themselves.
4. One low-friction ask: a short reply, or fifteen minutes. Offer, do not push.

TONE
Warm, direct, human. A helpful peer, not a salesperson. Confident and honest: say what the scan measured, never exaggerate. Never judge the business or its owner, never imply the reader is incompetent or should feel bad. Short sentences, one idea each. No em dashes: use commas, colons or periods. No exclamation marks, no bullet lists, no marketing filler, no artificial urgency, no closing hard sell. You are selling a website that brings them customers, not one that looks nice.

Never use: game-changing, cutting-edge, transform, unlock, boost, leverage, seamless, robust, comprehensive, delve, journey, landscape, showcase, crucial, truly, absolutely, "it is worth noting", "in today's digital world".

HARD LIMITS
- Body is 70 to 120 words.
- Use only the finding given below. Never invent one.
- Never promise rankings, revenue figures, or guarantees.
- Exactly one call to action.
- No greeting placeholders like [Name]. No sign-off or signature: the system adds it.
- Do not write any privacy notice, legal disclosure, data-source explanation or unsubscribe text. The system appends that afterwards; yours would duplicate or contradict it.`;

/**
 * Rendered with real literal values (2026-07-28 rewrite's worked example),
 * so the model sees shape, not a fill-in-the-blank template — the HARD
 * LIMITS above already forbid inventing findings, so this teaches form
 * only. Deliberately unrounded ("6.4" / "6,4") to model the verbatim-figure
 * rule rather than contradict it. No sign-off line: the system appends one.
 */
const EXAMPLE_EN = `EXAMPLE
SUBJECT: Your site is slow on mobile
BODY:
Hi, I took a look at Van Dijk Physio. The largest image on your homepage takes 6.4 seconds to appear. Most mobile visitors leave after three seconds, so you are probably losing enquiries before anyone sees what you offer. I put the full findings together for you here: https://scan.adashi.io/report/a1b2c3. If it looks useful, let me know and I will walk you through it in fifteen minutes. No obligation.`;

const EXAMPLE_NL = `EXAMPLE
SUBJECT: Je site laadt traag op mobiel
BODY:
Hoi, ik keek even naar Fysio Van Dijk. De grootste afbeelding op je homepage is pas na 6,4 seconden zichtbaar. De meeste bezoekers op mobiel haken na drie seconden af, dus je verliest waarschijnlijk aanvragen voordat iemand je aanbod ziet. Ik heb de volledige bevindingen voor je op een rij gezet: https://scan.adashi.io/report/a1b2c3. Als het nuttig lijkt, laat het weten, dan loop ik er in een kwartier met je doorheen. Geen verplichting.`;

const OUTPUT_CONTRACT = `OUTPUT CONTRACT
Return exactly this shape and nothing else:
SUBJECT: one line, at most six words, specific, no hype, no clickbait
BODY:
the body text`;

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
 * Composes, in order: the tone brief (ROLE/STRUCTURE/TONE/HARD LIMITS), the
 * Dutch language directive (nl only), the business context, the required
 * figure with an instruction to reproduce it exactly, the report URL, the
 * locale-selected worked example, and the output contract. Never includes
 * the Article 14 notice text — that is appended by code after generation
 * (D-6-12), never requested from the model.
 */
export function buildDraftPrompt(input: DraftPromptInput): string {
  const { businessName, domain, locale, metric, verdict, topIssueTitles, reportUrl } = input;
  const languageDirective = locale === "nl" ? `\n\n${LANGUAGE_DIRECTIVE_NL}` : "";
  const issuesList = topIssueTitles.length > 0 ? topIssueTitles.join("; ") : "(none listed)";
  const topIssueLine = `\nThe finding to write about: ${issuesList}.`;
  const example = locale === "nl" ? EXAMPLE_NL : EXAMPLE_EN;

  return `${TONE_BRIEF}${languageDirective}

BUSINESS CONTEXT
You are writing to ${businessName} (${domain}). The scan verdict: "${verdict}".${topIssueLine}

REQUIRED FIGURE
${metric.displayText}. Reproduce this exact figure, "${metric.displayValue}", character for character, somewhere in the body. Never round it, restate it in other units, or paraphrase the number away.

REPORT LINK
Include this exact URL once: ${reportUrl}

${example}

${OUTPUT_CONTRACT}`;
}

/**
 * Code template, no model call. RESEARCH open question 2: templating the
 * subject line keeps the verbatim-figure problem confined to the body.
 */
export function buildDraftSubject(domain: string, locale: Locale): string {
  return locale === "nl" ? `Snelle observatie over ${domain}` : `A quick observation about ${domain}`;
}
