import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { IngredientCategory, ShoppingListItem } from "../api/types";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ShoppingCategoryProps {
  category: IngredientCategory;
  items: ShoppingListItem[];
  onToggleItem: (itemId: string) => void;
}

export default function ShoppingCategory({ category, items, onToggleItem }: ShoppingCategoryProps) {
  const { t } = useTranslation();

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.is_checked === b.is_checked) return 0;
      return a.is_checked ? 1 : -1;
    });
  }, [items]);

  const checkedCount = items.filter((item) => item.is_checked).length;

  return (
    <Collapsible defaultOpen className="group rounded-lg border border-gray-200 bg-white shadow-sm">
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <ChevronDown
              className={cn(
                "h-4 w-4 text-gray-400 transition-transform",
                "group-data-[state=closed]:-rotate-90",
              )}
            />
            <h3 className="text-sm font-semibold text-gray-700">
              {t(`shopping.categories.${category}`)}
            </h3>
          </div>
          <span className="text-xs text-gray-400">
            {t("shopping.itemCount", { checked: checkedCount, total: items.length })}
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="divide-y divide-gray-50 border-t border-gray-100">
          {sortedItems.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-gray-50"
            >
              <Checkbox
                checked={item.is_checked}
                onCheckedChange={() => onToggleItem(item.id)}
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
      </CollapsibleContent>
    </Collapsible>
  );
}
