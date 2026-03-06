import type { Metadata } from "next";
import "./globals.css";
import { Web3Providers } from "./providers";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  applicationName: "AION Yield",
  title: "AION Yield — AI-Orchestrated Money Market Protocol",
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
    title: "AION Yield — AI-Orchestrated Money Market Protocol",
    description:
      "Next-generation decentralized money market protocol powered by Chainlink CRE, AI-driven yield optimization, and autonomous agent payments on Base.",
    url: "https://aionyield.vercel.app",
    siteName: "AION Yield",
    type: "website",
    images: [
      {
        url: "/aion-logo.png",
        width: 1200,
        height: 630,
        alt: "AION Yield Logo",
      },
    ],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "AION Yield — AI-Orchestrated Money Market Protocol",
    description:
      "Next-generation DeFi money market powered by Chainlink CRE and AI agents on Base.",
  },
  robots: {
    index: true,
    follow: true,
  },
  other: {
    "talentapp:project_verification": "c2a90ba4f10f1648a21147b01e04a7c8165bd0b2a01367e0277e2117625d7a4d4e93c795541534079c2bdaef6cac609ce653b61d34039f1173a67ccd71c2adaf"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Web3Providers>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            {children}
          </ThemeProvider>
        </Web3Providers>
      </body>
    </html>
  );
}
