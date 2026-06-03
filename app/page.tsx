import { useTranslations } from "next-intl";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { UrlInput } from "@/components/ui/url-input";
import { LogoIcon } from "@/components/ui/logo";

export default function Home() {
  const t = useTranslations("home");

  const features = [
    {
      icon: <AccessibilityIcon className="w-6 h-6 text-adashi-blue" />,
      title: t("features.accessibility.title"),
      description: t("features.accessibility.description"),
      weight: t("features.accessibility.weight"),
    },
    {
      icon: <ContentIcon className="w-6 h-6 text-adashi-blue" />,
      title: t("features.content.title"),
      description: t("features.content.description"),
      weight: t("features.content.weight"),
    },
    {
      icon: <SeoIcon className="w-6 h-6 text-adashi-blue" />,
      title: t("features.seo.title"),
      description: t("features.seo.description"),
      weight: t("features.seo.weight"),
    },
    {
      icon: <SpeedIcon className="w-6 h-6 text-adashi-blue" />,
      title: t("features.performance.title"),
      description: t("features.performance.description"),
      weight: t("features.performance.weight"),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Hero */}
      <section className="relative hero-pattern noise flex-1 flex items-center">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-20 sm:py-32 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-adashi-blue/5 text-adashi-blue text-sm font-medium mb-8">
            <LogoIcon className="w-4 h-4" />
            {t("badge")}
          </div>

          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl text-adashi-gulf leading-tight mb-6">
            {t("hero.title")}{" "}
            <span className="gradient-text">{t("hero.titleHighlight")}</span>{" "}
            {t("hero.titleSuffix")}
          </h1>

          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-10">
            {t("hero.subtitle")}
          </p>

          <div className="flex justify-center">
            <UrlInput />
          </div>

          <p className="mt-4 text-sm text-gray-400">{t("hero.subnote")}</p>
        </div>
      </section>

      {/* What you get */}
      <section className="py-20 sm:py-28 bg-gray-50/50">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="font-display text-3xl sm:text-4xl text-adashi-gulf text-center mb-4">
            {t("features.heading")}
          </h2>
          <p className="text-center text-gray-500 max-w-xl mx-auto mb-14">
            {t("features.subheading")}
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f) => (
              <FeatureCard
                key={f.title}
                icon={f.icon}
                title={f.title}
                description={f.description}
                weight={f.weight}
                weightLabel={t("features.weightLabel", { weight: f.weight })}
              />
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="font-display text-3xl sm:text-4xl text-adashi-gulf text-center mb-14">
            {t("steps.heading")}
          </h2>

          <div className="grid sm:grid-cols-3 gap-8 sm:gap-12">
            <Step
              number="1"
              title={t("steps.step1.title")}
              description={t("steps.step1.description")}
            />
            <Step
              number="2"
              title={t("steps.step2.title")}
              description={t("steps.step2.description")}
            />
            <Step
              number="3"
              title={t("steps.step3.title")}
              description={t("steps.step3.description")}
            />
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16 bg-adashi-gulf text-white text-center noise relative">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="font-display text-3xl sm:text-4xl mb-4">
            {t("bottomCta.heading")}
          </h2>
          <p className="text-adashi-pastel text-lg mb-8">
            {t("bottomCta.subheading")}
          </p>
          <div className="flex justify-center">
            <UrlInput />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  weightLabel,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  weight: string;
  weightLabel: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-card spring-hover">
      <div className="flex items-center justify-between mb-4">
        <div className="w-12 h-12 rounded-xl bg-adashi-blue/5 flex items-center justify-center">
          {icon}
        </div>
        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
          {weightLabel}
        </span>
      </div>
      <h3 className="font-semibold text-adashi-gulf mb-2">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="w-12 h-12 rounded-full bg-adashi-blue text-white font-bold text-lg flex items-center justify-center mx-auto mb-4">
        {number}
      </div>
      <h3 className="font-semibold text-adashi-gulf text-lg mb-2">{title}</h3>
      <p className="text-gray-500">{description}</p>
    </div>
  );
}

function AccessibilityIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <circle cx="12" cy="4.5" r="2" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 8.5h10M12 8.5v4m-3 5.5l3-3.5 3 3.5"
      />
    </svg>
  );
}

function ContentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  );
}

function SeoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
      />
    </svg>
  );
}

function SpeedIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
      />
    </svg>
  );
}
