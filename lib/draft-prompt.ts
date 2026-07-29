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
1. Open with "Hi," alone on its own line, then a blank line, then the body starts.
2. One specific, true observation about their site. One finding, never several.
3. What it costs them, in plain terms: visitors leaving, enquiries not arriving, being hard to find.
4. Write the token [RAPPORT] once, at the point in the sentence where the report link belongs, as evidence they can check for themselves.
5. One low-friction ask: a short reply, or fifteen minutes. Offer, do not push.

TONE
Warm, direct, human. A helpful peer, not a salesperson. Confident and honest: say what the scan measured, never exaggerate. Never judge the business or its owner, never imply the reader is incompetent or should feel bad. Short sentences, one idea each. No em dashes: use commas, colons or periods. No exclamation marks, no bullet lists, no marketing filler, no artificial urgency, no closing hard sell. You are selling a website that brings them customers, not one that looks nice.

Never use: game-changing, cutting-edge, transform, unlock, boost, leverage, seamless, robust, comprehensive, delve, journey, landscape, showcase, crucial, truly, absolutely, "it is worth noting", "in today's digital world".

HARD LIMITS
- Body is 70 to 120 words.
- Use only the finding given below. Never invent one.
- Never promise rankings, revenue figures, or guarantees.
- Exactly one call to action.
- No greeting placeholders like [Name]. The one permitted placeholder token is [RAPPORT], written exactly once, where the report link belongs — never write a URL of your own, anywhere.
- No sign-off or signature: the system adds it.
- Do not write any privacy notice, legal disclosure, data-source explanation or unsubscribe text. The system appends that afterwards; yours would duplicate or contradict it.
- SUBJECT: write it for THIS business and THIS finding. At most six words, specific, no hype, no clickbait, naming the concrete thing found rather than a generic phrase. The EXAMPLE below shows length and register only — never reuse its subject wording; ten live generations copied it verbatim and that is the exact mistake this line exists to stop.`;

/**
 * Rendered with real literal values (2026-07-28 rewrite's worked example),
 * so the model sees shape, not a fill-in-the-blank template — the HARD
 * LIMITS above already forbid inventing findings, so this teaches form
 * only. Deliberately unrounded ("6.4" / "6,4") to model the verbatim-figure
 * rule rather than contradict it. No sign-off line: the system appends one.
 */
const EXAMPLE_EN = `EXAMPLE (illustrates length and register only — write your own subject, do not reuse this one)
SUBJECT: Your site is slow on mobile
BODY:
Hi,

I took a look at Van Dijk Physio. The largest image on your homepage takes 6.4 seconds to appear. Most mobile visitors leave after three seconds, so you are probably losing enquiries before anyone sees what you offer. I put the full findings together for you here: [RAPPORT]. If it looks useful, let me know and I will walk you through it in fifteen minutes. No obligation.`;

const EXAMPLE_NL = `EXAMPLE (illustreert lengte en register alleen — schrijf je eigen subject, hergebruik deze niet)
SUBJECT: Je site laadt traag op mobiel
BODY:
Hi,

Ik keek even naar Fysio Van Dijk. De grootste afbeelding op je homepage is pas na 6,4 seconden zichtbaar. De meeste bezoekers op mobiel haken na drie seconden af, dus je verliest waarschijnlijk aanvragen voordat iemand je aanbod ziet. Ik heb de volledige bevindingen voor je op een rij gezet: [RAPPORT]. Als het nuttig lijkt, laat het weten, dan loop ik er in een kwartier met je doorheen. Geen verplichting.`;

const OUTPUT_CONTRACT = `OUTPUT CONTRACT
Return exactly this shape and nothing else:
SUBJECT: one line, at most six words, specific, no hype, no clickbait, written for this business and this finding, not copied from the example
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
  /**
   * Kept on the input shape for caller convenience (draft-generator.ts
   * already has it in scope building this object) even though buildDraftPrompt
   * no longer puts it in the prompt text (code-owned link, 2026-07-28): the
   * model writes the [RAPPORT] token instead, and resolveReportLink() below
   * substitutes this same value back in after generation.
   */
  reportUrl: string;
}

