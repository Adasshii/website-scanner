"use client";

import { useEffect, useState } from "react";
import type { OutreachQueueRow } from "@/lib/outreach-queue";
import { ARTICLE_14_NOTICE_EN, ARTICLE_14_NOTICE_NL, appendArticle14Notice } from "@/lib/draft-prompt";

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

  // Re-sync the edit buffer whenever the underlying row changes (e.g. after
  // a successful regenerate, or a refetch following another action).
  useEffect(() => {
    setSubject(row.draftSubject ?? "");
    setBody(stripArticle14Notice(row.draftBody ?? "", row.locale));
  }, [row.id, row.draftSubject, row.draftBody, row.locale]);

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
    if (result.ok) onRefetch();
    else alert(`Failed to save edit${result.error ? `: ${result.error}` : ""}.`);
  }

  async function handleRegenerate() {
    if (row.status === "edited") {
      const confirmed = window.confirm("Regenerate this draft? Your edits will be overwritten and lost.");
      if (!confirmed) return;
    }
    setRegenerating(true);
    const result = await patchOutreach(secret, { id: row.id, action: "regenerate" });
    setRegenerating(false);
    if (result.ok) onRefetch();
    else alert(`Failed to regenerate draft${result.error ? `: ${result.error}` : ""}.`);
  }

  async function handleApprove() {
    setApproving(true);
    const result = await patchOutreach(secret, { id: row.id, action: "approve" });
    setApproving(false);
    if (result.ok) onRefetch();
    else alert(`Failed to approve draft${result.error ? `: ${result.error}` : ""}.`);
  }

  async function handleReject() {
    const confirmed = window.confirm(
      `Reject ${row.domain}? They will not receive another draft unless you regenerate one manually. This does not add them to the suppression list.`
    );
    if (!confirmed) return;
    setRejecting(true);
    const result = await patchOutreach(secret, { id: row.id, action: "reject" });
    setRejecting(false);
    if (result.ok) onRefetch();
    else alert(`Failed to reject prospect${result.error ? `: ${result.error}` : ""}.`);
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
