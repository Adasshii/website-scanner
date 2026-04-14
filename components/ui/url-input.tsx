"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { validateUrlFormat } from "@/lib/url-validation";

export function UrlInput() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    // Client-side validation
    try {
      validateUrlFormat(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid URL");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      // Redirect to the scan results page
      router.push(`/scan/${data.id}`);
    } catch {
      setError("Could not connect to the server. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <label htmlFor="url-input" className="sr-only">
            Website URL
          </label>
          <input
            id="url-input"
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError("");
            }}
            placeholder="https://example.com"
            className={`w-full px-5 py-4 rounded-xl border-2 text-base bg-white text-gray-900 placeholder-gray-400 transition-colors outline-none ${
              error
                ? "border-red-400 focus:border-red-500"
                : "border-gray-200 focus:border-adashi-blue"
            }`}
            disabled={loading}
            autoComplete="url"
            autoFocus
          />
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={loading || !url.trim()}
          className={`sm:w-auto w-full whitespace-nowrap ${
            loading ? "" : "animate-cta-pulse"
          }`}
        >
          {loading ? (
            <>
              <Spinner />
              Scanning...
            </>
          ) : (
            "Scan my site"
          )}
        </Button>
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
