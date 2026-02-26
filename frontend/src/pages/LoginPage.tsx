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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-orange-50 via-amber-50/50 to-white px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1>
            <AppLogo className="text-5xl" />
          </h1>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg shadow-orange-900/5 ring-1 ring-gray-950/5">
          <form onSubmit={showPasswordForm ? handlePasswordLogin : handlePasskeyLogin}>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              {t("auth.emailPlaceholder")}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mb-5 w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-gray-900 placeholder-gray-400 transition-colors focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/20"
            />

            {error && (
              <p className="-mt-3 mb-4 text-center text-xs font-medium text-red-500">{error}</p>
            )}

            {showPasswordForm ? (
              <>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">
                  {t("auth.passwordPlaceholder")}
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mb-5 w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-gray-900 placeholder-gray-400 transition-colors focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-orange-500/25 transition-all hover:bg-orange-600 hover:shadow-md hover:shadow-orange-500/25 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
                >
                  {isLoading ? t("common.loading") : t("auth.signInWithPassword")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordForm(false);
                    setPassword("");
                    setError("");
                  }}
                  className="mt-3 w-full text-center text-xs text-gray-400 transition-colors hover:text-orange-500"
                >
                  {t("auth.signInWithPasskey")}
                </button>
              </>
            ) : (
              <>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-orange-500/25 transition-all hover:bg-orange-600 hover:shadow-md hover:shadow-orange-500/25 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
                >
                  {isLoading ? t("common.loading") : t("auth.signInWithPasskey")}
                </button>
                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-xs text-gray-400">{t("auth.orDivider")}</span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    setShowPasswordForm(true);
                    setError("");
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
                >
                  {t("auth.signInWithPassword")}
                </button>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
