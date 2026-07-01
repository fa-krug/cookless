"use client";

import { useRouter } from "next/navigation";
import { LogOut, Mail } from "lucide-react";

import { useT } from "@/lib/i18n/provider";
import { logoutAction } from "@/app/(auth)/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { clear as clearOfflineQueue } from "@/lib/offline/queue";
import { SettingsSection } from "./settings-section";
import { PasswordForm } from "./password-form";
import { PasskeySection } from "./passkey-section";

export function AccountSection({
  email,
  hasPassword,
  hasPasskey,
}: {
  email: string;
  hasPassword: boolean;
  hasPasskey: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleLogout() {
    const confirmed = await confirm({
      title: t("settings.logout"),
      message: t("settings.logoutConfirm"),
      confirmLabel: t("settings.logout"),
      destructive: true,
    });
    if (!confirmed) return;

    // Clear offline caches + pending queue so the next account on this device
    // can't see this session's cached pages or replay its queued toggles.
    if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHES" });
    }
    await clearOfflineQueue();

    await logoutAction();
    router.push("/login");
  }

  return (
    <SettingsSection
      icon={Mail}
      title={t("settings.account")}
      description={t("settings.accountDescription")}
    >
      <p className="text-sm text-muted-foreground">{email}</p>
      <PasswordForm hasPassword={hasPassword} hasPasskey={hasPasskey} />
      <PasskeySection hasPassword={hasPassword} />
      <Button variant="destructive" className="w-full" onClick={handleLogout}>
        <LogOut size={16} />
        {t("settings.logout")}
      </Button>
      {dialog}
    </SettingsSection>
  );
}
