import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, SlidersHorizontal } from "lucide-react";
import { Spinner } from "../components/ui/Spinner";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { type ListType } from "../api/types";
import type { RecipeFormValues } from "@/lib/schemas/recipe";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/IconButton";
import { Label } from "@/components/ui/label";
import IngredientForm from "../components/IngredientForm";
import StepEditor from "../components/StepEditor";
import TagFilterDrawer from "../components/TagFilterDrawer";
import { useIngredients } from "../hooks/useIngredients";
import { queryKeys } from "../hooks/queryKeys";
import { useCreateRecipe } from "../hooks/useRecipes";
import { useRecipeForm } from "../hooks/useRecipeForm";
import { useTags } from "../hooks/useTags";
import { toast } from "sonner";
import { useUnits } from "../hooks/useUnits";

export default function RecipeCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const listType = (searchParams.get("list") as ListType) || "KNOWN";

  const { data: allIngredients = [] } = useIngredients();
  const { data: allUnits = [] } = useUnits();
  const { data: groupedTags } = useTags();
  const createRecipe = useCreateRecipe();

  const { form, ingredientFields, manualStepFields, machineStepFields, buildPayload } =
    useRecipeForm({ listType });

  async function handleSave(values: RecipeFormValues) {
    const payload = await buildPayload(values);
    createRecipe.mutate(payload, {
      onSuccess: (newRecipe) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.ingredients });
        toast.success(t("success.recipeSaved"));
        navigate("/recipes", { state: { newRecipeId: newRecipe.id } });
      },
      onError: () => toast.error(t("errors.recipeSave")),
    });
  }

  const title = form.watch("title");
  const tagIds = form.watch("tagIds");

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("recipes.newRecipe")}</h1>
        <IconButton type="button" variant="ghost" onClick={() => navigate("/recipes")} tooltip={t("common.back")} aria-label={t("common.back")}>
          <ArrowLeft size={20} />
        </IconButton>
      </div>

      <form onSubmit={form.handleSubmit(handleSave)} className="mt-4 space-y-6">
        {/* Title */}
        <div>
          <Input
            type="text"
            {...form.register("title")}
            placeholder={t("recipes.titlePlaceholder")}
            className="rounded-lg px-3 py-2 text-lg font-medium"
          />
        </div>

        {/* Servings, Prep Time, Cook Time */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label>
              {t("recipes.servings")}
            </Label>
            <Input
              type="number"
              min={1}
              {...form.register("defaultServings", { valueAsNumber: true })}
            />
          </div>
          <div>
            <Label>
              {t("recipes.prepTime")}
            </Label>
            <Input
              type="number"
              min={0}
              {...form.register("prepTime")}
              placeholder={t("recipes.minutes")}
            />
          </div>
          <div>
            <Label>
              {t("recipes.cookTime")}
            </Label>
            <Input
              type="number"
              min={0}
              {...form.register("cookTime")}
              placeholder={t("recipes.minutes")}
            />
          </div>
        </div>

        {/* Ingredients */}
        <IngredientForm
          fields={ingredientFields.fields}
          append={ingredientFields.append}
          remove={ingredientFields.remove}
          update={ingredientFields.update}
          allIngredients={allIngredients}
          allUnits={allUnits}
        />

        {/* Manual Steps */}
        <StepEditor
          fields={manualStepFields.fields}
          append={manualStepFields.append}
          remove={manualStepFields.remove}
          update={manualStepFields.update}
          move={manualStepFields.move}
          label={t("steps.manualSteps")}
        />

        {/* Machine Steps */}
        <StepEditor
          fields={machineStepFields.fields}
          append={machineStepFields.append}
          remove={machineStepFields.remove}
          update={machineStepFields.update}
          move={machineStepFields.move}
          label={t("steps.machineSteps")}
          isMachine
        />

        {/* Tags */}
        <div>
          {groupedTags && (
            <TagFilterDrawer
              groupedTags={groupedTags}
              selectedTags={tagIds}
              onChange={(ids) => form.setValue("tagIds", ids)}
            >
              <Button type="button" variant="outline" size="sm">
                <SlidersHorizontal size={14} />
                {t("tags.filter")}
                {tagIds.length > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold text-white">
                    {tagIds.length}
                  </span>
                )}
              </Button>
            </TagFilterDrawer>
          )}
        </div>

        {/* Save button */}
        <Button type="submit" className="w-full" disabled={createRecipe.isPending || !title.trim()}>
          {createRecipe.isPending ? <Spinner /> : <Save size={16} />}
          {t("common.save")}
        </Button>
      </form>

    </div>
  );
}