const LANGUAGE_DIRECTIVE_NL = `LANGUAGE: Respond entirely in natural Dutch (Nederlands). Use clear, direct business Dutch, no jargon, no Anglicisms where a Dutch word fits naturally. Do not translate "Adashi" or other brand names.

REGISTER: Address the reader informally, as je / jij / jouw. Never use the formal u / uw / uzelf. A live generation drifted to formal "u" because only the worked example implied register; this directive makes it explicit.`;

/**
 * Composes, in order: the tone brief (ROLE/STRUCTURE/TONE/HARD LIMITS), the
 * Dutch language directive (nl only), the business context, the required
 * figure with an instruction to reproduce it exactly, the report URL, the
 * locale-selected worked example, and the output contract. Never includes
 * the Article 14 notice text — that is appended by code after generation
 * (D-6-12), never requested from the model.
 *
 * D-6-03 (Change C, 2026-07-28): names ONE finding, `topIssueTitles[0]`,
 * never a joined list — a laundry-list of issues was part of what made the
 * pitch read weak. `topIssueTitles` stays `string[]` and every caller stays
 * unchanged; only this one line narrows to the first entry. Omits the
 * finding sentence entirely when the array is empty, rather than emitting a
 * placeholder like "(none listed)".
 *
 * Code-owned link (2026-07-28): `input.reportUrl` is intentionally unused
 * here — the model never sees the real URL, only the [RAPPORT] token (see
 * REPORT LINK below). resolveReportLink() is what actually uses reportUrl,
 * after generation.
 */
export function buildDraftPrompt(input: DraftPromptInput): string {
  const { businessName, domain, locale, metric, verdict, topIssueTitles } = input;
  const languageDirective = locale === "nl" ? `\n\n${LANGUAGE_DIRECTIVE_NL}` : "";
  const topIssueLine =
    topIssueTitles.length > 0 ? `\nThe finding to write about: ${topIssueTitles[0]}.` : "";
  const example = locale === "nl" ? EXAMPLE_NL : EXAMPLE_EN;

  return `${TONE_BRIEF}${languageDirective}

BUSINESS CONTEXT
You are writing to ${businessName} (${domain}). The scan verdict: "${verdict}".${topIssueLine}

REQUIRED FIGURE
${metric.displayText}. Reproduce this exact figure, "${metric.displayValue}", character for character, somewhere in the body. Never round it, restate it in other units, or paraphrase the number away.

REPORT LINK
Do not write a URL of your own, anywhere in the body. Write the exact token [RAPPORT] once, at the point in the sentence where the link belongs. [RAPPORT] is the ONE permitted placeholder token; the system replaces it with the real link afterward.

${example}

${OUTPUT_CONTRACT}`;
}

/**
 * Code template fallback, no model call. Used directly by
 * parseDraftResponse() below whenever the model's own subject is missing or
 * implausible, and by callers that need a subject with no raw model output
 * at all.
 */
export function buildDraftSubject(domain: string, locale: Locale): string {
  return locale === "nl" ? `Snelle observatie over ${domain}` : `A quick observation about ${domain}`;
}

// ── D-6-04 (Change B, 2026-07-28): model-authored subject, code fallback ─

/** Longer than this reads as the model dumping prose into the subject line, not a real subject. */
const MAX_PLAUSIBLE_SUBJECT_LENGTH = 120;

const SUBJECT_LINE_RE = /^[ \t]*subject:[ \t]*(.*)$/im;
const BODY_LABEL_RE = /^[ \t]*body:[ \t]*\n?([\s\S]*)$/im;

