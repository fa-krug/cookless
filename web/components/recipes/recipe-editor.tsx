"use client";

import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recipeFormSchema, type RecipeFormValues } from "@/lib/schemas/recipe";
import { buildPayload } from "./editor/build-payload";
import { IngredientRows } from "./editor/ingredient-rows";
import { saveRecipeAction } from "@/app/(app)/actions";
import type { IngredientLite, UnitLite, RecipeTagDto } from "@/lib/queries/recipes";
import type { Locale } from "@/lib/i18n/config";

const EMPTY: RecipeFormValues = {
  title: "", description: "", defaultServings: 2,
  prepTimeMinutes: null, cookTimeMinutes: null, leftoverDays: null,
  ingredients: [], manualSteps: [], machineSteps: [], tagIds: [],
};

export function RecipeEditor(props: {
  mode: "create" | "edit";
  recipeId: string | null;
  listType: "KNOWN" | "TO_TRY";
  initialValues?: RecipeFormValues;
  ingredients: IngredientLite[];
  units: UnitLite[];
  tags: RecipeTagDto[];
  locale: Locale;
}) {
  const { t } = useT();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const form = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeFormSchema),
    defaultValues: props.initialValues ?? EMPTY,
  });

  async function onSubmit(values: RecipeFormValues) {
    setSaving(true);
    const res = await saveRecipeAction(props.recipeId, buildPayload(values, props.listType));
    setSaving(false);
    if (!res.ok) {
      toast.error(res.message || t("common.error"));
      return;
    }
    toast.success(t(props.mode === "create" ? "recipes.created" : "recipes.saved"));
    router.push(`/recipes/${res.data.id}`);
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <h1 className="text-xl font-semibold">
          {t(props.mode === "create" ? "recipes.newRecipe" : "recipes.editRecipe")}
        </h1>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t("recipes.recipeName")}</label>
          <Input {...form.register("title")} placeholder={t("recipes.titlePlaceholder")} />
          {form.formState.errors.title && (
            <p className="text-sm text-destructive">{t("recipes.titleRequired")}</p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t("recipes.description")}</label>
          <textarea
            {...form.register("description")}
            className="w-full rounded-md border bg-background p-2 text-sm"
            rows={3}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("recipes.servings")}</label>
            <Input type="number" min={1} {...form.register("defaultServings", { valueAsNumber: true })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("recipes.prepTime")}</label>
            <Input type="number" min={0} {...form.register("prepTimeMinutes", { setValueAs: (v) => (v === "" ? null : Number(v)) })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("recipes.cookTime")}</label>
            <Input type="number" min={0} {...form.register("cookTimeMinutes", { setValueAs: (v) => (v === "" ? null : Number(v)) })} />
          </div>
        </div>

        <IngredientRows ingredients={props.ingredients} units={props.units} locale={props.locale} />

        {/* Task 7 stubs — replaced by later tasks */}
        {/* <StepEditor method="manual" ... /> (Tasks 9-10) */}
        {/* <StepEditor method="machine" ... /> (Tasks 9-10) */}
        {/* <TagSelector tags={props.tags} locale={props.locale} /> (Task 11) */}

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
