"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { EmailStatusGroup } from "@/components/admin/email-status-badge";
import { CutoffSlider } from "@/components/admin/cutoff-slider";
import { ShortlistTable } from "@/components/admin/shortlist-table";
import { ReleaseButton } from "@/components/admin/release-button";
import type { ShortlistRow } from "@/lib/triage-candidates";
import { DEFAULT_CUTOFF } from "@/lib/triage-constants";

interface Stats {
  totalScans: number;
  scansToday: number;
  scansThisWeek: number;
  totalLeads: number;
  leadsThisWeek: number;
  completedScans: number;
  failedScans: number;
  averageScore: number | null;
  averageScoreThisWeek: number | null;
  conversionRate: number;
  conversionRateThisWeek: number;
}

interface ScanRow {
  id: string;
  url: string;
  domain: string;
  type: string;
  status: string;
  scores: { overall: number } | null;
  email: string | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}

interface LeadRow {
  id: string;
  email: string;
  domain: string;
  scan_id: string | null;
  source: string;
  gdpr_consent: boolean;
  created_at: string;
  score: number | null;
  scanStatus: string | null;
  emailStatuses: Array<{ email_type: string; status: string }>;
}

type Tab = "scans" | "leads" | "shortlist";

export default function AdminPage() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<(ScanRow | LeadRow)[]>([]);
  const [tab, setTab] = useState<Tab>("scans");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [keepaliveLoading, setKeepaliveLoading] = useState(false);
  const [keepaliveStatus, setKeepaliveStatus] = useState<"idle" | "ok" | "error">("idle");
  const [shortlistRows, setShortlistRows] = useState<ShortlistRow[]>([]);
  const [shortlistLoading, setShortlistLoading] = useState(false);
  const [cutoff, setCutoff] = useState(DEFAULT_CUTOFF);

  // Restore secret from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem("admin_secret");
    if (stored) {
      setSecret(stored);
      setAuthenticated(true);
    }
  }, []);

  const fetchData = useCallback(
    async (t: Tab, p: number) => {
      setLoading(true);
      setError("");

      try {
        const res = await fetch(`/api/admin/stats?tab=${t}&page=${p}`, {
          headers: { "x-admin-secret": secret },
        });

        if (!res.ok) {
          if (res.status === 401) {
            setAuthenticated(false);
            setError("Invalid admin secret.");
          } else {
            const body = await res.json().catch(() => ({}));
            setError(`Failed to fetch data${body.detail ? `: ${body.detail}` : ""}.`);
          }
          setLoading(false);
          return;
        }

        const data = await res.json();
        setStats(data.stats);
        setRows(data.rows);
        setTotalPages(data.totalPages);
        setAuthenticated(true);
        sessionStorage.setItem("admin_secret", secret);
      } catch {
        setError("Could not connect to server.");
      } finally {
        setLoading(false);
      }
    },
    [secret]
  );

  const fetchShortlist = useCallback(async () => {
    setShortlistLoading(true);
    try {
      const res = await fetch("/api/admin/shortlist", {
        headers: { "x-admin-secret": secret },
      });
      if (res.ok) {
        const data = await res.json();
        setShortlistRows(data.rows);
        setAuthenticated(true);
        sessionStorage.setItem("admin_secret", secret);
      } else if (res.status === 401) {
        setAuthenticated(false);
        setError("Invalid admin secret.");
      }
    } catch {
      setError("Could not connect to server.");
    } finally {
      setShortlistLoading(false);
    }
  }, [secret]);

  useEffect(() => {
    if (!authenticated) return;
    if (tab === "shortlist") {
      fetchShortlist();
    } else {
      fetchData(tab, page);
    }
  }, [authenticated, tab, page, fetchData, fetchShortlist]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    fetchData(tab, 1);
  }

  function handleTabChange(t: Tab) {
    setTab(t);
    setPage(1);
  }

  async function handleKeepalive() {
    setKeepaliveLoading(true);
    setKeepaliveStatus("idle");
    try {
      const res = await fetch("/api/admin/trigger-keepalive", {
        method: "POST",
        headers: { "x-admin-secret": secret },
      });
      setKeepaliveStatus(res.ok ? "ok" : "error");
    } catch {
      setKeepaliveStatus("error");
    } finally {
      setKeepaliveLoading(false);
    }
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <form
          onSubmit={handleLogin}
          className="bg-white rounded-2xl shadow-card p-8 w-full max-w-sm"
        >
          <h1 className="font-display text-2xl text-adashi-gulf mb-6 text-center">
            Admin Dashboard
          </h1>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Admin secret"
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-adashi-blue outline-none mb-4"
            autoFocus
          />
          <button
            type="submit"
            disabled={!secret.trim() || loading}
            className="w-full bg-adashi-blue hover:bg-adashi-science text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? "Checking..." : "Sign in"}
          </button>
          {error && (
            <p className="mt-3 text-sm text-red-500 text-center">{error}</p>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-adashi-gulf text-white px-6 py-4 flex items-center justify-between">
        <h1 className="font-display text-xl">Adashi Admin</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handleKeepalive}
              disabled={keepaliveLoading}
              className="text-sm text-adashi-pastel hover:text-white transition-colors disabled:opacity-50"
            >
              {keepaliveLoading ? "Pinging..." : "Ping DB"}
            </button>
            {keepaliveStatus === "ok" && (
              <span className="text-xs text-green-400">DB OK</span>
            )}
            {keepaliveStatus === "error" && (
              <span className="text-xs text-red-400">Failed</span>
            )}
          </div>
          <button
            onClick={() => {
              setAuthenticated(false);
              setSecret("");
              sessionStorage.removeItem("admin_secret");
            }}
            className="text-sm text-adashi-pastel hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total scans" value={stats.totalScans} />
            <StatCard label="Scans today" value={stats.scansToday} />
            <StatCard label="This week" value={stats.scansThisWeek} />
            <StatCard
              label="Completed"
              value={stats.completedScans}
              sub={`${stats.failedScans} failed`}
            />
            <StatCard label="Total leads" value={stats.totalLeads} highlight />
            <StatCard label="Leads this week" value={stats.leadsThisWeek} highlight />
            <StatCard
              label="Conversion"
              value={`${stats.conversionRate}%`}
              sub={`${stats.conversionRateThisWeek}% this week`}
            />
            <StatCard
              label="Avg score"
              value={stats.averageScore ?? "-"}
              sub={stats.averageScoreThisWeek ? `${stats.averageScoreThisWeek} this week` : undefined}
            />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 shadow-sm w-fit">
          <TabButton
            active={tab === "scans"}
            onClick={() => handleTabChange("scans")}
          >
            Scans
          </TabButton>
          <TabButton
            active={tab === "leads"}
            onClick={() => handleTabChange("leads")}
          >
            Leads
          </TabButton>
          <TabButton
            active={tab === "shortlist"}
            onClick={() => handleTabChange("shortlist")}
          >
            Shortlist
          </TabButton>
        </div>

        {/* Table */}
        {tab === "shortlist" ? (
          <ShortlistTab
            rows={shortlistRows}
            loading={shortlistLoading}
            cutoff={cutoff}
            setCutoff={setCutoff}
            secret={secret}
            onReleased={fetchShortlist}
          />
        ) : (
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-gray-400">Loading...</div>
            ) : tab === "scans" ? (
              <ScansTable rows={rows as ScanRow[]} secret={secret} onDelete={() => fetchData(tab, page)} />
            ) : (
              <LeadsTable rows={rows as LeadRow[]} secret={secret} router={router} onDelete={() => fetchData(tab, page)} />
            )}
          </div>
        )}

        {/* Pagination */}
        {tab !== "shortlist" && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg text-sm bg-white shadow-sm disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg text-sm bg-white shadow-sm disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: number | string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 ${
        highlight ? "bg-adashi-blue/5 border border-adashi-blue/20" : "bg-white shadow-sm"
      }`}
    >
      <div className={`text-2xl font-bold ${highlight ? "text-adashi-blue" : "text-adashi-gulf"}`}>
        {value}
      </div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function ShortlistTab({
  rows,
  loading,
  cutoff,
  setCutoff,
  secret,
  onReleased,
}: {
  rows: ShortlistRow[];
  loading: boolean;
  cutoff: number;
  setCutoff: (n: number) => void;
  secret: string;
  onReleased: () => void;
}) {
  const gatedCount = rows.filter((r) => r.triage_score.gated).length;
  const releasedCount = rows.filter((r) => r.scan_released_at).length;
  const eligibleCount = rows.filter(
    (r) => !r.scan_released_at && (r.triage_score.gated || r.triage_score.score <= cutoff)
  ).length;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total triaged" value={rows.length} />
        <StatCard label="Gated" value={gatedCount} />
        <StatCard label="Eligible now" value={eligibleCount} highlight />
        <StatCard label="Released" value={releasedCount} />
      </div>

      <div className="bg-white rounded-2xl shadow-card p-4 mb-6">
        <CutoffSlider
          value={cutoff}
          onChange={setCutoff}
          eligibleCount={eligibleCount}
          totalTriaged={rows.length}
        />
      </div>

      <div className="bg-white rounded-2xl shadow-card overflow-hidden mb-6">
        <ShortlistTable rows={rows} cutoff={cutoff} loading={loading} />
      </div>

      <ReleaseButton cutoff={cutoff} eligibleCount={eligibleCount} secret={secret} onReleased={onReleased} />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-adashi-blue text-white"
          : "text-gray-500 hover:text-adashi-gulf"
      }`}
    >
      {children}
    </button>
  );
}

