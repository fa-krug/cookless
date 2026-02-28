import { Trash2, UtensilsCrossed } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { RecipeSummary, TagCategory } from "../api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const TAG_VARIANT: Record<TagCategory, "dietary" | "protein" | "cuisine" | "meal_type"> = {
  DIETARY: "dietary",
  PROTEIN: "protein",
  CUISINE: "cuisine",
  MEAL_TYPE: "meal_type",
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
    <Card
      ref={highlight ? ref : undefined}
      className={highlight ? "animate-highlight" : ""}
    >
      <CardContent className="flex min-w-0 items-center justify-between p-4">
        <Link to={`/recipes/${recipe.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          {recipe.image ? (
            <img
              src={recipe.image}
              alt={recipe.title}
              className="h-16 w-16 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted">
              <UtensilsCrossed size={24} className="text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="truncate text-lg font-medium">{recipe.title}</h3>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
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
            {recipe.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {recipe.tags.map((tag) => (
                  <Badge key={tag.id} variant={TAG_VARIANT[tag.category]}>
                    {i18n.language === "de" ? tag.name_de : tag.name_en}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="ml-3 shrink-0 text-red-600 hover:bg-red-50"
          onClick={() => onDelete(recipe.id)}
          aria-label={`${t("common.delete")} ${recipe.title}`}
        >
          <Trash2 size={18} />
        </Button>
      </CardContent>
    </Card>
  );
}
