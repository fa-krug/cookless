"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { KeyRound } from "lucide-react";

import { useT } from "@/lib/i18n/provider";
import { addPasskey } from "@/lib/auth-client/webauthn";
import { useWebAuthnSupport } from "@/lib/hooks/use-webauthn-support";
import { setPasswordAction, skipPasskeyAction } from "@/app/(auth)/actions";
import { createHouseholdAction } from "@/app/(account)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChangePasswordStep({
  email,
  onDone,
}: {
  email: string;
  onDone: () => void;
}) {
  const { t } = useT();
  const form = useForm<{ currentPassword: string; newPassword: string; confirm: string }>({
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
  });
  const [error, setError] = useState("");

  async function onSubmit(v: { currentPassword: string; newPassword: string; confirm: string }) {
    setError("");
    if (v.newPassword !== v.confirm) {
      setError(t("setup.changePassword.mismatch"));
      return;
    }
    const res = await setPasswordAction({
      currentPassword: v.currentPassword,
      newPassword: v.newPassword,
    });
    if (!res.ok) {
      setError(res.message);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-xl font-semibold">{t("setup.changePassword.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("setup.changePassword.description")}</p>
      <p className="text-sm text-muted-foreground">{email}</p>
      <Input
        type="password"
        placeholder={t("setup.changePassword.currentPassword")}
        autoComplete="current-password"
        {...form.register("currentPassword")}
      />
      <Input
        type="password"
        placeholder={t("setup.changePassword.newPassword")}
        autoComplete="new-password"
        {...form.register("newPassword")}
      />
      <Input
        type="password"
        placeholder={t("setup.changePassword.confirmPassword")}
        autoComplete="new-password"
        {...form.register("confirm")}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? t("common.loading") : t("setup.changePassword.submit")}
      </Button>
    </form>
  );
}

export function AddPasskeyStep({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const passkeySupported = useWebAuthnSupport();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    if (!passkeySupported) return;
    setBusy(true);
    setError("");
    try {
      await addPasskey();
      onDone();
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") {
        setBusy(false);
        return;
      }
      setError(t("errors.passkeyAdd"));
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    const res = await skipPasskeyAction();
    if (!res.ok) {
      setError(t("common.error"));
      setBusy(false);
      return;
    }
    onDone();
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{t("setup.addPasskey.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("setup.addPasskey.description")}</p>
      {!passkeySupported && <p className="text-sm text-destructive">{t("auth.passkeyInsecure")}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" onClick={add} disabled={busy || !passkeySupported}>
        <KeyRound size={18} />
        {busy ? t("common.loading") : t("setup.addPasskey.add")}
      </Button>
      <Button variant="outline" className="w-full" onClick={skip} disabled={busy}>
        {t("setup.addPasskey.skip")}
      </Button>
    </div>
  );
}

export function CreateHouseholdStep({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const form = useForm<{ name: string }>({ defaultValues: { name: "" } });
  const [error, setError] = useState("");

  async function onSubmit(v: { name: string }) {
    setError("");
    const res = await createHouseholdAction({ name: v.name });
    if (!res.ok) {
      setError(res.message || t("errors.householdCreate"));
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-xl font-semibold">{t("setup.createHousehold.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("setup.createHousehold.description")}</p>
      <Input
        type="text"
        placeholder={t("setup.createHousehold.namePlaceholder")}
        {...form.register("name", { required: true })}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? t("common.loading") : t("setup.createHousehold.submit")}
      </Button>
    </form>
  );
}
