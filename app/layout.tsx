import type { Metadata } from "next";
import { Inter, DM_Serif_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const dmSerif = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-dm-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Free Website Scanner — Adashi",
  description:
    "Scan your website for accessibility issues, SEO problems, and content quality. Get a free, detailed report with actionable recommendations.",
  metadataBase: new URL("https://scan.adashi.io"),
  openGraph: {
    title: "Free Website Scanner — Adashi",
    description:
      "Scan your website for accessibility issues, SEO problems, and content quality.",
    url: "https://scan.adashi.io",
    siteName: "Adashi Website Scanner",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${dmSerif.variable} font-body text-adashi-onyx antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
