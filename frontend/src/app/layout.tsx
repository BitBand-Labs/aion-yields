import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Web3Providers } from "./providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "AionYield — AI-Orchestrated Money Market Protocol",
  description:
    "Next-generation decentralized money market protocol powered by Chainlink CRE, AI-driven yield optimization, and autonomous agent payments on Base.",
  keywords: [
    "DeFi",
    "Chainlink",
    "Money Market",
    "AI Yield",
    "Lending",
    "Borrowing",
    "Base",
    "ERC-8004",
    "x402",
    "CCIP",
  ],
  openGraph: {
    title: "AionYield — AI-Orchestrated Money Market Protocol",
    description:
      "Next-generation decentralized money market protocol powered by Chainlink CRE, AI-driven yield optimization, and autonomous agent payments on Base.",
    url: "https://aionyield.vercel.app",
    siteName: "AionYield",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "AionYield — AI-Orchestrated Money Market Protocol",
    description:
      "Next-generation DeFi money market powered by Chainlink CRE and AI agents on Base.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <Web3Providers>{children}</Web3Providers>
      </body>
    </html>
  );
}
