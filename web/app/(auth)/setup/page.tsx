import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hasAnyUser } from "@/lib/auth/first-run";
import { AuthCard } from "@/components/auth/auth-card";
import { getI18n } from "@/lib/i18n/server";
import { SetupForm } from "./setup-form";

export default async function SetupPage() {
  if (hasAnyUser(db)) redirect("/login");
  const { t } = await getI18n();
  return (
    <AuthCard>
      <h1 className="mb-1 text-center text-lg font-semibold">{t("firstRun.title")}</h1>
      <p className="mb-4 text-center text-sm text-muted-foreground">{t("firstRun.prompt")}</p>
      <SetupForm />
    </AuthCard>
  );
}
