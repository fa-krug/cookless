import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "../api/client";
import { useAuth } from "../hooks/useAuth";

interface InviteInfo {
  household_name: string;
  expires_at: string;
}

export default function InvitePage() {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();
  const { user, register, registerWithPassword } = useAuth();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasskeyNudge, setShowPasskeyNudge] = useState(false);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    api
      .get<InviteInfo>(`/api/v1/invites/${code}/`)
      .then((data) => setInvite(data))
      .catch(() => setError(t("invite.invalid")))
      .finally(() => setLoading(false));
  }, [code, t]);

  async function handleJoin() {
    if (!code) return;
    setActionLoading(true);
    setActionError("");
    try {
      await api.post(`/api/v1/invites/${code}/accept/`);
      navigate("/recipes", { replace: true });
    } catch {
      setActionError(t("invite.joinFailed"));
    } finally {
      setActionLoading(false);
    }
  }

  function handleDecline() {
    navigate("/recipes", { replace: true });
  }

  async function handleRegister(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!code) return;
    setActionLoading(true);
    setActionError("");
    try {
      await register(email, code);
      navigate("/recipes", { replace: true });
    } catch {
      setActionError(t("invite.registerFailed"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePasswordRegister(e: FormEvent) {
    e.preventDefault();
    if (!code) return;
    if (password !== confirmPassword) {
      setActionError(t("password.passwordMismatch"));
      return;
    }
    setActionLoading(true);
    setActionError("");
    try {
      await registerWithPassword(email, password, code);
      setShowPasskeyNudge(true);
      setTimeout(() => {
        navigate("/recipes", { replace: true });
      }, 3000);
    } catch {
      setActionError(t("invite.registerFailed"));
    } finally {
      setActionLoading(false);
    }
  }

  if (showPasskeyNudge) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <p className="text-center text-muted-foreground">{t("invite.passkeyRecommendation")}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <h1 className="mb-4 text-2xl font-bold text-foreground">{t("common.appName")}</h1>
        <p className="text-center text-destructive">{error || t("invite.invalid")}</p>
      </div>
    );
  }

  // Logged-in user: show join prompt
  if (user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <h1 className="mb-2 text-2xl font-bold text-foreground">{t("invite.joinTitle")}</h1>
        <p className="mb-8 text-center text-muted-foreground">
          {t("invite.joinPrompt", { household: invite.household_name })}
        </p>

        {actionError && <p className="mb-4 text-center text-sm text-destructive">{actionError}</p>}

        <div className="flex w-full max-w-xs gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleDecline}
          >
            {t("invite.decline")}
          </Button>
          <Button
            className="flex-1"
            onClick={handleJoin}
            disabled={actionLoading}
          >
            {actionLoading ? t("common.loading") : t("invite.join")}
          </Button>
        </div>
      </div>
    );
  }

  // Not logged in: show registration form
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <h1 className="mb-2 text-2xl font-bold text-foreground">{t("invite.registerTitle")}</h1>
      <p className="mb-8 text-center text-muted-foreground">
        {t("invite.registerPrompt", { household: invite.household_name })}
      </p>

      <div className="w-full max-w-xs">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("auth.emailPlaceholder")}
          className="mb-4"
        />

        {actionError && <p className="mb-4 text-center text-sm text-destructive">{actionError}</p>}

        <Button
          type="button"
          className="mb-4 w-full"
          onClick={(e) => handleRegister(e)}
          disabled={actionLoading}
        >
          {actionLoading && !showPasswordForm
            ? t("common.loading")
            : t("invite.registerWithPasskey")}
        </Button>

        <div className="mb-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-sm text-muted-foreground">{t("auth.orDivider")}</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {!showPasswordForm ? (
          <Button
            type="button"
            variant="outline"
            className="w-full border-primary text-primary hover:bg-primary/10"
            onClick={() => setShowPasswordForm(true)}
          >
            {t("invite.registerWithPassword")}
          </Button>
        ) : (
          <form onSubmit={handlePasswordRegister}>
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.passwordPlaceholder")}
              className="mb-3"
            />
            <Input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t("password.confirmPassword")}
              className="mb-4"
            />
            <Button
              type="submit"
              className="w-full"
              disabled={actionLoading}
            >
              {actionLoading ? t("common.loading") : t("invite.registerWithPassword")}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
