"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { pickName } from "@/lib/display/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import type { RecipeTagDto } from "@/lib/queries/recipes";
import { streamGenerateRecipes, type GeneratedRecipeData } from "@/lib/ai/stream-client";
import { bulkCreateRecipesAction } from "@/app/(app)/actions";
import type { BulkRecipeInput } from "@/lib/recipes/bulk-create";

interface PreviewRecipe {
  data: GeneratedRecipeData;
  imageBase64?: string;
  selected: boolean;
}

function toBulkInput(r: PreviewRecipe): BulkRecipeInput {
  const d = r.data;
  return {
    title: d.title,
    description: d.description ?? "",
    defaultServings: d.default_servings ?? 2,
    prepTimeMinutes: d.prep_time_minutes ?? null,
    cookTimeMinutes: d.cook_time_minutes ?? null,
    leftoverDays: d.leftover_days ?? null,
    ingredients: (d.ingredients ?? []).map((i, idx) => ({
      nameEn: i.name_en,
      nameDe: i.name_de,
      category: i.category ?? "OTHER",
      quantity: String(i.quantity ?? "0"),
      unitAbbreviation: i.unit_abbreviation ?? "",
      order: i.order ?? idx,
    })),
    manualSteps: (d.manual_steps ?? []).map((s) => ({ stepNumber: s.step_number, instruction: s.instruction ?? "" })),
    machineSteps: (d.machine_steps ?? []).map((s) => ({
      stepNumber: s.step_number,
      instruction: s.instruction ?? "",
      programType: s.program_type,
      temperature: s.temperature ?? null,
      durationSeconds: s.duration_seconds ?? null,
      speed: s.speed ?? null,
      turbo: s.turbo,
      direction: s.direction,
      weightGrams: s.weight_grams ?? null,
    })),
    tagIds: d.tag_ids ?? [],
    imageBase64: r.imageBase64 ?? null,
  };
}

export function GenerateRecipesClient({ tags, locale }: { tags: RecipeTagDto[]; locale: string }) {
  const { t } = useT();
  const router = useRouter();
  const [count, setCount] = useState(10);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [generateImages, setGenerateImages] = useState(true);
  const [recipes, setRecipes] = useState<PreviewRecipe[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function onGenerate() {
    setRecipes([]);
    setGenerating(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamGenerateRecipes(
        { count, tagIds: selectedTagIds, freeText, generateImages },
        (e) => {
          if (e.type === "recipe") {
            setRecipes((prev) => {
              const next = [...prev];
              next[e.index] = { data: e.data, selected: true };
              return next;
            });
          } else if (e.type === "image") {
            setRecipes((prev) => {
              const next = [...prev];
              if (next[e.index]) next[e.index] = { ...next[e.index], imageBase64: e.data.image_base64 };
              return next;
            });
          } else if (e.type === "error") {
            toast.error(t("common.errorRetry"));
          }
        },
        ctrl.signal,
      );
    } catch {
      toast.error(t("common.errorRetry"));
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }

  async function onSave() {
    const chosen = recipes.filter((r) => r?.selected);
    if (!chosen.length) return;
    setSaving(true);
    const res = await bulkCreateRecipesAction({ recipes: chosen.map(toBulkInput) });
    setSaving(false);
    if (res.ok) {
      toast.success(t("generateRecipes.saved", { count: res.data.createdIds.length }));
      router.push("/recipes");
    } else {
      toast.error(t("common.errorRetry"));
    }
  }

  const present = recipes.filter(Boolean);
  const selectedCount = present.filter((r) => r.selected).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("generateRecipes.title")}</h1>

      <div className="space-y-4 rounded-xl border p-4">
        <label className="block text-sm">
          {t("generateRecipes.count")}
          <Input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} />
        </label>

        {tags.length > 0 && (
          <fieldset>
            <legend className="text-sm font-medium">{t("generateRecipes.tags")}</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {tags.map((tag) => {
                const checked = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => setSelectedTagIds((ids) => (checked ? ids.filter((x) => x !== tag.id) : [...ids, tag.id]))}
                    className={`rounded border px-2 py-1 text-xs ${checked ? "bg-primary text-primary-foreground" : "border-border"}`}
                  >
                    {pickName(locale, tag)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <label className="block text-sm">
          {t("generateRecipes.freeText")}
          <textarea
            className="mt-1 w-full rounded-md border bg-transparent p-2 text-sm"
            rows={3}
            value={freeText}
            placeholder={t("generateRecipes.freeTextPlaceholder")}
            onChange={(e) => setFreeText(e.target.value)}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={generateImages} onChange={(e) => setGenerateImages(e.target.checked)} />
          {t("generateRecipes.generateImages")}
        </label>

        <Button onClick={onGenerate} disabled={generating} className="w-full">
          <Sparkles size={16} />
          {generating ? t("generateRecipes.generating") : t("generateRecipes.generate")}
        </Button>
      </div>

      {present.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("generateRecipes.selected", { count: selectedCount })}</span>
            <Button onClick={onSave} disabled={saving || selectedCount === 0}>
              {t("generateRecipes.saveCount", { count: selectedCount })}
            </Button>
          </div>
          {present.map((r, i) => (
            <label key={i} className="flex items-center gap-3 rounded-lg border p-3">
              <input
                type="checkbox"
                checked={r.selected}
                onChange={(e) =>
                  setRecipes((prev) => {
                    const next = [...prev];
                    const realIdx = prev.indexOf(r);
                    if (next[realIdx]) next[realIdx] = { ...next[realIdx], selected: e.target.checked };
                    return next;
                  })
                }
              />
              {r.imageBase64 ? (
                <img src={`data:image/webp;base64,${r.imageBase64}`} alt={r.data.title} className="h-14 w-14 rounded-md object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-muted">
                  <Sparkles size={20} className={`text-muted-foreground ${generating && generateImages ? "animate-pulse" : ""}`} />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate font-medium">{r.data.title}</p>
                <p className="text-xs text-muted-foreground">{(r.data.ingredients ?? []).length} · {r.data.default_servings ?? 2}</p>
              </div>
            </label>
          ))}
        </div>
      )}

      {!generating && present.length === 0 && recipes.length > 0 && (
        <p className="text-sm text-muted-foreground">{t("generateRecipes.noResults")}</p>
      )}
    </div>
  );
}
