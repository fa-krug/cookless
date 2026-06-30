"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound, ShieldMinus } from "lucide-react";

import { useT } from "@/lib/i18n/provider";
import { setPasswordAction, removePasswordAction } from "@/app/(auth)/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";

const makeSchema = (hasPassword: boolean) =>
  z
    .object({
      currentPassword: hasPassword ? z.string().min(1) : z.string().optional(),
      newPassword: z.string().min(8),
      confirmPassword: z.string().min(1),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
      message: "password.passwordMismatch",
      path: ["confirmPassword"],
    });

type FormValues = {
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
};

export function PasswordForm({
  hasPassword,
  hasPasskey,
}: {
  hasPassword: boolean;
  hasPasskey: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  const schema = makeSchema(hasPassword);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: FormValues) {
    const res = await setPasswordAction({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
    if (res.ok) {
      toast.success(hasPassword ? t("password.passwordChanged") : t("password.passwordSet"));
      form.reset();
      router.refresh();
    } else {
      form.setError("root", { message: res.message });
    }
  }

  async function handleRemovePassword() {
    const result = await confirm({
      title: t("password.removePassword"),
      message: t("password.removeConfirm"),
      confirmLabel: t("common.confirm"),
      destructive: true,
      input: { placeholder: t("password.currentPassword"), type: "password" },
    });
    if (!result) return;
    const currentPassword = result as string;
    const res = await removePasswordAction({ currentPassword });
    if (res.ok) {
      toast.success(t("password.passwordRemoved"));
      router.refresh();
    } else {
      form.setError("root", { message: res.message });
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t("password.title")}</h3>

      {!hasPassword && (
        <p className="text-sm text-muted-foreground">{t("password.noPasswordSet")}</p>
      )}

      {form.formState.errors.root && (
        <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          {hasPassword && (
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={t("password.currentPassword")}
                      autoComplete="current-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    type="password"
                    placeholder={t("password.newPassword")}
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
            name="confirmPassword"
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
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            <KeyRound size={16} />
            {form.formState.isSubmitting
              ? t("common.loading")
              : hasPassword
                ? t("password.changePassword")
                : t("password.setPassword")}
          </Button>
        </form>
      </Form>

      {hasPassword && (
        <Button
          variant="outline"
          className="w-full border-destructive text-destructive hover:bg-destructive/10"
          onClick={handleRemovePassword}
          disabled={!hasPasskey}
          title={!hasPasskey ? t("passkeys.cannotDeleteLast") : undefined}
        >
          <ShieldMinus size={16} />
          {t("password.removePassword")}
        </Button>
      )}

      {dialog}
    </div>
  );
}
