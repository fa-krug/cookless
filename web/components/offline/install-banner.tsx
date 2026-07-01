"use client";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import { useInstallPrompt } from "@/lib/hooks/use-install-prompt";

export function InstallBanner() {
  const { t } = useT();
  const { isInstallable, promptInstall, dismiss } = useInstallPrompt();

  if (!isInstallable) return null;

  return (
    <div className="flex items-center justify-between gap-2 bg-primary px-4 py-3 text-primary-foreground shadow-md">
      <p className="min-w-0 text-sm font-medium">{t("install.message")}</p>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          className="bg-background text-primary hover:bg-background/90"
          onClick={promptInstall}
        >
          {t("install.install")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-primary-foreground/70 hover:bg-transparent hover:text-primary-foreground"
          onClick={dismiss}
          aria-label={t("common.close")}
        >
          {t("install.dismiss")}
        </Button>
      </div>
    </div>
  );
}
