import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Household, Invite } from "../api/types";
import { useToast } from "../hooks/useToast";
import { useAuth } from "../hooks/useAuth";
import {
  useAcceptInvite,
  useCreateHousehold,
  useCreateInvite,
  useHouseholds,
  useRemoveMember,
  useSwitchHousehold,
} from "../hooks/useHousehold";

function MembersList({
  household,
  currentUserEmail,
  isOwner,
}: {
  household: Household;
  currentUserEmail: string;
  isOwner: boolean;
}) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const removeMember = useRemoveMember();

  function handleRemove(memberId: number) {
    if (!window.confirm(t("household.removeMemberConfirm"))) return;
    removeMember.mutate(
      { householdId: household.id, memberId },
      {
        onError: () => addToast(t("errors.memberRemove"), "error"),
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
              <button
                onClick={() => handleRemove(member.id)}
                disabled={removeMember.isPending}
                className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                {t("common.remove")}
              </button>
            )}
          </li>
        ))}
      </ul>
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
      onError: () => addToast(t("common.error"), "error"),
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
        className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {t("household.generateInvite")}
      </button>

      {invite && (
        <div className="mt-3 rounded-md bg-gray-50 p-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-gray-200 px-2 py-1 text-sm font-mono">
              {invite.code}
            </code>
            <button
              onClick={handleCopy}
              className="rounded-md bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
            >
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
          className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
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
          className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
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
  const { data: households, isLoading } = useHouseholds();
  const switchHousehold = useSwitchHousehold();

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
        await refreshUser();
      },
      onError: () => addToast(t("errors.householdSwitch"), "error"),
    });
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
          <h2 className="text-lg font-semibold text-gray-900">
            {t("household.currentHousehold")}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {activeHousehold.name} &middot;{" "}
            {t("household.members")} ({activeHousehold.members.length})
          </p>
        </div>
      )}

      {/* Members list */}
      {activeHousehold && (
        <div className="mb-4">
          <MembersList
            household={activeHousehold}
            currentUserEmail={currentUserEmail}
            isOwner={isOwner}
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
    </div>
  );
}
