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
  title: "Website Performance & Conversion Audit — Adashi",
  description:
    "Get a free audit of your website's performance, accessibility, SEO, and conversion potential. Detailed report with actionable recommendations.",
  metadataBase: new URL("https://scan.adashi.io"),
  openGraph: {
    title: "Website Performance & Conversion Audit — Adashi",
    description:
      "Get a free audit of your website's performance, accessibility, SEO, and conversion potential.",
    url: "https://scan.adashi.io",
    siteName: "Adashi Website Performance & Conversion Audit",
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
