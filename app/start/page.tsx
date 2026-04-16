"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { LogoIcon } from "@/components/ui/logo";

const STAGES = [
  { min: 0, label: "Fetching..." },
  { min: 33, label: "Analyzing..." },
  { min: 66, label: "Building report..." },
] as const;

function getStageLabel(progress: number): string {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (progress >= STAGES[i].min) return STAGES[i].label;
  }
  return STAGES[0].label;
}

function StartScanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const url = searchParams.get("url");

    if (!url) {
      setError("No URL provided. Please go back and enter a URL to scan.");
      return;
    }

    try {
      new URL(url.startsWith("http") ? url : `https://${url}`);
    } catch {
      setError(
        "The provided URL is invalid. Please check the URL and try again."
      );
      return;
    }

    // Animate progress from 0 → 90% over ~15 seconds
    const startTime = Date.now();
    const fillDuration = 15000;

    const tick = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const target = Math.min((elapsed / fillDuration) * 90, 90);
      setProgress(target);
    }, 50);

    // Start the scan
    fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Something went wrong.");
        }
        return data;
      })
      .then((data) => {
        clearInterval(tick);
        setProgress(100);
        setTimeout(() => router.push(`/scan/${data.id}`), 500);
      })
      .catch((err) => {
        clearInterval(tick);
        setError(
          err instanceof Error ? err.message : "Could not connect to the server."
        );
      });

    return () => clearInterval(tick);
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md mx-auto px-4">
            <p className="text-red-500 text-lg mb-6">{error}</p>
            <a
              href="/"
              className="inline-flex items-center px-6 py-3 bg-adashi-blue text-white rounded-xl font-medium hover:bg-adashi-blue/90 transition-colors"
            >
              Go back to homepage
            </a>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="relative w-12 h-12 mx-auto mb-6">
            <LogoIcon className="w-12 h-12 text-gray-200" />
            <div
              className="absolute inset-0"
              style={{ clipPath: `inset(0 0 ${100 - progress}% 0)` }}
            >
              <LogoIcon className="w-12 h-12 text-adashi-blue" />
            </div>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl text-adashi-gulf mb-2">
            Scanning your website
          </h1>
          <p className="text-gray-500 mb-8">{getStageLabel(progress)}</p>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-adashi-blue rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.round(progress)}%` }}
            />
          </div>
          <p className="mt-3 text-sm text-gray-400">
            {Math.round(progress)}%
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default function StartPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      }
    >
      <StartScanner />
    </Suspense>
  );
}
