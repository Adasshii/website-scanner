"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { setLocale } from "@/app/actions/locale";
import { locales, type Locale } from "@/i18n/config";

export function LanguageToggle() {
  const current = useLocale() as Locale;
  const t = useTranslations("layout.languageToggle");
  const [isPending, startTransition] = useTransition();

  function switchTo(locale: Locale) {
    if (locale === current || isPending) return;
    startTransition(() => {
      setLocale(locale);
    });
  }

  return (
    <div
      role="group"
      aria-label={t("ariaLabel")}
      className="inline-flex items-center gap-0.5 rounded-full border border-gray-200 bg-white p-0.5 text-xs font-medium"
    >
      {locales.map((locale) => {
        const active = locale === current;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => switchTo(locale)}
            disabled={isPending}
            aria-pressed={active}
            className={`px-2.5 py-1 rounded-full transition-colors ${
              active
                ? "bg-adashi-blue text-white"
                : "text-gray-500 hover:text-adashi-blue"
            } ${isPending ? "opacity-60" : ""}`}
          >
            {t(locale)}
          </button>
        );
      })}
    </div>
  );
}
