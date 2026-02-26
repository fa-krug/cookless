import {
  ChevronRight,
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
import { type Passkey, type User } from "../api/types";
import { addPasskey } from "../api/webauthn";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import ResponsiveOverlay from "../components/ui/ResponsiveOverlay";
import { extractApiDetail, mapPasswordError } from "../utils/passwordErrors";
import { SettingsSkeleton } from "../components/ui/SettingsSkeleton";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";

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
              className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          )}
          <input
            type="password"
            placeholder={t("password.newPassword")}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <input
            type="password"
            placeholder={t("password.confirmPassword")}
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
