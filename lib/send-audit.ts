/**
 * lib/send-audit.ts — Phase 8, CMP-12: getSendAudit() answers "why were we
 * allowed to email this business?" for a single prospect, read entirely
 * from `send_records`.
 *
 * One query and no join is the design, not a shortcut. Every value CMP-12
 * needs was denormalised onto the record at mark time (lib/send-record.ts's
 * markAsSent(), reading a fresh lib/send-gate.ts context) precisely so the
 * answer cannot drift when the prospect row, the draft text, or the regime
 * config change afterwards. Adding an embedded select against another table
 * here would reintroduce exactly the drift the immutable record exists to
 * prevent — the record is the answer, not a pointer to one.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SendAuditEntry {
  sendRecordId: string;
  outreachMessageId: string;
  prospectId: string;
  sentAt: string;
  resolvedEmail: string;
  resolvedEmailType: "generic" | "named-person";
  subjectSent: string;
  bodySent: string;
  legalBasis: string;
  liaVersion: number;
  twExemptionClaimed: boolean;
  firstContactNoticeIncluded: boolean;
  isFirstContact: boolean;
  approvedBy: string;
  suppressionCheckedAt: string;
  suppressionHit: boolean;
}

interface RawSendRecord {
  id: string;
  outreach_message_id: string;
  prospect_id: string;
  sent_at: string;
  resolved_email: string;
  resolved_email_type: string;
  subject_sent: string;
  body_sent: string;
  legal_basis: string;
  lia_version: number;
  tw_exemption_claimed: boolean;
  first_contact_notice_included: boolean;
  is_first_contact: boolean;
  approved_by: string;
  suppression_checked_at: string;
  suppression_hit: boolean;
}

/**
 * Every `send_records` row for `prospectId`, newest first by `sent_at`.
 * Returns an empty array for a prospect with no send record — never null,
 * never a thrown error, so a caller can render the empty case directly.
 */
export async function getSendAudit(sb: SupabaseClient, prospectId: string): Promise<SendAuditEntry[]> {
  const { data, error } = await sb.from("send_records")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("sent_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as RawSendRecord[];

  return rows.map((row) => ({
    sendRecordId: row.id,
    outreachMessageId: row.outreach_message_id,
    prospectId: row.prospect_id,
    sentAt: row.sent_at,
    resolvedEmail: row.resolved_email,
    resolvedEmailType: row.resolved_email_type as "generic" | "named-person",
    subjectSent: row.subject_sent,
    bodySent: row.body_sent,
    legalBasis: row.legal_basis,
    liaVersion: row.lia_version,
    twExemptionClaimed: row.tw_exemption_claimed,
    firstContactNoticeIncluded: row.first_contact_notice_included,
    isFirstContact: row.is_first_contact,
    approvedBy: row.approved_by,
    suppressionCheckedAt: row.suppression_checked_at,
    suppressionHit: row.suppression_hit,
  }));
}
