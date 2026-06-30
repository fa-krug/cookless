"use client";

import { useState } from "react";
import { LogOut, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { leaveHouseholdAction, deleteHouseholdAction } from "@/app/(account)/actions";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import type { ConfirmOpts } from "@/components/ui/confirm-dialog";
import type { HouseholdDto } from "@/lib/households/serialize";

interface DangerZoneProps {
  active: HouseholdDto;
  isOwner: boolean;
  confirm: (opts: ConfirmOpts) => Promise<string | boolean>;
  onRefresh: () => void;
}

export function DangerZone({ active, isOwner, confirm, onRefresh }: DangerZoneProps) {
  const { t } = useT();
  const [isPending, setIsPending] = useState(false);

  async function handleLeave() {
    const ok = await confirm({
      title: t("household.leaveHousehold"),
      message: t("household.leaveConfirm"),
      confirmLabel: t("household.leaveHousehold"),
      cancelLabel: t("common.cancel"),
      destructive: true,
    });
    if (!ok) return;
    setIsPending(true);
    const res = await leaveHouseholdAction(active.id);
    setIsPending(false);
    if (!res.ok) {
      toast.error(t("errors.householdLeave"));
      return;
    }
    toast.success(t("success.householdLeft"));
    onRefresh();
  }

  async function handleDelete() {
    const result = await confirm({
      title: t("household.deleteHousehold"),
      message: t("household.deleteConfirm", { name: active.name }),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      destructive: true,
      input: {
        placeholder: t("household.deleteConfirmPlaceholder"),
        expected: active.name,
      },
    });
    if (!result || result !== active.name) return;
    setIsPending(true);
    const res = await deleteHouseholdAction(active.id);
    setIsPending(false);
    if (!res.ok) {
      toast.error(t("errors.householdDelete"));
      return;
    }
    toast.success(t("success.householdDeleted"));
    onRefresh();
  }

  if (!isOwner) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <Button
          variant="outline"
          onClick={handleLeave}
          disabled={isPending}
          className="border-destructive text-destructive hover:bg-destructive/10"
        >
          <LogOut size={16} />
          {t("household.leaveHousehold")}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 dark:border-destructive/30 dark:bg-destructive/10">
      <h2 className="mb-2 text-lg font-semibold text-destructive dark:text-destructive">
        {t("household.deleteHousehold")}
      </h2>
      <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
        <Trash2 size={16} />
        {t("household.deleteHousehold")}
      </Button>
    </div>
  );
}
