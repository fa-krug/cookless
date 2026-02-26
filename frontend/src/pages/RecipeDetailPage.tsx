import type { InfiniteData } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowLeft, ChefHat, Save, Sparkles, Trash2, Upload, UtensilsCrossed } from "lucide-react";
import { Spinner } from "../components/ui/Spinner";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  TAG_CATEGORIES,
  type Ingredient,
  type PaginatedResponse,
  type Recipe,
  type RecipeSummary,
  type RecipeUpdatePayload,
  type TagCategory,
} from "../api/types";
import IngredientForm, { type IngredientRow } from "../components/IngredientForm";
import StepEditor, { type StepRow } from "../components/StepEditor";
import { RecipeDetailSkeleton } from "../components/ui/RecipeDetailSkeleton";
import { createIngredient, useIngredients } from "../hooks/useIngredients";
import { useAuth } from "../hooks/useAuth";
import { useDeleteRecipeImage, useGenerateRecipeImage, useUploadRecipeImage } from "../hooks/useRecipeImage";
import { useDeleteRecipe, useMoveRecipe, useRecipe, useUpdateRecipe } from "../hooks/useRecipes";
import { useCloseDetailsOnClickOutside } from "../hooks/useCloseDetailsOnClickOutside";
import { useDropUp } from "../hooks/useDropUp";
import { useCreateTag, useTags } from "../hooks/useTags";
import { useToast } from "../hooks/useToast";
import { useUnits } from "../hooks/useUnits";

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();

  const { data: recipe, isLoading: recipeLoading } = useRecipe(id ?? "");
  const { data: allIngredients = [], isLoading: ingredientsLoading } = useIngredients();
  const { data: allUnits = [], isLoading: unitsLoading } = useUnits();

  if (recipeLoading || ingredientsLoading || unitsLoading) {
    return <RecipeDetailSkeleton />;
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
  const { addToast } = useToast();
  const lang = i18n.language === "de" ? "de" : "en";
  const nameKey = lang === "de" ? "name_de" : "name_en";

  const updateRecipe = useUpdateRecipe();
  const moveRecipe = useMoveRecipe();
  const deleteRecipe = useDeleteRecipe();
  const queryClient = useQueryClient();
  const pendingDeleteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadImage = useUploadRecipeImage();
  const generateImage = useGenerateRecipeImage();
  const deleteImage = useDeleteRecipeImage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const household = user?.active_household;
  const imageInProgress = uploadImage.isPending || generateImage.isPending;
  const { data: groupedTags } = useTags();
  const createTag = useCreateTag();
  const tagSectionRef = useCloseDetailsOnClickOutside<HTMLDivElement>();
  const tagDropUp = useDropUp();

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
  const [machineSteps, setMachineSteps] = useState<StepRow[]>(
    recipe.machine_steps.map((s) => ({
      step_number: s.step_number,
      instruction: s.instruction,
      ...(s.program_type && {
        program_type: s.program_type,
        temperature: s.temperature,
        duration_seconds: s.duration_seconds,
        speed: s.speed,
        turbo: s.turbo,
        direction: s.direction,
        weight_grams: s.weight_grams,
      }),
    })),
  );
  const [tagIds, setTagIds] = useState<string[]>(recipe.tags.map((tag) => tag.id));
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
      list_type: recipe.list_type,
      default_servings: defaultServings || 1,
      prep_time_minutes: prepTime ? Number(prepTime) : null,
      cook_time_minutes: cookTime ? Number(cookTime) : null,
      leftover_days: recipe.leftover_days,
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

    updateRecipe.mutate({ id: recipeId, data: payload }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["ingredients"] });
        addToast(t("success.recipeSaved"), "success");
        navigate("/recipes");
      },
      onError: () => addToast(t("errors.recipeSave"), "error"),
    });
  }

  function handleMove() {
    moveRecipe.mutate(recipeId, {
      onSuccess: () => navigate("/recipes"),
      onError: () => addToast(t("errors.recipeMove"), "error"),
    });
  }

  function handleDelete() {
    type InfiniteRecipes = InfiniteData<PaginatedResponse<RecipeSummary>>;

    // Optimistically remove from list cache
    const listQueryKey = ["recipes", recipe.list_type];
    const previousRecipes = queryClient.getQueryData<InfiniteRecipes>(listQueryKey);
    queryClient.setQueryData<InfiniteRecipes>(listQueryKey, (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          items: page.items.filter((r) => r.id !== recipeId),
          total_count: page.total_count - 1,
        })),
      };
    });

    // Navigate back immediately
    navigate("/recipes");

    let undone = false;

    // Show undo toast on the list page
    addToast(t("recipes.deleted", { title: recipe.title }), "success", {
      duration: 5000,
      action: {
        label: t("common.undo"),
        onClick: () => {
          undone = true;
          if (pendingDeleteRef.current) {
            clearTimeout(pendingDeleteRef.current);
            pendingDeleteRef.current = null;
          }
          // Restore cache and navigate back
          queryClient.setQueryData<InfiniteRecipes>(listQueryKey, previousRecipes);
          navigate(`/recipes/${recipeId}`);
        },
      },
    });

    // Schedule actual delete
    pendingDeleteRef.current = setTimeout(() => {
      pendingDeleteRef.current = null;
      if (!undone) {
        deleteRecipe.mutate(recipeId, {
          onError: () => {
            queryClient.setQueryData<InfiniteRecipes>(listQueryKey, previousRecipes);
            addToast(t("errors.recipeDelete"), "error");
          },
        });
      }
    }, 5000);
  }

  function handleUploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadImage.mutate(
      { id: recipeId, file },
      {
        onError: () => addToast(t("recipeImage.uploadFailed"), "error"),
      },
    );
    e.target.value = "";
  }

  function handleGenerateImage() {
    if (!household?.ai_enabled) return;
    if (!household?.gemini_api_key) {
      navigate("/settings");
      return;
    }
    generateImage.mutate(recipeId, {
      onError: () => addToast(t("recipeImage.generateFailed"), "error"),
    });
  }

  function handleDeleteImage() {
    deleteImage.mutate(recipeId, {
      onError: () => addToast(t("common.error"), "error"),
    });
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("recipes.editRecipe")}</h1>
        <button
          type="button"
          onClick={() => navigate("/recipes")}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label={t("common.back")}
        >
          <ArrowLeft size={20} />
        </button>
      </div>

      {/* Image section */}
      <div className="mt-4">
        {recipe.image ? (
          <img
            src={recipe.image}
            alt={recipe.title}
            className="h-48 w-full rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-48 w-full items-center justify-center rounded-lg bg-gray-100">
            <UtensilsCrossed size={48} className={`text-gray-400 ${generateImage.isPending ? "animate-pulse" : ""}`} />
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleUploadImage}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={imageInProgress}
            className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {uploadImage.isPending ? <Spinner /> : <Upload size={14} />}
            {t("recipeImage.upload")}
          </button>

          {household?.ai_enabled && (
            <button
              type="button"
              onClick={handleGenerateImage}
              disabled={imageInProgress}
              className="flex items-center gap-1 rounded-md border border-orange-300 px-3 py-1.5 text-sm text-orange-600 hover:bg-orange-50 disabled:opacity-50"
            >
              {generateImage.isPending ? <Spinner /> : <Sparkles size={14} />}
              {generateImage.isPending ? t("recipeImage.generating") : t("recipeImage.generate")}
            </button>
          )}

          {recipe.image && (
            <button
              type="button"
              onClick={handleDeleteImage}
              disabled={imageInProgress}
              className="flex items-center gap-1 rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={14} />
              {t("recipeImage.remove")}
            </button>
          )}
        </div>
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
              onChange={(e) => setDefaultServings(e.target.valueAsNumber || 0)}
              onBlur={() => setDefaultServings((v) => Math.max(1, v))}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
          <div ref={tagSectionRef} className="space-y-2">
            <h3 className="text-sm font-medium text-gray-700">{t("tags.title")}</h3>
            <div className="flex flex-wrap gap-2">
              {TAG_CATEGORIES.map((category) => {
                const tags = groupedTags[category] || [];
                const selected = tags.filter((tag) => tagIds.includes(tag.id));
                return (
                  <details key={category} className="relative" ref={tagDropUp(category).ref} onToggle={tagDropUp(category).onToggle}>
                    <summary className="cursor-pointer select-none rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm">
                      {t(`tags.${category}`)}
                      {selected.length > 0 && (
                        <span className="ml-1 rounded-full bg-orange-500 px-1.5 text-xs text-white">
                          {selected.length}
                        </span>
                      )}
                    </summary>
                    <div className={`absolute z-10 max-h-60 min-w-48 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg ${tagDropUp(category).openUp ? "bottom-full mb-1" : "mt-1"}`}>
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
                            className="w-full rounded border px-2 py-1"
                          />
                          <input
                            type="text"
                            placeholder={t("tags.nameDe")}
                            value={newTagDe}
                            onChange={(e) => setNewTagDe(e.target.value)}
                            className="w-full rounded border px-2 py-1"
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

        {/* Action buttons */}
        <div className="space-y-3">
          {/* Cook button */}
          <button
            type="button"
            onClick={() => navigate(`/cook/${recipeId}`)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            <ChefHat size={16} />
            {t("cooking.start")}
          </button>

          {/* Move button */}
          <button
            type="button"
            onClick={handleMove}
            disabled={moveRecipe.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-500 hover:bg-orange-50 disabled:opacity-50"
          >
            {moveRecipe.isPending ? <Spinner /> : <ArrowLeftRight size={16} />}
            {recipe.list_type === "KNOWN" ? t("recipes.moveToTry") : t("recipes.moveToKnown")}
          </button>

          {/* Save / Delete row */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={updateRecipe.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-500 hover:bg-orange-50 disabled:opacity-50"
            >
              {updateRecipe.isPending ? <Spinner /> : <Save size={16} />}
              {t("common.save")}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteRecipe.isPending}
              className="flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {deleteRecipe.isPending ? <Spinner /> : <Trash2 size={16} />}
              {t("common.delete")}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
