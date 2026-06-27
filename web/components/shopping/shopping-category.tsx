"use client";

import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { formatQuantity } from "@/lib/display/format";
import type { ShoppingItemDto } from "@/lib/queries/shopping";

interface ShoppingCategoryProps {
  category: string;
  items: ShoppingItemDto[];
}

export function ShoppingCategory({ category, items }: ShoppingCategoryProps) {
  const { t } = useT();
  const [isOpen, setIsOpen] = useState(true);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.isChecked === b.isChecked) return 0;
      return a.isChecked ? 1 : -1;
    });
  }, [items]);

  const checkedCount = items.filter((item) => item.isChecked).length;

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${
              isOpen ? "" : "-rotate-90"
            }`}
          />
          <h3 className="text-sm font-semibold text-foreground">
            {t(`shopping.categories.${category}`)}
          </h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {t("shopping.itemCount", { checked: checkedCount, total: items.length })}
        </span>
      </button>

      {isOpen && (
        <div className="divide-y divide-border border-t border-border">
          {sortedItems.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
              {/* Read-only checkbox — TODO(plan-6): toggle */}
              <input
                type="checkbox"
                checked={item.isChecked}
                disabled
                readOnly
                className="h-4 w-4 cursor-not-allowed rounded"
                aria-label={item.ingredientName}
              />
              <span
                className={`flex-1 text-sm ${
                  item.isChecked
                    ? "text-muted-foreground line-through"
                    : "text-foreground"
                }`}
              >
                {formatQuantity(item.quantity)} {item.unitAbbreviation}{" "}
                {item.ingredientName}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
