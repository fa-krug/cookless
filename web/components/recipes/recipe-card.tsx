"use client";

import type { JSX } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import type { RecipeSummary } from "@/lib/queries/recipes";
import { pickName, recipeImageUrl } from "@/lib/display/format";
import { useT } from "@/lib/i18n/provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RecipeCardDelete } from "./recipe-card-delete";

const TAG_VARIANT: Record<string, "dietary" | "protein" | "cuisine" | "meal_type"> = {
  DIETARY: "dietary",
  PROTEIN: "protein",
  CUISINE: "cuisine",
  MEAL_TYPE: "meal_type",
};

interface RecipeCardProps {
  recipe: RecipeSummary;
  locale: string;
}

export function RecipeCard({ recipe, locale }: RecipeCardProps): JSX.Element {
  const { t } = useT();
  const imageUrl = recipeImageUrl(recipe.image);

  return (
    <Card>
      <CardContent className="flex min-w-0 items-center justify-between p-4">
        <Link
          href={`/recipes/${recipe.id}`}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          {imageUrl !== null ? (
            <img
              src={imageUrl}
              alt={recipe.title}
              loading="lazy"
              className="h-16 w-16 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted">
              <BookOpen size={24} className="text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="truncate text-lg font-medium">{recipe.title}</h3>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
              {recipe.prepTimeMinutes != null && (
                <span>
                  {t("recipes.prepTime")}: {recipe.prepTimeMinutes} {t("recipes.minutes")}
                </span>
              )}
              {recipe.cookTimeMinutes != null && (
                <span>
                  {t("recipes.cookTime")}: {recipe.cookTimeMinutes} {t("recipes.minutes")}
                </span>
              )}
              <span>
                {t("recipes.servings")}: {recipe.defaultServings}
              </span>
            </div>
            {recipe.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {recipe.tags.map((tag) => (
                  <Badge key={tag.id} variant={TAG_VARIANT[tag.category]}>
                    {pickName(locale, tag)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </Link>
        <RecipeCardDelete recipeId={recipe.id} title={recipe.title} />
      </CardContent>
    </Card>
  );
}
