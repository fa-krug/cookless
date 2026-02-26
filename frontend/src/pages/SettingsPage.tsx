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
import { TAG_CATEGORIES, type Passkey, type TagCategory, type User } from "../api/types";
import { addPasskey } from "../api/webauthn";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import ResponsiveOverlay from "../components/ui/ResponsiveOverlay";
import { SettingsSkeleton } from "../components/ui/SettingsSkeleton";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from "../hooks/useTags";
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

  // Tag state
  const { data: groupedTags } = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editNameEn, setEditNameEn] = useState("");
  const [editNameDe, setEditNameDe] = useState("");
  const [addingCategory, setAddingCategory] = useState<TagCategory | null>(null);
  const [newTagEn, setNewTagEn] = useState("");
  const [newTagDe, setNewTagDe] = useState("");

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

      {/* Manage Tags */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("tags.manageTags")}</h2>
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
                        {editingTag === tag.id ? (
                          <div className="flex flex-1 items-center gap-2">
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
                            <button
                              type="button"
                              onClick={async () => {
                                await updateTag.mutateAsync({
                                  id: tag.id,
                                  payload: { name_en: editNameEn, name_de: editNameDe },
                                });
                                setEditingTag(null);
                              }}
                              className="rounded bg-orange-500 px-2 py-0.5 text-xs text-white"
                            >
                              {t("common.save")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTag(null)}
                              className="px-2 py-0.5 text-xs text-gray-500"
                            >
                              {t("common.cancel")}
                            </button>
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
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTag(tag.id);
                                  setEditNameEn(tag.name_en);
                                  setEditNameDe(tag.name_de);
                                }}
                                className="px-1 text-xs text-gray-500 hover:text-orange-600"
                              >
                                {t("tags.editTag")}
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
                                className="px-1 text-xs text-gray-500 hover:text-red-600"
                              >
                                {t("tags.deleteTag")}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    {addingCategory === category ? (
                      <div className="mt-2 flex items-center gap-2 border-t pt-2">
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
                          className="rounded bg-orange-500 px-2 py-0.5 text-xs text-white"
                        >
                          {t("common.save")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingCategory(null);
                            setNewTagEn("");
                            setNewTagDe("");
                          }}
                          className="px-2 py-0.5 text-xs text-gray-500"
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddingCategory(category)}
                        className="mt-2 w-full border-t pt-2 text-left text-sm text-orange-600 hover:text-orange-700"
                      >
                        + {t("tags.addTag")}
                      </button>
                    )}
                  </div>
                </details>
              );
            })}
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
