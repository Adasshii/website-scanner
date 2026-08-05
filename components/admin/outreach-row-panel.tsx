"use client";

import { useEffect, useRef, useState } from "react";
import type { OutreachQueueRow } from "@/lib/outreach-queue";
import { ARTICLE_14_NOTICE_EN, ARTICLE_14_NOTICE_NL, appendArticle14Notice } from "@/lib/draft-prompt";
// Deliberately not "@/lib/send-gate" — that module imports node:crypto
// (computePreparedHash's createHash), which fails Next.js's client-bundle
// webpack build. See lib/send-gate-constants.ts's header comment.
import { PREPARED_TTL_MINUTES } from "@/lib/send-gate-constants";

interface OutreachRowPanelProps {
  row: OutreachQueueRow;
  secret: string;
  onRefetch: () => void;
}

function noticeFor(locale: OutreachQueueRow["locale"]): string {
  return locale === "nl" ? ARTICLE_14_NOTICE_NL : ARTICLE_14_NOTICE_EN;
}

/**
 * Strips the trailing Article 14 notice that lib/draft-generator.ts's
 * appendArticle14Notice() attaches on every generation, so the editable
 * textarea below never shows it as editable text (D-6-12) — the notice
 * renders in its own read-only block instead. Reversed on save by
 * re-appending via the same exported helper, so the persisted draft_body
 * always carries the notice regardless of what the editor displayed.
 */
function stripArticle14Notice(body: string, locale: OutreachQueueRow["locale"]): string {
  const suffix = `\n\n${noticeFor(locale)}`;
  return body.endsWith(suffix) ? body.slice(0, -suffix.length) : body;
}

async function patchOutreach(
  secret: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/admin/outreach", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: typeof data.error === "string" ? data.error : undefined };
  } catch {
    return { ok: false, error: undefined };
  }
}

/**
 * Result shape from POST /api/admin/outreach/send `action: "prepare"`. A 409
 * gate refusal is not a fetch failure — `refusal` is read straight from the
 * response body and rendered into the same role="alert" banner every other
 * action uses. On success the route also returns the composed subject/body
 * and a preparedHash (D-02/D-03): this is what the copy block below renders
 * and what the Mark as sent action echoes back unchanged.
 */
async function prepareSend(
  secret: string,
  messageId: string
): Promise<{
  ok: boolean;
  refusal?: string;
  detail?: string;
  subject?: string;
  body?: string;
  preparedHash?: string;
  isFirstContact?: boolean;
}> {
  try {
    const res = await fetch("/api/admin/outreach/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify({ id: messageId, action: "prepare" }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      return {
        ok: true,
        subject: typeof data.subject === "string" ? data.subject : undefined,
        body: typeof data.body === "string" ? data.body : undefined,
        preparedHash: typeof data.preparedHash === "string" ? data.preparedHash : undefined,
        isFirstContact: typeof data.isFirstContact === "boolean" ? data.isFirstContact : undefined,
      };
    }
    return {
      ok: false,
      refusal: typeof data.refusal === "string" ? data.refusal : undefined,
      detail: typeof data.detail === "string" ? data.detail : undefined,
    };
  } catch {
    return { ok: false };
  }
}

/**
 * Result shape from POST /api/admin/outreach/send `action: "mark-sent"`
 * (D-03's second, distinct step) — same 409-refusal-in-body convention as
 * prepareSend above.
 */
