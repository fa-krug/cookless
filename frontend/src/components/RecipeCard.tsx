import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { Recipe } from "../api/types";

interface RecipeCardProps {
  recipe: Recipe;
  onDelete: (id: string) => void;
}

export default function RecipeCard({ recipe, onDelete }: RecipeCardProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <Link to={`/recipes/${recipe.id}`} className="min-w-0 flex-1">
        <h3 className="truncate text-lg font-medium text-gray-900">{recipe.title}</h3>
        <div className="mt-1 flex gap-3 text-sm text-gray-500">
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
          <span>
            {t("recipes.servings")}: {recipe.default_servings}
          </span>
        </div>
      </Link>
      <button
        onClick={() => onDelete(recipe.id)}
        className="ml-3 shrink-0 rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
        aria-label={`${t("common.delete")} ${recipe.title}`}
      >
        {t("common.delete")}
      </button>
    </div>
  );
}
