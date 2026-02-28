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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { settingsPasswordSchema, type SettingsPasswordFormValues } from "@/lib/schemas/password";
import { tokenCreateSchema, type TokenCreateFormValues } from "@/lib/schemas/settings";
import { api } from "../api/client";
import type { AccessTokenCreated } from "../api/types";
import { type Passkey, type User } from "../api/types";
import { addPasskey } from "../api/webauthn";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/IconButton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormField,
  FormItem,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import ResponsiveOverlay from "../components/ui/ResponsiveOverlay";
import { extractApiDetail, mapPasswordError } from "../utils/passwordErrors";
import { SettingsSkeleton } from "../components/ui/SettingsSkeleton";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { toast } from "sonner";
import { useTokens, useCreateToken, useDeleteToken } from "../hooks/useTokens";

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { user, logout, refreshUser } = useAuth();
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

  // Password form
  const passwordForm = useForm<SettingsPasswordFormValues>({
    resolver: zodResolver(settingsPasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const [passwordSuccess, setPasswordSuccess] = useState("");

  // Token state
  const { data: tokens = [], isLoading: tokensLoading } = useTokens();
  const createToken = useCreateToken();
  const deleteToken = useDeleteToken();
  const [showTokenForm, setShowTokenForm] = useState(false);
  const tokenForm = useForm<TokenCreateFormValues>({
    resolver: zodResolver(tokenCreateSchema),
    defaultValues: { name: "", scopes: [], preset: "90d", customDate: "" },
  });
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
      toast.error(t("errors.settingsSave"));
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
      toast.error(t("errors.passkeyAdd"));
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
      toast.error(t("errors.passkeyDelete"));
    }
  }

  async function handlePasswordSubmit(values: SettingsPasswordFormValues) {
    setPasswordSuccess("");
    try {
      const body: Record<string, string> = { new_password: values.newPassword };
      if (user?.has_password) {
        body.current_password = values.currentPassword;
      }
      await api.post("/api/v1/users/me/password/", body);
      await refreshUser();
      passwordForm.reset();
      const msg = user?.has_password
        ? t("password.passwordChanged")
        : t("password.passwordSet");
      setPasswordSuccess(msg);
      setTimeout(() => setPasswordSuccess(""), 2000);
    } catch (err) {
      passwordForm.setError("root", {
        message: mapPasswordError(extractApiDetail(err), t, "password"),
      });
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
    passwordForm.clearErrors();
    setPasswordSuccess("");
    try {
      await api.delete("/api/v1/users/me/password/", {
        current_password: password,
      });
      await refreshUser();
      passwordForm.reset();
      setPasswordSuccess(t("password.passwordRemoved"));
      setTimeout(() => setPasswordSuccess(""), 2000);
    } catch (err) {
      passwordForm.setError("root", {
        message: mapPasswordError(extractApiDetail(err), t, "password"),
      });
    }
  }

  const SCOPE_GROUPS = ["recipes", "planner", "shopping", "households"] as const;

  const tokenScopes = tokenForm.watch("scopes");
  const tokenPreset = tokenForm.watch("preset");
  const tokenName = tokenForm.watch("name");

  function toggleScope(scope: string) {
    const current = tokenForm.getValues("scopes");
    const next = current.includes(scope)
      ? current.filter((s) => s !== scope)
      : [...current, scope];
    tokenForm.setValue("scopes", next);
  }

  async function handleCreateToken(values: TokenCreateFormValues) {
    const payload: {
      name: string;
      scopes: string[];
      duration_preset?: string;
      expires_at?: string;
    } = {
      name: values.name.trim(),
      scopes: values.scopes,
    };

    if (values.preset === "custom" && values.customDate) {
      payload.expires_at = new Date(values.customDate).toISOString();
    } else if (values.preset && values.preset !== "never") {
      payload.duration_preset = values.preset;
    }

    try {
      const result = await createToken.mutateAsync(payload);
      setCreatedToken(result);
      setShowTokenForm(false);
      tokenForm.reset();
      toast.success(t("tokens.tokenCreated"));
    } catch {
      toast.error(t("errors.tokenCreate"));
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
      toast.error(t("errors.tokenDelete"));
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
        <Button
          variant="ghost"
          className="mb-4 flex h-auto w-full items-center justify-start rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          onClick={() => setHouseholdOpen(true)}
        >
          <Home size={20} className="mr-3 text-gray-400" />
          <div className="min-w-0 flex-1 text-left">
            <p className="text-xs text-gray-500">{t("household.title")}</p>
            <p className="truncate text-sm font-semibold text-gray-900">
              {user.active_household.name}
            </p>
          </div>
          <ChevronRight size={20} className="text-gray-400" />
        </Button>
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
          <Button
            className="w-full"
            onClick={() => {
              setHouseholdOpen(false);
              navigate("/household");
            }}
          >
            {t("household.manage")}
          </Button>
        </div>
      </ResponsiveOverlay>

      {/* Language */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("settings.language")}</h2>
        <ToggleGroup
          type="single"
          value={language}
          onValueChange={(val) => val && handleLanguageChange(val)}
        >
          {(["en", "de"] as const).map((lang) => (
            <ToggleGroupItem key={lang} value={lang}>
              {t(`settings.languages.${lang}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Theme */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("settings.theme")}</h2>
        <ToggleGroup
          type="single"
          value={theme}
          onValueChange={(val) => {
            if (!val || (val !== "light" && val !== "dark")) return;
            setTheme(val);
            localStorage.setItem("theme", val);
            document.documentElement.classList.toggle("dark", val === "dark");
          }}
        >
          {(["light", "dark"] as const).map((t_) => (
            <ToggleGroupItem key={t_} value={t_}>
              {t(`settings.themes.${t_}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
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
                <IconButton
                  variant="ghost"
                  className="h-8 w-8 text-red-500 hover:bg-red-50"
                  onClick={() => handleDeletePasskey(passkey.id)}
                  disabled={passkeys.length <= 1 && !user?.has_password}
                  tooltip={
                    passkeys.length <= 1 && !user?.has_password
                      ? t("passkeys.cannotDeleteLast")
                      : t("passkeys.deletePasskey")
                  }
                  aria-label={t("passkeys.deletePasskey")}
                >
                  <Trash2 size={16} />
                </IconButton>
              </div>
            ))}
          </div>
        )}

        <Button
          variant="outline"
          className="mt-3 w-full border-orange-500 text-orange-500 hover:bg-orange-50"
          onClick={handleAddPasskey}
          disabled={addingPasskey}
        >
          {addingPasskey ? <Spinner /> : <Plus size={16} />}
          {addingPasskey ? t("common.loading") : t("passkeys.addPasskey")}
        </Button>
      </div>

      {/* Password */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("password.title")}</h2>

        {!user?.has_password && (
          <p className="mb-3 text-sm text-gray-500">{t("password.noPasswordSet")}</p>
        )}

        {passwordForm.formState.errors.root && (
          <p className="mb-3 text-sm text-red-500">
            {passwordForm.formState.errors.root.message}
          </p>
        )}
        {passwordSuccess && (
          <p className="mb-3 text-sm text-green-600">{passwordSuccess}</p>
        )}

        <Form {...passwordForm}>
          <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)}>
            {user?.has_password && (
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem className="mb-3">
                    <FormControl>
                      <Input
                        type="password"
                        placeholder={t("password.currentPassword")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={passwordForm.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem className="mb-3">
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={t("password.newPassword")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={passwordForm.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem className="mb-3">
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={t("password.confirmPassword")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={passwordForm.formState.isSubmitting}
            >
              {passwordForm.formState.isSubmitting ? <Spinner /> : <KeyRound size={16} />}
              {passwordForm.formState.isSubmitting
                ? t("common.loading")
                : user?.has_password
                  ? t("password.changePassword")
                  : t("password.setPassword")}
            </Button>
          </form>
        </Form>

        {user?.has_password && (
          <Button
            variant="outline"
            className="mt-3 w-full border-red-500 text-red-500 hover:bg-red-50"
            onClick={handleRemovePassword}
            disabled={!user?.has_passkey}
            title={!user?.has_passkey ? t("passkeys.cannotDeleteLast") : ""}
          >
            <ShieldMinus size={16} />
            {t("password.removePassword")}
          </Button>
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
              <IconButton
                variant="ghost"
                className="h-8 w-8 shrink-0 text-orange-600 hover:bg-orange-100"
                type="button"
                onClick={() => copyToken(createdToken.token)}
                tooltip={copied ? t("tokens.tokenLabel") : t("tokens.tokenLabel")}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </IconButton>
            </div>
            <p className="mt-2 text-xs text-orange-700">{t("tokens.tokenWarning")}</p>
            <Button
              variant="link"
              className="mt-2 h-auto p-0 text-xs text-orange-600"
              type="button"
              onClick={() => setCreatedToken(null)}
            >
              {t("common.close")}
            </Button>
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
                <IconButton
                  variant="ghost"
                  className="h-8 w-8 shrink-0 text-red-500 hover:bg-red-50"
                  onClick={() => handleDeleteToken(token.id)}
                  tooltip={t("tokens.deleteToken")}
                  aria-label={t("tokens.deleteToken")}
                >
                  <Trash2 size={16} />
                </IconButton>
              </div>
            ))}
          </div>
        )}

        {/* Create form */}
        {showTokenForm ? (
          <Form {...tokenForm}>
            <form
              onSubmit={tokenForm.handleSubmit(handleCreateToken)}
              className="mt-3 space-y-3 rounded-md border border-gray-200 p-3"
            >
              <FormField
                control={tokenForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder={t("tokens.namePlaceholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">{t("tokens.scopes")}</p>
                <div className="space-y-2">
                  {SCOPE_GROUPS.map((group) => (
                    <div key={group} className="flex items-center gap-3">
                      <span className="w-24 text-sm text-gray-600">
                        {t(`tokens.scopeGroups.${group}`)}
                      </span>
                      <Label className="flex items-center gap-1.5 text-xs font-normal">
                        <input
                          type="checkbox"
                          checked={tokenScopes.includes(`${group}:read`)}
                          onChange={() => toggleScope(`${group}:read`)}
                          className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                        />
                        {t("tokens.scopeRead")}
                      </Label>
                      <Label className="flex items-center gap-1.5 text-xs font-normal">
                        <input
                          type="checkbox"
                          checked={tokenScopes.includes(`${group}:write`)}
                          onChange={() => toggleScope(`${group}:write`)}
                          className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                        />
                        {t("tokens.scopeWrite")}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">{t("tokens.expiration")}</p>
                <div className="flex flex-wrap gap-2">
                  {(["30d", "90d", "1y", "never", "custom"] as const).map((preset) => (
                    <Button
                      key={preset}
                      size="sm"
                      variant={tokenPreset === preset ? "default" : "secondary"}
                      type="button"
                      onClick={() => tokenForm.setValue("preset", preset)}
                    >
                      {t(`tokens.preset${preset.charAt(0).toUpperCase() + preset.slice(1)}`)}
                    </Button>
                  ))}
                </div>
                {tokenPreset === "custom" && (
                  <Input
                    type="date"
                    {...tokenForm.register("customDate")}
                    min={new Date().toISOString().split("T")[0]}
                    className="mt-2"
                  />
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  type="submit"
                  disabled={
                    !tokenName.trim() ||
                    tokenScopes.length === 0 ||
                    createToken.isPending
                  }
                >
                  {createToken.isPending ? <Spinner /> : <Code size={16} />}
                  {t("tokens.createToken")}
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setShowTokenForm(false)}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          </Form>
        ) : (
          <Button
            variant="outline"
            className="mt-3 w-full border-orange-500 text-orange-500 hover:bg-orange-50"
            onClick={() => setShowTokenForm(true)}
          >
            <Plus size={16} />
            {t("tokens.createToken")}
          </Button>
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
        <Button
          variant="destructive"
          className="w-full"
          onClick={handleLogout}
        >
          <LogOut size={16} />
          {t("settings.logout")}
        </Button>
      </div>

      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </div>
  );
}