async function markSent(
  secret: string,
  messageId: string,
  preparedHash: string
): Promise<{ ok: boolean; refusal?: string; detail?: string }> {
  try {
    const res = await fetch("/api/admin/outreach/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify({ id: messageId, action: "mark-sent", preparedHash }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) return { ok: true };
    return {
      ok: false,
      refusal: typeof data.refusal === "string" ? data.refusal : undefined,
      detail: typeof data.detail === "string" ? data.detail : undefined,
    };
  } catch {
    return { ok: false };
  }
}

/** Same shape the removed native dialogs used to build: "Failed to {action}[: {detail}]." */
function failureMessage(action: string, result: { error?: string }): string {
  return `Failed to ${action}${result.error ? `: ${result.error}` : ""}.`;
}

/**
 * Held between a successful Prepare and either a successful Mark as sent or
 * the panel losing this state (row change, unmount, or the mark itself).
 * preparedAtClient is a client-side display timestamp only — the value that
 * actually gates staleness is outreach_messages.prepared_at, read fresh by
 * markAsSent() on the server.
 */
interface PreparedState {
  subject: string;
  body: string;
  preparedHash: string;
  isFirstContact: boolean;
  preparedAtClient: Date;
}

/**
 * The expanded review panel (D-6-02): one draft, editable on the left with
 * scan evidence on the right. Every action here addresses row.id alone and
 * calls onRefetch() on success — there is no path from this component to any
 * other row (QUE-05).
 */
export function OutreachRowPanel({ row, secret, onRefetch }: OutreachRowPanelProps) {
  const [subject, setSubject] = useState(row.draftSubject ?? "");
  const [body, setBody] = useState(stripArticle14Notice(row.draftBody ?? "", row.locale));
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState<PreparedState | null>(null);
  const [marking, setMarking] = useState(false);
  // Transient "Copied" confirmation, cleared automatically and on unmount.
  const [copyStatus, setCopyStatus] = useState<{ field: "subject" | "body"; message: string } | null>(null);
  const copyStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subjectPreviewRef = useRef<HTMLInputElement>(null);
  const bodyPreviewRef = useRef<HTMLTextAreaElement>(null);
  // Rendered inline with role="alert", replacing the native dialogs these
  // actions used to call — the in-app browser suppresses those silently,
  // which is exactly what hid the GEMINI_API_KEY config failure behind an
  // apparently-dead Regenerate button. Component unmounts on collapse or
  // when a different row expands (OutreachTable renders this conditionally,
  // keyed per row), so this always starts cleared for a fresh row.
  const [actionError, setActionError] = useState<string | null>(null);

  // In-DOM replacement for the two window.confirm() calls this panel used to
  // make (regenerate-when-edited, reject). Only one of "regenerate" |
  // "reject" | null at a time — there is no second field to get out of sync,
  // so "only one confirmation open at once" is a type-level guarantee, not a
  // rule to remember. State is local to this component instance, which
  // OutreachTable unmounts on collapse and remounts fresh per row (Fragment
  // keyed by row.id, conditional render), so a confirmation always clears
  // when the row collapses or a different row expands (QUE-05).
  const [confirmAction, setConfirmAction] = useState<"regenerate" | "reject" | null>(null);
  const confirmDialogRef = useRef<HTMLDivElement>(null);

  // Re-sync the edit buffer whenever the underlying row changes (e.g. after
  // a successful regenerate, or a refetch following another action).
  useEffect(() => {
    setSubject(row.draftSubject ?? "");
    setBody(stripArticle14Notice(row.draftBody ?? "", row.locale));
  }, [row.id, row.draftSubject, row.draftBody, row.locale]);

  // Clear the prepared-send state whenever a different row's data arrives
  // under this instance. In practice OutreachTable remounts this component
  // fresh per expanded row (Fragment keyed by row.id), so this is a
  // defensive second guarantee alongside that natural remount.
  useEffect(() => {
    setPrepared(null);
    setCopyStatus(null);
  }, [row.id]);

  // Clear the pending "Copied" timeout on unmount so it never fires a state
  // update after this component is gone.
  useEffect(() => {
    return () => {
      if (copyStatusTimeoutRef.current) clearTimeout(copyStatusTimeoutRef.current);
    };
  }, []);

  // Move focus into the confirmation dialog the moment it renders, per the
  // accessibility requirement (focus moved in on open).
  useEffect(() => {
    if (confirmAction) confirmDialogRef.current?.focus();
  }, [confirmAction]);

  const strippedOriginalBody = stripArticle14Notice(row.draftBody ?? "", row.locale);
  const dirty = subject.trim() !== (row.draftSubject ?? "").trim() || body.trim() !== strippedOriginalBody.trim();

  async function handleSaveEdit() {
    setSaving(true);
    const fullBody = appendArticle14Notice(body.trim(), row.locale);
    const result = await patchOutreach(secret, {
      id: row.id,
      action: "edit",
      subject: subject.trim(),
      body: fullBody,
    });
    setSaving(false);
    if (result.ok) {
      setActionError(null);
      onRefetch();
    } else {
      setActionError(failureMessage("save edit", result));
    }
  }

  async function performRegenerate() {
    setRegenerating(true);
    const result = await patchOutreach(secret, { id: row.id, action: "regenerate" });
    setRegenerating(false);
    if (result.ok) {
      setActionError(null);
      onRefetch();
    } else {
      setActionError(failureMessage("regenerate draft", result));
    }
  }

  function handleRegenerate() {
    if (row.status === "edited") {
      setConfirmAction("regenerate");
      return;
    }
    void performRegenerate();
  }

  async function handleApprove() {
    setApproving(true);
    const result = await patchOutreach(secret, { id: row.id, action: "approve" });
    setApproving(false);
    if (result.ok) {
      setActionError(null);
      onRefetch();
    } else {
      setActionError(failureMessage("approve draft", result));
    }
  }

  async function performReject() {
    setRejecting(true);
    const result = await patchOutreach(secret, { id: row.id, action: "reject" });
    setRejecting(false);
    if (result.ok) {
      setActionError(null);
      onRefetch();
    } else {
      setActionError(failureMessage("reject prospect", result));
    }
  }

  function handleReject() {
    setConfirmAction("reject");
  }

  /**
   * On a 409 the refusal and detail render in the existing role="alert"
   * banner as `Send refused: {refusal}. {detail}`. On success (D-02, D-03)
   * the composed subject/body/preparedHash are held in `prepared` state and
   * the copy-and-mark block below renders — Prepare only reveals the copy
   * actions, it never marks anything sent itself.
   */
  async function handlePrepareSend() {
    setPreparing(true);
    const result = await prepareSend(secret, row.id);
    setPreparing(false);
    if (result.ok && result.subject !== undefined && result.body !== undefined && result.preparedHash !== undefined) {
      setActionError(null);
      setPrepared({
        subject: result.subject,
        body: result.body,
        preparedHash: result.preparedHash,
        isFirstContact: result.isFirstContact ?? false,
        preparedAtClient: new Date(),
      });
      onRefetch();
    } else if (result.refusal) {
      setActionError(`Send refused: ${result.refusal}.${result.detail ? ` ${result.detail}` : ""}`);
    } else {
      setActionError(failureMessage("prepare send", { error: result.detail }));
    }
  }

  /**
   * The distinct second step (D-03): POSTs the prepared subject/body's own
   * hash back, unmodified by anything the operator did in between. On
   * success the prepared block clears and onRefetch() picks up the new
   * `sent` status. A 409 here means the gate refused again at Mark time —
   * most commonly `suppressed` (CMP-02, a late suppression) or
   * `prepared-content-changed`/`prepare-stale` — rendered in the same
   * banner as every other refusal.
   */
  async function handleMarkSent() {
    if (!prepared) return;
    setMarking(true);
    const result = await markSent(secret, row.id, prepared.preparedHash);
    setMarking(false);
    if (result.ok) {
      setActionError(null);
      setPrepared(null);
      onRefetch();
    } else if (result.refusal) {
      setActionError(`Send refused: ${result.refusal}.${result.detail ? ` ${result.detail}` : ""}`);
    } else {
      setActionError(failureMessage("mark as sent", { error: result.detail }));
    }
  }

  function announceCopy(field: "subject" | "body", message: string) {
    setCopyStatus({ field, message });
    if (copyStatusTimeoutRef.current) clearTimeout(copyStatusTimeoutRef.current);
    copyStatusTimeoutRef.current = setTimeout(() => setCopyStatus(null), 3000);
  }

  /**
   * Two separate handlers (not one shared helper parameterized by field) so
   * each copy control has its own literal navigator.clipboard.writeText
   * call site — deliberate, not duplication for its own sake: it keeps
   * "copy subject" and "copy body" independently traceable in the source.
   * If navigator.clipboard is unavailable, selects the read-only preview's
   * text instead of failing silently — 06-07 banned the native alert dialog
   * from this codebase for exactly that kind of silent no-op.
   */
  async function handleCopySubject() {
    if (!prepared) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(prepared.subject);
        announceCopy("subject", "Copied");
        return;
      } catch {
        // Fall through to the manual-selection instruction below.
      }
    }
    subjectPreviewRef.current?.select();
    announceCopy("subject", "Clipboard unavailable — subject selected, copy manually (Cmd/Ctrl+C).");
  }

  async function handleCopyBody() {
    if (!prepared) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(prepared.body);
        announceCopy("body", "Copied");
        return;
      } catch {
        // Fall through to the manual-selection instruction below.
      }
    }
    bodyPreviewRef.current?.select();
    announceCopy("body", "Clipboard unavailable — body selected, copy manually (Cmd/Ctrl+C).");
  }

  function handleConfirmAction() {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === "regenerate") void performRegenerate();
    if (action === "reject") void performReject();
  }

  function handleCancelConfirm() {
    setConfirmAction(null);
  }

  const scoreColor =
    row.overallScore >= 80 ? "text-green-600" : row.overallScore >= 50 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
      {/* Left column: editable draft */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-adashi-blue outline-none"
        />

        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1 mt-3">
          Body
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-adashi-blue outline-none"
        />

        <div className="mt-3 border-l-4 border-gray-300 bg-gray-50 rounded-r-lg p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            GDPR ARTICLE 14 NOTICE
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Draft wording - pending counsel review</p>
          <p className="text-sm text-gray-600 mt-2">{noticeFor(row.locale)}</p>
        </div>

        {/*
         * D-02/D-03: revealed only after a successful Prepare. The body
         * preview is the exact text that will be recorded on Mark as sent
         * (opt-out line included) — copy controls come before the mark
         * control, and marking is never combined with copying into one
         * action, per the plan's explicit either/or instruction.
         */}
        {prepared && (
          <div className="mt-3 border-l-4 border-adashi-blue bg-blue-50/40 rounded-r-lg p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-adashi-gulf">Ready to send</p>
            <p className="text-xs text-gray-500 mt-0.5">
              This is the exact text that will be recorded as sent, opt-out line included.
            </p>

            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1 mt-3">
              Subject (exact text that will be recorded)
            </label>
            <input
              ref={subjectPreviewRef}
              type="text"
              readOnly
              value={prepared.subject}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
            />

            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1 mt-3">
              Body (exact text that will be recorded)
            </label>
            <textarea
              ref={bodyPreviewRef}
              readOnly
              value={prepared.body}
              rows={10}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
            />

            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={handleCopySubject}
                className="text-sm font-medium text-adashi-blue hover:underline"
              >
                Copy subject
              </button>
              <button onClick={handleCopyBody} className="text-sm font-medium text-adashi-blue hover:underline">
                Copy body
              </button>
              {copyStatus && (
                <span role="status" className="text-xs text-gray-500">
                  {copyStatus.message}
                </span>
              )}
            </div>

            <p className="text-xs text-gray-500 mt-3">
              Prepared {prepared.preparedAtClient.toLocaleTimeString()}. A Prepare expires after{" "}
              {PREPARED_TTL_MINUTES} minutes — mark as sent before then, or prepare again.
            </p>

            <div className="mt-3 pt-3 border-t border-blue-100">
              <p className="text-xs text-gray-600 mb-2">
                Marking as sent records that this message was sent and cannot be undone.
              </p>
              <button
                onClick={handleMarkSent}
                disabled={marking}
                className="bg-adashi-gulf hover:bg-adashi-blue text-white font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
              >
                {marking ? "Marking as sent..." : "Mark as sent"}
              </button>
            </div>
          </div>
        )}

        {/* Inline failure state (replaces the four native dialogs these
            actions used to call) — same banner style app/admin/page.tsx's
            top-level error uses. */}
        {actionError && (
          <div role="alert" className="mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {actionError}
          </div>
        )}

        {/* In-DOM confirmation, replacing the two remaining window.confirm()
            calls (regenerate-when-edited, reject). Styled as the reject
            variant (red, matching the destructive button below) or the
            regenerate variant (neutral gray, reusing the Article 14 block's
            border-l-4/bg-gray-50 treatment) so the destructive action reads
            as visually distinct per D-6-15 / the UI spec's reject-vs-delete
            note. Copy is carried over verbatim from the removed
            window.confirm() strings. */}
        {confirmAction && (
          <div
            ref={confirmDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="outreach-confirm-title"
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === "Escape") handleCancelConfirm();
            }}
            className={`mt-3 rounded-r-lg border-l-4 px-4 py-3 text-sm outline-none ${
              confirmAction === "reject"
                ? "border-red-600 bg-red-50 text-red-700"
                : "border-gray-300 bg-gray-50 text-gray-700"
            }`}
          >
            <p id="outreach-confirm-title" className="font-medium">
              {confirmAction === "regenerate"
                ? "Regenerate this draft? Your edits will be overwritten and lost."
                : `Reject ${row.domain}? They will not receive another draft unless you regenerate one manually. This does not add them to the suppression list.`}
            </p>
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={handleConfirmAction}
                className={`font-semibold px-3 py-1.5 rounded-lg text-sm transition-colors text-white ${
                  confirmAction === "reject"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-adashi-blue hover:bg-adashi-science"
                }`}
              >
                {confirmAction === "reject" ? "Reject prospect" : "Regenerate"}
              </button>
              <button
                onClick={handleCancelConfirm}
                className="text-sm font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mt-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveEdit}
              disabled={!dirty || saving}
              className="bg-adashi-blue hover:bg-adashi-science text-white font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save edit"}
            </button>
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="text-sm text-adashi-blue hover:underline font-medium disabled:opacity-50"
            >
              {regenerating ? "Regenerating..." : "Regenerate"}
            </button>
          </div>
          <div className="flex items-center gap-3">
            {row.status === "approved" && (
              <button
                onClick={handlePrepareSend}
                disabled={preparing}
                className="bg-adashi-gulf hover:bg-adashi-blue text-white font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
              >
                {preparing ? "Preparing..." : "Prepare send"}
              </button>
            )}
            <button
              onClick={handleApprove}
              disabled={approving}
              className="bg-adashi-blue hover:bg-adashi-science text-white font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
            >
              {approving ? "Approving..." : "Approve draft"}
            </button>
            <button
              onClick={handleReject}
              disabled={rejecting}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
            >
              {rejecting ? "Rejecting..." : "Reject prospect"}
            </button>
          </div>
        </div>
      </div>

      {/* Right column: evidence pane (QUE-04) */}
      <div>
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold ${scoreColor}`}>{row.overallScore}</span>
          <span className="text-xs text-gray-400 uppercase tracking-wider">Overall score</span>
        </div>

        <p className="text-sm text-gray-700 mt-2">{row.verdict}</p>

        <div className="flex gap-4 mt-4 text-sm">
          <div>
            <span className="font-bold text-red-600">{row.criticalIssues}</span>{" "}
            <span className="text-gray-500">critical</span>
          </div>
          <div>
            <span className="font-bold text-yellow-600">{row.majorIssues}</span>{" "}
            <span className="text-gray-500">major</span>
          </div>
        </div>

        {row.topIssueTitles.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Top issues</p>
            <ul className="mt-1 space-y-1 text-sm text-gray-600 list-disc list-inside">
              {row.topIssueTitles.map((title, i) => (
                <li key={i}>{title}</li>
              ))}
            </ul>
          </div>
        )}

        {/*
         * D-6-03/D-6-11 cited-number highlight: the textarea to the left
         * cannot carry inline markup, so the shared highlight token is
         * applied here instead (not inside a read-only body preview),
         * labeled as the figure the draft is required to contain. Joshua
         * verifies by reading this figure, then confirming the same number
         * appears both in the draft body's plain text above and in the
         * linked report (Task 3 check 4) — one highlighted anchor is enough
         * to drive that comparison.
         */}
        {row.citedMetric && (
          <div className="mt-4 text-sm text-gray-600">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
              Figure the draft must contain
            </p>
            <span className="bg-adashi-electric/30 rounded px-1 font-semibold text-adashi-gulf">
              {row.citedMetric.displayValue}
            </span>{" "}
            {row.citedMetric.displayText}
          </div>
        )}

        <a
          href={row.reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-adashi-blue hover:underline text-sm font-medium mt-4 inline-block"
        >
          View full report ↗
        </a>
      </div>
    </div>
  );
}
