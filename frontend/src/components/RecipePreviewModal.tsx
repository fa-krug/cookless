import { Pencil, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { Recipe } from "../api/types";
import { Button } from "@/components/ui/button";
import { useIngredients } from "../hooks/useIngredients";
import { useUnits } from "../hooks/useUnits";
import ResponsiveOverlay from "./ui/ResponsiveOverlay";

interface RecipePreviewModalProps {
  open: boolean;
  recipe: Recipe;
  servings: number;
  onClose: () => void;
}

export default function RecipePreviewModal({ open, recipe, servings, onClose }: RecipePreviewModalProps) {
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
    <ResponsiveOverlay open={open} onClose={onClose} title={recipe.title}>
      <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
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
          <h3 className="text-sm font-semibold text-foreground">{t("ingredients.title")}</h3>
          <ul className="mt-2 space-y-1">
            {sortedIngredients.map((ri) => {
              const ing = ingredientMap.get(ri.ingredient);
              const unit = unitMap.get(ri.unit);
              const qty = parseFloat(ri.quantity) * scale;
              const displayQty = Number.isInteger(qty) ? qty.toString() : qty.toFixed(1);
              const ingName = ing ? ing[`name_${lang}`] : "...";
              const unitAbbr = unit?.abbreviation ?? "";

              return (
                <li key={ri.id} className="text-sm text-foreground">
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
          <Button type="button" className="flex-1" onClick={() => navigate(`/cook/${recipe.id}`)}>
            <Play size={16} />
            {t("cooking.start")}
          </Button>
        )}
        <Button type="button" variant="outline" className="flex-1" onClick={() => navigate(`/recipes/${recipe.id}`)}>
          <Pencil size={16} />
          {t("common.edit")}
        </Button>
      </div>
    </ResponsiveOverlay>
  );
}
