import {
  Check,
  Clipboard,
  Link,
  LogOut,
  Pencil,
  Plus,
  Shield,
  Sparkles,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { Spinner } from "../components/ui/Spinner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Household, Invite } from "../api/types";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useToast } from "../hooks/useToast";
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
    <div className="rounded-lg bg-white p-4 shadow-sm">
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
    <div className="rounded-lg bg-white p-4 shadow-sm">
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
    <div className="rounded-lg bg-white p-4 shadow-sm">
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
    <div className="rounded-lg bg-white p-4 shadow-sm">
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
  const { t } = useTranslation();
  const { addToast } = useToast();
  const { user, refreshUser } = useAuth();
  const { confirm, dialogProps } = useConfirm();
  const { data: households, isLoading } = useHouseholds();
  const switchHousehold = useSwitchHousehold();
  const updateHousehold = useUpdateHousehold();
  const deleteHousehold = useDeleteHousehold();
  const leaveHousehold = useLeaveHousehold();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

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

  function handleSwitch(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (!id || id === activeHouseholdId) return;
    switchHousehold.mutate(id, {
      onSuccess: async () => {
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
      <h1 className="mb-4 text-2xl font-bold text-gray-900">{t("household.title")}</h1>

      {isLoading && <p className="text-sm text-gray-500">{t("common.loading")}</p>}

      {!isLoading && (!households || households.length === 0) && !activeHousehold && (
        <div className="mb-6 mt-8 text-center">
          <p className="text-gray-500">{t("household.noHousehold")}</p>
        </div>
      )}

      {/* Switch household dropdown */}
      {households && households.length > 1 && (
        <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t("household.switchHousehold")}
          </label>
          <select
            value={activeHouseholdId ?? ""}
            onChange={handleSwitch}
            disabled={switchHousehold.isPending}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            {households.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Current household info */}
      {activeHousehold && (
        <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
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
              className="flex gap-2"
            >
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                autoFocus
              />
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

      {/* AI Settings (owner only) */}
      {activeHousehold && isOwner && (
        <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={20} className="text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">{t("ai.title")}</h2>
            </div>
            <button
              onClick={handleAiToggle}
              role="switch"
              aria-checked={aiEnabled}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                aiEnabled ? "bg-orange-500" : "bg-gray-200"
              }`}
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
                  className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <button
                  onClick={handleVerifyKey}
                  disabled={!geminiKey || verifyingKey}
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

      {/* Leave household (non-owner only) */}
      {activeHousehold && !isOwner && (
        <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
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
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <h2 className="mb-2 text-lg font-semibold text-red-900">
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
              <p className="mb-2 text-sm text-red-800">
                {t("household.deleteConfirm", { name: activeHousehold.name })}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={t("household.deleteConfirmPlaceholder")}
                  className="flex-1 rounded-md border border-red-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
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
                  className="rounded-md bg-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </div>
  );
}
