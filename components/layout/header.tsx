import Link from "next/link";
import { useTranslations } from "next-intl";
import { LogoFull } from "@/components/ui/logo";
import { LanguageToggle } from "@/components/layout/language-toggle";

export function Header() {
  const t = useTranslations("layout.header");
  return (
    <header className="w-full border-b border-gray-100">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <Link href="/" className="text-adashi-blue">
          <LogoFull className="h-7" />
        </Link>
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline text-sm text-gray-400">
            {t("tagline")}
          </span>
          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}
