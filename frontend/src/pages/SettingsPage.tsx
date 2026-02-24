import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client.ts";
import type { Passkey, User } from "../api/types.ts";
import { addPasskey } from "../api/webauthn.ts";
import { useAuth } from "../hooks/useAuth.ts";

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { user, logout, refreshUser } = useAuth();

  const [language, setLanguage] = useState(user?.preferred_language ?? i18n.language);
  const [defaultServings, setDefaultServings] = useState(user?.settings.default_servings ?? 2);
  const [knownNewRatio, setKnownNewRatio] = useState(user?.settings.known_new_ratio ?? 0.7);
  const [planDays, setPlanDays] = useState(user?.settings.plan_days ?? 7);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Passkey state
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(true);
  const [addingPasskey, setAddingPasskey] = useState(false);

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
        settings: {
          default_servings: defaultServings,
          known_new_ratio: knownNewRatio,
          plan_days: planDays,
        },
      });
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
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
    } catch {
      // User may have cancelled the ceremony
    } finally {
      setAddingPasskey(false);
    }
  }

  async function handleDeletePasskey(id: string) {
    if (!window.confirm(t("passkeys.confirmDelete"))) return;
    try {
      await api.delete(`/api/v1/users/me/passkeys/${id}/`);
      await fetchPasskeys();
    } catch {
      // silently fail
    }
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold text-gray-900">{t("settings.title")}</h1>

      {/* Language */}
      <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
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

      {/* Default settings */}
      <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("settings.defaults")}</h2>

        {/* Default servings */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t("settings.defaultServings")}
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={defaultServings}
            onChange={(e) => setDefaultServings(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>

        {/* Known/new ratio slider */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t("settings.knownRatio")}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={knownNewRatio}
              onChange={(e) => setKnownNewRatio(parseFloat(e.target.value))}
              className="flex-1 accent-orange-500"
            />
            <span className="w-12 text-right text-sm font-medium text-gray-700">
              {Math.round(knownNewRatio * 100)}%
            </span>
          </div>
        </div>

        {/* Plan days */}
        <div className="mb-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t("settings.planDays")}
          </label>
          <div className="flex gap-2">
            {[7, 14].map((days) => (
              <button
                key={days}
                onClick={() => setPlanDays(days)}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  planDays === days
                    ? "bg-orange-500 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {days}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="mb-4 w-full rounded-md bg-orange-500 px-4 py-3 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {isSaving ? t("common.loading") : saved ? t("settings.saved") : t("settings.save")}
      </button>

      {/* Passkeys */}
      <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("passkeys.title")}</h2>

        {passkeysLoading ? (
          <p className="text-sm text-gray-500">{t("common.loading")}</p>
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
                  disabled={passkeys.length <= 1}
                  title={passkeys.length <= 1 ? t("passkeys.cannotDeleteLast") : ""}
                  className="rounded-md px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {t("passkeys.deletePasskey")}
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleAddPasskey}
          disabled={addingPasskey}
          className="mt-3 w-full rounded-md border border-orange-500 px-4 py-2 text-sm font-medium text-orange-500 hover:bg-orange-50 disabled:opacity-50"
        >
          {addingPasskey ? t("common.loading") : t("passkeys.addPasskey")}
        </button>
      </div>

      {/* Account / Logout */}
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("settings.account")}</h2>
        {user && <p className="mb-3 text-sm text-gray-600">{user.email}</p>}
        <button
          onClick={handleLogout}
          className="w-full rounded-md bg-red-500 px-4 py-3 text-sm font-medium text-white hover:bg-red-600"
        >
          {t("settings.logout")}
        </button>
      </div>
    </div>
  );
}
