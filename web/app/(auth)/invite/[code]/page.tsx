import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getInviteSummary } from "@/lib/households/invites";
import { AuthCard } from "@/components/auth/auth-card";
import { getI18n } from "@/lib/i18n/server";
import { InviteForm } from "./invite-form";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const { t } = await getI18n();
  let summary: { householdName: string };
  try {
    summary = getInviteSummary(db, code, new Date());
  } catch {
    notFound();
  }
  return (
    <AuthCard>
      <p className="mb-4 text-center text-sm text-muted-foreground">
        {t("invite.registerPrompt", { household: summary.householdName })}
      </p>
      <InviteForm code={code} />
    </AuthCard>
  );
}
