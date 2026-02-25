import { Pencil, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { Recipe } from "../api/types";
import { useIngredients } from "../hooks/useIngredients";
import { useUnits } from "../hooks/useUnits";

interface RecipePreviewModalProps {
  recipe: Recipe;
  servings: number;
  onClose: () => void;
}

export default function RecipePreviewModal({ recipe, servings, onClose }: RecipePreviewModalProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: ingredients } = useIngredients();
  const { data: units } = useUnits();

  const lang = i18n.language === "de" ? "de" : "en";

  const ingredientMap = new Map(ingredients?.map((i) => [i.id, i]));
  const unitMap = new Map(units?.map((u) => [u.id, u]));

  const scale = recipe.default_servings > 0 ? servings / recipe.default_servings : 1;

  const sortedIngredients = [...recipe.ingredients].sort((a, b) => a.order - b.order);

  const hasManualSteps = recipe.manual_steps.length > 0;
  const hasMachineSteps = recipe.machine_steps.length > 0;
  const hasSteps = hasManualSteps || hasMachineSteps;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:max-w-md sm:rounded-2xl">
        {/* Drag handle */}
        <div className="sticky top-0 z-10 flex justify-center bg-white pt-3 pb-2 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        <div className="px-5 pb-5 sm:pt-5">
          {/* Title & meta */}
          <h2 className="text-xl font-bold text-gray-900">{recipe.title}</h2>

          <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-500">
            <span>
              {servings} {t("recipes.servings")}
            </span>
            {recipe.prep_time_minutes != null && (
              <span>
                {t("recipes.prepTime")}: {recipe.prep_time_minutes} {t("recipes.minutes")}
              </span>
            )}
            {recipe.cook_time_minutes != null && (
              <span>
                {t("recipes.cookTime")}: {recipe.cook_time_minutes} {t("recipes.minutes")}
              </span>
            )}
          </div>

          {/* Ingredients */}
          {sortedIngredients.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-700">{t("ingredients.title")}</h3>
              <ul className="mt-2 space-y-1">
                {sortedIngredients.map((ri) => {
                  const ing = ingredientMap.get(ri.ingredient);
                  const unit = unitMap.get(ri.unit);
                  const qty = parseFloat(ri.quantity) * scale;
                  const displayQty = Number.isInteger(qty) ? qty.toString() : qty.toFixed(1);
                  const ingName = ing ? ing[`name_${lang}`] : "...";
                  const unitAbbr = unit?.abbreviation ?? "";

                  return (
                    <li key={ri.id} className="text-sm text-gray-700">
                      <span className="font-medium">
                        {displayQty} {unitAbbr}
                      </span>{" "}
                      {ingName}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex gap-3">
            {hasSteps && (
              <button
                type="button"
                onClick={() => navigate(`/cook/${recipe.id}`)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
              >
                <Play size={16} />
                {t("cooking.start")}
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate(`/recipes/${recipe.id}`)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Pencil size={16} />
              {t("common.edit")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
