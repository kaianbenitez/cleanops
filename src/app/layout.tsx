import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Archivo } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const sansFont = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const monoFont = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["500"],
});

const displayFont = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "Shimmer | Maid Service & Cleaning Business Software",
    template: "%s | Shimmer",
  },
  description: "Maid service and cleaning business software: scheduling, crew work, customers, quotes, invoicing, and payroll.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Shimmer",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#141a2c" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("h-full", "antialiased", sansFont.variable, monoFont.variable, displayFont.variable, "font-sans")}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
