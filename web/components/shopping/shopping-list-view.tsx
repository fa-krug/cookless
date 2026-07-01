import { CheckCircle, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import type { ShoppingListView as ShoppingListDto, ShoppingItemDto } from "@/lib/queries/shopping";
import { EmptyState } from "@/components/ui/empty-state";
import { ShoppingCategory } from "@/components/shopping/shopping-category";
import { UncheckAllButton } from "@/components/shopping/shopping-actions";
import { CATEGORY_ORDER } from "@/lib/display/format";

export async function ShoppingListView({
  list,
  showDate = false,
}: {
  list: ShoppingListDto | null;
  showDate?: boolean;
}) {
  const { locale, t } = await getI18n();

  const title = <h1 className="text-2xl font-bold">{t("shopping.title")}</h1>;

  if (!list || list.items.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        {title}
        <EmptyState
          fill
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
      <div className="flex flex-1 flex-col gap-4">
        {title}
        <EmptyState
          fill
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

  const dateLabel =
    showDate && list.shoppingDate
      ? t("shopping.forDate", {
          date: new Date(list.shoppingDate + "T00:00:00").toLocaleDateString(locale, {
            month: "short",
            day: "numeric",
          }),
        })
      : t("shopping.linkedToPlan");

  const byCategory = new Map<string, ShoppingItemDto[]>();
  for (const item of list.items) {
    const cat = (CATEGORY_ORDER as readonly string[]).includes(item.category) ? item.category : "OTHER";
    const arr = byCategory.get(cat) ?? [];
    arr.push(item);
    byCategory.set(cat, arr);
  }

  return (
    <div className="space-y-4">
      {title}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
        <UncheckAllButton itemIds={list.items.filter((i) => i.isChecked).map((i) => i.id)} />
      </div>
      <div className="space-y-3">
        {CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => (
          <ShoppingCategory key={c} category={c} items={byCategory.get(c)!} />
        ))}
      </div>
    </div>
  );
}
