import type { Metadata } from "next";
import { Fraunces, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import Navbar from "@/components/Navbar";
import { ToastProvider } from "@/components/ToastContext";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "ShipWatch — Open Source Supply Chain Intelligence",
  description:
    "Audit your dependencies with one SQL query. Powered by Coral cross-source JOINs across GitHub, OSV, and npm.",
  keywords: [
    "dependency audit",
    "supply chain security",
    "open source",
    "vulnerability scanner",
    "coral",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", spaceGrotesk.variable, fraunces.variable, jetbrainsMono.variable)} suppressHydrationWarning>
      <body className="font-sans antialiased bg-slate-50 text-slate-900 dark:bg-neutral-950 dark:text-neutral-100 min-h-screen">
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <Navbar />
              {children}
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
