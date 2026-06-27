import { CheckCircle, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getLatestShoppingList, type ShoppingItemDto } from "@/lib/queries/shopping";
import { EmptyState } from "@/components/ui/empty-state";
import { ShoppingCategory } from "@/components/shopping/shopping-category";
import { CATEGORY_ORDER } from "@/lib/display/format";

export default async function ShoppingPage() {
  const { householdId } = await requireHousehold();
  const { locale, t } = await getI18n();
  const list = getLatestShoppingList(db, householdId, locale as "en" | "de");

  if (!list || list.items.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("shopping.title")}</h1>
        <EmptyState
          icon={ShoppingCart}
          title={t("shopping.emptyTitle")}
          subtitle={t("shopping.emptySubtitle")}
          action={
            <Link href="/plan" className="text-sm font-medium text-primary hover:underline">
              {t("shopping.goToPlan")}
            </Link>
          }
        />
      </div>
    );
  }

  if (list.items.every((i) => i.isChecked)) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("shopping.title")}</h1>
        <EmptyState
          icon={CheckCircle}
          title={t("shopping.allDoneTitle")}
          subtitle={t("shopping.allDoneSubtitle")}
          action={
            <Link href="/plan" className="text-sm font-medium text-primary hover:underline">
              {t("shopping.backToPlan")}
            </Link>
          }
        />
      </div>
    );
  }

  // Group items by category, folding unknown categories into "OTHER" (defensive)
  const byCategory = new Map<string, ShoppingItemDto[]>();
  for (const item of list.items) {
    const cat = (CATEGORY_ORDER as readonly string[]).includes(item.category)
      ? item.category
      : "OTHER";
    const arr = byCategory.get(cat) ?? [];
    arr.push(item);
    byCategory.set(cat, arr);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("shopping.title")}</h1>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("shopping.linkedToPlan")}</p>
        {/* TODO(plan-6): reset — disabled placeholder */}
        <button
          type="button"
          disabled
          className="cursor-not-allowed text-sm font-medium text-muted-foreground"
        >
          {t("shopping.uncheckAll")}
        </button>
      </div>
      <div className="space-y-3">
        {CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => (
          <ShoppingCategory key={c} category={c} items={byCategory.get(c)!} />
        ))}
      </div>
    </div>
  );
}
