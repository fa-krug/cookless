import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MealPlan, MealPlanEntry, MealType, Recipe } from "../api/types";
import { useRecipes } from "../hooks/useRecipes";
import { useUpdateEntry } from "../hooks/useMealPlan";

interface PlanGridProps {
  plan: MealPlan;
}

const MEAL_TYPES: MealType[] = ["LUNCH", "DINNER"];

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

export default function PlanGrid({ plan }: PlanGridProps) {
  const { t, i18n } = useTranslation();
  const { data: recipes } = useRecipes();
  const updateEntry = useUpdateEntry();
  const [swappingEntryId, setSwappingEntryId] = useState<string | null>(null);

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
      map.set(`${entry.date}-${entry.meal_type}`, entry);
    }
    return map;
  }, [plan.entries]);

  const dates = useMemo(() => getDates(plan), [plan]);

  function handleToggleLock(entry: MealPlanEntry) {
    updateEntry.mutate({
      entryId: entry.id,
      data: { is_locked: !entry.is_locked },
    });
  }

  function handleSwapRecipe(entryId: string, recipeId: string) {
    updateEntry.mutate(
      { entryId, data: { recipe: recipeId } },
      { onSuccess: () => setSwappingEntryId(null) },
    );
  }

  const mealLabel: Record<string, string> = {
    LUNCH: t("plan.lunch"),
    DINNER: t("plan.dinner"),
  };

  return (
    <div className="space-y-3">
      {dates.map((date) => (
        <div key={date} className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-2">
            <h3 className="text-sm font-semibold text-gray-700">
              {formatDate(date, i18n.language)}
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {MEAL_TYPES.map((mealType) => {
              const entry = entryMap.get(`${date}-${mealType}`);
              if (!entry) return null;

              const recipe = recipeMap.get(entry.recipe);
              const recipeName = recipe?.title ?? "...";
              const isSwapping = swappingEntryId === entry.id;

              return (
                <div key={mealType} className="flex items-center gap-2 px-4 py-3">
                  <span className="w-14 shrink-0 text-xs font-medium uppercase text-gray-400">
                    {mealLabel[mealType] ?? mealType}
                  </span>

                  {isSwapping ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <select
                        className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
                        defaultValue=""
                        onChange={(e) => handleSwapRecipe(entry.id, e.target.value)}
                      >
                        <option value="" disabled>
                          {t("plan.selectRecipe")}
                        </option>
                        {recipes?.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setSwappingEntryId(null)}
                        className="shrink-0 text-xs text-gray-500 hover:text-gray-700"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSwappingEntryId(entry.id)}
                      className="min-w-0 flex-1 text-left"
                      title={t("plan.swapRecipe")}
                    >
                      <span
                        className={`truncate text-sm ${
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

                  <button
                    onClick={() => handleToggleLock(entry)}
                    className={`shrink-0 rounded p-1 text-xs ${
                      entry.is_locked
                        ? "text-orange-500 hover:text-orange-600"
                        : "text-gray-300 hover:text-gray-500"
                    }`}
                    title={entry.is_locked ? t("plan.unlock") : t("plan.lock")}
                    aria-label={entry.is_locked ? t("plan.unlock") : t("plan.lock")}
                  >
                    {entry.is_locked ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-4 w-4"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-4 w-4"
                      >
                        <path
                          fillRule="evenodd"
                          d="M14.5 1A4.5 4.5 0 0 0 10 5.5V9H3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1.5V5.5a3 3 0 1 1 6 0v2.75a.75.75 0 0 0 1.5 0V5.5A4.5 4.5 0 0 0 14.5 1Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
