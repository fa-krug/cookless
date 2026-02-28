import {
  ArrowLeftRight,
  Check,
  Clipboard,
  Link,
  LogOut,
  Pencil,
  Plus,
  RotateCcw,
  Shield,
  Sparkles,
  Tags,
  Trash2,
  UserMinus,
  UserPlus,
  X,
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
import { api } from "../api/client";
import { TAG_CATEGORIES, type Household, type Invite, type TagCategory } from "../api/types";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { toast } from "sonner";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import {
  useCreateTag,
  useDeleteTag,
  useResetTags,
  useTags,
  useUpdateTag,
} from "../hooks/useTags";
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
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("household.members")}</h2>
      <ul className="divide-y divide-gray-100">
        {household.members.map((member) => (
          <li key={member.id} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Avatar className="h-7 w-7 text-xs">
                <AvatarFallback
                  className={
                    member.role === "OWNER"
                      ? "bg-orange-100 text-orange-700"
                      : "bg-gray-100 text-gray-600"
                  }
                >
                  {member.email.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-gray-900">{member.email}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  member.role === "OWNER"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-gray-100 text-gray-600"
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
                    className="h-8 w-8 text-orange-500 hover:bg-orange-50 hover:text-orange-700"
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
                  className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-700"
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
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("household.generateInvite")}</h2>
      <Button
        onClick={handleGenerate}
        disabled={createInvite.isPending}
      >
        {createInvite.isPending ? <Spinner /> : <Link size={16} />}
        {t("household.generateInvite")}
      </Button>

      {invite && (
        <div className="mt-3 rounded-md bg-gray-50 p-3">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-gray-200 px-2 py-1 text-sm font-mono">
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
          <p className="mt-2 text-xs text-gray-500">
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
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("household.joinHousehold")}</h2>
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
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-gray-900">
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
  const { t, i18n } = useTranslation();
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

  // Tag state
  const { data: groupedTags } = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const resetTags = useResetTags();
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editNameEn, setEditNameEn] = useState("");
  const [editNameDe, setEditNameDe] = useState("");
  const [addingCategory, setAddingCategory] = useState<TagCategory | null>(null);
  const [newTagEn, setNewTagEn] = useState("");
  const [newTagDe, setNewTagDe] = useState("");

  // AI state
  const household = user?.active_household;
  const [aiEnabled, setAiEnabled] = useState(household?.ai_enabled ?? false);
  const [geminiKey, setGeminiKey] = useState(household?.gemini_api_key ?? "");
  const [verifyingKey, setVerifyingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<"idle" | "valid" | "invalid">("idle");

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
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t("household.title")}</h1>
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

      {isLoading && <p className="text-sm text-gray-500">{t("common.loading")}</p>}

      {!isLoading && (!households || households.length === 0) && !activeHousehold && (
        <div className="mb-6 mt-8 text-center">
          <p className="text-gray-500">{t("household.noHousehold")}</p>
        </div>
      )}

      {/* Current household info */}
      {activeHousehold && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
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
              <p className="text-sm text-gray-600">
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
                  className="h-7 w-7 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
      {activeHousehold && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={20} className="text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">{t("ai.title")}</h2>
            </div>
            <button
              onClick={handleAiToggle}
              role="switch"
              aria-checked={aiEnabled}
              disabled={!isOwner}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                aiEnabled ? "bg-orange-500" : "bg-gray-200"
              } ${isOwner ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
            >
              <span
                className={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
                  aiEnabled ? "translate-x-5.5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <p className="mb-3 text-sm text-gray-500">{t("ai.description")}</p>

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
                  className={cn("min-w-0 flex-1", !isOwner && "cursor-not-allowed bg-gray-50 opacity-60")}
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
                        ? "bg-red-100 text-red-700"
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
      )}

      {/* Manage Tags */}
      {activeHousehold && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tags size={20} className="text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">{t("tags.manageTags")}</h2>
            </div>
            {isOwner && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const confirmed = await confirm({
                    title: t("tags.resetToDefaults"),
                    message: t("tags.resetConfirm"),
                    confirmVariant: "danger",
                    cancelLabel: t("common.cancel"),
                  });
                  if (confirmed) {
                    resetTags.mutate(undefined, {
                      onSuccess: () => toast.success(t("tags.resetSuccess")),
                      onError: () => toast.error(t("errors.tagsReset")),
                    });
                  }
                }}
                disabled={resetTags.isPending}
              >
                {resetTags.isPending ? <Spinner /> : <RotateCcw size={14} />}
                {t("tags.resetToDefaults")}
              </Button>
            )}
          </div>
          <div className="space-y-3">
            {groupedTags &&
              TAG_CATEGORIES.map((category) => {
                const tags = groupedTags[category] || [];
                return (
                  <details key={category} className="rounded-lg border">
                    <summary className="cursor-pointer rounded-lg bg-gray-50 px-4 py-2 font-medium">
                      {t(`tags.${category}`)}
                      <span className="ml-2 text-sm text-gray-500">({tags.length})</span>
                    </summary>
                    <div className="space-y-1 p-3">
                      {tags.length === 0 && (
                        <p className="text-sm text-gray-400">{t("tags.noTags")}</p>
                      )}
                      {tags.map((tag) => (
                        <div
                          key={tag.id}
                          className="flex items-center justify-between rounded px-2 py-1 hover:bg-gray-50"
                        >
                          {isOwner && editingTag === tag.id ? (
                            <div className="flex flex-1 items-center justify-between gap-2">
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <Input
                                  value={editNameEn}
                                  onChange={(e) => setEditNameEn(e.target.value)}
                                  className="h-8 w-28"
                                  placeholder={t("tags.nameEn")}
                                />
                                <Input
                                  value={editNameDe}
                                  onChange={(e) => setEditNameDe(e.target.value)}
                                  className="h-8 w-28"
                                  placeholder={t("tags.nameDe")}
                                />
                              </div>
                              <div className="flex gap-1">
                                <IconButton
                                  variant="ghost"
                                  type="button"
                                  onClick={async () => {
                                    await updateTag.mutateAsync({
                                      id: tag.id,
                                      payload: { name_en: editNameEn, name_de: editNameDe },
                                    });
                                    setEditingTag(null);
                                  }}
                                  className="h-7 w-7 text-green-600 hover:bg-green-50"
                                  tooltip={t("common.save")}
                                  aria-label={t("common.save")}
                                >
                                  <Check size={14} />
                                </IconButton>
                                <IconButton
                                  variant="ghost"
                                  type="button"
                                  onClick={() => setEditingTag(null)}
                                  className="h-7 w-7 text-gray-400 hover:bg-gray-100"
                                  tooltip={t("common.cancel")}
                                  aria-label={t("common.cancel")}
                                >
                                  <X size={14} />
                                </IconButton>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2">
                                <span className="text-sm">
                                  {i18n.language === "de" ? tag.name_de : tag.name_en}
                                </span>
                                {tag.is_default && (
                                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-400">
                                    default
                                  </span>
                                )}
                              </div>
                              {isOwner && (
                                <div className="flex gap-1">
                                  <IconButton
                                    variant="ghost"
                                    type="button"
                                    onClick={() => {
                                      setEditingTag(tag.id);
                                      setEditNameEn(tag.name_en);
                                      setEditNameDe(tag.name_de);
                                    }}
                                    className="h-7 w-7 text-gray-400 hover:bg-gray-100 hover:text-orange-600"
                                    tooltip={t("tags.editTag")}
                                    aria-label={t("tags.editTag")}
                                  >
                                    <Pencil size={14} />
                                  </IconButton>
                                  <IconButton
                                    variant="ghost"
                                    type="button"
                                    onClick={async () => {
                                      const confirmed = await confirm({
                                        title: t("tags.deleteTag"),
                                        message: t("tags.deleteConfirm", { count: 0 }),
                                        confirmVariant: "danger",
                                        cancelLabel: t("common.cancel"),
                                      });
                                      if (confirmed) {
                                        deleteTag.mutate(tag.id);
                                      }
                                    }}
                                    className="h-7 w-7 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                    tooltip={t("tags.deleteTag")}
                                    aria-label={t("tags.deleteTag")}
                                  >
                                    <Trash2 size={14} />
                                  </IconButton>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                      {isOwner && (addingCategory === category ? (
                        <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <Input
                              value={newTagEn}
                              onChange={(e) => setNewTagEn(e.target.value)}
                              className="h-8 w-28"
                              placeholder={t("tags.nameEn")}
                            />
                            <Input
                              value={newTagDe}
                              onChange={(e) => setNewTagDe(e.target.value)}
                              className="h-8 w-28"
                              placeholder={t("tags.nameDe")}
                            />
                          </div>
                          <div className="flex gap-1">
                            <IconButton
                              variant="ghost"
                              type="button"
                              onClick={async () => {
                                if (newTagEn.trim() && newTagDe.trim()) {
                                  await createTag.mutateAsync({
                                    category,
                                    name_en: newTagEn.trim(),
                                    name_de: newTagDe.trim(),
                                  });
                                  setNewTagEn("");
                                  setNewTagDe("");
                                  setAddingCategory(null);
                                }
                              }}
                              className="h-7 w-7 text-green-600 hover:bg-green-50"
                              tooltip={t("common.save")}
                              aria-label={t("common.save")}
                            >
                              <Check size={14} />
                            </IconButton>
                            <IconButton
                              variant="ghost"
                              type="button"
                              onClick={() => {
                                setAddingCategory(null);
                                setNewTagEn("");
                                setNewTagDe("");
                              }}
                              className="h-7 w-7 text-gray-400 hover:bg-gray-100"
                              tooltip={t("common.cancel")}
                              aria-label={t("common.cancel")}
                            >
                              <X size={14} />
                            </IconButton>
                          </div>
                        </div>
                      ) : (
                        <Button
                          variant="link"
                          type="button"
                          onClick={() => setAddingCategory(category)}
                          className="mt-2 w-full justify-start pt-2 text-sm text-orange-600 hover:text-orange-700"
                        >
                          + {t("tags.addTag")}
                        </Button>
                      ))}
                    </div>
                  </details>
                );
              })}
          </div>
        </div>
      )}

      {/* Leave household (non-owner only) */}
      {activeHousehold && !isOwner && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <Button
            variant="outline"
            onClick={handleLeave}
            disabled={leaveHousehold.isPending}
            className="border-red-300 text-red-600 hover:bg-red-50"
          >
            {leaveHousehold.isPending ? <Spinner /> : <LogOut size={16} />}
            {t("household.leaveHousehold")}
          </Button>
        </div>
      )}

      {/* Delete household (owner only, danger zone) */}
      {activeHousehold && isOwner && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/50">
          <h2 className="mb-2 text-lg font-semibold text-red-900 dark:text-red-300">
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
              <p className="mb-2 text-sm text-red-800 dark:text-red-300">
                {t("household.deleteConfirm", { name: activeHousehold.name })}
              </p>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={t("household.deleteConfirmPlaceholder")}
                  className="flex-1 border-red-300 focus-visible:ring-red-500 dark:border-red-700 dark:bg-red-950 dark:text-red-200 dark:placeholder-red-400"
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
                  ? "bg-orange-50 text-orange-700 ring-1 ring-orange-300"
                  : "bg-gray-50 text-gray-700 hover:bg-gray-100"
              )}
            >
              {h.name}
              {h.id === activeHouseholdId && (
                <Check size={16} className="float-right mt-0.5 text-orange-500" />
              )}
            </Button>
          ))}
        </div>
      </ResponsiveOverlay>
    </div>
  );
}
