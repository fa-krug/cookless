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
import { Spinner } from "../components/ui/Spinner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { TAG_CATEGORIES, type Household, type Invite, type TagCategory } from "../api/types";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useToast } from "../hooks/useToast";
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
  const { addToast } = useToast();
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
        onError: () => addToast(t("errors.memberRemove"), "error"),
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
          addToast(t("success.ownershipTransferred"), "success");
        },
        onError: () => addToast(t("errors.ownershipTransfer"), "error"),
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
                  <button
                    onClick={() => handleTransferOwnership(member.id, member.email)}
                    disabled={transferOwnership.isPending}
                    className="rounded-md p-1.5 text-orange-500 hover:bg-orange-50 hover:text-orange-700 disabled:opacity-50"
                    aria-label={t("household.transferOwnership")}
                  >
                    {transferOwnership.isPending ? <Spinner /> : <Shield size={16} />}
                  </button>
                )}
                <button
                  onClick={() => handleRemove(member.id)}
                  disabled={removeMember.isPending}
                  className="rounded-md p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                  aria-label={t("common.remove")}
                >
                  {removeMember.isPending ? <Spinner /> : <UserMinus size={16} />}
                </button>
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
  const { addToast } = useToast();
  const createInvite = useCreateInvite();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [copied, setCopied] = useState(false);

  function handleGenerate() {
    createInvite.mutate(householdId, {
      onSuccess: (data) => {
        setInvite(data);
        setCopied(false);
      },
      onError: () => addToast(t("errors.inviteCreate"), "error"),
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
      <button
        onClick={handleGenerate}
        disabled={createInvite.isPending}
        className="flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {createInvite.isPending ? <Spinner /> : <Link size={16} />}
        {t("household.generateInvite")}
      </button>

      {invite && (
        <div className="mt-3 rounded-md bg-gray-50 p-3">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-gray-200 px-2 py-1 text-sm font-mono">
              {invite.code}
            </code>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-md bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
            >
              <Clipboard size={14} />
              {copied ? t("household.copied") : t("household.copyLink")}
            </button>
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
  const { addToast } = useToast();
  const acceptInvite = useAcceptInvite();
  const { refreshUser } = useAuth();
  const [code, setCode] = useState("");

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    acceptInvite.mutate(code.trim(), {
      onSuccess: async () => {
        setCode("");
        await refreshUser();
        addToast(t("success.householdJoined"), "success");
      },
      onError: () => addToast(t("errors.householdJoin"), "error"),
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("household.joinHousehold")}</h2>
      <form onSubmit={handleJoin} className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("household.inviteCodePlaceholder")}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <button
          type="submit"
          disabled={!code.trim() || acceptInvite.isPending}
          className="flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {acceptInvite.isPending ? <Spinner /> : <UserPlus size={16} />}
          {t("household.joinHousehold")}
        </button>
      </form>
    </div>
  );
}

function CreateHouseholdSection() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const createHousehold = useCreateHousehold();
  const { refreshUser } = useAuth();
  const [name, setName] = useState("");

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createHousehold.mutate(name.trim(), {
      onSuccess: async () => {
        setName("");
        await refreshUser();
      },
      onError: () => addToast(t("errors.householdCreate"), "error"),
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-gray-900">
        {t("household.createHousehold")}
      </h2>
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("household.householdName")}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <button
          type="submit"
          disabled={!name.trim() || createHousehold.isPending}
          className="flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {createHousehold.isPending ? <Spinner /> : <Plus size={16} />}
          {t("common.add")}
        </button>
      </form>
    </div>
  );
}

export default function HouseholdPage() {
  const { t, i18n } = useTranslation();
  const { addToast } = useToast();
  const { user, refreshUser } = useAuth();
  const { confirm, dialogProps } = useConfirm();
  const { data: households, isLoading } = useHouseholds();
  const switchHousehold = useSwitchHousehold();
  const updateHousehold = useUpdateHousehold();
  const deleteHousehold = useDeleteHousehold();
  const leaveHousehold = useLeaveHousehold();

  const [switchDrawerOpen, setSwitchDrawerOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
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
      onError: () => addToast(t("errors.householdSwitch"), "error"),
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
        addToast(t("success.householdLeft"), "success");
      },
      onError: () => addToast(t("errors.householdLeave"), "error"),
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
      addToast(t("errors.settingsSave"), "error");
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
          <button
            onClick={() => setSwitchDrawerOpen(true)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label={t("household.switchHousehold")}
          >
            <ArrowLeftRight size={20} />
          </button>
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
              onSubmit={(e) => {
                e.preventDefault();
                if (!editName.trim()) return;
                updateHousehold.mutate(
                  { id: activeHousehold.id, name: editName.trim() },
                  {
                    onSuccess: async () => {
                      setIsEditing(false);
                      await refreshUser();
                    },
                    onError: () => addToast(t("errors.householdUpdate"), "error"),
                  },
                );
              }}
              className="space-y-2"
            >
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!editName.trim() || updateHousehold.isPending}
                  className="rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {updateHousehold.isPending ? t("common.loading") : t("common.save")}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-md bg-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-600">
                {activeHousehold.name} &middot; {t("household.members")} (
                {activeHousehold.members.length})
              </p>
              {isOwner && (
                <button
                  onClick={() => {
                    setEditName(activeHousehold.name);
                    setIsEditing(true);
                  }}
                  className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  aria-label={t("household.editName")}
                >
                  <Pencil size={14} />
                </button>
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
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t("ai.apiKey")}
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder={t("ai.apiKeyPlaceholder")}
                  value={geminiKey}
                  onChange={(e) => {
                    setGeminiKey(e.target.value);
                    setKeyStatus("idle");
                  }}
                  onBlur={handleGeminiKeyBlur}
                  disabled={!isOwner}
                  className={`min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 ${!isOwner ? "cursor-not-allowed bg-gray-50 opacity-60" : ""}`}
                />
                <button
                  onClick={handleVerifyKey}
                  disabled={!geminiKey || verifyingKey || !isOwner}
                  className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50 ${
                    keyStatus === "valid"
                      ? "bg-green-100 text-green-700"
                      : keyStatus === "invalid"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
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
                </button>
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
              <button
                onClick={async () => {
                  const confirmed = await confirm({
                    title: t("tags.resetToDefaults"),
                    message: t("tags.resetConfirm"),
                    confirmVariant: "danger",
                    cancelLabel: t("common.cancel"),
                  });
                  if (confirmed) {
                    resetTags.mutate(undefined, {
                      onSuccess: () => addToast(t("tags.resetSuccess"), "success"),
                      onError: () => addToast(t("errors.tagsReset"), "error"),
                    });
                  }
                }}
                disabled={resetTags.isPending}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                {resetTags.isPending ? <Spinner /> : <RotateCcw size={14} />}
                {t("tags.resetToDefaults")}
              </button>
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
                                <input
                                  value={editNameEn}
                                  onChange={(e) => setEditNameEn(e.target.value)}
                                  className="w-28 rounded border px-2 py-0.5 text-sm"
                                  placeholder={t("tags.nameEn")}
                                />
                                <input
                                  value={editNameDe}
                                  onChange={(e) => setEditNameDe(e.target.value)}
                                  className="w-28 rounded border px-2 py-0.5 text-sm"
                                  placeholder={t("tags.nameDe")}
                                />
                              </div>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await updateTag.mutateAsync({
                                      id: tag.id,
                                      payload: { name_en: editNameEn, name_de: editNameDe },
                                    });
                                    setEditingTag(null);
                                  }}
                                  className="rounded-md p-1.5 text-green-600 hover:bg-green-50"
                                  aria-label={t("common.save")}
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingTag(null)}
                                  className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100"
                                  aria-label={t("common.cancel")}
                                >
                                  <X size={14} />
                                </button>
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
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTag(tag.id);
                                      setEditNameEn(tag.name_en);
                                      setEditNameDe(tag.name_de);
                                    }}
                                    className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-orange-600"
                                    aria-label={t("tags.editTag")}
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
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
                                    className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                    aria-label={t("tags.deleteTag")}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                      {isOwner && (addingCategory === category ? (
                        <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <input
                              value={newTagEn}
                              onChange={(e) => setNewTagEn(e.target.value)}
                              className="w-28 rounded border px-2 py-0.5 text-sm"
                              placeholder={t("tags.nameEn")}
                            />
                            <input
                              value={newTagDe}
                              onChange={(e) => setNewTagDe(e.target.value)}
                              className="w-28 rounded border px-2 py-0.5 text-sm"
                              placeholder={t("tags.nameDe")}
                            />
                          </div>
                          <div className="flex gap-1">
                            <button
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
                              className="rounded-md p-1.5 text-green-600 hover:bg-green-50"
                              aria-label={t("common.save")}
                            >
                              <Check size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAddingCategory(null);
                                setNewTagEn("");
                                setNewTagDe("");
                              }}
                              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100"
                              aria-label={t("common.cancel")}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAddingCategory(category)}
                          className="mt-2 w-full border-t pt-2 text-left text-sm text-orange-600 hover:text-orange-700"
                        >
                          + {t("tags.addTag")}
                        </button>
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
          <button
            onClick={handleLeave}
            disabled={leaveHousehold.isPending}
            className="flex items-center gap-2 rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {leaveHousehold.isPending ? <Spinner /> : <LogOut size={16} />}
            {t("household.leaveHousehold")}
          </button>
        </div>
      )}

      {/* Delete household (owner only, danger zone) */}
      {activeHousehold && isOwner && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/50">
          <h2 className="mb-2 text-lg font-semibold text-red-900 dark:text-red-300">
            {t("household.deleteHousehold")}
          </h2>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              {t("household.deleteHousehold")}
            </button>
          ) : (
            <div>
              <p className="mb-2 text-sm text-red-800 dark:text-red-300">
                {t("household.deleteConfirm", { name: activeHousehold.name })}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={t("household.deleteConfirmPlaceholder")}
                  className="flex-1 rounded-md border border-red-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-red-700 dark:bg-red-950 dark:text-red-200 dark:placeholder-red-400"
                />
                <button
                  onClick={() => {
                    deleteHousehold.mutate(activeHousehold.id, {
                      onSuccess: async () => {
                        setShowDeleteConfirm(false);
                        setDeleteConfirmName("");
                        await refreshUser();
                        addToast(t("success.householdDeleted"), "success");
                      },
                      onError: () => addToast(t("errors.householdDelete"), "error"),
                    });
                  }}
                  disabled={
                    deleteConfirmName !== activeHousehold.name || deleteHousehold.isPending
                  }
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {t("common.delete")}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmName("");
                  }}
                  className="rounded-md bg-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  {t("common.cancel")}
                </button>
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
            <button
              key={h.id}
              onClick={() => handleSwitch(h.id)}
              disabled={switchHousehold.isPending}
              className={`w-full rounded-lg px-4 py-3 text-left text-sm font-medium transition ${
                h.id === activeHouseholdId
                  ? "bg-orange-50 text-orange-700 ring-1 ring-orange-300"
                  : "bg-gray-50 text-gray-700 hover:bg-gray-100"
              } disabled:opacity-50`}
            >
              {h.name}
              {h.id === activeHouseholdId && (
                <Check size={16} className="float-right mt-0.5 text-orange-500" />
              )}
            </button>
          ))}
        </div>
      </ResponsiveOverlay>
    </div>
  );
}
