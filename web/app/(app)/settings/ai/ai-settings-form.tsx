"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { Check, X } from "lucide-react";
import { updateAiSettingsAction } from "@/app/(app)/actions";
import { verifyGeminiKeyAction } from "@/app/(account)/actions";
import { Card } from "@/components/ui/card";

type KeyStatus = "idle" | "valid" | "invalid" | "unreachable";

export function AiSettingsForm({
  aiEnabled,
  hasKey,
  isOwner,
}: {
  aiEnabled: boolean;
  hasKey: boolean;
  isOwner: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [enabled, setEnabled] = useState(aiEnabled);
  const [key, setKey] = useState("");
  const [pending, startTransition] = useTransition();
  const [verifying, setVerifying] = useState(false);
  const [keyStatus, setKeyStatus] = useState<KeyStatus>("idle");

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

  async function onVerify() {
    if (!key.trim() || verifying || !isOwner) return;
    setVerifying(true);
    setKeyStatus("idle");
    const res = await verifyGeminiKeyAction(key.trim());
    if (res.ok) {
      setKeyStatus(res.data as KeyStatus);
    } else {
      setKeyStatus("unreachable");
    }
    setVerifying(false);
  }

  function getVerifyLabel() {
    if (verifying) return t("common.loading");
    if (keyStatus === "valid") return t("aiSettings.keyValid");
    if (keyStatus === "invalid") return t("aiSettings.keyInvalid");
    if (keyStatus === "unreachable") return t("aiSettings.keyUnreachable");
    return t("aiSettings.verify");
  }

  return (
    <Card className="max-w-md space-y-4 p-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={!isOwner}
          className={!isOwner ? "cursor-not-allowed opacity-60" : undefined}
        />
        {t("aiSettings.enable")}
      </label>
      <label className="block text-sm">
        {t("aiSettings.apiKey")}
        <div className="mt-1 flex gap-2">
          <Input
            type="password"
            autoComplete="off"
            value={key}
            placeholder={t("aiSettings.apiKeyPlaceholder")}
            disabled={!isOwner}
            onChange={(e) => {
              setKey(e.target.value);
              setKeyStatus("idle");
            }}
            className={!isOwner ? "cursor-not-allowed opacity-60" : undefined}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!key.trim() || verifying || !isOwner}
            onClick={onVerify}
            className={
              keyStatus === "valid"
                ? "shrink-0 bg-green-100 text-green-700"
                : keyStatus === "invalid"
                  ? "shrink-0 bg-destructive/10 text-destructive"
                  : "shrink-0"
            }
          >
            {!verifying && keyStatus === "valid" && <Check size={16} className="mr-1" />}
            {!verifying && keyStatus === "invalid" && <X size={16} className="mr-1" />}
            {getVerifyLabel()}
          </Button>
        </div>
        {hasKey && (
          <span className="mt-1 block text-xs text-muted-foreground">{t("aiSettings.apiKeySet")}</span>
        )}
      </label>
      <Button disabled={pending || !isOwner} onClick={onSave}>
        {t("aiSettings.save")}
      </Button>
    </Card>
  );
}
