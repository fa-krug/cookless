import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { listTags } from "@/lib/queries/recipes";
import { TagManagementClient } from "./tag-management-client";

export default async function TagSettingsPage() {
  const { householdId } = await requireHousehold();
  const { locale } = await getI18n();
  return <TagManagementClient tags={listTags(db, householdId)} locale={locale} />;
}
