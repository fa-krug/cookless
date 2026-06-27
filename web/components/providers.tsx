"use client";

import { I18nProvider } from "@/lib/i18n/provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/translate";

export function Providers({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: React.ReactNode;
}) {
  return (
    <I18nProvider locale={locale} dict={dict}>
      <ThemeProvider>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </ThemeProvider>
    </I18nProvider>
  );
}
