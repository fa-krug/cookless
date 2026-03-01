import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Sparkles, X } from "lucide-react";
import type {
  GenerateRecipesPayload,
  GeneratedRecipe,
  GenerateStreamEvent,
} from "../api/types";
import { streamGenerateRecipes, useBulkCreateRecipes } from "../hooks/useGenerateRecipes";
import { toast } from "sonner";
import { Spinner } from "./ui/Spinner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { IconButton } from "@/components/ui/IconButton";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GenerateRecipesPreviewProps {
  config: GenerateRecipesPayload;
  onClose: () => void;
}

interface PreviewRecipe extends GeneratedRecipe {
  selected: boolean;
  imageBase64?: string;
}

export function GenerateRecipesPreview({ config, onClose }: GenerateRecipesPreviewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const bulkCreate = useBulkCreateRecipes();

  const [recipes, setRecipes] = useState<PreviewRecipe[]>([]);
  const [generating, setGenerating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef(false);

  const handleEvent = useCallback((event: GenerateStreamEvent) => {
    if (abortRef.current) return;

    switch (event.type) {
      case "recipe": {
        const recipe = event.data as GeneratedRecipe;
        setRecipes((prev) => [...prev, { ...recipe, selected: true }]);
        break;
      }
      case "image": {
        const { image_base64 } = event.data as { image_base64: string };
        const index = event.index ?? 0;
        setRecipes((prev) =>
          prev.map((r, i) => (i === index ? { ...r, imageBase64: image_base64 } : r)),
        );
        break;
      }
      case "error": {
        setError(event.message ?? t("errors.recipeGenerate"));
        setGenerating(false);
        break;
      }
      case "done": {
        setGenerating(false);
        break;
      }
    }
  }, [t]);

  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current = false;
    const controller = new AbortController();
    controllerRef.current = controller;

    streamGenerateRecipes(config, handleEvent, controller.signal).catch((err) => {
      if (!abortRef.current) {
        setError(err instanceof Error ? err.message : t("errors.recipeGenerate"));
        setGenerating(false);
      }
    });

    return () => {
      abortRef.current = true;
      controller.abort();
    };
  }, [config, handleEvent, t]);

  const toggleRecipe = (index: number) => {
    setRecipes((prev) =>
      prev.map((r, i) => (i === index ? { ...r, selected: !r.selected } : r)),
    );
  };

  const handleCancel = () => {
    abortRef.current = true;
    controllerRef.current?.abort();
    onClose();
  };

  const selectedRecipes = recipes.filter((r) => r.selected);
  const selectedCount = selectedRecipes.length;

  const handleSave = async () => {
    if (selectedCount === 0) return;
    setSaving(true);
    try {
      await bulkCreate.mutateAsync({
        recipes: selectedRecipes.map((r) => ({
          title: r.title,
          default_servings: r.default_servings,
          prep_time_minutes: r.prep_time_minutes,
          cook_time_minutes: r.cook_time_minutes,
          leftover_days: r.leftover_days,
          ingredients: r.ingredients,
          manual_steps: r.manual_steps,
          machine_steps: r.machine_steps,
          tag_ids: r.tag_ids,
          image_base64: r.imageBase64,
        })),
      });
      toast.success(t("generateRecipes.saved", { count: selectedCount }));
      navigate("/recipes");
    } catch {
      toast.error(t("errors.recipeSave"));
    } finally {
      setSaving(false);
    }
  };

  const imagesStillLoading =
    config.generate_images && recipes.some((r) => !r.imageBase64) && generating;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-semibold">{t("generateRecipes.preview")}</h2>
        <IconButton
          variant="ghost"
          onClick={handleCancel}
          tooltip={t("common.cancel")}
          aria-label={t("common.cancel")}
        >
          <X size={20} />
        </IconButton>
      </div>

      {/* Scrollable recipe list */}
      <ScrollArea className="flex-1 px-4 py-3">
        {error && (
          <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {recipes.map((recipe, index) => (
          <button
            key={index}
            type="button"
            onClick={() => toggleRecipe(index)}
            className={`mb-3 flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
              recipe.selected
                ? "border-primary/50 bg-primary/10"
                : "border-border bg-background opacity-50"
            }`}
          >
            {/* Checkbox */}
            <Checkbox
              checked={recipe.selected}
              onCheckedChange={() => toggleRecipe(index)}
              onClick={(e) => e.stopPropagation()}
              className="mt-1 shrink-0"
            />

            {/* Image thumbnail */}
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
              {recipe.imageBase64 ? (
                <img
                  src={`data:image/webp;base64,${recipe.imageBase64}`}
                  alt={recipe.title}
                  className="h-full w-full object-cover"
                />
              ) : config.generate_images ? (
                <Spinner size={20} />
              ) : (
                <Sparkles size={20} className="text-muted-foreground" />
              )}
            </div>

            {/* Text content */}
            <div className="min-w-0 flex-1">
              <p className="font-medium">{recipe.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {recipe.ingredients.length} {t("ingredients.title")}
                {recipe.prep_time_minutes != null && (
                  <>
                    {" "}
                    &middot; {t("recipes.prepTime")} {recipe.prep_time_minutes}
                    {t("recipes.minutes")}
                  </>
                )}
                {recipe.cook_time_minutes != null && (
                  <>
                    {" "}
                    &middot; {t("recipes.cookTime")} {recipe.cook_time_minutes}
                    {t("recipes.minutes")}
                  </>
                )}
              </p>
            </div>
          </button>
        ))}

        {/* Loading indicator */}
        {generating && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Spinner size={16} />
            <span>
              {imagesStillLoading
                ? t("generateRecipes.generatingImages")
                : t("generateRecipes.generating")}
            </span>
          </div>
        )}

        {/* Empty state */}
        {!generating && recipes.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Sparkles size={32} className="mb-2 text-muted-foreground" />
            <p>{t("generateRecipes.noResults")}</p>
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-4 py-3">
        <span className="text-sm text-muted-foreground">
          {t("generateRecipes.selected", { count: selectedCount })}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCancel}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={selectedCount === 0 || saving}
          >
            {saving ? (
              <Spinner size={16} />
            ) : (
              t("generateRecipes.saveCount", { count: selectedCount })
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
