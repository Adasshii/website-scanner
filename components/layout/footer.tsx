import Link from "next/link";
import { useTranslations } from "next-intl";

export function Footer() {
  const t = useTranslations("layout.footer");
  return (
    <footer className="w-full border-t border-gray-100 py-8 mt-auto">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
        <p>{t("rights", { year: new Date().getFullYear() })}</p>
        <div className="flex gap-6">
          <Link
            href="/privacy"
            className="hover:text-adashi-blue transition-colors"
          >
            {t("privacy")}
          </Link>
          <a
            href="https://adashi.io"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-adashi-blue transition-colors"
          >
            adashi.io
          </a>
        </div>
      </div>
    </footer>
  );
}
