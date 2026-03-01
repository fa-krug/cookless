import {
  ArrowLeftRight,
  Check,
  Clipboard,
  Link,
  LogOut,
  Pencil,
  Plus,
  Shield,
  UserMinus,
  UserPlus,
} from "lucide-react";
import ResponsiveOverlay from "../components/ui/ResponsiveOverlay";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Spinner } from "../components/ui/Spinner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  householdNameSchema,
  joinHouseholdSchema,
  type HouseholdNameFormValues,
  type JoinHouseholdFormValues,
} from "@/lib/schemas/household";
import type { Household, Invite } from "../api/types";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { toast } from "sonner";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import {
  useAcceptInvite,
  useCreateHousehold,
  useCreateInvite,
  useDeleteHousehold,
  useHouseholds,
  useLeaveHousehold,
  useRemoveMember,
  useSwitchHousehold,
  useTransferOwnership,
  useUpdateHousehold,
} from "../hooks/useHousehold";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AISettings } from "./household/AISettings";
import { TagManagement } from "./household/TagManagement";

function MembersList({
  household,
  currentUserEmail,
  isOwner,
  onOwnershipTransferred,
}: {
  household: Household;
  currentUserEmail: string;
  isOwner: boolean;
  onOwnershipTransferred: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { confirm, dialogProps } = useConfirm();
  const removeMember = useRemoveMember();
  const transferOwnership = useTransferOwnership();

  async function handleRemove(memberId: number) {
    const confirmed = await confirm({
      title: t("common.remove"),
      message: t("household.removeMemberConfirm"),
      confirmLabel: t("common.remove"),
      confirmVariant: "danger",
      cancelLabel: t("common.cancel"),
    });
    if (!confirmed) return;
    removeMember.mutate(
      { householdId: household.id, memberId },
      {
        onError: () => toast.error(t("errors.memberRemove")),
      },
    );
  }

  async function handleTransferOwnership(memberId: number, email: string) {
    const confirmed = await confirm({
      title: t("household.transferOwnership"),
      message: t("household.transferOwnershipConfirm", { email }),
      confirmLabel: t("common.confirm"),
      confirmVariant: "danger",
      cancelLabel: t("common.cancel"),
    });
    if (!confirmed) return;
    transferOwnership.mutate(
      { householdId: household.id, memberId },
      {
        onSuccess: async () => {
          await onOwnershipTransferred();
          toast.success(t("success.ownershipTransferred"));
        },
        onError: () => toast.error(t("errors.ownershipTransfer")),
      },
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-foreground">{t("household.members")}</h2>
      <ul className="divide-y divide-border">
        {household.members.map((member) => (
          <li key={member.id} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Avatar className="h-7 w-7 text-xs">
                <AvatarFallback
                  className={
                    member.role === "OWNER"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {member.email.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
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
            {isOwner && member.email !== currentUserEmail && (
              <div className="flex items-center gap-1">
                {member.role !== "OWNER" && (
                  <IconButton
                    variant="ghost"
                    onClick={() => handleTransferOwnership(member.id, member.email)}
                    disabled={transferOwnership.isPending}
                    className="h-8 w-8 text-primary hover:bg-primary/10 hover:text-primary"
                    tooltip={t("household.transferOwnership")}
                    aria-label={t("household.transferOwnership")}
                  >
                    {transferOwnership.isPending ? <Spinner /> : <Shield size={16} />}
                  </IconButton>
                )}
                <IconButton
                  variant="ghost"
                  onClick={() => handleRemove(member.id)}
                  disabled={removeMember.isPending}
                  className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  tooltip={t("common.remove")}
                  aria-label={t("common.remove")}
                >
                  {removeMember.isPending ? <Spinner /> : <UserMinus size={16} />}
                </IconButton>
              </div>
            )}
          </li>
        ))}
      </ul>
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </div>
  );
}

function InviteSection({ householdId }: { householdId: string }) {
  const { t } = useTranslation();
  const createInvite = useCreateInvite();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [copied, setCopied] = useState(false);

  function handleGenerate() {
    createInvite.mutate(householdId, {
      onSuccess: (data) => {
        setInvite(data);
        setCopied(false);
      },
      onError: () => toast.error(t("errors.inviteCreate")),
    });
  }

  async function handleCopy() {
    if (!invite) return;
    await navigator.clipboard.writeText(invite.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-foreground">{t("household.generateInvite")}</h2>
      <Button
        onClick={handleGenerate}
        disabled={createInvite.isPending}
      >
        {createInvite.isPending ? <Spinner /> : <Link size={16} />}
        {t("household.generateInvite")}
      </Button>

      {invite && (
        <div className="mt-3 rounded-md bg-muted p-3">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-sm font-mono">
              {invite.code}
            </code>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopy}
            >
              <Clipboard size={14} />
              {copied ? t("household.copied") : t("household.copyLink")}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("household.inviteExpiry", {
              date: new Date(invite.expires_at).toLocaleDateString(),
            })}
          </p>
        </div>
      )}
    </div>
  );
}

function JoinHouseholdSection() {
  const { t } = useTranslation();
  const acceptInvite = useAcceptInvite();
  const { refreshUser } = useAuth();

  const form = useForm<JoinHouseholdFormValues>({
    resolver: zodResolver(joinHouseholdSchema),
    defaultValues: { code: "" },
  });

  function handleJoin(values: JoinHouseholdFormValues) {
    acceptInvite.mutate(values.code.trim(), {
      onSuccess: async () => {
        form.reset();
        await refreshUser();
        toast.success(t("success.householdJoined"));
      },
      onError: () => toast.error(t("errors.householdJoin")),
    });
  }

  const code = form.watch("code");

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-foreground">{t("household.joinHousehold")}</h2>
      <form onSubmit={form.handleSubmit(handleJoin)} className="flex gap-2">
        <Input
          type="text"
          {...form.register("code")}
          placeholder={t("household.inviteCodePlaceholder")}
          className="flex-1"
        />
        <Button
          type="submit"
          disabled={!code.trim() || acceptInvite.isPending}
        >
          {acceptInvite.isPending ? <Spinner /> : <UserPlus size={16} />}
          {t("household.joinHousehold")}
        </Button>
      </form>
    </div>
  );
}

function CreateHouseholdSection() {
  const { t } = useTranslation();
  const createHousehold = useCreateHousehold();
  const { refreshUser } = useAuth();

  const form = useForm<HouseholdNameFormValues>({
    resolver: zodResolver(householdNameSchema),
    defaultValues: { name: "" },
  });

  function handleCreate(values: HouseholdNameFormValues) {
    createHousehold.mutate(values.name.trim(), {
      onSuccess: async () => {
        form.reset();
        await refreshUser();
      },
      onError: () => toast.error(t("errors.householdCreate")),
    });
  }

  const name = form.watch("name");

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-foreground">
        {t("household.createHousehold")}
      </h2>
      <form onSubmit={form.handleSubmit(handleCreate)} className="flex gap-2">
        <Input
          type="text"
          {...form.register("name")}
          placeholder={t("household.householdName")}
          className="flex-1"
        />
        <Button
          type="submit"
          disabled={!name.trim() || createHousehold.isPending}
        >
          {createHousehold.isPending ? <Spinner /> : <Plus size={16} />}
          {t("common.add")}
        </Button>
      </form>
    </div>
  );
}

export default function HouseholdPage() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const { confirm, dialogProps } = useConfirm();
  const { data: households, isLoading } = useHouseholds();
  const switchHousehold = useSwitchHousehold();
  const updateHousehold = useUpdateHousehold();
  const deleteHousehold = useDeleteHousehold();
  const leaveHousehold = useLeaveHousehold();

  const [switchDrawerOpen, setSwitchDrawerOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const editForm = useForm<HouseholdNameFormValues>({
    resolver: zodResolver(householdNameSchema),
    defaultValues: { name: "" },
  });
  const editName = editForm.watch("name");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const activeHouseholdId = user?.active_household?.id ?? null;

  const activeHousehold = households?.find((h) => h.id === activeHouseholdId) ?? null;
  const currentUserEmail = user?.email ?? "";

  const isOwner =
    activeHousehold?.members.some(
      (m) => m.email === currentUserEmail && m.role === "OWNER",
    ) ?? false;

  function handleSwitch(id: string) {
    if (!id || id === activeHouseholdId) return;
    switchHousehold.mutate(id, {
      onSuccess: async () => {
        setSwitchDrawerOpen(false);
        setIsEditing(false);
        setShowDeleteConfirm(false);
        setDeleteConfirmName("");
        await refreshUser();
      },
      onError: () => toast.error(t("errors.householdSwitch")),
    });
  }

  async function handleLeave() {
    if (!activeHousehold) return;
    const confirmed = await confirm({
      title: t("household.leaveHousehold"),
      message: t("household.leaveConfirm"),
      confirmLabel: t("household.leaveHousehold"),
      confirmVariant: "danger",
      cancelLabel: t("common.cancel"),
    });
    if (!confirmed) return;
    leaveHousehold.mutate(activeHousehold.id, {
      onSuccess: async () => {
        await refreshUser();
        toast.success(t("success.householdLeft"));
      },
      onError: () => toast.error(t("errors.householdLeave")),
    });
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("household.title")}</h1>
        {households && households.length > 1 && (
          <IconButton
            variant="ghost"
            onClick={() => setSwitchDrawerOpen(true)}
            tooltip={t("household.switchHousehold")}
            aria-label={t("household.switchHousehold")}
          >
            <ArrowLeftRight size={20} />
          </IconButton>
        )}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}

      {!isLoading && (!households || households.length === 0) && !activeHousehold && (
        <div className="mb-6 mt-8 text-center">
          <p className="text-muted-foreground">{t("household.noHousehold")}</p>
        </div>
      )}

      {/* Current household info */}
      {activeHousehold && (
        <div className="mb-4 rounded-lg border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            {t("household.currentHousehold")}
          </h2>
          {isEditing ? (
            <form
              onSubmit={editForm.handleSubmit((values) => {
                updateHousehold.mutate(
                  { id: activeHousehold.id, name: values.name.trim() },
                  {
                    onSuccess: async () => {
                      setIsEditing(false);
                      await refreshUser();
                    },
                    onError: () => toast.error(t("errors.householdUpdate")),
                  },
                );
              })}
              className="space-y-2"
            >
              <Input
                type="text"
                {...editForm.register("name")}
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={!editName.trim() || updateHousehold.isPending}
                >
                  {updateHousehold.isPending ? t("common.loading") : t("common.save")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                {activeHousehold.name} &middot; {t("household.members")} (
                {activeHousehold.members.length})
              </p>
              {isOwner && (
                <IconButton
                  variant="ghost"
                  onClick={() => {
                    editForm.setValue("name", activeHousehold.name);
                    setIsEditing(true);
                  }}
                  className="h-7 w-7 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
                  tooltip={t("household.editName")}
                  aria-label={t("household.editName")}
                >
                  <Pencil size={14} />
                </IconButton>
              )}
            </div>
          )}
        </div>
      )}

      {/* Members list */}
      {activeHousehold && (
        <div className="mb-4">
          <MembersList
            household={activeHousehold}
            currentUserEmail={currentUserEmail}
            isOwner={isOwner}
            onOwnershipTransferred={refreshUser}
          />
        </div>
      )}

      {/* Invite section (only for owners) */}
      {activeHousehold && isOwner && (
        <div className="mb-4">
          <InviteSection householdId={activeHousehold.id} />
        </div>
      )}

      {/* Create household */}
      <div className="mb-4">
        <CreateHouseholdSection />
      </div>

      {/* Join household */}
      <div className="mb-4">
        <JoinHouseholdSection />
      </div>

      {/* AI Settings */}
      {activeHousehold && <AISettings isOwner={isOwner} />}

      {/* Manage Tags */}
      {activeHousehold && <TagManagement isOwner={isOwner} />}

      {/* Leave household (non-owner only) */}
      {activeHousehold && !isOwner && (
        <div className="mb-4 rounded-lg border border-border bg-card p-4 shadow-sm">
          <Button
            variant="outline"
            onClick={handleLeave}
            disabled={leaveHousehold.isPending}
            className="border-destructive text-destructive hover:bg-destructive/10"
          >
            {leaveHousehold.isPending ? <Spinner /> : <LogOut size={16} />}
            {t("household.leaveHousehold")}
          </Button>
        </div>
      )}

      {/* Delete household (owner only, danger zone) */}
      {activeHousehold && isOwner && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 dark:border-destructive/30 dark:bg-destructive/10">
          <h2 className="mb-2 text-lg font-semibold text-destructive dark:text-destructive">
            {t("household.deleteHousehold")}
          </h2>
          {!showDeleteConfirm ? (
            <Button
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
            >
              {t("household.deleteHousehold")}
            </Button>
          ) : (
            <div>
              <p className="mb-2 text-sm text-destructive dark:text-destructive">
                {t("household.deleteConfirm", { name: activeHousehold.name })}
              </p>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={t("household.deleteConfirmPlaceholder")}
                  className="flex-1 border-destructive focus-visible:ring-destructive dark:border-destructive dark:bg-destructive/10 dark:text-destructive dark:placeholder-destructive/60"
                />
                <Button
                  variant="destructive"
                  onClick={() => {
                    deleteHousehold.mutate(activeHousehold.id, {
                      onSuccess: async () => {
                        setShowDeleteConfirm(false);
                        setDeleteConfirmName("");
                        await refreshUser();
                        toast.success(t("success.householdDeleted"));
                      },
                      onError: () => toast.error(t("errors.householdDelete")),
                    });
                  }}
                  disabled={
                    deleteConfirmName !== activeHousehold.name || deleteHousehold.isPending
                  }
                >
                  {t("common.delete")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmName("");
                  }}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {dialogProps && <ConfirmDialog {...dialogProps} />}

      {/* Switch household drawer */}
      <ResponsiveOverlay
        open={switchDrawerOpen}
        onClose={() => setSwitchDrawerOpen(false)}
        title={t("household.switchHousehold")}
        size="sm"
      >
        <div className="space-y-2">
          {households?.map((h) => (
            <Button
              key={h.id}
              variant="ghost"
              onClick={() => handleSwitch(h.id)}
              disabled={switchHousehold.isPending}
              className={cn(
                "w-full justify-start px-4 py-3 text-sm font-medium",
                h.id === activeHouseholdId
                  ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                  : "bg-muted text-foreground hover:bg-muted"
              )}
            >
              {h.name}
              {h.id === activeHouseholdId && (
                <Check size={16} className="float-right mt-0.5 text-primary" />
              )}
            </Button>
          ))}
        </div>
      </ResponsiveOverlay>
    </div>
  );
}
