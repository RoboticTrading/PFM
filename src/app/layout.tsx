import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/lib/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: "PFM — Personal Financial Manager",
  description: "Bob's personal financial manager (LAN-only).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
