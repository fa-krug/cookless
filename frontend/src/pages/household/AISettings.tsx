import { Check, Sparkles, X } from "lucide-react";
import { Spinner } from "../../components/ui/Spinner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Household } from "../../api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth } from "../../hooks/useAuth";
import { toast } from "sonner";

export function AISettings({ isOwner }: { isOwner: boolean }) {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const household = user?.active_household;

  const [aiEnabled, setAiEnabled] = useState(household?.ai_enabled ?? false);
  const [geminiKey, setGeminiKey] = useState(household?.gemini_api_key ?? "");
  const [verifyingKey, setVerifyingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<"idle" | "valid" | "invalid">("idle");

  async function saveHouseholdSettings(patch: Record<string, unknown>) {
    if (!household) return;
    try {
      await api.patch<Household>(
        `/api/v1/households/${household.id}/settings/`,
        patch,
      );
      await refreshUser();
    } catch {
      toast.error(t("errors.settingsSave"));
    }
  }

  async function handleAiToggle() {
    const next = !aiEnabled;
    setAiEnabled(next);
    await saveHouseholdSettings({ ai_enabled: next });
  }

  async function handleGeminiKeyBlur() {
    if (geminiKey === (household?.gemini_api_key ?? "")) return;
    setKeyStatus("idle");
    await saveHouseholdSettings({ gemini_api_key: geminiKey });
  }

  async function handleVerifyKey() {
    if (!geminiKey) return;
    setVerifyingKey(true);
    setKeyStatus("idle");
    try {
      await api.post("/api/v1/users/me/verify-gemini-key/", { api_key: geminiKey });
      setKeyStatus("valid");
    } catch {
      setKeyStatus("invalid");
    } finally {
      setVerifyingKey(false);
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={20} className="text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">{t("ai.title")}</h2>
        </div>
        <button
          onClick={handleAiToggle}
          role="switch"
          aria-checked={aiEnabled}
          disabled={!isOwner}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
            aiEnabled ? "bg-primary" : "bg-muted"
          } ${isOwner ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
        >
          <span
            className={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-background shadow transition-transform ${
              aiEnabled ? "translate-x-5.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">{t("ai.description")}</p>

      {aiEnabled && (
        <>
          <Label>
            {t("ai.apiKey")}
          </Label>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder={t("ai.apiKeyPlaceholder")}
              value={geminiKey}
              onChange={(e) => {
                setGeminiKey(e.target.value);
                setKeyStatus("idle");
              }}
              onBlur={handleGeminiKeyBlur}
              disabled={!isOwner}
              className={cn("min-w-0 flex-1", !isOwner && "cursor-not-allowed bg-muted opacity-60")}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleVerifyKey}
              disabled={!geminiKey || verifyingKey || !isOwner}
              className={cn(
                "shrink-0",
                keyStatus === "valid"
                  ? "bg-green-100 text-green-700"
                  : keyStatus === "invalid"
                    ? "bg-destructive/10 text-destructive"
                    : ""
              )}
            >
              {verifyingKey ? (
                <Spinner />
              ) : keyStatus === "valid" ? (
                <Check size={16} />
              ) : keyStatus === "invalid" ? (
                <X size={16} />
              ) : null}
              {verifyingKey
                ? t("common.loading")
                : keyStatus === "valid"
                  ? t("ai.keyValid")
                  : keyStatus === "invalid"
                    ? t("ai.keyInvalid")
                    : t("ai.verify")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
