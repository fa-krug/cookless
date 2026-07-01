"use client";

import { useState } from "react";
import { ArrowLeftRight, Building2, Check, Plus, UserPlus } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import {
  createHouseholdAction,
  joinHouseholdAction,
  switchHouseholdAction,
} from "@/app/(account)/actions";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HouseholdDto } from "@/lib/households/serialize";
import { cn } from "@/lib/utils";
import { SettingsSection } from "../settings-section";

interface ManageHouseholdsProps {
  households: HouseholdDto[];
  activeId: string | null;
  onRefresh: () => void;
}

export function ManageHouseholds({
  households,
  activeId,
  onRefresh,
}: ManageHouseholdsProps) {
  const { t } = useT();

  // Create household
  const [createName, setCreateName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Join household
  const [joinCode, setJoinCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  // Switch household
  const [switchOpen, setSwitchOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createName.trim()) return;
    setIsCreating(true);
    const res = await createHouseholdAction({ name: createName.trim() });
    setIsCreating(false);
    if (!res.ok) {
      toast.error(t("errors.householdCreate"));
      return;
    }
    setCreateName("");
    onRefresh();
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setIsJoining(true);
    const res = await joinHouseholdAction({ code: joinCode.trim() });
    setIsJoining(false);
    if (!res.ok) {
      toast.error(t("errors.householdJoin"));
      return;
    }
    toast.success(t("success.householdJoined"));
    setJoinCode("");
    onRefresh();
  }

  async function handleSwitch(id: string) {
    if (!id || id === activeId) {
      setSwitchOpen(false);
      return;
    }
    setIsSwitching(true);
    const res = await switchHouseholdAction(id);
    setIsSwitching(false);
    if (!res.ok) {
      toast.error(t("errors.householdSwitch"));
      return;
    }
    setSwitchOpen(false);
    onRefresh();
  }

  return (
    <>
      {/* Switch household (only when multiple) */}
      {households.length > 1 && (
        <SettingsSection
          icon={Building2}
          title={t("household.switchHousehold")}
          description={t("household.manageDescription")}
        >
          <Button
            variant="outline"
            onClick={() => setSwitchOpen(true)}
          >
            <ArrowLeftRight size={16} />
            {t("household.switchHousehold")}
          </Button>
        </SettingsSection>
      )}

      {/* Create household */}
      <SettingsSection
        icon={Plus}
        title={t("household.createHousehold")}
      >
        <form onSubmit={handleCreate} className="flex gap-2">
          <Input
            type="text"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder={t("household.householdName")}
            className="flex-1"
          />
          <Button type="submit" disabled={!createName.trim() || isCreating}>
            <Plus size={16} />
            {t("common.add")}
          </Button>
        </form>
      </SettingsSection>

      {/* Join household */}
      <SettingsSection
        icon={UserPlus}
        title={t("household.joinHousehold")}
      >
        <form onSubmit={handleJoin} className="flex gap-2">
          <Input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder={t("household.inviteCodePlaceholder")}
            className="flex-1"
          />
          <Button type="submit" disabled={!joinCode.trim() || isJoining}>
            <UserPlus size={16} />
            {t("household.joinHousehold")}
          </Button>
        </form>
      </SettingsSection>

      {/* Switch dialog */}
      {households.length > 1 && (
        <Dialog open={switchOpen} onOpenChange={setSwitchOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("household.switchHousehold")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {households.map((h) => (
                <Button
                  key={h.id}
                  variant="ghost"
                  onClick={() => handleSwitch(h.id)}
                  disabled={isSwitching}
                  className={cn(
                    "w-full justify-start px-4 py-3 text-sm font-medium",
                    h.id === activeId
                      ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                      : "bg-muted text-foreground hover:bg-muted",
                  )}
                >
                  {h.name}
                  {h.id === activeId && (
                    <Check size={16} className="ml-auto text-primary" />
                  )}
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
