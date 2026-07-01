"use client";

import { useOnlineSync } from "@/lib/offline/use-online-sync";
import { useT } from "@/lib/i18n/provider";

export function OfflineIndicator() {
  const { online, syncing } = useOnlineSync();
  const { t } = useT();

  if (online && !syncing) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-50 bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground shadow-sm"
    >
      {syncing ? t("offline.syncing") : t("offline.banner")}
    </div>
  );
}
