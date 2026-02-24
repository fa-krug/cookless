import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import type { Ingredient, Recipe, RecipeUpdatePayload } from "../api/types";
import IngredientForm, { type IngredientRow } from "../components/IngredientForm";
import StepEditor, { type StepRow } from "../components/StepEditor";
import { createIngredient, useIngredients } from "../hooks/useIngredients";
import { useDeleteRecipe, useMoveRecipe, useRecipe, useUpdateRecipe } from "../hooks/useRecipes";
import { useUnits } from "../hooks/useUnits";

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();

  const { data: recipe, isLoading: recipeLoading } = useRecipe(id ?? "");
  const { data: allIngredients = [] } = useIngredients();
  const { data: allUnits = [] } = useUnits();

  if (recipeLoading) {
    return (
      <div className="p-4">
        <p className="text-center text-sm text-gray-500">{t("common.loading")}</p>
      </div>
    );
  }

  if (!recipe || !id) {
    return (
      <div className="p-4">
        <p className="text-center text-sm text-gray-500">{t("common.error")}</p>
      </div>
    );
  }

  return (
    <RecipeForm
      key={recipe.updated_at}
      recipe={recipe}
      recipeId={id}
      allIngredients={allIngredients}
      allUnits={allUnits}
    />
  );
}

function buildIngredientRows(
  recipe: Recipe,
  allIngredients: Ingredient[],
  nameKey: "name_de" | "name_en",
): IngredientRow[] {
  return recipe.ingredients.map((ri) => {
    const ing = allIngredients.find((i) => i.id === ri.ingredient);
    return {
      ingredient: ri.ingredient,
      ingredientName: ing ? ing[nameKey] : String(ri.ingredient),
      quantity: ri.quantity,
      unit: ri.unit,
      order: ri.order,
    };
  });
}

function buildStepRows(steps: Recipe["manual_steps"]): StepRow[] {
  return steps.map((s) => ({
    step_number: s.step_number,
    instruction: s.instruction,
  }));
}

interface RecipeFormProps {
  recipe: Recipe;
  recipeId: string;
  allIngredients: Ingredient[];
  allUnits: import("../api/types").Unit[];
}

function RecipeForm({ recipe, recipeId, allIngredients, allUnits }: RecipeFormProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language === "de" ? "de" : "en";
  const nameKey = lang === "de" ? "name_de" : "name_en";

  const updateRecipe = useUpdateRecipe();
  const moveRecipe = useMoveRecipe();
  const deleteRecipe = useDeleteRecipe();
  const queryClient = useQueryClient();

  const initialIngredients = useMemo(
    () => buildIngredientRows(recipe, allIngredients, nameKey),
    [recipe, allIngredients, nameKey],
  );

  const [title, setTitle] = useState(recipe.title);
  const [defaultServings, setDefaultServings] = useState(recipe.default_servings);
  const [prepTime, setPrepTime] = useState(recipe.prep_time_minutes?.toString() ?? "");
  const [cookTime, setCookTime] = useState(recipe.cook_time_minutes?.toString() ?? "");
  const [ingredients, setIngredients] = useState<IngredientRow[]>(initialIngredients);
  const [manualSteps, setManualSteps] = useState<StepRow[]>(buildStepRows(recipe.manual_steps));
  const [machineSteps, setMachineSteps] = useState<StepRow[]>(buildStepRows(recipe.machine_steps));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    // Auto-create unknown ingredients (ingredient === 0 with a typed name)
    const resolvedIngredients = await Promise.all(
      ingredients.map(async (row) => {
        if (row.ingredient > 0 || !row.ingredientName.trim()) return row;
        const created = await createIngredient(row.ingredientName.trim());
        return { ...row, ingredient: created.id };
      }),
    );

    const payload: RecipeUpdatePayload = {
      title,
      list_type: recipe.list_type,
      default_servings: defaultServings,
      prep_time_minutes: prepTime ? Number(prepTime) : null,
      cook_time_minutes: cookTime ? Number(cookTime) : null,
      ingredients: resolvedIngredients
        .filter((row) => row.ingredient > 0)
        .map((row, i) => ({
          ingredient: row.ingredient,
          quantity: row.quantity || "0",
          unit: row.unit,
          order: i,
        })),
      manual_steps: manualSteps
        .filter((s) => s.instruction.trim())
        .map((s, i) => ({ step_number: i + 1, instruction: s.instruction })),
      machine_steps: machineSteps
        .filter((s) => s.instruction.trim())
        .map((s, i) => ({ step_number: i + 1, instruction: s.instruction })),
    };

    updateRecipe.mutate({ id: recipeId, data: payload }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["ingredients"] });
        navigate("/recipes");
      },
    });
  }

  function handleMove() {
    moveRecipe.mutate(recipeId, {
      onSuccess: () => navigate("/recipes"),
    });
  }

  function handleDelete() {
    if (!window.confirm(t("recipes.deleteConfirm"))) return;
    deleteRecipe.mutate(recipeId, {
      onSuccess: () => navigate("/recipes"),
    });
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("recipes.editRecipe")}</h1>
        <button
          type="button"
          onClick={() => navigate("/recipes")}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          {t("common.back")}
        </button>
      </div>

      <form onSubmit={handleSave} className="mt-4 space-y-6">
        {/* Title */}
        <div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("recipes.titlePlaceholder")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-lg font-medium focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>

        {/* Servings, Prep Time, Cook Time */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("recipes.servings")}
            </label>
            <input
              type="number"
              min={1}
              value={defaultServings}
              onChange={(e) => setDefaultServings(Number(e.target.value) || 1)}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("recipes.prepTime")}
            </label>
            <input
              type="number"
              min={0}
              value={prepTime}
              onChange={(e) => setPrepTime(e.target.value)}
              placeholder={t("recipes.minutes")}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("recipes.cookTime")}
            </label>
            <input
              type="number"
              min={0}
              value={cookTime}
              onChange={(e) => setCookTime(e.target.value)}
              placeholder={t("recipes.minutes")}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </div>

        {/* Ingredients */}
        <IngredientForm
          ingredients={ingredients}
          onChange={setIngredients}
          allIngredients={allIngredients}
          allUnits={allUnits}
        />

        {/* Manual Steps */}
        <StepEditor steps={manualSteps} onChange={setManualSteps} label={t("steps.manualSteps")} />

        {/* Machine Steps */}
        <StepEditor
          steps={machineSteps}
          onChange={setMachineSteps}
          label={t("steps.machineSteps")}
        />

        {/* Action buttons */}
        <div className="space-y-3">
          {/* Move button */}
          <button
            type="button"
            onClick={handleMove}
            disabled={moveRecipe.isPending}
            className="w-full rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-500 hover:bg-orange-50 disabled:opacity-50"
          >
            {recipe.list_type === "KNOWN" ? t("recipes.moveToTry") : t("recipes.moveToKnown")}
          </button>

          {/* Save / Delete row */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={updateRecipe.isPending}
              className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {t("common.save")}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteRecipe.isPending}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {t("common.delete")}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
