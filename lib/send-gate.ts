/**
 * lib/send-gate.ts — Phase 8, D-05: the gate that refuses a send rather than
 * warning about it. evaluateSendGates() runs a fixed sequence of checks
 * against a real approved outreach_messages row and returns on the first
 * failure. CMP-02 (suppression) is checked here, at Prepare, against live
 * `suppressions` rows — never against anything cached at draft time. CMP-10
 * (Article 14 notice) is checked here too, and refuses a first-touch send
 * when the notice flag is not true or the notice text is not present in the
 * body.
 *
 * This module builds no legal content and asserts no legal value. It reads
 * `legal_regimes.legal_basis` and `.article_14_notice_approved` — both
 * counsel-supplied, both created unset by migration 020 — and refuses when
 * either is absent. It does not import lib/email.ts, Resend, or any mail
 * client: D-01 keeps the whole send path manual, and this file only ever
 * decides whether a human is allowed to proceed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { isSuppressed } from "@/lib/suppression";
import { ARTICLE_14_NOTICE_EN, ARTICLE_14_NOTICE_NL, localeForCountry, type Locale } from "@/lib/draft-prompt";
import { renderSendableBody } from "@/lib/opt-out-link";

/**
 * D-04: a Prepare from days ago must not be treated as still valid. Nothing
 * in this module enforces the TTL directly (that is a UI/queue concern for a
 * later plan) — this constant is the single documented source for it.
 */
export const PREPARED_TTL_MINUTES = 30;

export type SendGateRefusal =
  | "not-approved"
  | "already-sent"
  | "no-contact-email"
  | "contact-classification-unset"
  | "suppressed"
  | "no-legal-regime"
  | "legal-basis-unset"
  | "article-14-notice-not-approved"
  | "notice-missing-from-body";

export interface SendGateContext {
  messageId: string;
  prospectId: string;
  resolvedEmail: string;
  resolvedEmailType: "generic" | "named-person";
  locale: Locale;
  subject: string;
  draftBody: string;
  legalBasis: string;
  liaVersion: number;
  twExemptionClaimed: boolean;
  isFirstContact: boolean;
  firstContactNoticeIncluded: boolean;
  approvedBy: string;
  suppressionCheckedAt: string;
  suppressionHit: boolean;
}

export type SendGateResult =
  | { ok: true; context: SendGateContext }
  | { ok: false; refusal: SendGateRefusal; detail: string };

interface EmbeddedProspectForGate {
  id: string;
  country: string;
  contact_email: string | null;
  contact_email_type: string | null;
  commercial_contact_invited: boolean;
}

interface RawMessageForGate {
  id: string;
  prospect_id: string;
  status: string;
  draft_subject: string | null;
  draft_body: string | null;
  approved_by: string | null;
  prepared_at: string | null;
  prospects: EmbeddedProspectForGate | null;
}

/**
 * Runs every gate in a fixed order and returns on the first failure. Order
 * matters (T-08-01-02): suppression is checked before any legal-config read,
 * so a misconfigured legal_regimes row can never mask a suppression hit.
 */
