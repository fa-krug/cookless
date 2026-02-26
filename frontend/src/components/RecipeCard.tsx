import { Trash2, UtensilsCrossed } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { RecipeSummary, TagCategory } from "../api/types";

const TAG_COLORS: Record<TagCategory, string> = {
  DIETARY: "bg-green-100 text-green-800",
  PROTEIN: "bg-red-100 text-red-800",
  CUISINE: "bg-blue-100 text-blue-800",
  MEAL_TYPE: "bg-amber-100 text-amber-800",
};

interface RecipeCardProps {
  recipe: RecipeSummary;
  onDelete: (id: string) => void;
  highlight?: boolean;
}

export default function RecipeCard({ recipe, onDelete, highlight }: RecipeCardProps) {
  const { t, i18n } = useTranslation();
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
      <Link to={`/recipes/${recipe.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        {recipe.image ? (
          <img
            src={recipe.image}
            alt={recipe.title}
            className="h-16 w-16 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gray-100">
            <UtensilsCrossed size={24} className="text-gray-400" />
          </div>
        )}
        <div className="min-w-0">
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
        </div>
        {recipe.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {recipe.tags.map((tag) => (
              <span
                key={tag.id}
                className={`text-xs px-1.5 py-0.5 rounded ${TAG_COLORS[tag.category]}`}
              >
                {i18n.language === "de" ? tag.name_de : tag.name_en}
              </span>
            ))}
          </div>
        )}
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
