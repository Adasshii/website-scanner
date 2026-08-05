/**
 * lib/opt-out-link.ts — SND-02, D-06: the one-step, fast, free opt-out link
 * that must live inside the copied message body.
 *
 * OPT_OUT_LABEL_EN and OPT_OUT_LABEL_NL are mechanical UI strings, not
 * Article 14 notice wording. They are deliberately one word plus a colon
 * (LEGAL.md §2.4's "snel"/"gratis" mechanics, nothing more) so they can
 * never be mistaken for legal prose — that text lives entirely in
 * lib/draft-prompt.ts's ARTICLE_14_NOTICE_EN / _NL and is out of bounds for
 * this file.
 *
 * The opt-out line is composed fresh at Prepare time (see
 * lib/send-gate.ts's prepareSend()) and is NEVER written into
 * outreach_messages.draft_body. The review panel's stripArticle14Notice
 * helper requires the persisted body to end with the notice; appending the
 * opt-out line after it in storage would silently break the Phase 6 edit
 * round-trip (a re-opened draft would show the opt-out line as editable
 * text, and saving it back would duplicate it on the next Prepare).
 *
 * Pure module: no Supabase client, no fetch, no environment reads. The one
 * dependency is lib/unsubscribe-token.ts's signUnsubscribeToken(), which
 * encodes only the prospect id (a UUID), never the email address — so this
 * module, and the URL it builds, never carries a contact address into a
 * mail client, a Referrer header, or a link-prefetch request.
 */
import { signUnsubscribeToken } from "@/lib/unsubscribe-token";
import type { Locale } from "@/lib/draft-prompt";

/**
 * Matches lib/draft-generator.ts's REPORT_BASE_URL reasoning: the link must
 * point at production regardless of which preview environment rendered it.
 * Unlike that constant, this one is a bare literal with no env-var fallback
 * — this module must carry zero client-exposed environment-variable names.
 */
const UNSUBSCRIBE_BASE_URL = "https://scan.adashi.io";

/**
 * Builds the one-click unsubscribe URL for a prospect. The token carries
 * only the prospect id (signUnsubscribeToken's payload), so the URL itself
 * leaks no PII into logs, Referrer headers, or mail-client link prefetch.
 */
export function buildUnsubscribeUrl(prospectId: string): string {
  const token = signUnsubscribeToken(prospectId);
  return `${UNSUBSCRIBE_BASE_URL}/api/unsubscribe/${token}`;
}

export const OPT_OUT_LABEL_EN = "Unsubscribe";
export const OPT_OUT_LABEL_NL = "Afmelden";

/** `"Unsubscribe: {url}"` (en) or `"Afmelden: {url}"` (nl). */
export function buildOptOutLine(prospectId: string, locale: Locale): string {
  const label = locale === "nl" ? OPT_OUT_LABEL_NL : OPT_OUT_LABEL_EN;
  return `${label}: ${buildUnsubscribeUrl(prospectId)}`;
}

/**
 * The draft body, right-trimmed, then a blank line, then the opt-out line.
 * Idempotent: re-running this on its own output returns that output
 * unchanged, because the opt-out line is a deterministic function of
 * (prospectId, locale) — the same suffix check appendArticle14Notice uses
 * for the notice it never disturbs, since the opt-out line always lands
 * strictly after whatever the draft body already ends with.
 */
export function renderSendableBody(draftBody: string, prospectId: string, locale: Locale): string {
  const trimmedBody = draftBody.trimEnd();
  const optOutLine = buildOptOutLine(prospectId, locale);
  if (trimmedBody.endsWith(optOutLine)) return trimmedBody;
  return `${trimmedBody}\n\n${optOutLine}`;
}
