import type { InfiniteData } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowLeft, ChefHat, Save, SlidersHorizontal, Sparkles, Trash2, Upload, UtensilsCrossed } from "lucide-react";
import { Spinner } from "../components/ui/Spinner";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  type Ingredient,
  type PaginatedResponse,
  type Recipe,
  type RecipeSummary,
} from "../api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import IngredientForm from "../components/IngredientForm";
import StepEditor from "../components/StepEditor";
import TagFilterDrawer from "../components/TagFilterDrawer";
import { RecipeDetailSkeleton } from "../components/ui/RecipeDetailSkeleton";
import { useIngredients } from "../hooks/useIngredients";
import { queryKeys } from "../hooks/queryKeys";
import { useAuth } from "../hooks/useAuth";
import { useDeleteRecipeImage, useGenerateRecipeImage, useUploadRecipeImage } from "../hooks/useRecipeImage";
import { useDeleteRecipe, useMoveRecipe, useRecipe, useUpdateRecipe } from "../hooks/useRecipes";
import { useRecipeForm } from "../hooks/useRecipeForm";
import { useTags } from "../hooks/useTags";
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

interface RecipeFormProps {
  recipe: Recipe;
  recipeId: string;
  allIngredients: Ingredient[];
  allUnits: import("../api/types").Unit[];
}

function RecipeForm({ recipe, recipeId, allIngredients, allUnits }: RecipeFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { addToast } = useToast();

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
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  const form = useRecipeForm({ recipe, allIngredients });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const payload = await form.buildPayload();
    updateRecipe.mutate(
      { id: recipeId, data: payload },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.ingredients });
          addToast(t("success.recipeSaved"), "success");
          navigate("/recipes");
        },
        onError: () => addToast(t("errors.recipeSave"), "error"),
      },
    );
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
    const listQueryKey = [...queryKeys.recipes, recipe.list_type];
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
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={() => navigate("/recipes")}
          aria-label={t("common.back")}
        >
          <ArrowLeft size={20} />
        </Button>
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
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={imageInProgress}
          >
            {uploadImage.isPending ? <Spinner /> : <Upload size={14} />}
            <span className="hidden sm:inline">{t("recipeImage.upload")}</span>
          </Button>

          {household?.ai_enabled && (
            <Button
              variant="outline"
              size="sm"
              className="border-orange-300 text-orange-600 hover:bg-orange-50"
              type="button"
              onClick={handleGenerateImage}
              disabled={imageInProgress}
            >
              {generateImage.isPending ? <Spinner /> : <Sparkles size={14} />}
              <span className="hidden sm:inline">{generateImage.isPending ? t("recipeImage.generating") : t("recipeImage.generate")}</span>
            </Button>
          )}

          {recipe.image && (
            <Button
              variant="outline"
              size="sm"
              className="border-red-300 text-red-600 hover:bg-red-50"
              type="button"
              onClick={handleDeleteImage}
              disabled={imageInProgress}
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline">{t("recipeImage.remove")}</span>
            </Button>
          )}
        </div>
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
        <StepEditor steps={form.manualSteps} onChange={form.setManualSteps} label={t("steps.manualSteps")} />

        {/* Machine Steps */}
        <StepEditor
          steps={form.machineSteps}
          onChange={form.setMachineSteps}
          label={t("steps.machineSteps")}
          isMachine
        />

        {/* Tags */}
        <div>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => setShowFilterDrawer(true)}
          >
            <SlidersHorizontal size={14} />
            {t("tags.filter")}
            {form.tagIds.length > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold text-white">
                {form.tagIds.length}
              </span>
            )}
          </Button>
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          {/* Cook button */}
          <Button
            className="w-full"
            type="button"
            onClick={() => navigate(`/cook/${recipeId}`)}
          >
            <ChefHat size={16} />
            {t("cooking.start")}
          </Button>

          {/* Move button */}
          <Button
            variant="outline"
            className="w-full border-orange-500 text-orange-500 hover:bg-orange-50"
            type="button"
            onClick={handleMove}
            disabled={moveRecipe.isPending}
          >
            {moveRecipe.isPending ? <Spinner /> : <ArrowLeftRight size={16} />}
            {recipe.list_type === "KNOWN" ? t("recipes.moveToTry") : t("recipes.moveToKnown")}
          </Button>

          {/* Save / Delete row */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 border-orange-500 text-orange-500 hover:bg-orange-50"
              type="submit"
              disabled={updateRecipe.isPending}
            >
              {updateRecipe.isPending ? <Spinner /> : <Save size={16} />}
              {t("common.save")}
            </Button>
            <Button
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50"
              type="button"
              onClick={handleDelete}
              disabled={deleteRecipe.isPending}
            >
              {deleteRecipe.isPending ? <Spinner /> : <Trash2 size={16} />}
              {t("common.delete")}
            </Button>
          </div>
        </div>
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
