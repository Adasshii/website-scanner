"use client";

import { useLocale, useTranslations } from "next-intl";

interface LegacyLocaleNoticeProps {
  /** The locale this scan was originally generated in (e.g. "en"). */
  scanLocale: string;
  /** The URL that was scanned — used for the "re-scan in current language" link. */
  scanUrl: string;
}

/**
 * Shown on report / scan pages when the visitor's current UI locale differs
 * from the locale this scan was generated in AND no alt-language version
 * is available (legacy scan from before bilingual content was stored).
 *
 * Offers a "re-scan in {current language}" affordance that re-submits the
 * same URL through the scan flow under the active cookie locale.
 */
export function LegacyLocaleNotice({ scanLocale, scanUrl }: LegacyLocaleNoticeProps) {
  const t = useTranslations("legacyLocaleNotice");
  const currentLocale = useLocale();

  const langKey = (l: string) => (l === "nl" ? "languageNl" : "languageEn");
  const originalLanguage = t(langKey(scanLocale));
  const currentLanguage = t(langKey(currentLocale));

  const reScanHref = `/start?url=${encodeURIComponent(scanUrl)}`;

  return (
    <div
      role="status"
      className="bg-blue-50 border border-blue-200 rounded-2xl p-4 sm:p-5 mb-6 flex flex-col sm:flex-row sm:items-center gap-3"
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-blue-900 text-sm">
          {t("heading", { originalLanguage })}
        </p>
        <p className="text-blue-800 text-sm leading-relaxed mt-1">
          {t("body", { currentLanguage })}
        </p>
      </div>
      <a
        href={reScanHref}
        className="inline-flex items-center justify-center bg-adashi-blue hover:bg-adashi-science text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap"
      >
        {t("cta", { currentLanguage })}
      </a>
    </div>
  );
}
