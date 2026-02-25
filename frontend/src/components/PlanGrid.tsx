import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { MealPlan, MealPlanEntry, Recipe } from "../api/types";
import { useRecipes } from "../hooks/useRecipes";
import { useShoppingLists } from "../hooks/useShoppingList";

interface PlanGridProps {
  plan: MealPlan;
}

function formatDate(dateStr: string, locale: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
}

function getDates(plan: MealPlan): string[] {
  const dates: string[] = [];
  const start = new Date(plan.start_date + "T00:00:00");
  const end = new Date(plan.end_date + "T00:00:00");
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function isFirstDay(dateStr: string, plan: MealPlan): boolean {
  return dateStr === plan.start_date;
}

export default function PlanGrid({ plan }: PlanGridProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: recipes } = useRecipes();
  const { data: shoppingLists } = useShoppingLists();

  const recipeMap = useMemo(() => {
    const map = new Map<string, Recipe>();
    if (recipes) {
      for (const recipe of recipes) {
        map.set(recipe.id, recipe);
      }
    }
    return map;
  }, [recipes]);

  const entryMap = useMemo(() => {
    const map = new Map<string, MealPlanEntry>();
    for (const entry of plan.entries) {
      if (entry.meal_type === "LUNCH") {
        map.set(entry.date, entry);
      }
    }
    return map;
  }, [plan.entries]);

  const dates = useMemo(() => getDates(plan), [plan]);

  const shoppingList = shoppingLists?.find((sl) => sl.meal_plan === plan.id);
  const shoppingItemCount = shoppingList?.items.length ?? 0;

  return (
    <div className="space-y-3">
      {dates.map((date) => {
        const entry = entryMap.get(date);
        const recipe = entry ? recipeMap.get(entry.recipe) : null;
        const recipeName = recipe?.title ?? "...";
        const firstDay = isFirstDay(date, plan);

        return (
          <div key={date} className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-4 py-2">
              <h3 className="text-sm font-semibold text-gray-700">
                {formatDate(date, i18n.language)}
              </h3>
            </div>

            <div className="divide-y divide-gray-50">
              {/* Shopping list preview on first day */}
              {firstDay && shoppingList && (
                <button
                  onClick={() => navigate(`/shopping/${shoppingList.id}`)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-orange-50"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4 text-orange-500"
                  >
                    <path d="M1 1.75A.75.75 0 0 1 1.75 1h1.628a1.75 1.75 0 0 1 1.734 1.51L5.18 3h10.07A1.75 1.75 0 0 1 17 5.018l-1.14 7.584A1.75 1.75 0 0 1 14.128 14H6.872a1.75 1.75 0 0 1-1.732-1.398L3.395 2.253a.25.25 0 0 0-.248-.216H1.75A.75.75 0 0 1 1 1.75ZM6 17.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM15.5 17.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
                  </svg>
                  <span className="text-sm font-medium text-orange-500">
                    {t("plan.shoppingPreview", { count: shoppingItemCount })}
                  </span>
                </button>
              )}

              {/* Lunch entry */}
              {entry && (
                <button
                  onClick={() => recipe && navigate(`/recipes/${recipe.id}`)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <span className="w-14 shrink-0 text-xs font-medium uppercase text-gray-400">
                    {t("plan.lunch")}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${
                      entry.is_leftover
                        ? "italic text-gray-400"
                        : "font-medium text-gray-900"
                    }`}
                  >
                    {recipeName}
                    {entry.is_leftover && (
                      <span className="ml-1.5 text-xs font-normal not-italic text-gray-400">
                        ({t("plan.leftover")})
                      </span>
                    )}
                  </span>
                </button>
              )}

              {/* Static dinner label */}
              <div className="flex items-center gap-2 px-4 py-3">
                <span className="w-14 shrink-0 text-xs font-medium uppercase text-gray-400">
                  {t("plan.dinner")}
                </span>
                <span className="text-sm text-gray-400">
                  {t("plan.coldDish")}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
