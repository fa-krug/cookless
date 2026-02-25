import { ListRestart } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { IngredientCategory, ShoppingList } from "../api/types";
import ShoppingCategory from "../components/ShoppingCategory";
import { ShoppingListSkeleton } from "../components/ui/ShoppingListSkeleton";
import { useBulkToggle, useShoppingLists, useToggleItem } from "../hooks/useShoppingList";
import { useToast } from "../hooks/useToast";

function ShoppingListView({ shoppingList }: { shoppingList: ShoppingList }) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const toggleItem = useToggleItem();
  const bulkToggle = useBulkToggle();

  const groupedItems = useMemo(() => {
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

  const checkedItemIds = shoppingList.items
    .filter((item) => item.is_checked)
    .map((item) => item.id);
  const hasCheckedItems = checkedItemIds.length > 0;

  function handleUncheckAll() {
    if (!hasCheckedItems) return;
    bulkToggle.mutate(
      { item_ids: checkedItemIds, is_checked: false },
      {
        onError: () => addToast(t("errors.shoppingUpdate"), "error"),
      },
    );
  }

  function handleToggleItem(itemId: string) {
    toggleItem.mutate(itemId, {
      onError: () => addToast(t("errors.shoppingUpdate"), "error"),
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {t("shopping.linkedToPlan")}
        </p>
        <button
          onClick={handleUncheckAll}
          disabled={!hasCheckedItems || bulkToggle.isPending}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-orange-500 hover:bg-orange-50 disabled:opacity-50"
        >
          <ListRestart size={16} />
          {t("shopping.uncheckAll")}
        </button>
      </div>

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
  );
}

export default function ShoppingListPage() {
  const { t } = useTranslation();
  const { data: lists, isLoading } = useShoppingLists();

  const currentList = lists?.[0] ?? null;

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t("shopping.title")}</h1>
      </div>

      {isLoading && <ShoppingListSkeleton />}

      {!isLoading && !currentList && (
        <div className="mt-12 text-center">
          <p className="text-gray-500">{t("shopping.emptyState")}</p>
        </div>
      )}

      {currentList && <ShoppingListView shoppingList={currentList} />}
    </div>
  );
}
