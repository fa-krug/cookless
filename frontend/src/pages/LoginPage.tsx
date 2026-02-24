import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth.ts";

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await login(email);
    } catch {
      setError(t("auth.loginFailed"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <h1 className="mb-2 text-4xl font-bold text-orange-500">{t("common.appName")}</h1>
      <p className="mb-12 text-gray-500">{t("nav.plan")}</p>

      <form onSubmit={handleSubmit} className="w-full max-w-xs">
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
          type="submit"
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
        >
          {isLoading ? t("common.loading") : t("auth.signIn")}
        </button>
      </form>
    </div>
  );
}
