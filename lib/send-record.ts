/**
 * lib/send-record.ts — Phase 8, D-03/D-05: markAsSent(), the second and
 * final step of the two-step send flow. Prepare (lib/send-gate.ts) renders
 * the copyable subject/body and stamps `prepared_at`; this module writes
 * the immutable per-send audit record and never runs before a human has
 * actually acted on the prepared draft.
 *
 * Every field written to `send_records` is read here, fresh, from a second
 * `evaluateSendGates()` call — never from the request body, and never
 * carried over from whatever Prepare returned. This is the CMP-02
 * re-check: suppression state that changed between Prepare and Mark still
 * refuses here, at Mark, where it counts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateSendGates,
  isPreparedFresh,
  computePreparedHash,
  PREPARED_TTL_MINUTES,
  type SendGateRefusal,
} from "@/lib/send-gate";
import { renderSendableBody } from "@/lib/opt-out-link";

export type MarkRefusal = "not-prepared" | "prepare-stale" | "prepared-content-changed" | "status-update-failed";

export type MarkAsSentResult =
  | { ok: true; sendRecordId: string }
  | { ok: false; refusal: SendGateRefusal | MarkRefusal; detail: string };

interface RawMessageForMark {
  prepared_at: string | null;
}

/**
 * Runs this sequence and returns on the first failure:
 *
 * 1. Read `prepared_at`. Null (or the message not found at all) refuses
 *    with `not-prepared` — nothing can be marked that was never prepared.
 * 2. `isPreparedFresh()` against `PREPARED_TTL_MINUTES`. A Prepare from
 *    days ago is not still valid; stale refuses with `prepare-stale`.
 * 3. `evaluateSendGates()` again, in full. Any refusal it returns is
 *    propagated verbatim — this call's suppression lookup, taken at Mark
 *    time, is what lands on the record, never Prepare's.
 * 4. Recompose the message server-side from the fresh gate context. The
 *    request body contributes no message text at all.
 * 5. Recompute the hash over the recomposed subject/body and compare it to
 *    the caller's `preparedHash`. A mismatch means the draft changed after
 *    Prepare, and refuses with `prepared-content-changed` rather than
 *    recording text the operator never actually saw.
 * 6. Insert one `send_records` row from the fresh context plus the
 *    recomposed subject/body. A unique-violation (Postgres 23505) on
 *    `outreach_message_id` means a concurrent call already inserted first;
 *    translated to `already-sent` so a double click is a clean refusal,
 *    not a stack trace.
 * 7. Update `outreach_messages.status` to `sent` and stamp `sent_at`.
 */
export async function markAsSent(
  sb: SupabaseClient,
  messageId: string,
  preparedHash: string
): Promise<MarkAsSentResult> {
  // 1. A message that was never prepared cannot be marked sent.
  const { data: rawMessage, error: messageError } = await sb
    .from("outreach_messages")
    .select("prepared_at")
    .eq("id", messageId)
    .maybeSingle();
  if (messageError) throw messageError;
  const message = rawMessage as RawMessageForMark | null;
  if (!message || !message.prepared_at) {
    return { ok: false, refusal: "not-prepared", detail: "this message has not been prepared" };
  }

  // 2. D-04: a Prepare from days ago is not still valid.
  if (!isPreparedFresh(message.prepared_at)) {
    const ageMinutes = Math.floor((Date.now() - new Date(message.prepared_at).getTime()) / 60_000);
    return {
      ok: false,
      refusal: "prepare-stale",
      detail: `prepared ${ageMinutes} minute(s) ago, older than the ${PREPARED_TTL_MINUTES}-minute window; prepare again`,
    };
  }

  // 3. CMP-02: the whole gate is re-run at Mark, not trusted from Prepare.
  const gateResult = await evaluateSendGates(sb, messageId);
  if (!gateResult.ok) return gateResult;

  const { context } = gateResult;

  // 4. Recompose server-side. No message text, address, approver, or legal
  //    value is ever accepted from a caller.
  const subject = context.subject;
  const body = renderSendableBody(context.draftBody, context.prospectId, context.locale);

  // 5. The draft the operator copied must be the draft this record claims.
  const freshHash = computePreparedHash(subject, body);
  if (freshHash !== preparedHash) {
    return {
      ok: false,
      refusal: "prepared-content-changed",
      detail: "the draft changed after Prepare; prepare again before marking sent",
    };
  }

  // 6. The insert precedes the status update below and is never rolled
  //    back on a later failure: the send_records row is the legal truth of
  //    the send, the immutability trigger makes deleting it impossible by
  //    design, and the safe direction to fail is a written record beside a
  //    stale status — never an advanced status with no record. A row left
  //    in that state stays visible through the outreach queue's unresolved
  //    marker rather than disappearing.
  const { data: inserted, error: insertError } = await sb
    .from("send_records")
    .insert({
      outreach_message_id: context.messageId,
      prospect_id: context.prospectId,
      resolved_email: context.resolvedEmail,
      resolved_email_type: context.resolvedEmailType,
      subject_sent: subject,
      body_sent: body,
      legal_basis: context.legalBasis,
      lia_version: context.liaVersion,
      tw_exemption_claimed: context.twExemptionClaimed,
      first_contact_notice_included: context.firstContactNoticeIncluded,
      is_first_contact: context.isFirstContact,
      approved_by: context.approvedBy,
      suppression_checked_at: context.suppressionCheckedAt,
      suppression_hit: context.suppressionHit,
    })
    .select("id")
    .single();

  if (insertError) {
    // 23505 = unique_violation: a concurrent Mark won the race.
    if ((insertError as { code?: string }).code === "23505") {
      return { ok: false, refusal: "already-sent", detail: "a send_records row already exists for this message" };
    }
    throw insertError;
  }

  const sendRecordId = inserted!.id as string;

  // 7. Advance the message status. On failure the audit record already
  //    written above stands; only the status needs reconciling.
  const { error: statusError } = await sb
    .from("outreach_messages")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", messageId);
  if (statusError) {
    return {
      ok: false,
      refusal: "status-update-failed",
      detail: `send_records row ${sendRecordId} was written; only outreach_messages.status needs reconciling`,
    };
  }

  return { ok: true, sendRecordId };
}
