"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useT } from "@/lib/i18n/provider";
import { passkeyRegister } from "@/lib/auth-client/webauthn";
import { useWebAuthnSupport } from "@/lib/hooks/use-webauthn-support";
import { registerPasswordAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";

const schema = z
  .object({
    email: z.string().email(),
    password: z.string().optional(),
    confirm: z.string().optional(),
  })
  .refine((v) => !v.password || v.password === v.confirm, {
    path: ["confirm"],
    message: "password.passwordMismatch",
  });
type Values = z.infer<typeof schema>;

export function InviteForm({ code }: { code: string }) {
  const { t } = useT();
  const router = useRouter();
  const passkeySupported = useWebAuthnSupport();
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", confirm: "" },
  });

  function done() {
    router.push("/");
    router.refresh();
  }

  async function onSubmit(values: Values) {
    form.clearErrors("root");
    try {
      if (showPassword) {
        const res = await registerPasswordAction({
          email: values.email,
          password: values.password ?? "",
          inviteCode: code,
        });
        if (!res.ok) {
          form.setError("root", { message: res.message });
          return;
        }
      } else {
        // Passkeys are unavailable outside a secure context; the message below
        // explains why, so bail out instead of throwing an opaque error.
        if (!passkeySupported) return;
        await passkeyRegister(values.email, code);
      }
      done();
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") return;
      form.setError("root", {
        message: e instanceof Error ? e.message : t("invite.registerFailed"),
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  autoComplete="username webauthn"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {showPassword && (
          <>
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={t("auth.passwordPlaceholder")}
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={t("password.confirmPassword")}
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        {!showPassword && !passkeySupported && (
          <p className="text-center text-xs text-destructive">{t("auth.passkeyInsecure")}</p>
        )}

        {form.formState.errors.root && (
          <p className="text-center text-xs text-destructive">
            {form.formState.errors.root.message}
          </p>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={form.formState.isSubmitting || (!showPassword && !passkeySupported)}
        >
          {showPassword ? t("auth.register") : t("auth.signInWithPasskey")}
        </Button>

        <div className="my-2 flex items-center gap-3">
          <div className="h-px flex-1 bg-muted" />
          <span className="text-xs text-muted-foreground">{t("auth.orDivider")}</span>
          <div className="h-px flex-1 bg-muted" />
        </div>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => {
            form.clearErrors("root");
            setShowPassword((v) => !v);
          }}
        >
          {showPassword ? t("auth.signInWithPasskey") : t("auth.signInWithPassword")}
        </Button>
      </form>
    </Form>
  );
}
