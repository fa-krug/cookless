import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { Spinner } from "../components/ui/Spinner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ListType, RecipeUpdatePayload, TagCategory } from "../api/types";
import IngredientForm, { type IngredientRow } from "../components/IngredientForm";
import StepEditor, { type StepRow } from "../components/StepEditor";
import { createIngredient, useIngredients } from "../hooks/useIngredients";
import { useCreateRecipe } from "../hooks/useRecipes";
import { useCreateTag, useTags } from "../hooks/useTags";
import { useToast } from "../hooks/useToast";
import { useUnits } from "../hooks/useUnits";

const TAG_CATEGORIES: TagCategory[] = ["DIETARY", "PROTEIN", "CUISINE", "MEAL_TYPE"];

export default function RecipeCreatePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const listType = (searchParams.get("list") as ListType) || "KNOWN";

  const { data: allIngredients = [] } = useIngredients();
  const { data: allUnits = [] } = useUnits();
  const { data: groupedTags } = useTags();
  const createRecipe = useCreateRecipe();
  const createTag = useCreateTag();

  const [title, setTitle] = useState("");
  const [defaultServings, setDefaultServings] = useState(2);
  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [manualSteps, setManualSteps] = useState<StepRow[]>([]);
  const [machineSteps, setMachineSteps] = useState<StepRow[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [addingCategory, setAddingCategory] = useState<TagCategory | null>(null);
  const [newTagEn, setNewTagEn] = useState("");
  const [newTagDe, setNewTagDe] = useState("");

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
      default_servings: defaultServings,
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
        .filter((s) => s.instruction.trim())
        .map((s, i) => ({ step_number: i + 1, instruction: s.instruction })),
      tag_ids: tagIds,
    };

    createRecipe.mutate(payload, {
      onSuccess: (newRecipe) => {
        queryClient.invalidateQueries({ queryKey: ["ingredients"] });
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
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("recipes.titlePlaceholder")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-lg font-medium focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>

        {/* Servings, Prep Time, Cook Time */}
        <div className="grid grid-cols-3 gap-2">
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

        {/* Tags Section */}
        {groupedTags && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-700">{t("tags.title")}</h3>
            <div className="flex flex-wrap gap-2">
              {TAG_CATEGORIES.map((category) => {
                const tags = groupedTags[category] || [];
                const selected = tags.filter((tag) => tagIds.includes(tag.id));
                return (
                  <details key={category} className="relative">
                    <summary className="cursor-pointer select-none rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm">
                      {t(`tags.${category}`)}
                      {selected.length > 0 && (
                        <span className="ml-1 rounded-full bg-orange-500 px-1.5 text-xs text-white">
                          {selected.length}
                        </span>
                      )}
                    </summary>
                    <div className="absolute z-10 mt-1 max-h-60 min-w-48 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                      {tags.map((tag) => (
                        <label
                          key={tag.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={tagIds.includes(tag.id)}
                            onChange={(e) => {
                              setTagIds((prev) =>
                                e.target.checked
                                  ? [...prev, tag.id]
                                  : prev.filter((tid) => tid !== tag.id),
                              );
                            }}
                            className="rounded accent-orange-500"
                          />
                          <span className="text-sm">
                            {i18n.language === "de" ? tag.name_de : tag.name_en}
                          </span>
                        </label>
                      ))}
                      {/* Add new tag inline */}
                      {addingCategory === category ? (
                        <div className="mt-1 space-y-1 border-t pt-1">
                          <input
                            type="text"
                            placeholder={t("tags.nameEn")}
                            value={newTagEn}
                            onChange={(e) => setNewTagEn(e.target.value)}
                            className="w-full rounded border px-2 py-1 text-sm"
                          />
                          <input
                            type="text"
                            placeholder={t("tags.nameDe")}
                            value={newTagDe}
                            onChange={(e) => setNewTagDe(e.target.value)}
                            className="w-full rounded border px-2 py-1 text-sm"
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={async () => {
                                if (newTagEn.trim() && newTagDe.trim()) {
                                  const tag = await createTag.mutateAsync({
                                    category,
                                    name_en: newTagEn.trim(),
                                    name_de: newTagDe.trim(),
                                  });
                                  setTagIds((prev) => [...prev, tag.id]);
                                  setNewTagEn("");
                                  setNewTagDe("");
                                  setAddingCategory(null);
                                }
                              }}
                              className="rounded bg-orange-500 px-2 py-1 text-xs text-white hover:bg-orange-600"
                            >
                              {t("common.save")}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAddingCategory(null);
                                setNewTagEn("");
                                setNewTagDe("");
                              }}
                              className="px-2 py-1 text-xs text-gray-500"
                            >
                              {t("common.cancel")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAddingCategory(category)}
                          className="mt-1 w-full border-t px-2 py-1 text-left text-sm text-orange-600 hover:text-orange-700"
                        >
                          + {t("tags.addTag")}
                        </button>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
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
