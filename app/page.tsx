import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { UrlInput } from "@/components/ui/url-input";
import { LogoIcon } from "@/components/ui/logo";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Hero */}
      <section className="relative hero-pattern noise flex-1 flex items-center">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-20 sm:py-32 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-adashi-blue/5 text-adashi-blue text-sm font-medium mb-8">
            <LogoIcon className="w-4 h-4" />
            100% free &mdash; no signup required
          </div>

          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl text-adashi-gulf leading-tight mb-6">
            How does your website{" "}
            <span className="gradient-text">really</span> perform?
          </h1>

          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-10">
            Get an instant scan of your website&apos;s accessibility, SEO,
            content quality, and performance. See what&apos;s holding you back
            &mdash; in plain language, not developer jargon.
          </p>

          <div className="flex justify-center">
            <UrlInput />
          </div>

          <p className="mt-4 text-sm text-gray-400">
            Takes about 15 seconds. We scan your homepage and show you the
            results instantly.
          </p>
        </div>
      </section>

      {/* What you get */}
      <section className="py-20 sm:py-28 bg-gray-50/50">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="font-display text-3xl sm:text-4xl text-adashi-gulf text-center mb-4">
            What you&apos;ll discover
          </h2>
          <p className="text-center text-gray-500 max-w-xl mx-auto mb-14">
            Our scanner checks the things that matter most for your
            business&apos;s online presence.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={
                <AccessibilityIcon className="w-6 h-6 text-adashi-blue" />
              }
              title="Accessibility"
              description="Can all visitors use your site? We check for screen reader support, color contrast, keyboard navigation, and more."
              weight="40%"
            />
            <FeatureCard
              icon={<ContentIcon className="w-6 h-6 text-adashi-blue" />}
              title="Content Quality"
              description="Is your message clear? We analyze readability, heading structure, and whether your calls-to-action actually work."
              weight="25%"
            />
            <FeatureCard
              icon={<SeoIcon className="w-6 h-6 text-adashi-blue" />}
              title="SEO Basics"
              description="Can Google find you? We check meta tags, heading hierarchy, image descriptions, and other ranking factors."
              weight="20%"
            />
            <FeatureCard
              icon={<SpeedIcon className="w-6 h-6 text-adashi-blue" />}
              title="Performance"
              description="Is your site fast enough? Slow pages lose visitors. We measure load time and flag optimization opportunities."
              weight="15%"
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="font-display text-3xl sm:text-4xl text-adashi-gulf text-center mb-14">
            How it works
          </h2>

          <div className="grid sm:grid-cols-3 gap-8 sm:gap-12">
            <Step
              number="1"
              title="Enter your URL"
              description="Just paste your website address. No account needed, no strings attached."
            />
            <Step
              number="2"
              title="Get your score"
              description="In about 15 seconds, see your overall score and top issues — explained in plain language."
            />
            <Step
              number="3"
              title="Get the full report"
              description="Enter your email to receive a detailed report with page-by-page analysis and fix recommendations."
            />
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16 bg-adashi-gulf text-white text-center noise relative">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="font-display text-3xl sm:text-4xl mb-4">
            Ready to see how your site stacks up?
          </h2>
          <p className="text-adashi-pastel text-lg mb-8">
            It&apos;s free, takes 15 seconds, and could reveal issues
            you&apos;ve never noticed.
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
  weight,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  weight: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-card spring-hover">
      <div className="flex items-center justify-between mb-4">
        <div className="w-12 h-12 rounded-xl bg-adashi-blue/5 flex items-center justify-center">
          {icon}
        </div>
        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
          {weight} of score
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
