import {
  Check,
  ChevronRight,
  Code,
  Copy,
  ExternalLink,
  Home,
  KeyRound,
  LogOut,
  Plus,
  Shield,
  ShieldMinus,
  Trash2,
} from "lucide-react";
import { Spinner } from "../components/ui/Spinner";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { AccessTokenCreated } from "../api/types";
import { type Passkey, type User } from "../api/types";
import { addPasskey } from "../api/webauthn";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import ResponsiveOverlay from "../components/ui/ResponsiveOverlay";
import { extractApiDetail, mapPasswordError } from "../utils/passwordErrors";
import { SettingsSkeleton } from "../components/ui/SettingsSkeleton";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import { useTokens, useCreateToken, useDeleteToken } from "../hooks/useTokens";

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { user, logout, refreshUser } = useAuth();
  const { addToast } = useToast();
  const { confirm, dialogProps } = useConfirm();
  const navigate = useNavigate();

  const [language, setLanguage] = useState(i18n.language);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
  const [householdOpen, setHouseholdOpen] = useState(false);

  // Passkey state
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(true);
  const [addingPasskey, setAddingPasskey] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Token state
  const { data: tokens = [], isLoading: tokensLoading } = useTokens();
  const createToken = useCreateToken();
  const deleteToken = useDeleteToken();
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [newTokenScopes, setNewTokenScopes] = useState<string[]>([]);
  const [newTokenPreset, setNewTokenPreset] = useState<string>("90d");
  const [newTokenCustomDate, setNewTokenCustomDate] = useState("");
  const [createdToken, setCreatedToken] = useState<AccessTokenCreated | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchPasskeys = useCallback(async () => {
    try {
      const data = await api.get<Passkey[]>("/api/v1/users/me/passkeys/");
      setPasskeys(data);
    } catch {
      // silently fail
    } finally {
      setPasskeysLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPasskeys();
  }, [fetchPasskeys]);

  async function handleLanguageChange(lang: string) {
    setLanguage(lang);
    i18n.changeLanguage(lang);
    try {
      await api.patch<User>("/api/v1/users/me/", {
        preferred_language: lang,
      });
      await refreshUser();
    } catch {
      addToast(t("errors.settingsSave"), "error");
    }
  }

  async function handleLogout() {
    const confirmed = await confirm({
      title: t("settings.logout"),
      message: t("settings.logoutConfirm"),
      confirmLabel: t("settings.logout"),
      confirmVariant: "danger",
      cancelLabel: t("common.cancel"),
    });
    if (!confirmed) return;
    logout();
  }

  async function handleAddPasskey() {
    setAddingPasskey(true);
    try {
      await addPasskey(navigator.userAgent);
      await fetchPasskeys();
    } catch (err) {
      // Silence user cancellation (browser WebAuthn dialog dismissed)
      if (err instanceof DOMException && err.name === "NotAllowedError") return;
      addToast(t("errors.passkeyAdd"), "error");
    } finally {
      setAddingPasskey(false);
    }
  }

  async function handleDeletePasskey(id: string) {
    const confirmed = await confirm({
      title: t("passkeys.deletePasskey"),
      message: t("passkeys.confirmDelete"),
      confirmLabel: t("common.remove"),
      confirmVariant: "danger",
      cancelLabel: t("common.cancel"),
    });
    if (!confirmed) return;
    try {
      await api.delete(`/api/v1/users/me/passkeys/${id}/`);
      await fetchPasskeys();
      await refreshUser();
    } catch {
      addToast(t("errors.passkeyDelete"), "error");
    }
  }

  async function handlePasswordSubmit() {
    setPasswordError("");
    setPasswordSuccess("");

    if (newPassword !== confirmNewPassword) {
      setPasswordError(t("password.passwordMismatch"));
      return;
    }

    setSavingPassword(true);
    try {
      const body: Record<string, string> = { new_password: newPassword };
      if (user?.has_password) {
        body.current_password = currentPassword;
      }
      await api.post("/api/v1/users/me/password/", body);
      await refreshUser();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      const msg = user?.has_password
        ? t("password.passwordChanged")
        : t("password.passwordSet");
      setPasswordSuccess(msg);
      setTimeout(() => setPasswordSuccess(""), 2000);
    } catch (err) {
      setPasswordError(mapPasswordError(extractApiDetail(err), t, "password"));
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleRemovePassword() {
    const result = await confirm({
      title: t("password.removePassword"),
      message: t("password.removeConfirm"),
      confirmLabel: t("common.confirm"),
      confirmVariant: "danger",
      cancelLabel: t("common.cancel"),
      inputField: { type: "password", placeholder: t("password.currentPassword") },
    });
    if (!result) return;
    const password = result as string;
    setPasswordError("");
    setPasswordSuccess("");
    try {
      await api.delete("/api/v1/users/me/password/", {
        current_password: password,
      });
      await refreshUser();
      setCurrentPassword("");
      setPasswordSuccess(t("password.passwordRemoved"));
      setTimeout(() => setPasswordSuccess(""), 2000);
    } catch (err) {
      setPasswordError(mapPasswordError(extractApiDetail(err), t, "password"));
    }
  }

  const SCOPE_GROUPS = ["recipes", "planner", "shopping", "households"] as const;

  function toggleScope(scope: string) {
    setNewTokenScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function handleCreateToken() {
    const payload: {
      name: string;
      scopes: string[];
      duration_preset?: string;
      expires_at?: string;
    } = {
      name: newTokenName.trim(),
      scopes: newTokenScopes,
    };

    if (newTokenPreset === "custom" && newTokenCustomDate) {
      payload.expires_at = new Date(newTokenCustomDate).toISOString();
    } else if (newTokenPreset && newTokenPreset !== "never") {
      payload.duration_preset = newTokenPreset;
    }

    try {
      const result = await createToken.mutateAsync(payload);
      setCreatedToken(result);
      setShowTokenForm(false);
      setNewTokenName("");
      setNewTokenScopes([]);
      setNewTokenPreset("90d");
      setNewTokenCustomDate("");
      addToast(t("tokens.tokenCreated"), "success");
    } catch {
      addToast(t("errors.tokenCreate"), "error");
    }
  }

  async function handleDeleteToken(id: string) {
    const confirmed = await confirm({
      title: t("tokens.deleteToken"),
      message: t("tokens.confirmDelete"),
      confirmLabel: t("common.remove"),
      confirmVariant: "danger",
      cancelLabel: t("common.cancel"),
    });
    if (!confirmed) return;
    try {
      await deleteToken.mutateAsync(id);
    } catch {
      addToast(t("errors.tokenDelete"), "error");
    }
  }

  async function copyToken(token: string) {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold text-gray-900">{t("settings.title")}</h1>

      {/* Household */}
      {user?.active_household && (
        <button
          onClick={() => setHouseholdOpen(true)}
          className="mb-4 flex w-full items-center rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
        >
          <Home size={20} className="mr-3 text-gray-400" />
          <div className="min-w-0 flex-1 text-left">
            <p className="text-xs text-gray-500">{t("household.title")}</p>
            <p className="truncate text-sm font-semibold text-gray-900">
              {user.active_household.name}
            </p>
          </div>
          <ChevronRight size={20} className="text-gray-400" />
        </button>
      )}

      <ResponsiveOverlay
        open={householdOpen}
        onClose={() => setHouseholdOpen(false)}
        title={t("household.title")}
      >
        <div className="p-4">
          <div className="mb-4 rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{t("household.currentHousehold")}</p>
            <p className="text-lg font-semibold text-gray-900">
              {user?.active_household?.name}
            </p>
          </div>
          <button
            onClick={() => {
              setHouseholdOpen(false);
              navigate("/household");
            }}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-3 text-sm font-medium text-white hover:bg-orange-600"
          >
            {t("household.manage")}
          </button>
        </div>
      </ResponsiveOverlay>

      {/* Language */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("settings.language")}</h2>
        <div className="flex gap-2">
          {(["en", "de"] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => handleLanguageChange(lang)}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                language === lang
                  ? "bg-orange-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t(`settings.languages.${lang}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Theme */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("settings.theme")}</h2>
        <div className="flex gap-2">
          {(["light", "dark"] as const).map((t_) => (
            <button
              key={t_}
              onClick={() => {
                setTheme(t_);
                localStorage.setItem("theme", t_);
                document.documentElement.classList.toggle("dark", t_ === "dark");
              }}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                theme === t_
                  ? "bg-orange-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t(`settings.themes.${t_}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Passkeys */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("passkeys.title")}</h2>

        {passkeysLoading ? (
          <SettingsSkeleton />
        ) : (
          <div className="space-y-3">
            {passkeys.map((passkey) => (
              <div
                key={passkey.id}
                className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {passkey.device_name || "Passkey"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t("passkeys.added", {
                      date: new Date(passkey.created_at).toLocaleDateString(),
                    })}
                  </p>
                </div>
                <button
                  onClick={() => handleDeletePasskey(passkey.id)}
                  disabled={passkeys.length <= 1 && !user?.has_password}
                  title={
                    passkeys.length <= 1 && !user?.has_password
                      ? t("passkeys.cannotDeleteLast")
                      : ""
                  }
                  className="rounded-md p-1.5 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={t("passkeys.deletePasskey")}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleAddPasskey}
          disabled={addingPasskey}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-orange-500 px-4 py-2 text-sm font-medium text-orange-500 hover:bg-orange-50 disabled:opacity-50"
        >
          {addingPasskey ? <Spinner /> : <Plus size={16} />}
          {addingPasskey ? t("common.loading") : t("passkeys.addPasskey")}
        </button>
      </div>

      {/* Password */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("password.title")}</h2>

        {!user?.has_password && (
          <p className="mb-3 text-sm text-gray-500">{t("password.noPasswordSet")}</p>
        )}

        {passwordError && (
          <p className="mb-3 text-sm text-red-500">{passwordError}</p>
        )}
        {passwordSuccess && (
          <p className="mb-3 text-sm text-green-600">{passwordSuccess}</p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handlePasswordSubmit();
          }}
        >
          {user?.has_password && (
            <input
              type="password"
              placeholder={t("password.currentPassword")}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          )}
          <input
            type="password"
            placeholder={t("password.newPassword")}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <input
            type="password"
            placeholder={t("password.confirmPassword")}
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <button
            type="submit"
            disabled={savingPassword || !newPassword || !confirmNewPassword}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {savingPassword ? <Spinner /> : <KeyRound size={16} />}
            {savingPassword
              ? t("common.loading")
              : user?.has_password
                ? t("password.changePassword")
                : t("password.setPassword")}
          </button>
        </form>

        {user?.has_password && (
          <button
            onClick={handleRemovePassword}
            disabled={!user?.has_passkey}
            title={!user?.has_passkey ? t("passkeys.cannotDeleteLast") : ""}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-red-500 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShieldMinus size={16} />
            {t("password.removePassword")}
          </button>
        )}
      </div>

      {/* API Tokens */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{t("tokens.title")}</h2>
          <a
            href="/api/v1/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-700"
          >
            {t("tokens.docsLink")}
            <ExternalLink size={12} />
          </a>
        </div>

        {/* Created token display */}
        {createdToken && (
          <div className="mb-4 rounded-md border border-orange-300 bg-orange-50 p-3">
            <p className="mb-1 text-xs font-medium text-orange-800">{t("tokens.tokenLabel")}</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 font-mono text-xs text-gray-900">
                {createdToken.token}
              </code>
              <button
                type="button"
                onClick={() => copyToken(createdToken.token)}
                className="shrink-0 rounded-md p-1.5 text-orange-600 hover:bg-orange-100"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <p className="mt-2 text-xs text-orange-700">{t("tokens.tokenWarning")}</p>
            <button
              type="button"
              onClick={() => setCreatedToken(null)}
              className="mt-2 text-xs text-orange-600 hover:text-orange-800"
            >
              {t("common.close")}
            </button>
          </div>
        )}

        {/* Token list */}
        {tokensLoading ? (
          <SettingsSkeleton />
        ) : tokens.length === 0 && !showTokenForm ? (
          <p className="text-sm text-gray-500">{t("tokens.noTokens")}</p>
        ) : (
          <div className="space-y-3">
            {tokens.map((token) => (
              <div
                key={token.id}
                className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900">{token.name}</p>
                    {token.expires_at && new Date(token.expires_at) < new Date() && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                        {t("tokens.expired")}
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-xs text-gray-400">{token.token_prefix}...</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {token.scopes.map((scope) => (
                      <span
                        key={scope}
                        className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {token.last_used_at
                      ? t("tokens.lastUsed", {
                          date: new Date(token.last_used_at).toLocaleDateString(),
                        })
                      : t("tokens.neverUsed")}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteToken(token.id)}
                  className="shrink-0 rounded-md p-1.5 text-red-500 hover:bg-red-50"
                  aria-label={t("tokens.deleteToken")}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Create form */}
        {showTokenForm ? (
          <div className="mt-3 space-y-3 rounded-md border border-gray-200 p-3">
            <input
              type="text"
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
              placeholder={t("tokens.namePlaceholder")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />

            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">{t("tokens.scopes")}</p>
              <div className="space-y-2">
                {SCOPE_GROUPS.map((group) => (
                  <div key={group} className="flex items-center gap-3">
                    <span className="w-24 text-sm text-gray-600">
                      {t(`tokens.scopeGroups.${group}`)}
                    </span>
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={newTokenScopes.includes(`${group}:read`)}
                        onChange={() => toggleScope(`${group}:read`)}
                        className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                      />
                      {t("tokens.scopeRead")}
                    </label>
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={newTokenScopes.includes(`${group}:write`)}
                        onChange={() => toggleScope(`${group}:write`)}
                        className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                      />
                      {t("tokens.scopeWrite")}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">{t("tokens.expiration")}</p>
              <div className="flex flex-wrap gap-2">
                {(["30d", "90d", "1y", "never", "custom"] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setNewTokenPreset(preset)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                      newTokenPreset === preset
                        ? "bg-orange-500 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {t(`tokens.preset${preset.charAt(0).toUpperCase() + preset.slice(1)}`)}
                  </button>
                ))}
              </div>
              {newTokenPreset === "custom" && (
                <input
                  type="date"
                  value={newTokenCustomDate}
                  onChange={(e) => setNewTokenCustomDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="mt-2 rounded-md border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreateToken}
                disabled={
                  !newTokenName.trim() ||
                  newTokenScopes.length === 0 ||
                  createToken.isPending
                }
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {createToken.isPending ? <Spinner /> : <Code size={16} />}
                {t("tokens.createToken")}
              </button>
              <button
                type="button"
                onClick={() => setShowTokenForm(false)}
                className="rounded-md px-4 py-2 text-sm text-gray-500 hover:bg-gray-100"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowTokenForm(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-orange-500 px-4 py-2 text-sm font-medium text-orange-500 hover:bg-orange-50"
          >
            <Plus size={16} />
            {t("tokens.createToken")}
          </button>
        )}
      </div>

      {/* Admin */}
      {user?.is_staff && (
        <a
          href="/admin/"
          className="mb-4 flex w-full items-center rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
        >
          <Shield size={20} className="mr-3 text-gray-400" />
          <div className="min-w-0 flex-1 text-left">
            <p className="text-sm font-semibold text-gray-900">{t("settings.admin")}</p>
          </div>
          <ChevronRight size={20} className="text-gray-400" />
        </a>
      )}

      {/* Account / Logout */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("settings.account")}</h2>
        {user && <p className="mb-3 text-sm text-gray-600">{user.email}</p>}
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-red-500 px-4 py-3 text-sm font-medium text-white hover:bg-red-600"
        >
          <LogOut size={16} />
          {t("settings.logout")}
        </button>
      </div>

      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </div>
  );
}
