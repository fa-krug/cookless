import { KeyRound, LogOut, Plus, Save, ShieldMinus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Passkey, User } from "../api/types";
import { addPasskey } from "../api/webauthn";
import { SettingsSkeleton } from "../components/ui/SettingsSkeleton";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { user, logout, refreshUser } = useAuth();
  const { addToast } = useToast();

  const [language, setLanguage] = useState(i18n.language);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  function handleLanguageChange(lang: string) {
    setLanguage(lang);
    i18n.changeLanguage(lang);
  }

  async function handleSave() {
    setIsSaving(true);
    setSaved(false);
    try {
      await api.patch<User>("/api/v1/users/me/", {
        preferred_language: language,
      });
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      addToast(t("errors.settingsSave"), "error");
    } finally {
      setIsSaving(false);
    }
  }

  function handleLogout() {
    if (!window.confirm(t("settings.logoutConfirm"))) return;
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
    if (!window.confirm(t("passkeys.confirmDelete"))) return;
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
      if (err instanceof Error && "body" in err) {
        const apiErr = err as { body: unknown };
        const body = apiErr.body as Record<string, string> | undefined;
        setPasswordError(body?.detail ?? t("common.error"));
      } else {
        setPasswordError(t("common.error"));
      }
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleRemovePassword() {
    const password = window.prompt(t("password.removeConfirm"));
    if (!password) return;
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
      if (err instanceof Error && "body" in err) {
        const apiErr = err as { body: unknown };
        const body = apiErr.body as Record<string, string> | undefined;
        setPasswordError(body?.detail ?? t("common.error"));
      } else {
        setPasswordError(t("common.error"));
      }
    }
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold text-gray-900">{t("settings.title")}</h1>

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

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-3 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
      >
        <Save size={16} />
        {isSaving ? t("common.loading") : saved ? t("settings.saved") : t("settings.save")}
      </button>

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
          <Plus size={16} />
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
            <KeyRound size={16} />
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
    </div>
  );
}
