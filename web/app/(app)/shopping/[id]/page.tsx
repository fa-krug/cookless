import { notFound } from "next/navigation";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getShoppingListById } from "@/lib/queries/shopping";
import { ShoppingListView } from "@/components/shopping/shopping-list-view";

export default async function ShoppingListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { householdId } = await requireHousehold();
  const { locale } = await getI18n();
  const list = getShoppingListById(db, householdId, id, locale as "en" | "de");
  if (!list) notFound();
  return <ShoppingListView list={list} showDate />;
}
