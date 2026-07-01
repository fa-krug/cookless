"use client";

import { useState } from "react";
import { Home, Pencil } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { updateHouseholdAction } from "@/app/(account)/actions";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HouseholdDto } from "@/lib/households/serialize";
import { SettingsSection } from "../settings-section";

interface HouseholdInfoProps {
  active: HouseholdDto;
  isOwner: boolean;
  onRefresh: () => void;
}

export function HouseholdInfo({ active, isOwner, onRefresh }: HouseholdInfoProps) {
  const { t } = useT();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(active.name);
  const [isPending, setIsPending] = useState(false);

  async function handleSave() {
    if (!editName.trim()) return;
    setIsPending(true);
    const res = await updateHouseholdAction(active.id, { name: editName.trim() });
    setIsPending(false);
    if (!res.ok) {
      toast.error(t("errors.householdUpdate"));
      return;
    }
    setIsEditing(false);
    onRefresh();
  }

  function handleCancel() {
    setEditName(active.name);
    setIsEditing(false);
  }

  return (
    <SettingsSection
      icon={Home}
      title={t("household.currentHousehold")}
      description={t("household.infoDescription")}
    >
      {isEditing ? (
        <div className="space-y-2">
          <Input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!editName.trim() || isPending}
            >
              {isPending ? t("common.saving") : t("common.save")}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={handleCancel}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {active.name} &middot; {t("household.members")} ({active.memberCount})
          </p>
          {isOwner && (
            <button
              type="button"
              onClick={() => {
                setEditName(active.name);
                setIsEditing(true);
              }}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
              title={t("household.editName")}
              aria-label={t("household.editName")}
            >
              <Pencil size={14} />
            </button>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
