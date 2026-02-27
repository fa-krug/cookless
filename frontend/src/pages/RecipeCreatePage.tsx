import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { Spinner } from "../components/ui/Spinner";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { type ListType } from "../api/types";
import Input from "../components/ui/Input";
import IngredientForm from "../components/IngredientForm";
import StepEditor from "../components/StepEditor";
import TagSelector from "../components/TagSelector";
import { useIngredients } from "../hooks/useIngredients";
import { queryKeys } from "../hooks/queryKeys";
import { useCreateRecipe } from "../hooks/useRecipes";
import { useRecipeForm } from "../hooks/useRecipeForm";
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

  const form = useRecipeForm({ listType });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const payload = await form.buildPayload();
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
            value={form.title}
            onChange={(e) => form.setTitle(e.target.value)}
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
              value={form.defaultServings}
              onChange={(e) => form.setDefaultServings(e.target.valueAsNumber || 0)}
              onBlur={() => form.setDefaultServings((v) => Math.max(1, v))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("recipes.prepTime")}
            </label>
            <Input
              type="number"
              min={0}
              value={form.prepTime}
              onChange={(e) => form.setPrepTime(e.target.value)}
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
              value={form.cookTime}
              onChange={(e) => form.setCookTime(e.target.value)}
              placeholder={t("recipes.minutes")}
            />
          </div>
        </div>

        {/* Ingredients */}
        <IngredientForm
          ingredients={form.ingredients}
          onChange={form.setIngredients}
          allIngredients={allIngredients}
          allUnits={allUnits}
        />

        {/* Manual Steps */}
        <StepEditor
          steps={form.manualSteps}
          onChange={form.setManualSteps}
          label={t("steps.manualSteps")}
        />

        {/* Machine Steps */}
        <StepEditor
          steps={form.machineSteps}
          onChange={form.setMachineSteps}
          label={t("steps.machineSteps")}
          isMachine
        />

        {/* Tags Section */}
        {groupedTags && (
          <TagSelector
            groupedTags={groupedTags}
            selectedTagIds={form.tagIds}
            onChange={form.setTagIds}
          />
        )}

        {/* Save button */}
        <button
          type="submit"
          disabled={createRecipe.isPending || !form.title.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {createRecipe.isPending ? <Spinner /> : <Save size={16} />}
          {t("common.save")}
        </button>
      </form>
    </div>
  );
}
