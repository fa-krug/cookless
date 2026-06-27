import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { listTags } from "@/lib/queries/recipes";
import { getHouseholdAiSettings } from "@/lib/queries/household";
import { GenerateRecipesClient } from "./generate-recipes-client";

export default async function GenerateRecipesPage() {
  const { householdId } = await requireHousehold();
  const { locale } = await getI18n();
  const { aiEnabled, hasKey } = getHouseholdAiSettings(db, householdId);
  if (!aiEnabled || !hasKey) redirect("/settings/ai");
  return <GenerateRecipesClient tags={listTags(db, householdId)} locale={locale} />;
}
