import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { IngredientCategory, ShoppingListItem } from "../api/types";

interface ShoppingCategoryProps {
  category: IngredientCategory;
  items: ShoppingListItem[];
  onToggleItem: (itemId: string) => void;
}

export default function ShoppingCategory({ category, items, onToggleItem }: ShoppingCategoryProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.is_checked === b.is_checked) return 0;
      return a.is_checked ? 1 : -1;
    });
  }, [items]);

  const checkedCount = items.filter((item) => item.is_checked).length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-4 w-4 text-gray-400 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          >
            <path
              fillRule="evenodd"
              d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
          <h3 className="text-sm font-semibold text-gray-700">
            {t(`shopping.categories.${category}`)}
          </h3>
        </div>
        <span className="text-xs text-gray-400">
          {t("shopping.itemCount", { checked: checkedCount, total: items.length })}
        </span>
      </button>

      {!collapsed && (
        <div className="divide-y divide-gray-50 border-t border-gray-100">
          {sortedItems.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={item.is_checked}
                onChange={() => onToggleItem(item.id)}
                className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
              />
              <span
                className={`flex-1 text-sm ${
                  item.is_checked ? "text-gray-400 line-through" : "text-gray-900"
                }`}
              >
                {item.quantity && item.unit_abbreviation
                  ? `${item.quantity} ${item.unit_abbreviation} `
                  : item.quantity
                    ? `${item.quantity} `
                    : ""}
                {item.ingredient_name}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
