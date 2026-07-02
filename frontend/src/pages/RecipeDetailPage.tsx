import type { InfiniteData } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowLeft, ChefHat, Save, Share2, SlidersHorizontal, Sparkles, Trash2, Upload, UtensilsCrossed } from "lucide-react";
import { Spinner } from "../components/ui/Spinner";
import { useRef, useState } from "react";
import { useUndoDelete } from "../hooks/useUndoDelete";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  type Ingredient,
  type PaginatedResponse,
  type Recipe,
  type RecipeSummary,
} from "../api/types";
import type { RecipeFormValues } from "@/lib/schemas/recipe";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import IngredientForm from "../components/IngredientForm";
import StepEditor from "../components/StepEditor";
import ExportRecipeOverlay from "../components/ExportRecipeOverlay";
import TagFilterDrawer from "../components/TagFilterDrawer";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { RecipeDetailSkeleton } from "../components/ui/RecipeDetailSkeleton";
import { useConfirm } from "../hooks/useConfirm";
import { useIngredients } from "../hooks/useIngredients";
import { queryKeys } from "../hooks/queryKeys";
import { useAuth } from "../hooks/useAuth";
import { useDeleteRecipeImage, useGenerateRecipeImage, useUploadRecipeImage } from "../hooks/useRecipeImage";
import { useDeleteRecipe, useMoveRecipe, useRecipe, useUpdateRecipe } from "../hooks/useRecipes";
import { useRecipeForm } from "../hooks/useRecipeForm";
import { useTags } from "../hooks/useTags";
import { toast } from "sonner";
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
        <p className="text-center text-sm text-muted-foreground">{t("common.error")}</p>
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

  const updateRecipe = useUpdateRecipe();
  const moveRecipe = useMoveRecipe();
  const deleteRecipe = useDeleteRecipe();
  const queryClient = useQueryClient();
  const { confirm, dialogProps } = useConfirm();
  const { softDelete } = useUndoDelete();
  const uploadImage = useUploadRecipeImage();
  const generateImage = useGenerateRecipeImage();
  const deleteImage = useDeleteRecipeImage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const household = user?.active_household;
  const imageInProgress = uploadImage.isPending || generateImage.isPending;
  const { data: groupedTags } = useTags();
  const [exportOpen, setExportOpen] = useState(false);

  const { form, ingredientFields, manualStepFields, machineStepFields, buildPayload } =
    useRecipeForm({ recipe, allIngredients });

  const tagIds = form.watch("tagIds");

  async function handleSave(values: RecipeFormValues) {
    const payload = await buildPayload(values);
    updateRecipe.mutate(
      { id: recipeId, data: payload },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.ingredients });
          toast.success(t("success.recipeSaved"));
          navigate("/recipes");
        },
        onError: () => toast.error(t("errors.recipeSave")),
      },
    );
  }

  function handleMove() {
    moveRecipe.mutate(recipeId, {
      onSuccess: () => navigate("/recipes"),
      onError: () => toast.error(t("errors.recipeMove")),
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

    softDelete(recipeId, {
      toastMessage: t("recipes.deleted", { title: recipe.title }),
      undoLabel: t("common.undo"),
      onConfirm: () => {
        deleteRecipe.mutate(recipeId, {
          onError: () => {
            queryClient.setQueryData<InfiniteRecipes>(listQueryKey, previousRecipes);
            toast.error(t("errors.recipeDelete"));
          },
        });
      },
      onUndo: () => {
        queryClient.setQueryData<InfiniteRecipes>(listQueryKey, previousRecipes);
        navigate(`/recipes/${recipeId}`);
      },
    });
  }

  function handleUploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadImage.mutate(
      { id: recipeId, file },
      {
        onError: () => toast.error(t("recipeImage.uploadFailed")),
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
      onError: () => toast.error(t("recipeImage.generateFailed")),
    });
  }

  async function handleDeleteImage() {
    const confirmed = await confirm({
      title: t("recipeImage.remove"),
      message: t("recipeImage.removeConfirm"),
      confirmLabel: t("common.delete"),
      confirmVariant: "danger",
      cancelLabel: t("common.cancel"),
    });
    if (!confirmed) return;
    deleteImage.mutate(recipeId, {
      onError: () => toast.error(t("common.error")),
    });
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("recipes.editRecipe")}</h1>
        <IconButton
          variant="ghost"
          type="button"
          onClick={() => navigate("/recipes")}
          tooltip={t("common.back")}
          aria-label={t("common.back")}
        >
          <ArrowLeft size={20} />
        </IconButton>
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
          <div className="flex h-48 w-full items-center justify-center rounded-lg bg-muted">
            <UtensilsCrossed size={48} className={`text-muted-foreground ${generateImage.isPending ? "animate-pulse" : ""}`} />
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
              className="border-primary/30 text-primary hover:bg-primary/10"
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
              className="border-destructive/30 text-destructive hover:bg-destructive/10"
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
          formIngredients={form.watch("ingredients")}
          allIngredients={allIngredients}
          allUnits={allUnits}
          otherSteps={form.watch("machineSteps")}
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
          formIngredients={form.watch("ingredients")}
          allIngredients={allIngredients}
          allUnits={allUnits}
          otherSteps={form.watch("manualSteps")}
        />

        {/* Tags */}
        <div>
          {groupedTags && (
            <TagFilterDrawer
              groupedTags={groupedTags}
              selectedTags={tagIds}
              onChange={(ids) => form.setValue("tagIds", ids)}
            >
              <Button variant="outline" size="sm" type="button">
                <SlidersHorizontal size={14} />
                {t("tags.filter")}
                {tagIds.length > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">
                    {tagIds.length}
                  </span>
                )}
              </Button>
            </TagFilterDrawer>
          )}
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

          {/* Share button */}
          <Button
            variant="outline"
            className="w-full border-primary text-primary hover:bg-primary/10"
            type="button"
            onClick={() => setExportOpen(true)}
          >
            <Share2 size={16} />
            {t("export.button")}
          </Button>

          {/* Move button */}
          <Button
            variant="outline"
            className="w-full border-primary text-primary hover:bg-primary/10"
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
              className="flex-1 border-primary text-primary hover:bg-primary/10"
              type="submit"
              disabled={updateRecipe.isPending}
            >
              {updateRecipe.isPending ? <Spinner /> : <Save size={16} />}
              {t("common.save")}
            </Button>
            <Button
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/10"
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

      <ExportRecipeOverlay open={exportOpen} onClose={() => setExportOpen(false)} recipe={recipe} />

      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </div>
  );
}