/**
 * Parses the OUTPUT CONTRACT's `SUBJECT: <line>` / `BODY:\n<rest>` shape out
 * of a raw model response. Tolerant: case-insensitive labels, leading
 * whitespace/blank lines, and a body that spans many lines and may itself
 * contain colons.
 *
 * Subject and body are resolved INDEPENDENTLY of each other (fixed 2026-07-29
 * after ten live generations showed 3/6 valid model subjects discarded
 * because no BODY: label happened to be present — see 06-04-SUMMARY.md).
 * A `SUBJECT:` line that parses to a non-empty, plausible value is used
 * regardless of whether a `BODY:` label exists; it only falls back to
 * buildDraftSubject(domain, locale) when missing, empty, or implausible
 * (too long, or spanning multiple lines). The body never leaks that parsed
 * subject line: when no BODY: label is found, the body is the raw response
 * minus the matched SUBJECT: line; when neither label is found, the entire
 * raw response is the body. Pure: no I/O, never throws.
 */
export function parseDraftResponse(
  raw: string,
  domain: string,
  locale: Locale
): { subject: string; body: string } {
  const fallbackSubject = buildDraftSubject(domain, locale);
  const subjectMatch = raw.match(SUBJECT_LINE_RE);
  const bodyMatch = raw.match(BODY_LABEL_RE);

  const parsedSubject = subjectMatch ? subjectMatch[1].trim() : "";
  const isImplausible =
    parsedSubject.length === 0 ||
    parsedSubject.length > MAX_PLAUSIBLE_SUBJECT_LENGTH ||
    /\r|\n/.test(parsedSubject);
  const subject = isImplausible ? fallbackSubject : parsedSubject;

  if (!bodyMatch) {
    const body = subjectMatch
      ? raw.slice((subjectMatch.index ?? 0) + subjectMatch[0].length)
      : raw;
    return { subject, body: body.trim() };
  }

  return { subject, body: bodyMatch[1].trim() };
}

// ── Report-link resolution (2026-07-28 post-review revision) ────────────

/** The one placeholder token buildDraftPrompt's REPORT LINK section permits the model to write. */
const REPORT_LINK_TOKEN = "[RAPPORT]";

/** Matches any http(s) URL so a hallucinated or corrupted one can be stripped before it reaches a draft. */
const ANY_URL_RE = /https?:\/\/\S+/g;

/**
 * Placeholder used only inside resolveReportLink's own scope, never seen by
 * a model or a caller — protects the freshly substituted reportUrl from
 * ANY_URL_RE below, which (being a greedy \S+ match) would otherwise also
 * swallow trailing punctuation like the period after a URL and treat the
 * result as "some other URL" not equal to reportUrl.
 */
const REPORT_URL_SENTINEL = " RESOLVED_REPORT_URL ";

/**
 * DRA-03, code-owned link (2026-07-28): a live generation asked the model to
 * reproduce a 36-character UUID verbatim and it corrupted one character,
 * producing a dead link in the body plus a correct one appended by
 * draft-generator.ts's old repair path (now replaced by this function).
 * Asking any model to retype a UUID exactly will fail some percentage of
 * the time, so the model no longer handles the URL at all — buildDraftPrompt's
 * REPORT LINK section asks it to write the [RAPPORT] token instead.
 *
 * This function is the other half of that contract, in three steps:
 *   1. Substitute every [RAPPORT] token with a sentinel standing in for the
 *      real reportUrl (not the URL itself yet — see step 3).
 *   2. Strip any OTHER http(s) URL still present in the body: a hallucinated
 *      or corrupted link the model wrote despite the instruction.
 *   3. Swap the sentinel back for the real reportUrl, then — preserving
 *      DRA-03's original repair guarantee — append reportUrl once if it is
 *      still absent after all of the above.
 * The sentinel indirection in steps 1/3 (rather than substituting reportUrl
 * directly before stripping) exists because step 2's URL regex is greedy: it
 * would otherwise swallow trailing punctuation right after a freshly
 * substituted reportUrl and strip it as "some other URL". Pure: no I/O,
 * never throws.
 */
export function resolveReportLink(body: string, reportUrl: string): string {
  const withSentinel = body.split(REPORT_LINK_TOKEN).join(REPORT_URL_SENTINEL);
  const stripped = withSentinel.replace(ANY_URL_RE, "");
  const resolved = stripped.split(REPORT_URL_SENTINEL).join(reportUrl);
  if (resolved.includes(reportUrl)) return resolved;
  return `${resolved.trim()}\n\n${reportUrl}`;
}
