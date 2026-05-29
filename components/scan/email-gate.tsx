"use client";

import { useState, FormEvent, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

type GateStatus = "idle" | "submitting" | "processing" | "completed" | "failed";

interface EmailGateProps {
  scanId: string;
  /** Called when full scan completes so the parent can refresh data */
  onFullScanComplete?: () => void;
}

export function EmailGate({ scanId, onFullScanComplete }: EmailGateProps) {
  const [email, setEmail] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<GateStatus>("idle");

  // Poll for full scan completion
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/scan/${scanId}/status`);
      const data = await res.json();

      if (data.status === "completed") {
        setStatus("completed");
        onFullScanComplete?.();
        return true; // done polling
      }
      if (data.status === "failed") {
        setStatus("failed");
        setError(data.error_message || "Full scan failed. Please try again.");
        return true; // done polling
      }
      return false; // keep polling
    } catch {
      return false;
    }
  }, [scanId, onFullScanComplete]);

  useEffect(() => {
    if (status !== "processing") return;

    const interval = setInterval(async () => {
      const done = await pollStatus();
      if (done) clearInterval(interval);
    }, 3000);

    return () => clearInterval(interval);
  }, [status, pollStatus]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    if (!consent) {
      setError("Please accept the privacy policy to continue.");
      return;
    }

    setStatus("submitting");

    try {
      const res = await fetch(`/api/scan/${scanId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent, company_size: companySize || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setStatus("idle");
        return;
      }

      setStatus("processing");
    } catch {
      setError("Could not connect to the server. Please try again.");
      setStatus("idle");
    }
  }

  if (status === "completed") {
    return (
      <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-6 sm:p-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-4">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="font-display text-xl text-adashi-gulf mb-2">
          Your full report is ready!
        </h3>
        <p className="text-gray-600 mb-4">
          We&apos;ve scanned multiple pages and generated a comprehensive analysis.
        </p>
        <a
          href={`/report/${scanId}`}
          className="inline-block bg-adashi-blue hover:bg-adashi-science text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          View Full Report
        </a>
      </div>
    );
  }

  if (status === "processing") {
    return (
      <div className="bg-adashi-blue/5 border-2 border-adashi-blue/20 rounded-2xl p-6 sm:p-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 mb-4">
          <svg className="animate-spin h-8 w-8 text-adashi-blue" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
        <h3 className="font-display text-xl text-adashi-gulf mb-2">
          Deep scan in progress
        </h3>
        <p className="text-gray-500 text-sm">
          We&apos;re analysing every page of your site — this catches issues the quick scan misses.
          Your full report will be in your inbox shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-card p-6 sm:p-8">
      <div className="text-center mb-6">
        <h3 className="font-display text-xl sm:text-2xl text-adashi-gulf mb-2">
          Unlock your full report
        </h3>
        <p className="text-gray-500">
          Get the full cost breakdown, your quick wins, and a complete multi-page audit — free.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-md mx-auto">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError("");
            }}
            placeholder="you@company.com"
            className={`flex-1 px-4 py-3 rounded-xl border-2 text-base bg-white transition-colors outline-none ${
              error
                ? "border-red-400 focus:border-red-500"
                : "border-gray-200 focus:border-adashi-blue"
            }`}
            disabled={status === "submitting"}
            autoComplete="email"
          />
          <Button
            type="submit"
            disabled={status === "submitting" || !email.trim() || !consent}
          >
            {status === "submitting" ? "Sending..." : "Get full report"}
          </Button>
        </div>

        <div className="mb-4">
          <label htmlFor="company-size" className="block text-sm text-gray-500 mb-1.5">
            How many people work at your company? <span className="text-gray-400">(optional)</span>
          </label>
          <select
            id="company-size"
            value={companySize}
            onChange={(e) => setCompanySize(e.target.value)}
            disabled={status === "submitting"}
            className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-adashi-blue text-base bg-white text-gray-700 outline-none transition-colors"
          >
            <option value="">Select&hellip;</option>
            <option value="just-me">Just me</option>
            <option value="2-10">2–10</option>
            <option value="11-50">11–50</option>
            <option value="51-200">51–200</option>
            <option value="200+">200+</option>
          </select>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              if (error) setError("");
            }}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-adashi-blue focus:ring-adashi-blue"
            disabled={status === "submitting"}
          />
          <span className="text-sm text-gray-500 leading-relaxed">
            I agree to receive my scan report by email. We respect your privacy and
            won&apos;t spam you.{" "}
            <a
              href="https://adashi.io/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-adashi-blue hover:underline"
            >
              Privacy policy
            </a>
          </span>
        </label>

        {error && (
          <p className="mt-3 text-sm text-red-500 text-center" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
