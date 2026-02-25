import { Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { RecipeSummary } from "../api/types";

interface RecipeCardProps {
  recipe: RecipeSummary;
  onDelete: (id: string) => void;
  highlight?: boolean;
}

export default function RecipeCard({ recipe, onDelete, highlight }: RecipeCardProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlight && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlight]);

  return (
    <div
      ref={highlight ? ref : undefined}
      className={`flex min-w-0 items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${
        highlight ? "animate-highlight" : ""
      }`}
    >
      <Link to={`/recipes/${recipe.id}`} className="min-w-0 flex-1">
        <h3 className="truncate text-lg font-medium text-gray-900">{recipe.title}</h3>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-gray-500">
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
        className="ml-3 shrink-0 rounded-md p-2 text-red-600 hover:bg-red-50"
        aria-label={`${t("common.delete")} ${recipe.title}`}
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
}
