import { Plus, Trash2 } from "lucide-react";
import { Spinner } from "../../components/ui/Spinner";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Passkey } from "../../api/types";
import { addPasskey } from "../../api/webauthn";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/IconButton";
import { SettingsSkeleton } from "../../components/ui/SettingsSkeleton";
import { useConfirm } from "../../hooks/useConfirm";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useAuth } from "../../hooks/useAuth";
import { toast } from "sonner";

export function PasskeySection() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const { confirm, dialogProps } = useConfirm();

  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(true);
  const [addingPasskey, setAddingPasskey] = useState(false);

  const fetchPasskeys = useCallback(async () => {
    try {
      const data = await api.get<Passkey[]>("/api/v1/users/me/passkeys/");
      setPasskeys(data);
    } catch {
      // silently fail
    } finally {
      setPasskeysLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPasskeys();
  }, [fetchPasskeys]);

  async function handleAddPasskey() {
    setAddingPasskey(true);
    try {
      await addPasskey(navigator.userAgent);
      await fetchPasskeys();
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") return;
      toast.error(t("errors.passkeyAdd"));
    } finally {
      setAddingPasskey(false);
    }
  }

  async function handleDeletePasskey(id: string) {
    const confirmed = await confirm({
      title: t("passkeys.deletePasskey"),
      message: t("passkeys.confirmDelete"),
      confirmLabel: t("common.remove"),
      confirmVariant: "danger",
      cancelLabel: t("common.cancel"),
    });
    if (!confirmed) return;
    try {
      await api.delete(`/api/v1/users/me/passkeys/${id}/`);
      await fetchPasskeys();
      await refreshUser();
    } catch {
      toast.error(t("errors.passkeyDelete"));
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-foreground">{t("passkeys.title")}</h2>

      {passkeysLoading ? (
        <SettingsSkeleton />
      ) : (
        <div className="space-y-3">
          {passkeys.map((passkey) => (
            <div
              key={passkey.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  {passkey.device_name || "Passkey"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("passkeys.added", {
                    date: new Date(passkey.created_at).toLocaleDateString(),
                  })}
                </p>
              </div>
              <IconButton
                variant="ghost"
                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                onClick={() => handleDeletePasskey(passkey.id)}
                disabled={passkeys.length <= 1 && !user?.has_password}
                tooltip={
                  passkeys.length <= 1 && !user?.has_password
                    ? t("passkeys.cannotDeleteLast")
                    : t("passkeys.deletePasskey")
                }
                aria-label={t("passkeys.deletePasskey")}
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      <Button
        variant="outline"
        className="mt-3 w-full border-primary text-primary hover:bg-primary/10"
        onClick={handleAddPasskey}
        disabled={addingPasskey}
      >
        {addingPasskey ? <Spinner /> : <Plus size={16} />}
        {addingPasskey ? t("common.loading") : t("passkeys.addPasskey")}
      </Button>
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </div>
  );
}
