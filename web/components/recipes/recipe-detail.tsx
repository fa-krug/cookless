import type { JSX } from "react";
import Link from "next/link";
import { BookOpen, ChevronLeft } from "lucide-react";
import type {
  RecipeDetail as RecipeDetailDto,
  IngredientLite,
  UnitLite,
} from "@/lib/queries/recipes";
import { pickName, formatQuantity, recipeImageUrl } from "@/lib/display/format";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RecipeDetailActions } from "./recipe-detail-actions";

const TAG_VARIANT: Record<string, BadgeProps["variant"]> = {
  DIETARY: "dietary",
  PROTEIN: "protein",
  CUISINE: "cuisine",
  MEAL_TYPE: "meal_type",
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

interface RecipeDetailProps {
  recipe: RecipeDetailDto;
  ingredientsById: Map<number, IngredientLite>;
  unitsById: Map<number, UnitLite>;
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export function RecipeDetail({
  recipe,
  ingredientsById,
  unitsById,
  locale,
  t,
}: RecipeDetailProps): JSX.Element {
  const imageUrl = recipeImageUrl(recipe.image);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/recipes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft size={16} />
        {t("common.back")}
      </Link>

      {/* Hero image or placeholder */}
      {imageUrl !== null ? (
        <img
          src={imageUrl}
          alt={recipe.title}
          className="h-56 w-full rounded-xl object-cover"
        />
      ) : (
        <div className="flex h-56 w-full items-center justify-center rounded-xl bg-muted">
          <BookOpen size={48} className="text-muted-foreground" />
        </div>
      )}

      {/* Title */}
      <h1 className="text-3xl font-bold">{recipe.title}</h1>

      {/* Metadata row */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>
          {t("recipes.servings")}: {recipe.defaultServings}
        </span>
        {recipe.prepTimeMinutes != null && (
          <span>
            {t("recipes.prepTime")}: {recipe.prepTimeMinutes}{" "}
            {t("recipes.minutes")}
          </span>
        )}
        {recipe.cookTimeMinutes != null && (
          <span>
            {t("recipes.cookTime")}: {recipe.cookTimeMinutes}{" "}
            {t("recipes.minutes")}
          </span>
        )}
      </div>

      {/* Description */}
      {recipe.description && (
        <p className="text-muted-foreground">{recipe.description}</p>
      )}

      {/* Tags */}
      {recipe.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {recipe.tags.map((tag) => (
            <Badge key={tag.id} variant={TAG_VARIANT[tag.category]}>
              {pickName(locale, tag)}
            </Badge>
          ))}
        </div>
      )}

      {/* Ingredients */}
      {recipe.ingredients.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-3 text-lg font-semibold">
              {t("ingredients.title")}
            </h2>
            <ul className="space-y-1">
              {recipe.ingredients.map((ri) => {
                const ingredient = ingredientsById.get(ri.ingredientId);
                const unit = unitsById.get(ri.unitId);
                if (!ingredient) return null;
                return (
                  <li key={ri.id} className="flex items-baseline gap-1 text-sm">
                    <span className="font-medium">
                      {formatQuantity(ri.quantity)}
                    </span>
                    {unit && (
                      <span className="text-muted-foreground">
                        {unit.abbreviation}
                      </span>
                    )}
                    <span>{pickName(locale, ingredient)}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Manual steps */}
      {recipe.manualSteps.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t("steps.manualSteps")}</h2>
          <ol className="space-y-3">
            {recipe.manualSteps.map((step) => (
              <li key={step.id} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {step.stepNumber}
                </span>
                <p className="pt-0.5 text-sm leading-relaxed">
                  {step.instruction}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Machine steps */}
      {recipe.machineSteps.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t("steps.machineSteps")}</h2>
          <ol className="space-y-3">
            {recipe.machineSteps.map((step) => (
              <li key={step.id} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                  {step.stepNumber}
                </span>
                <div className="flex-1 space-y-1">
                  {step.programType && (
                    <p className="text-sm font-medium">
                      {t(`steps.programs.${step.programType}`)}
                    </p>
                  )}
                  <p className="text-sm leading-relaxed">{step.instruction}</p>
                  {/* Step params */}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {step.temperature != null && (
                      <span>
                        {t("steps.params.temperature")}: {step.temperature}
                        {t("steps.units.celsius")}
                      </span>
                    )}
                    {step.durationSeconds != null && (
                      <span>
                        {t("steps.params.duration")}:{" "}
                        {formatDuration(step.durationSeconds)}
                      </span>
                    )}
                    {step.speed != null && (
                      <span>
                        {t("steps.params.speed")}: {step.speed}
                      </span>
                    )}
                    {step.direction && (
                      <span>
                        {t("steps.params.direction")}:{" "}
                        {t(`steps.directions.${step.direction}`)}
                      </span>
                    )}
                    {step.weightGrams != null && (
                      <span>
                        {t("steps.params.weight")}: {step.weightGrams}
                        {t("steps.units.grams")}
                      </span>
                    )}
                    {step.turbo && (
                      <span className="font-medium">
                        {t("steps.params.turbo")}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <RecipeDetailActions recipeId={recipe.id} listType={recipe.listType} />
    </div>
  );
}
