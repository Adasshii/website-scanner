"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { LogoIcon } from "@/components/ui/logo";

const STAGE_BREAKPOINTS = [
  { min: 0, key: "fetching" },
  { min: 25, key: "analyzing" },
  { min: 55, key: "measuring" },
  { min: 80, key: "building" },
] as const;

function StartScanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("start");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  function getStageLabel(p: number): string {
    for (let i = STAGE_BREAKPOINTS.length - 1; i >= 0; i--) {
      if (p >= STAGE_BREAKPOINTS[i].min) return t(`stage.${STAGE_BREAKPOINTS[i].key}`);
    }
    return t(`stage.${STAGE_BREAKPOINTS[0].key}`);
  }

  useEffect(() => {
    const url = searchParams.get("url");

    if (!url) {
      setError(t("error.noUrl"));
      return;
    }

    try {
      new URL(url.startsWith("http") ? url : `https://${url}`);
    } catch {
      setError(t("error.invalidUrl"));
      return;
    }

    // Animate progress from 0 → 90% over ~75 seconds (Lighthouse adds significant time)
    const startTime = Date.now();
    const fillDuration = 75000;

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
          throw new Error(data.error || t("error.generic"));
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
        setError(err instanceof Error ? err.message : t("error.connection"));
      });

    return () => clearInterval(tick);
  }, [searchParams, router, t]);

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
              {t("error.backHome")}
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
            {t("title")}
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
          <StartFallback />
        </div>
      }
    >
      <StartScanner />
    </Suspense>
  );
}

function StartFallback() {
  const t = useTranslations("start");
  return <p className="text-gray-500">{t("loading")}</p>;
}
