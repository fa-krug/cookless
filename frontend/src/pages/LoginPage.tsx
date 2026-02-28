import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import AppLogo from "../components/AppLogo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

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
            <Label className="mb-1.5 text-xs text-gray-500">
              {t("auth.emailPlaceholder")}
            </Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mb-5"
            />

            {error && (
              <p className="-mt-3 mb-4 text-center text-xs font-medium text-red-500">{error}</p>
            )}

            {showPasswordForm ? (
              <>
                <Label className="mb-1.5 text-xs text-gray-500">
                  {t("auth.passwordPlaceholder")}
                </Label>
                <Input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mb-5"
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? t("common.loading") : t("auth.signInWithPassword")}
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className="mt-3 w-full text-xs text-gray-400"
                  onClick={() => {
                    setShowPasswordForm(false);
                    setPassword("");
                    setError("");
                  }}
                >
                  {t("auth.signInWithPasskey")}
                </Button>
              </>
            ) : (
              <>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? t("common.loading") : t("auth.signInWithPasskey")}
                </Button>
                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-xs text-gray-400">{t("auth.orDivider")}</span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={isLoading}
                  onClick={() => {
                    setShowPasswordForm(true);
                    setError("");
                  }}
                >
                  {t("auth.signInWithPassword")}
                </Button>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
