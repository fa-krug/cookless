import { requireUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { listHouseholds } from "@/lib/households/manage";
import { listMembers } from "@/lib/households/membership";
import { HouseholdClient } from "./household-client";

export default async function HouseholdPage() {
  const user = await requireUser();
  const { t } = await getI18n();
  const households = listHouseholds(db, user.id);
  const activeId = user.activeHouseholdId ?? null;
  const active = households.find((h) => h.id === activeId) ?? null;
  const members = active ? listMembers(db, active.id) : [];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("household.title")}</h1>
      <HouseholdClient
        households={households}
        activeId={activeId}
        active={active}
        members={members}
        currentEmail={user.email}
      />
    </div>
  );
}