export async function evaluateSendGates(sb: SupabaseClient, messageId: string): Promise<SendGateResult> {
  const { data: rawMessage, error: messageError } = await sb
    .from("outreach_messages")
    .select(
      `id, prospect_id, status, draft_subject, draft_body, approved_by, prepared_at,
       prospects ( id, country, contact_email, contact_email_type, commercial_contact_invited )`
    )
    .eq("id", messageId)
    .maybeSingle();
  if (messageError) throw messageError;
  const message = rawMessage as unknown as RawMessageForGate | null;

  // 1. Status must be exactly 'approved'.
  if (!message || message.status !== "approved") {
    return {
      ok: false,
      refusal: "not-approved",
      detail: `message status is ${message?.status ?? "missing"}, expected approved`,
    };
  }

  // 2. Any existing send_records row for this message is a repeat send.
  const { data: existingRecord, error: existingRecordError } = await sb
    .from("send_records")
    .select("id")
    .eq("outreach_message_id", messageId)
    .limit(1);
  if (existingRecordError) throw existingRecordError;
  if (existingRecord && existingRecord.length > 0) {
    return { ok: false, refusal: "already-sent", detail: "a send_records row already exists for this message" };
  }

  const prospect = message.prospects;
  if (!prospect) {
    return { ok: false, refusal: "no-contact-email", detail: "no prospect found for this message" };
  }

  // 3. contact_email must be non-null and non-empty.
  const resolvedEmail = prospect.contact_email;
  if (!resolvedEmail || !resolvedEmail.trim()) {
    return { ok: false, refusal: "no-contact-email", detail: "prospect has no contact_email" };
  }

  // 4. contact_email_type must be classified. A null classification cannot
  //    be recorded on send_records, so it fails closed rather than guessed.
  const resolvedEmailType = prospect.contact_email_type;
  if (resolvedEmailType !== "generic" && resolvedEmailType !== "named-person") {
    return {
      ok: false,
      refusal: "contact-classification-unset",
      detail: `contact_email_type is ${resolvedEmailType ?? "null"}, expected generic or named-person`,
    };
  }

  // 5. CMP-02: suppression checked here, against live state, never against
  //    anything cached at draft time.
  const suppressionCheckedAt = new Date().toISOString();
  const suppressionHit = await isSuppressed(sb, resolvedEmail);
  if (suppressionHit) {
    return { ok: false, refusal: "suppressed", detail: `${resolvedEmail} is on the suppression list` };
  }

  // 6. legal_regimes row for the prospect's country must exist.
  const { data: legalRegime, error: legalRegimeError } = await sb
    .from("legal_regimes")
    .select("legal_basis, article_14_notice_approved, current_lia_version")
    .eq("country_code", prospect.country)
    .maybeSingle();
  if (legalRegimeError) throw legalRegimeError;
  if (!legalRegime) {
    return { ok: false, refusal: "no-legal-regime", detail: `no legal_regimes row for country ${prospect.country}` };
  }

  // 7. legal_basis must be non-null and non-empty after trimming. This is
  //    the shipped-configuration refusal: migration 020 leaves the column
  //    NULL, so every Prepare attempt refuses here until counsel supplies a
  //    value as a data change.
  const legalBasis = ((legalRegime.legal_basis as string | null) ?? "").trim();
  if (!legalBasis) {
    return {
      ok: false,
      refusal: "legal-basis-unset",
      detail: `legal_regimes.legal_basis is unset for country ${prospect.country}`,
    };
  }

  // 8. CMP-10: a first-touch send needs the notice flag true and the notice
  //    text actually present in the draft body.
  const { count: priorSendCount, error: priorSendError } = await sb
    .from("send_records")
    .select("id", { count: "exact", head: true })
    .eq("prospect_id", prospect.id);
  if (priorSendError) throw priorSendError;
  const isFirstContact = (priorSendCount ?? 0) === 0;

  const locale = localeForCountry(prospect.country);
  const draftBody = message.draft_body ?? "";
  let firstContactNoticeIncluded = false;

  if (isFirstContact) {
    if (!legalRegime.article_14_notice_approved) {
      return {
        ok: false,
        refusal: "article-14-notice-not-approved",
        detail: `article_14_notice_approved is false for country ${prospect.country}`,
      };
    }
    const notice = locale === "nl" ? ARTICLE_14_NOTICE_NL : ARTICLE_14_NOTICE_EN;
    if (!draftBody.includes(notice)) {
      return {
        ok: false,
        refusal: "notice-missing-from-body",
        detail: "draft_body does not contain the Article 14 notice for this locale",
      };
    }
    firstContactNoticeIncluded = true;
  }

  const context: SendGateContext = {
    messageId: message.id,
    prospectId: prospect.id,
    resolvedEmail,
    resolvedEmailType,
    locale,
    subject: message.draft_subject ?? "",
    draftBody,
    legalBasis,
    liaVersion: legalRegime.current_lia_version as number,
    // No fallback, no inference (hard scope fence): this is exactly the
    // seeded prospects.commercial_contact_invited value, verbatim.
    twExemptionClaimed: prospect.commercial_contact_invited,
    isFirstContact,
    firstContactNoticeIncluded,
    approvedBy: message.approved_by ?? "",
    suppressionCheckedAt,
    suppressionHit,
  };

  return { ok: true, context };
}

/** Lowercase hex sha256 over `${subject}\n\n${body}`, used to fingerprint a prepared send. */
export function computePreparedHash(subject: string, body: string): string {
  return createHash("sha256").update(`${subject}\n\n${body}`).digest("hex");
}

export type PrepareSendResult =
  | { ok: true; subject: string; body: string; preparedHash: string; isFirstContact: boolean }
  | { ok: false; refusal: SendGateRefusal; detail: string };

/**
 * Runs every gate via evaluateSendGates(), and on success composes the
 * copyable subject/body, computes a fingerprint hash, and stamps
 * outreach_messages.prepared_at to now. D-04: there is no cached prepared
 * state — re-calling this re-runs every gate from scratch and overwrites
 * prepared_at, so a Prepare from days ago is never treated as still valid.
 */
export async function prepareSend(sb: SupabaseClient, messageId: string): Promise<PrepareSendResult> {
  const result = await evaluateSendGates(sb, messageId);
  if (!result.ok) return result;

  const { context } = result;
  const subject = context.subject;
  const body = renderSendableBody(context.draftBody, context.prospectId, context.locale);
  const preparedHash = computePreparedHash(subject, body);

  const { error: stampError } = await sb
    .from("outreach_messages")
    .update({ prepared_at: new Date().toISOString() })
    .eq("id", messageId);
  if (stampError) throw stampError;

  return { ok: true, subject, body, preparedHash, isFirstContact: context.isFirstContact };
}
