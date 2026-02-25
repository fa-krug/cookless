import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { MealPlanEntry, PlanIteration, Recipe } from "../api/types";
import { useRecipes } from "../hooks/useRecipes";
import { useShoppingLists } from "../hooks/useShoppingList";
import RecipePreviewModal from "./RecipePreviewModal";

interface IterationCardProps {
  iteration: PlanIteration;
  shoppingDays: number[];
  isArchived: boolean;
  onRenew?: () => void;
}

function formatDate(dateStr: string, locale: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getDates(iteration: PlanIteration): string[] {
  const dates: string[] = [];
  const start = new Date(iteration.start_date + "T00:00:00");
  const end = new Date(iteration.end_date + "T00:00:00");
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

/** Convert JS getDay() (0=Sun..6=Sat) to backend weekday (0=Mon..6=Sun). */
function jsToBackendDay(jsDay: number): number {
  return (jsDay + 6) % 7;
}

export default function IterationCard({
  iteration,
  shoppingDays,
  isArchived,
  onRenew,
}: IterationCardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: recipes } = useRecipes();
  const { data: shoppingLists } = useShoppingLists();
  const todayRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => getToday(), []);
  const [collapsed, setCollapsed] = useState(isArchived);
  const [previewEntry, setPreviewEntry] = useState<{
    recipe: Recipe;
    servings: number;
  } | null>(null);

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
    for (const entry of iteration.entries) {
      if (entry.meal_type === "LUNCH") {
        map.set(entry.date, entry);
      }
    }
    return map;
  }, [iteration.entries]);

  const dates = useMemo(() => getDates(iteration), [iteration]);

  // Shopping lists for this iteration, indexed by shopping_date
  const shoppingListByDate = useMemo(() => {
    const map = new Map<string, { id: string; itemCount: number }>();
    if (shoppingLists) {
      for (const sl of shoppingLists) {
        if (sl.iteration === iteration.id && sl.shopping_date) {
          map.set(sl.shopping_date, {
            id: sl.id,
            itemCount: sl.items.length,
          });
        }
      }
    }
    return map;
  }, [shoppingLists, iteration.id]);

  useEffect(() => {
    if (!isArchived && todayRef.current) {
      todayRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isArchived]);

  const headerLabel = `${formatDate(iteration.start_date, i18n.language)} – ${formatDate(iteration.end_date, i18n.language)}`;

  return (
    <div className={isArchived ? "opacity-75" : ""}>
      {/* Header */}
      <div
        className={`mb-3 flex items-center justify-between ${isArchived ? "cursor-pointer" : ""}`}
        onClick={isArchived ? () => setCollapsed((c) => !c) : undefined}
      >
        <h3
          className={`text-sm font-semibold ${isArchived ? "text-gray-400" : "text-gray-700"}`}
        >
          {headerLabel}
          {isArchived && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`ml-1 inline h-4 w-4 transition-transform ${collapsed ? "" : "rotate-180"}`}
            >
              <path
                fillRule="evenodd"
                d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </h3>
        {!isArchived && onRenew && (
          <button
            onClick={onRenew}
            className="rounded-lg border border-orange-300 px-3 py-1 text-xs font-medium text-orange-500 hover:bg-orange-50"
          >
            {t("plan.renew")}
          </button>
        )}
      </div>

      {/* Day cards */}
      {!collapsed && (
        <div className="space-y-3">
          {dates.map((date) => {
            const entry = entryMap.get(date);
            const recipe = entry ? recipeMap.get(entry.recipe) : null;
            const recipeName = recipe?.title ?? "...";
            const isToday = date === today;

            const jsDay = new Date(date + "T00:00:00").getDay();
            const backendDay = jsToBackendDay(jsDay);
            const isShoppingDay = shoppingDays.includes(backendDay);
            const shoppingInfo = shoppingListByDate.get(date);

            return (
              <div
                key={date}
                ref={isToday ? todayRef : undefined}
                className={`rounded-lg border shadow-sm ${
                  isToday
                    ? "border-orange-400 bg-orange-50 ring-2 ring-orange-300"
                    : isShoppingDay
                      ? "border-l-4 border-l-blue-300 border-t border-r border-b border-t-gray-200 border-r-gray-200 border-b-gray-200 bg-white"
                      : "border-gray-200 bg-white"
                }`}
              >
                <div
                  className={`border-b px-4 py-2 ${
                    isToday ? "border-orange-200" : "border-gray-100"
                  }`}
                >
                  <h3
                    className={`flex items-center text-sm font-semibold ${
                      isToday ? "text-orange-600" : "text-gray-700"
                    }`}
                  >
                    {formatDate(date, i18n.language)}
                    {isToday && (
                      <span className="ml-2 text-xs font-normal text-orange-500">
                        {t("plan.today")}
                      </span>
                    )}
                    {isShoppingDay && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="ml-2 h-4 w-4 text-blue-400"
                      >
                        <path d="M1 1.75A.75.75 0 0 1 1.75 1h1.628a1.75 1.75 0 0 1 1.734 1.51L5.18 3h10.07A1.75 1.75 0 0 1 17 5.018l-1.14 7.584A1.75 1.75 0 0 1 14.128 14H6.872a1.75 1.75 0 0 1-1.732-1.398L3.395 2.253a.25.25 0 0 0-.248-.216H1.75A.75.75 0 0 1 1 1.75ZM6 17.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM15.5 17.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
                      </svg>
                    )}
                  </h3>
                </div>

                <div className="divide-y divide-gray-50">
                  {/* Shopping list link on shopping days */}
                  {isShoppingDay && shoppingInfo && (
                    <button
                      onClick={() => navigate(`/shopping/${shoppingInfo.id}`)}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-blue-50"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-4 w-4 text-blue-500"
                      >
                        <path d="M1 1.75A.75.75 0 0 1 1.75 1h1.628a1.75 1.75 0 0 1 1.734 1.51L5.18 3h10.07A1.75 1.75 0 0 1 17 5.018l-1.14 7.584A1.75 1.75 0 0 1 14.128 14H6.872a1.75 1.75 0 0 1-1.732-1.398L3.395 2.253a.25.25 0 0 0-.248-.216H1.75A.75.75 0 0 1 1 1.75ZM6 17.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM15.5 17.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
                      </svg>
                      <span className="text-sm font-medium text-blue-500">
                        {t("plan.shoppingPreview", {
                          count: shoppingInfo.itemCount,
                        })}
                      </span>
                    </button>
                  )}

                  {/* Lunch entry */}
                  {entry && (
                    <button
                      onClick={() =>
                        recipe &&
                        setPreviewEntry({ recipe, servings: entry.servings })
                      }
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
      )}

      {previewEntry && (
        <RecipePreviewModal
          recipe={previewEntry.recipe}
          servings={previewEntry.servings}
          onClose={() => setPreviewEntry(null)}
        />
      )}
    </div>
  );
}
