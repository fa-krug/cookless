import type { Metadata } from "next";
import "./globals.css";
import { ThemeScript } from "@/components/theme/theme-script";
import { resolveLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Cookless",
  description: "Meal planning made simple.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await resolveLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
