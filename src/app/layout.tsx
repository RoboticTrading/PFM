import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/lib/theme";
import { TRPCProvider } from "@/lib/trpc/Provider";

import "./globals.css";

// Self-hosted via next/font — no external request, no FOUC, no @import ordering
// risk. Exposed as `--font-inter`; skins reference it in their font stacks.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PFM — Personal Financial Manager",
  description: "Bob's personal financial manager (LAN-only).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <TRPCProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
