import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { User } from "../api/types";
import { useAuth } from "../hooks/useAuth";

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { user, logout, refreshUser } = useAuth();

  const [language, setLanguage] = useState(user?.preferred_language ?? i18n.language);
  const [defaultServings, setDefaultServings] = useState(user?.settings.default_servings ?? 2);
  const [knownNewRatio, setKnownNewRatio] = useState(user?.settings.known_new_ratio ?? 0.7);
  const [planDays, setPlanDays] = useState(user?.settings.plan_days ?? 7);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
