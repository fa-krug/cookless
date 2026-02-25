import { ChevronDown, RefreshCw, ShoppingCart } from "lucide-react";
import { Spinner } from "./ui/Spinner";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { MealPlanEntry, PlanIteration, RecipeSummary } from "../api/types";
import { useRecipe, useRecipes } from "../hooks/useRecipes";
import { useShoppingLists } from "../hooks/useShoppingList";
import RecipePreviewModal from "./RecipePreviewModal";

interface IterationCardProps {
  iteration: PlanIteration;
  shoppingDays: number[];
  isArchived: boolean;
  onRenew?: () => void;
  isRenewing?: boolean;
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
    dates.push(
      `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`,
    );
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  isRenewing,
}: IterationCardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: recipesData } = useRecipes();
  const { data: shoppingLists } = useShoppingLists();
  const todayRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => getToday(), []);
  const [collapsed, setCollapsed] = useState(isArchived);
  const [previewEntry, setPreviewEntry] = useState<{
    recipeId: string;
    servings: number;
  } | null>(null);

  const { data: previewRecipe } = useRecipe(previewEntry?.recipeId ?? "");

  const allRecipes = useMemo(
    () => recipesData?.pages.flatMap((page) => page.items) ?? [],
    [recipesData],
  );

  const recipeMap = useMemo(() => {
    const map = new Map<string, RecipeSummary>();
    for (const recipe of allRecipes) {
      map.set(recipe.id, recipe);
    }
    return map;
  }, [allRecipes]);

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
            <ChevronDown
              size={16}
              className={`ml-1 inline transition-transform ${collapsed ? "" : "rotate-180"}`}
            />
          )}
        </h3>
        {!isArchived && onRenew && (
          <button
            onClick={onRenew}
            disabled={isRenewing}
            className="flex items-center gap-1.5 rounded-lg border border-orange-300 px-3 py-1 text-xs font-medium text-orange-500 hover:bg-orange-50 disabled:opacity-50"
          >
            {isRenewing ? <Spinner size={14} /> : <RefreshCw size={14} />}
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
                      <ShoppingCart size={16} className="ml-2 text-blue-400" />
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
                      <ShoppingCart size={16} className="text-blue-500" />
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
                        setPreviewEntry({ recipeId: recipe.id, servings: entry.servings })
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

      {previewEntry && previewRecipe && (
        <RecipePreviewModal
          open
          recipe={previewRecipe}
          servings={previewEntry.servings}
          onClose={() => setPreviewEntry(null)}
        />
      )}
    </div>
  );
}
