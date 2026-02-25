import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
        <p className="text-center text-gray-600">{t("invite.passkeyRecommendation")}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-gray-500">{t("common.loading")}</p>
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
        <h1 className="mb-4 text-2xl font-bold text-gray-900">{t("common.appName")}</h1>
        <p className="text-center text-red-500">{error || t("invite.invalid")}</p>
      </div>
    );
  }

  // Logged-in user: show join prompt
  if (user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">{t("invite.joinTitle")}</h1>
        <p className="mb-8 text-center text-gray-600">
          {t("invite.joinPrompt", { household: invite.household_name })}
        </p>

        {actionError && <p className="mb-4 text-center text-sm text-red-500">{actionError}</p>}

        <div className="flex w-full max-w-xs gap-3">
          <button
            onClick={handleDecline}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("invite.decline")}
          </button>
          <button
            onClick={handleJoin}
            disabled={actionLoading}
            className="flex-1 rounded-lg bg-orange-500 px-4 py-3 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {actionLoading ? t("common.loading") : t("invite.join")}
          </button>
        </div>
      </div>
    );
  }

  // Not logged in: show registration form
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">{t("invite.registerTitle")}</h1>
      <p className="mb-8 text-center text-gray-600">
        {t("invite.registerPrompt", { household: invite.household_name })}
      </p>

      <div className="w-full max-w-xs">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("auth.emailPlaceholder")}
          className="mb-4 w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />

        {actionError && <p className="mb-4 text-center text-sm text-red-500">{actionError}</p>}

        <button
          type="button"
          onClick={(e) => handleRegister(e)}
          disabled={actionLoading}
          className="mb-4 w-full rounded-lg bg-orange-500 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
        >
          {actionLoading && !showPasswordForm
            ? t("common.loading")
            : t("invite.registerWithPasskey")}
        </button>

        <div className="mb-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-300" />
          <span className="text-sm text-gray-500">{t("auth.orDivider")}</span>
          <div className="h-px flex-1 bg-gray-300" />
        </div>

        {!showPasswordForm ? (
          <button
            type="button"
            onClick={() => setShowPasswordForm(true)}
            className="w-full rounded-lg border border-orange-500 px-6 py-3 text-base font-medium text-orange-500 transition-colors hover:bg-orange-50"
          >
            {t("invite.registerWithPassword")}
          </button>
        ) : (
          <form onSubmit={handlePasswordRegister}>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.passwordPlaceholder")}
              className="mb-3 w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t("password.confirmPassword")}
              className="mb-4 w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            <button
              type="submit"
              disabled={actionLoading}
              className="w-full rounded-lg bg-orange-500 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
            >
              {actionLoading ? t("common.loading") : t("invite.registerWithPassword")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
