import { Suspense } from "react";
import { requireHousehold } from "@/lib/auth/session";
import { resolveLocale } from "@/lib/i18n/server";
import { ShoppingListSkeleton } from "@/components/shopping/shopping-list-skeleton";
import { ShoppingContent } from "./shopping-content";

export default async function ShoppingPage() {
  const { householdId } = await requireHousehold();
  const locale = await resolveLocale();
  return (
    <Suspense fallback={<ShoppingListSkeleton />}>
      <ShoppingContent householdId={householdId} locale={locale} />
    </Suspense>
  );
}
