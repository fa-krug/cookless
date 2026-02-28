import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginFormValues } from "@/lib/schemas/login";
import { useAuth } from "../hooks/useAuth";
import AppLogo from "../components/AppLogo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, loginWithPassword } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function handlePasskeyLogin(values: LoginFormValues) {
    setIsLoading(true);
    try {
      await login(values.email);
      navigate("/", { replace: true });
    } catch {
      form.setError("root", { message: t("auth.loginFailed") });
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePasswordLogin(values: LoginFormValues) {
    setIsLoading(true);
    try {
      await loginWithPassword(values.email, values.password);
      navigate("/", { replace: true });
    } catch {
      form.setError("root", { message: t("auth.passwordLoginFailed") });
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
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(
                showPasswordForm ? handlePasswordLogin : handlePasskeyLogin,
              )}
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="mb-5">
                    <FormLabel className="text-xs text-gray-500">
                      {t("auth.emailPlaceholder")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.formState.errors.root && (
                <p className="-mt-3 mb-4 text-center text-xs font-medium text-red-500">
                  {form.formState.errors.root.message}
                </p>
              )}

              {showPasswordForm ? (
                <>
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem className="mb-5">
                        <FormLabel className="text-xs text-gray-500">
                          {t("auth.passwordPlaceholder")}
                        </FormLabel>
                        <FormControl>
                          <Input type="password" autoFocus {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
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
                      form.setValue("password", "");
                      form.clearErrors();
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
                      form.clearErrors();
                    }}
                  >
                    {t("auth.signInWithPassword")}
                  </Button>
                </>
              )}
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
