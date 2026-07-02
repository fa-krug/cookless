import { CheckCircle, ListRestart, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "../components/ui/Spinner";
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { IngredientCategory, ShoppingListItem } from "../api/types";
import ShoppingCategory from "../components/ShoppingCategory";
import { EmptyState } from "../components/ui/EmptyState";
import { ShoppingListSkeleton } from "../components/ui/ShoppingListSkeleton";
import { useBulkToggle, useShoppingList, useToggleItem } from "../hooks/useShoppingList";
import { toast } from "sonner";

export default function ShoppingListDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { data: shoppingList, isLoading } = useShoppingList(id);
  const toggleItem = useToggleItem();
  const bulkToggle = useBulkToggle();

  const groupedItems = useMemo(() => {
    if (!shoppingList) return new Map<IngredientCategory, ShoppingListItem[]>();
    const groups = new Map<IngredientCategory, typeof shoppingList.items>();
    for (const item of shoppingList.items) {
      const existing = groups.get(item.ingredient_category) ?? [];
      existing.push(item);
      groups.set(item.ingredient_category, existing);
    }
    return groups;
  }, [shoppingList]);

  const categoryOrder: IngredientCategory[] = [
    "PRODUCE",
    "DAIRY",
    "MEAT",
    "PANTRY",
    "FROZEN",
    "OTHER",
  ];

  const sortedCategories = categoryOrder.filter((cat) => groupedItems.has(cat));

  const checkedItemIds =
    shoppingList?.items.filter((item) => item.is_checked).map((item) => item.id) ?? [];
  const hasCheckedItems = checkedItemIds.length > 0;
  const allChecked =
    (shoppingList?.items.length ?? 0) > 0 &&
    checkedItemIds.length === shoppingList?.items.length;

  function handleUncheckAll() {
    if (!hasCheckedItems) return;
    const idsToRestore = [...checkedItemIds];
    bulkToggle.mutate(
      { item_ids: idsToRestore, is_checked: false },
      {
        onError: () => toast.error(t("errors.shoppingUpdate")),
        onSuccess: () =>
          toast.success(t("shopping.resetDone"), {
            action: {
              label: t("common.undo"),
              onClick: () =>
                bulkToggle.mutate(
                  { item_ids: idsToRestore, is_checked: true },
                  { onError: () => toast.error(t("errors.shoppingUpdate")) },
                ),
            },
          }),
      },
    );
  }

  function handleToggleItem(itemId: string) {
    toggleItem.mutate(itemId, {
      onError: () => toast.error(t("errors.shoppingUpdate")),
    });
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("shopping.title")}</h1>
      </div>

      {isLoading && <ShoppingListSkeleton />}

      {!isLoading && !shoppingList && (
        <EmptyState
          icon={ShoppingCart}
          title={t("shopping.emptyTitle")}
          subtitle={t("shopping.emptySubtitle")}
          action={{ label: t("shopping.goToPlan"), to: "/plan" }}
        />
      )}

      {shoppingList && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t("shopping.linkedToPlan")} &middot; {formatDate(shoppingList.created_at)}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-primary hover:bg-primary/10"
              onClick={handleUncheckAll}
              disabled={!hasCheckedItems || bulkToggle.isPending}
            >
              {bulkToggle.isPending ? <Spinner /> : <ListRestart size={16} />}
              {t("shopping.uncheckAll")}
            </Button>
          </div>

          {allChecked && (
            <EmptyState
              icon={CheckCircle}
              title={t("shopping.allDoneTitle")}
              subtitle={t("shopping.allDoneSubtitle")}
              action={{ label: t("shopping.backToPlan"), to: "/plan" }}
            />
          )}

          <div className="space-y-3">
            {sortedCategories.map((category) => (
              <ShoppingCategory
                key={category}
                category={category}
                items={groupedItems.get(category)!}
                onToggleItem={handleToggleItem}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