function ScansTable({ rows, secret, onDelete }: { rows: ScanRow[]; secret: string; onDelete: () => void }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  if (rows.length === 0) {
    return <div className="p-12 text-center text-gray-400">No scans yet.</div>;
  }

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(id: string, domain: string) {
    if (!confirm(`Delete scan for ${domain}? This also removes associated leads and email events.`)) return;
    const res = await fetch("/api/admin/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify({ type: "scan", id }),
    });
    if (res.ok) onDelete();
    else alert("Failed to delete scan.");
  }

  async function handleBulkDelete() {
    const count = selectedIds.size;
    if (!confirm(`Delete ${count} selected scan${count !== 1 ? "s" : ""}? This also removes associated leads and email events.`)) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch("/api/admin/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-secret": secret },
            body: JSON.stringify({ type: "scan", id }),
          }).then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return id;
          })
        )
      );
      const failed: string[] = [];
      let firstError = "";
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          failed.push(ids[i]);
          if (!firstError) firstError = String(r.reason?.message ?? r.reason);
        }
      });
      setSelectedIds(new Set(failed));
      if (failed.length > 0) {
        alert(`${failed.length} of ${ids.length} deletes failed. First error: ${firstError}`);
      }
      onDelete();
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div>
      {selectedIds.size > 0 && (
        <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center gap-3">
          <span className="text-sm text-red-700 font-medium">
            {selectedIds.size} selected
          </span>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {bulkDeleting ? "Deleting..." : `Delete ${selectedIds.size} selected`}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-red-500 hover:text-red-700"
          >
            Clear
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-400 text-xs uppercase tracking-wider">
              <th className="px-4 py-3 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded"
                />
              </th>
              <th className="px-4 py-3">Domain</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Report</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((scan) => (
              <tr
                key={scan.id}
                className={`border-b border-gray-50 hover:bg-gray-50/50 ${selectedIds.has(scan.id) ? "bg-red-50/40" : ""}`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(scan.id)}
                    onChange={() => toggleOne(scan.id)}
                    className="rounded"
                  />
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`https://${scan.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-adashi-blue hover:underline font-medium"
                  >
                    {scan.domain}
                  </a>
                </td>
                <td className="px-4 py-3">
                  {scan.scores ? (
                    <span
                      className={`font-bold ${
                        scan.scores.overall >= 80
                          ? "text-green-600"
                          : scan.scores.overall >= 50
                          ? "text-yellow-600"
                          : "text-red-600"
                      }`}
                    >
                      {scan.scores.overall}
                    </span>
                  ) : (
                    <span className="text-gray-300">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={scan.status} />
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {scan.email ? "Full scan" : "Quick scan"}
                </td>
                <td className="px-4 py-3 text-gray-500 truncate max-w-[180px]">
                  {scan.email || <span className="text-gray-300">-</span>}
                </td>
                <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                  {formatShortDate(scan.created_at)}
                </td>
                <td className="px-4 py-3">
                  {scan.status === "completed" || scan.status === "quick_done" ? (
                    <a
                      href={scan.status === "completed" ? `/report/${scan.id}` : `/scan/${scan.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-adashi-blue hover:underline text-xs font-medium"
                    >
                      View report
                    </a>
                  ) : (
                    <span className="text-gray-300 text-xs">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDelete(scan.id, scan.domain)}
                    className="text-red-400 hover:text-red-600 transition-colors text-xs"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeadsTable({
  rows,
  secret,
  router,
  onDelete,
}: {
  rows: LeadRow[];
  secret: string;
  router: ReturnType<typeof useRouter>;
  onDelete: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  if (rows.length === 0) {
    return <div className="p-12 text-center text-gray-400">No leads yet.</div>;
  }

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(e: React.MouseEvent, id: string, email: string) {
    e.stopPropagation();
    if (!confirm(`Delete lead ${email}?`)) return;
    const res = await fetch("/api/admin/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify({ type: "lead", id }),
    });
    if (res.ok) onDelete();
    else alert("Failed to delete lead.");
  }

  async function handleBulkDelete() {
    const count = selectedIds.size;
    if (!confirm(`Delete ${count} selected lead${count !== 1 ? "s" : ""}?`)) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch("/api/admin/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-secret": secret },
            body: JSON.stringify({ type: "lead", id }),
          }).then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return id;
          })
        )
      );
      const failed: string[] = [];
      let firstError = "";
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          failed.push(ids[i]);
          if (!firstError) firstError = String(r.reason?.message ?? r.reason);
        }
      });
      setSelectedIds(new Set(failed));
      if (failed.length > 0) {
        alert(`${failed.length} of ${ids.length} deletes failed. First error: ${firstError}`);
      }
      onDelete();
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div>
      {selectedIds.size > 0 && (
        <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center gap-3">
          <span className="text-sm text-red-700 font-medium">
            {selectedIds.size} selected
          </span>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {bulkDeleting ? "Deleting..." : `Delete ${selectedIds.size} selected`}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-red-500 hover:text-red-700"
          >
            Clear
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-400 text-xs uppercase tracking-wider">
              <th className="px-4 py-3 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded"
                />
              </th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Domain</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Email Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => (
              <tr
                key={lead.id}
                className={`border-b border-gray-50 hover:bg-blue-50/50 cursor-pointer transition-colors ${selectedIds.has(lead.id) ? "bg-red-50/40" : ""}`}
                onClick={() => router.push(`/admin/lead/${lead.id}?key=${secret}`)}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(lead.id)}
                    onChange={() => toggleOne(lead.id)}
                    className="rounded"
                  />
                </td>
                <td className="px-4 py-3 font-medium text-adashi-gulf">
                  {lead.email}
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`https://${lead.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-adashi-blue hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {lead.domain}
                  </a>
                </td>
                <td className="px-4 py-3">
                  {lead.score !== null && lead.score !== undefined ? (
                    <span
                      className={`font-bold ${
                        lead.score >= 80
                          ? "text-green-600"
                          : lead.score >= 50
                          ? "text-yellow-600"
                          : "text-red-600"
                      }`}
                    >
                      {lead.score}
                    </span>
                  ) : (
                    <span className="text-gray-300">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <EmailStatusGroup emailStatuses={lead.emailStatuses} />
                </td>
                <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                  {formatShortDate(lead.created_at)}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={(e) => handleDelete(e, lead.id, lead.email)}
                    className="text-red-400 hover:text-red-600 transition-colors text-xs"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-green-50 text-green-700",
    quick_done: "bg-blue-50 text-blue-700",
    processing: "bg-yellow-50 text-yellow-700",
    scanning: "bg-yellow-50 text-yellow-700",
    pending: "bg-gray-50 text-gray-500",
    failed: "bg-red-50 text-red-700",
  };

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
        styles[status] || "bg-gray-50 text-gray-500"
      }`}
    >
      {status}
    </span>
  );
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
