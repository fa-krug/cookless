import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Spinner } from "../components/ui/Spinner";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { type ListType } from "../api/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  const form = useRecipeForm({ listType });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const payload = await form.buildPayload();
    createRecipe.mutate(payload, {
      onSuccess: (newRecipe) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.ingredients });
        toast.success(t("success.recipeSaved"));
        navigate("/recipes", { state: { newRecipeId: newRecipe.id } });
      },
      onError: () => toast.error(t("errors.recipeSave")),
    });
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("recipes.newRecipe")}</h1>
        <Button type="button" variant="ghost" size="icon" onClick={() => navigate("/recipes")} aria-label={t("common.back")}>
          <ArrowLeft size={20} />
        </Button>
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
            <Label>
              {t("recipes.servings")}
            </Label>
            <Input
              type="number"
              min={1}
              value={form.defaultServings}
              onChange={(e) => form.setDefaultServings(e.target.valueAsNumber || 0)}
              onBlur={() => form.setDefaultServings((v) => Math.max(1, v))}
            />
          </div>
          <div>
            <Label>
              {t("recipes.prepTime")}
            </Label>
            <Input
              type="number"
              min={0}
              value={form.prepTime}
              onChange={(e) => form.setPrepTime(e.target.value)}
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

        {/* Tags */}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowFilterDrawer(true)}>
            <SlidersHorizontal size={14} />
            {t("tags.filter")}
            {form.tagIds.length > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold text-white">
                {form.tagIds.length}
              </span>
            )}
          </Button>
        </div>

        {/* Save button */}
        <Button type="submit" className="w-full" disabled={createRecipe.isPending || !form.title.trim()}>
          {createRecipe.isPending ? <Spinner /> : <Save size={16} />}
          {t("common.save")}
        </Button>
      </form>

      {groupedTags && (
        <TagFilterDrawer
          open={showFilterDrawer}
          onClose={() => setShowFilterDrawer(false)}
          groupedTags={groupedTags}
          selectedTags={form.tagIds}
          onChange={form.setTagIds}
        />
      )}
    </div>
  );
}
