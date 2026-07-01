"use client";

import { useState } from "react";
import { Shield, UserMinus } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { removeMemberAction, transferOwnershipAction } from "@/app/(account)/actions";
import { toast } from "@/components/ui/sonner";
import type { ConfirmOpts } from "@/components/ui/confirm-dialog";
import type { MemberDto } from "@/lib/households/membership";

interface MembersListProps {
  householdId: string;
  members: MemberDto[];
  currentEmail: string;
  isOwner: boolean;
  confirm: (opts: ConfirmOpts) => Promise<string | boolean>;
  onRefresh: () => void;
}

export function MembersList({
  householdId,
  members,
  currentEmail,
  isOwner,
  confirm,
  onRefresh,
}: MembersListProps) {
  const { t } = useT();
  const [pendingRemove, setPendingRemove] = useState<number | null>(null);
  const [pendingTransfer, setPendingTransfer] = useState<number | null>(null);

  async function handleRemove(memberId: number) {
    const ok = await confirm({
      title: t("common.remove"),
      message: t("household.removeMemberConfirm"),
      confirmLabel: t("common.remove"),
      cancelLabel: t("common.cancel"),
      destructive: true,
    });
    if (!ok) return;
    setPendingRemove(memberId);
    const res = await removeMemberAction(householdId, memberId);
    setPendingRemove(null);
    if (!res.ok) {
      toast.error(t("errors.memberRemove"));
      return;
    }
    onRefresh();
  }

  async function handleTransferOwnership(memberId: number, email: string) {
    const ok = await confirm({
      title: t("household.transferOwnership"),
      message: t("household.transferOwnershipConfirm", { email }),
      confirmLabel: t("common.confirm"),
      cancelLabel: t("common.cancel"),
      destructive: true,
    });
    if (!ok) return;
    setPendingTransfer(memberId);
    const res = await transferOwnershipAction(householdId, memberId);
    setPendingTransfer(null);
    if (!res.ok) {
      toast.error(t("errors.ownershipTransfer"));
      return;
    }
    toast.success(t("success.ownershipTransferred"));
    onRefresh();
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-foreground">{t("household.members")}</h2>
      <ul className="divide-y divide-border">
        {members.map((member) => (
          <li key={member.id} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                  member.role === "OWNER"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {member.email.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-foreground">{member.email}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  member.role === "OWNER"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {member.role === "OWNER" ? t("household.owner") : t("household.member")}
              </span>
            </div>
            {isOwner && member.email !== currentEmail && (
              <div className="flex items-center gap-1">
                {member.role !== "OWNER" && (
                  <button
                    type="button"
                    onClick={() => handleTransferOwnership(member.id, member.email)}
                    disabled={pendingTransfer === member.id}
                    className="rounded p-1 text-primary hover:bg-primary/10 disabled:opacity-50"
                    title={t("household.transferOwnership")}
                    aria-label={t("household.transferOwnership")}
                  >
                    <Shield size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(member.id)}
                  disabled={pendingRemove === member.id}
                  className="rounded p-1 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  title={t("common.remove")}
                  aria-label={t("common.remove")}
                >
                  <UserMinus size={16} />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
