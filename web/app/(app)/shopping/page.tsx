import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getLatestShoppingList } from "@/lib/queries/shopping";
import { ShoppingListView } from "@/components/shopping/shopping-list-view";

export default async function ShoppingPage() {
  const { householdId } = await requireHousehold();
  const { locale } = await getI18n();
  const list = getLatestShoppingList(db, householdId, locale as "en" | "de");
  return <ShoppingListView list={list} />;
}
