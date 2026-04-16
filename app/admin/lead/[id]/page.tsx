"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { EmailStatusBadge } from "@/components/admin/email-status-badge";

interface LeadDetail {
  lead: {
    id: string;
    email: string;
    domain: string;
    scan_id: string;
    source: string;
    gdpr_consent: boolean;
    consent_timestamp: string;
    created_at: string;
  };
  scan: {
    id: string;
    url: string;
    domain: string;
    status: string;
    scores: { overall: number; accessibility: number; content: number; seo: number; performance: number } | null;
    summary: { totalPages: number; totalIssues: number; criticalIssues: number; topIssues: Array<{ severity: string; title: string }> } | null;
    screenshots: Record<string, { url: string }> | null;
    cost_estimate: { totalLostPercent: number } | null;
    quick_wins: Array<{ title: string; description: string; estimatedTime: string; expectedImpact: string }> | null;
    website_personality: string | null;
    sales_brief: string | null;
    created_at: string;
    completed_at: string | null;
  } | null;
  emailEvents: Array<{
    id: string;
    email_type: string;
    status: string;
    email: string;
    created_at: string;
    updated_at: string;
  }>;
}

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [data, setData] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Try to get secret from URL params or sessionStorage
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const keyFromUrl = urlParams.get("key");
    const storedSecret = sessionStorage.getItem("admin_secret");
    if (keyFromUrl) {
      setSecret(keyFromUrl);
      setAuthenticated(true);
    } else if (storedSecret) {
      setSecret(storedSecret);
      setAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (!authenticated || !secret) return;
    sessionStorage.setItem("admin_secret", secret);

    setLoading(true);
    fetch(`/api/admin/lead/${params.id}`, {
      headers: { "x-admin-secret": secret },
    })
      .then((res) => {
        if (res.status === 401) {
          setAuthenticated(false);
          setError("Invalid admin secret.");
          return null;
        }
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((d) => {
        if (d) setData(d);
      })
      .catch(() => setError("Failed to load lead."))
      .finally(() => setLoading(false));
  }, [authenticated, secret, params.id]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthenticated(true);
  }

  function handleCopyBrief() {
    if (!data?.scan?.sales_brief) return;
    navigator.clipboard.writeText(data.scan.sales_brief).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-card p-8 w-full max-w-sm">
          <h1 className="font-display text-2xl text-adashi-gulf mb-6 text-center">Admin Access</h1>
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
            disabled={!secret.trim()}
            className="w-full bg-adashi-blue hover:bg-adashi-science text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            Sign in
          </button>
          {error && <p className="mt-3 text-sm text-red-500 text-center">{error}</p>}
        </form>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">{error || "Lead not found."}</div>
      </div>
    );
  }

  const { lead, scan, emailEvents } = data;
  const scoreColor = (s: number) =>
    s >= 80 ? "text-green-600" : s >= 50 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-adashi-gulf text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/admin")}
            className="text-adashi-pastel hover:text-white transition-colors text-sm"
          >
            &larr; Back
          </button>
          <h1 className="font-display text-xl">Lead Detail</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Lead info */}
        <div className="bg-white rounded-2xl shadow-card p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-adashi-gulf text-lg">{lead.email}</h2>
              <a
                href={`https://${lead.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-adashi-blue hover:underline text-sm"
              >
                {lead.domain}
              </a>
              <div className="text-xs text-gray-400 mt-1">
                {new Date(lead.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
            {scan?.scores && (
              <div className={`text-4xl font-bold ${scoreColor(scan.scores.overall)}`}>
                {scan.scores.overall}
                <span className="text-sm font-normal text-gray-400">/100</span>
              </div>
            )}
          </div>
        </div>

        {/* Score breakdown */}
        {scan?.scores && (
          <div className="bg-white rounded-2xl shadow-card p-6">
            <h3 className="font-semibold text-adashi-gulf mb-4">Score Breakdown</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {(["accessibility", "content", "seo", "performance"] as const).map((cat) => (
                <div key={cat} className="text-center">
                  <div className={`text-2xl font-bold ${scoreColor(scan.scores![cat])}`}>
                    {scan.scores![cat]}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 capitalize">{cat}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top issues */}
        {scan?.summary?.topIssues && scan.summary.topIssues.length > 0 && (
          <div className="bg-white rounded-2xl shadow-card p-6">
            <h3 className="font-semibold text-adashi-gulf mb-4">Top Issues</h3>
            <div className="space-y-2">
              {scan.summary.topIssues.slice(0, 5).map((issue, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      issue.severity === "critical"
                        ? "bg-red-50 text-red-700"
                        : issue.severity === "major"
                        ? "bg-orange-50 text-orange-700"
                        : "bg-gray-50 text-gray-600"
                    }`}
                  >
                    {issue.severity}
                  </span>
                  <span className="text-gray-700">{issue.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Screenshot thumbnail */}
        {scan?.screenshots && Object.keys(scan.screenshots).length > 0 && (
          <div className="bg-white rounded-2xl shadow-card p-6">
            <h3 className="font-semibold text-adashi-gulf mb-4">Homepage Screenshot</h3>
            <div className="rounded-lg overflow-hidden border border-gray-200 max-w-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={Object.values(scan.screenshots)[0].url}
                alt={`Screenshot of ${lead.domain}`}
                className="w-full h-auto"
                loading="lazy"
              />
            </div>
          </div>
        )}

        {/* Sales brief */}
        {scan?.sales_brief && (
          <div className="bg-white rounded-2xl shadow-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-adashi-gulf">Sales Brief</h3>
              <button
                onClick={handleCopyBrief}
                className="text-sm text-adashi-blue hover:text-adashi-science transition-colors"
              >
                {copied ? "Copied!" : "Copy to clipboard"}
              </button>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
                {scan.sales_brief}
              </pre>
            </div>
          </div>
        )}

        {/* Email events timeline */}
        {emailEvents.length > 0 && (
          <div className="bg-white rounded-2xl shadow-card p-6">
            <h3 className="font-semibold text-adashi-gulf mb-4">Email Events</h3>
            <div className="space-y-3">
              {emailEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between border-b border-gray-50 pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <EmailStatusBadge emailType={event.email_type} status={event.status} />
                    <span className="text-xs text-gray-400">{event.email}</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(event.updated_at || event.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {scan && (
            <a
              href={`/report/${scan.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-adashi-blue hover:bg-adashi-science text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
            >
              Open full report
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
