"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { updateAiSettingsAction } from "@/app/(app)/actions";

export function AiSettingsForm({ aiEnabled, hasKey }: { aiEnabled: boolean; hasKey: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [enabled, setEnabled] = useState(aiEnabled);
  const [key, setKey] = useState("");
  const [pending, startTransition] = useTransition();

  function onSave() {
    startTransition(async () => {
      const input: { aiEnabled: boolean; geminiApiKey?: string } = { aiEnabled: enabled };
      if (key.trim()) input.geminiApiKey = key.trim();
      const res = await updateAiSettingsAction(input);
      if (res.ok) {
        toast.success(t("aiSettings.saved"));
        setKey("");
        router.refresh();
      } else {
        toast.error(t("common.errorRetry"));
      }
    });
  }

  return (
    <div className="max-w-md space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        {t("aiSettings.enable")}
      </label>
      <label className="block text-sm">
        {t("aiSettings.apiKey")}
        <Input
          type="password"
          autoComplete="off"
          value={key}
          placeholder={t("aiSettings.apiKeyPlaceholder")}
          onChange={(e) => setKey(e.target.value)}
        />
        {hasKey && <span className="mt-1 block text-xs text-muted-foreground">{t("aiSettings.apiKeySet")}</span>}
      </label>
      <Button disabled={pending} onClick={onSave}>{t("aiSettings.save")}</Button>
    </div>
  );
}
