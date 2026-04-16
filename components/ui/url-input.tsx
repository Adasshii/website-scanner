"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { validateUrlFormat } from "@/lib/url-validation";

export function UrlInput() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    try {
      validateUrlFormat(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid URL");
      return;
    }

    router.push(`/start?url=${encodeURIComponent(url)}`);
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
            autoComplete="url"
            autoFocus
          />
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={!url.trim()}
          className="sm:w-auto w-full whitespace-nowrap animate-cta-pulse"
        >
          Scan my site
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
