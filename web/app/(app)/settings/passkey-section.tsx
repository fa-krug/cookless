"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { useT } from "@/lib/i18n/provider";
import { addPasskey } from "@/lib/auth-client/webauthn";
import { listPasskeysAction, deletePasskeyAction } from "@/app/(account)/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";

interface PasskeyDto {
  id: string;
  deviceName: string;
  createdAt: Date;
}

export function PasskeySection({ hasPassword }: { hasPassword: boolean }) {
  const { t } = useT();
  const { confirm, dialog } = useConfirm();

  const [passkeys, setPasskeys] = useState<PasskeyDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const fetchPasskeys = useCallback(async () => {
    const res = await listPasskeysAction();
    if (res.ok) {
      setPasskeys(res.data as PasskeyDto[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPasskeys();
  }, [fetchPasskeys]);

  async function handleAdd() {
    setAdding(true);
    try {
      await addPasskey();
      await fetchPasskeys();
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") {
        setAdding(false);
        return;
      }
      toast.error(t("errors.passkeyAdd"));
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = await confirm({
      title: t("passkeys.deletePasskey"),
      message: t("passkeys.confirmDelete"),
      confirmLabel: t("common.remove"),
      destructive: true,
    });
    if (!confirmed) return;
    const res = await deletePasskeyAction(id);
    if (res.ok) {
      await fetchPasskeys();
    } else {
      toast.error(t("errors.passkeyDelete"));
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t("passkeys.title")}</h3>

      {loading ? (
        <div className="h-8 animate-pulse rounded bg-muted" />
      ) : passkeys.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("passkeys.empty")}</p>
      ) : (
        <div className="space-y-2">
          {passkeys.map((pk) => (
            <div
              key={pk.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">{pk.deviceName || "Passkey"}</p>
                <p className="text-xs text-muted-foreground">
                  {t("passkeys.created", {
                    date: new Date(pk.createdAt).toLocaleDateString(),
                  })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                onClick={() => handleDelete(pk.id)}
                disabled={passkeys.length <= 1 && !hasPassword}
                title={
                  passkeys.length <= 1 && !hasPassword
                    ? t("passkeys.cannotDeleteLast")
                    : t("passkeys.deletePasskey")
                }
                aria-label={t("passkeys.deletePasskey")}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button
        variant="outline"
        className="w-full border-primary text-primary hover:bg-primary/10"
        onClick={handleAdd}
        disabled={adding}
      >
        {adding ? null : <Plus size={16} />}
        {adding ? t("common.loading") : t("passkeys.addPasskey")}
      </Button>

      {dialog}
    </div>
  );
}
