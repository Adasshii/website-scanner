import Link from "next/link";
import { LogoFull } from "@/components/ui/logo";

export function Header() {
  return (
    <header className="w-full border-b border-gray-100">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-adashi-blue">
          <LogoFull className="h-7" />
        </Link>
        <span className="text-sm text-gray-400">Free Website Scanner staging</span>
      </div>
    </header>
  );
}
