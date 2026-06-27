"use client";

import { useState } from "react";
import { ChevronDown, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useT } from "@/lib/i18n/provider";
import { addDays, weekday } from "@/lib/domain/dates";
import type { PlanIterationDto, PlanShoppingListDto } from "@/lib/queries/meal-plan";

interface IterationCardProps {
  iteration: PlanIterationDto;
  shoppingDays: number[];
  isArchived: boolean;
  todayIso: string;
}

function formatDate(date: string, locale: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function buildDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let current = startDate;
  while (current <= endDate) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

export function IterationCard({
  iteration,
  shoppingDays,
  isArchived,
  todayIso,
}: IterationCardProps) {
  const { locale, t } = useT();
  const [collapsed, setCollapsed] = useState(isArchived);

  const dates = buildDates(iteration.startDate, iteration.endDate);

  // Build entry map: date → LUNCH entry
  const entryByDate = new Map(
    iteration.entries
      .filter((e) => e.mealType === "LUNCH")
      .map((e) => [e.date, e]),
  );

  // Build shopping list map: shoppingDate → PlanShoppingListDto
  const shoppingListByDate = new Map<string, PlanShoppingListDto>();
  for (const sl of iteration.shoppingLists) {
    if (sl.shoppingDate) {
      shoppingListByDate.set(sl.shoppingDate, sl);
    }
  }

  const headerLabel = `${formatDate(iteration.startDate, locale)} – ${formatDate(iteration.endDate, locale)}`;

  return (
    <div className={`rounded-lg border bg-card shadow-sm ${isArchived ? "opacity-75" : ""}`}>
      {/* Card header */}
      <div
        className={`flex items-center justify-between px-4 py-3 ${isArchived ? "cursor-pointer select-none" : ""}`}
        onClick={isArchived ? () => setCollapsed((c) => !c) : undefined}
      >
        <h3
          className={`flex items-center gap-1 text-sm font-semibold ${
            isArchived ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {headerLabel}
          {isArchived && (
            <ChevronDown
              size={16}
              className={`transition-transform ${collapsed ? "" : "rotate-180"}`}
            />
          )}
        </h3>

        {/* Refresh button — disabled placeholder until plan-6 */}
        {!isArchived && (
          <button
            type="button"
            disabled
            className="rounded border border-primary/50 px-3 py-1 text-xs text-primary opacity-50 cursor-not-allowed"
            // TODO(plan-6): generate new iteration
          >
            {t("plan.renew")}
          </button>
        )}
      </div>

      {/* Day rows */}
      {!collapsed && (
        <div className="divide-y divide-border border-t border-border">
          {dates.map((date) => {
            const entry = entryByDate.get(date);
            const isToday = date === todayIso;
            const isShoppingDay = shoppingDays.includes(weekday(date));
            // Match shopping list by exact date, then fall back to first list of the iteration
            const shoppingList =
              shoppingListByDate.get(date) ?? iteration.shoppingLists[0];

            return (
              <div
                key={date}
                className={`${
                  isToday
                    ? "bg-primary/10 ring-2 ring-inset ring-primary/40"
                    : isShoppingDay
                      ? "border-l-4 border-l-blue-300 bg-card"
                      : "bg-card"
                }`}
              >
                {/* Day header */}
                <div
                  className={`flex items-center gap-2 px-4 py-2 ${
                    isToday ? "border-b border-primary/30" : "border-b border-border"
                  }`}
                >
                  <span
                    className={`text-sm font-semibold ${
                      isToday ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {formatDate(date, locale)}
                  </span>
                  {isToday && (
                    <span className="text-xs font-normal text-primary">
                      {t("plan.today")}
                    </span>
                  )}
                  {isShoppingDay && (
                    <ShoppingCart size={14} className="ml-auto text-blue-400" />
                  )}
                </div>

                <div className="divide-y divide-border">
                  {/* Shopping list preview on shopping days */}
                  {isShoppingDay && shoppingList && (
                    <Link
                      href="/shopping"
                      className="flex items-center gap-2 px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-950"
                    >
                      <ShoppingCart size={14} className="text-blue-500" />
                      <span className="text-sm font-medium text-blue-500">
                        {t("plan.shoppingPreview", { count: shoppingList.itemCount })}
                      </span>
                    </Link>
                  )}

                  {/* Lunch entry */}
                  <div
                    className="flex items-center gap-2 px-4 py-3"
                    // TODO(plan-10): open preview modal on click
                  >
                    <span className="w-14 shrink-0 text-xs font-medium uppercase text-muted-foreground">
                      {t("plan.lunch")}
                    </span>
                    {entry ? (
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${
                          entry.isLeftover
                            ? "italic text-muted-foreground"
                            : "font-medium text-foreground"
                        }`}
                      >
                        {entry.recipeTitle}
                        {entry.isLeftover && (
                          <span className="ml-1.5 text-xs font-normal not-italic text-muted-foreground">
                            ({t("plan.leftover")})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>

                  {/* Static dinner row */}
                  <div className="flex items-center gap-2 px-4 py-3">
                    <span className="w-14 shrink-0 text-xs font-medium uppercase text-muted-foreground">
                      {t("plan.dinner")}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t("plan.coldDish")}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
