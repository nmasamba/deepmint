import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter, JetBrains_Mono } from "next/font/google";
import { TRPCProvider } from "@/components/providers/TRPCProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Deepmint — Analyst Track Records, Scored Against the Market",
  description:
    "Build a verifiable track record as a Guide or follow the best analysts as a Player. Every claim is scored against real outcomes, and the board shows who's actually good.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://www.deepmint.ai",
  ),
  manifest: "/manifest.json",
  themeColor: "#080C14",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Deepmint",
  },
  openGraph: {
    title: "Deepmint — Analyst Track Records, Scored Against the Market",
    description:
      "Prove your edge or find who has one. Deepmint scores analysts against real market data and ranks who to follow.",
    siteName: "Deepmint",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Deepmint — Analyst Track Records, Scored Against the Market",
    description:
      "Build a verifiable track record or follow the best analysts — ranked by results, not hype.",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
          <TRPCProvider>{children}</TRPCProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
