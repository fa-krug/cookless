import {
  ChevronRight,
  Home,
  KeyRound,
  LogOut,
  Shield,
  ShieldMinus,
} from "lucide-react";
import { Spinner } from "../components/ui/Spinner";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { settingsPasswordSchema, type SettingsPasswordFormValues } from "@/lib/schemas/password";
import { api } from "../api/client";
import type { User } from "../api/types";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
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
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { toast } from "sonner";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../hooks/useTheme";
import { PasskeySection } from "./settings/PasskeySection";
import { TokenSection } from "./settings/TokenSection";

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { user, logout, refreshUser } = useAuth();
  const { confirm, dialogProps } = useConfirm();
  const navigate = useNavigate();

  const [language, setLanguage] = useState(i18n.language);
  const { theme, setTheme } = useTheme();
  const [householdOpen, setHouseholdOpen] = useState(false);

  // Password form
  const passwordForm = useForm<SettingsPasswordFormValues>({
    resolver: zodResolver(settingsPasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const [passwordSuccess, setPasswordSuccess] = useState("");

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

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold text-foreground">{t("settings.title")}</h1>

      {/* Household */}
      {user?.active_household && (
        <Button
          variant="ghost"
          className="mb-4 flex h-auto w-full items-center justify-start rounded-lg border border-border bg-card p-4 shadow-sm"
          onClick={() => setHouseholdOpen(true)}
        >
          <Home size={20} className="mr-3 text-muted-foreground" />
          <div className="min-w-0 flex-1 text-left">
            <p className="text-xs text-muted-foreground">{t("household.title")}</p>
            <p className="truncate text-sm font-semibold text-foreground">
              {user.active_household.name}
            </p>
          </div>
          <ChevronRight size={20} className="text-muted-foreground" />
        </Button>
      )}

      <ResponsiveOverlay
        open={householdOpen}
        onClose={() => setHouseholdOpen(false)}
        title={t("household.title")}
      >
        <div className="p-4">
          <div className="mb-4 rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">{t("household.currentHousehold")}</p>
            <p className="text-lg font-semibold text-foreground">
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
      <div className="mb-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-foreground">{t("settings.language")}</h2>
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
      <div className="mb-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-foreground">{t("settings.theme")}</h2>
        <ToggleGroup
          type="single"
          value={theme}
          onValueChange={(val) => {
            if (!val) return;
            setTheme(val as Theme);
          }}
        >
          {(["light", "dark", "system"] as const).map((t_) => (
            <ToggleGroupItem key={t_} value={t_}>
              {t(`settings.themes.${t_}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Passkeys */}
      <PasskeySection />

      {/* Password */}
      <div className="mb-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-foreground">{t("password.title")}</h2>

        {!user?.has_password && (
          <p className="mb-3 text-sm text-muted-foreground">{t("password.noPasswordSet")}</p>
        )}

        {passwordForm.formState.errors.root && (
          <p className="mb-3 text-sm text-destructive">
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
            className="mt-3 w-full border-destructive text-destructive hover:bg-destructive/10"
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
      <TokenSection />

      {/* Admin */}
      {user?.is_staff && (
        <a
          href="/admin/"
          className="mb-4 flex w-full items-center rounded-lg border border-border bg-card p-4 shadow-sm"
        >
          <Shield size={20} className="mr-3 text-muted-foreground" />
          <div className="min-w-0 flex-1 text-left">
            <p className="text-sm font-semibold text-foreground">{t("settings.admin")}</p>
          </div>
          <ChevronRight size={20} className="text-muted-foreground" />
        </a>
      )}

      {/* Account / Logout */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-foreground">{t("settings.account")}</h2>
        {user && <p className="mb-3 text-sm text-muted-foreground">{user.email}</p>}
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
