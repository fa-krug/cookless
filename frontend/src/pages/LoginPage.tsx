import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import AppLogo from "../components/AppLogo";

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, loginWithPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  async function handlePasskeyLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await login(email);
      navigate("/", { replace: true });
    } catch {
      setError(t("auth.loginFailed"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePasswordLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await loginWithPassword(email, password);
      navigate("/", { replace: true });
    } catch {
      setError(t("auth.passwordLoginFailed"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <h1 className="mb-2">
        <AppLogo />
      </h1>
      <p className="mb-12 text-gray-500">{t("nav.plan")}</p>

      <form
        onSubmit={showPasswordForm ? handlePasswordLogin : handlePasskeyLogin}
        className="w-full max-w-xs"
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("auth.emailPlaceholder")}
          className="mb-4 w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />

        {error && <p className="mb-4 text-center text-sm text-red-500">{error}</p>}

        <button
          type={showPasswordForm ? "button" : "submit"}
          disabled={isLoading}
          onClick={
            showPasswordForm
              ? () => {
                  setShowPasswordForm(false);
                  setPassword("");
                  setError("");
                }
              : undefined
          }
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
        >
          {isLoading && !showPasswordForm
            ? t("common.loading")
            : t("auth.signInWithPasskey")}
        </button>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-300" />
          <span className="text-sm text-gray-400">{t("auth.orDivider")}</span>
          <div className="h-px flex-1 bg-gray-300" />
        </div>

        {showPasswordForm ? (
          <>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.passwordPlaceholder")}
              className="mb-4 w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
            >
              {isLoading ? t("common.loading") : t("auth.signInWithPassword")}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={isLoading}
            onClick={() => {
              setShowPasswordForm(true);
              setError("");
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-orange-500 px-6 py-3 text-base font-medium text-orange-500 transition-colors hover:bg-orange-50 disabled:opacity-50"
          >
            {t("auth.signInWithPassword")}
          </button>
        )}
      </form>
    </div>
  );
}
