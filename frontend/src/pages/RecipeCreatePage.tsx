import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { Spinner } from "../components/ui/Spinner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { type ListType, type RecipeUpdatePayload } from "../api/types";
import Input from "../components/ui/Input";
import IngredientForm, { type IngredientRow } from "../components/IngredientForm";
import StepEditor, { type StepRow } from "../components/StepEditor";
import TagSelector from "../components/TagSelector";
import { createIngredient, useIngredients } from "../hooks/useIngredients";
import { queryKeys } from "../hooks/queryKeys";
import { useCreateRecipe } from "../hooks/useRecipes";
import { useTags } from "../hooks/useTags";
import { useToast } from "../hooks/useToast";
import { useUnits } from "../hooks/useUnits";

export default function RecipeCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const listType = (searchParams.get("list") as ListType) || "KNOWN";

  const { data: allIngredients = [] } = useIngredients();
  const { data: allUnits = [] } = useUnits();
  const { data: groupedTags } = useTags();
  const createRecipe = useCreateRecipe();

  const [title, setTitle] = useState("");
  const [defaultServings, setDefaultServings] = useState(2);
  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [manualSteps, setManualSteps] = useState<StepRow[]>([]);
  const [machineSteps, setMachineSteps] = useState<StepRow[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);

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
      list_type: listType,
      default_servings: defaultServings || 1,
      prep_time_minutes: prepTime ? Number(prepTime) : null,
      cook_time_minutes: cookTime ? Number(cookTime) : null,
      leftover_days: null,
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
        .filter((s) => s.instruction.trim() || s.program_type)
        .map((s, i) => ({
          step_number: i + 1,
          instruction: s.instruction || "",
          ...(s.program_type && {
            program_type: s.program_type,
            temperature: s.temperature ?? null,
            duration_seconds: s.duration_seconds ?? null,
            speed: s.speed ?? null,
            turbo: s.turbo ?? false,
            direction: s.direction ?? null,
            weight_grams: s.weight_grams ?? null,
          }),
        })),
      tag_ids: tagIds,
    };

    createRecipe.mutate(payload, {
      onSuccess: (newRecipe) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.ingredients });
        addToast(t("success.recipeSaved"), "success");
        navigate("/recipes", { state: { newRecipeId: newRecipe.id } });
      },
      onError: () => addToast(t("errors.recipeSave"), "error"),
    });
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("recipes.newRecipe")}</h1>
        <button
          type="button"
          onClick={() => navigate("/recipes")}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label={t("common.back")}
        >
          <ArrowLeft size={20} />
        </button>
      </div>

      <form onSubmit={handleSave} className="mt-4 space-y-6">
        {/* Title */}
        <div>
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("recipes.titlePlaceholder")}
            className="rounded-lg px-3 py-2 text-lg font-medium"
          />
        </div>

        {/* Servings, Prep Time, Cook Time */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("recipes.servings")}
            </label>
            <Input
              type="number"
              min={1}
              value={defaultServings}
              onChange={(e) => setDefaultServings(e.target.valueAsNumber || 0)}
              onBlur={() => setDefaultServings((v) => Math.max(1, v))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("recipes.prepTime")}
            </label>
            <Input
              type="number"
              min={0}
              value={prepTime}
              onChange={(e) => setPrepTime(e.target.value)}
              placeholder={t("recipes.minutes")}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("recipes.cookTime")}
            </label>
            <Input
              type="number"
              min={0}
              value={cookTime}
              onChange={(e) => setCookTime(e.target.value)}
              placeholder={t("recipes.minutes")}
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
          isMachine
        />

        {/* Tags Section */}
        {groupedTags && (
          <TagSelector
            groupedTags={groupedTags}
            selectedTagIds={tagIds}
            onChange={setTagIds}
          />
        )}

        {/* Save button */}
        <button
          type="submit"
          disabled={createRecipe.isPending || !title.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {createRecipe.isPending ? <Spinner /> : <Save size={16} />}
          {t("common.save")}
        </button>
      </form>
    </div>
  );
}
