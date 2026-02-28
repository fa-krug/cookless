import { Sparkles } from "lucide-react";
import { Spinner } from "./ui/Spinner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  generatePlanSchema,
  type GeneratePlanFormValues,
} from "@/lib/schemas/generate-plan";
import { ApiError } from "../api/client";
import { TAG_CATEGORIES, type MealPlan } from "../api/types";
import { useSetupPlan } from "../hooks/useMealPlan";
import { useTags } from "../hooks/useTags";
import { toast } from "sonner";
import ResponsiveOverlay from "./ui/ResponsiveOverlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface GenerateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  existingPlan?: MealPlan | null;
}

interface DrawerFormProps {
  existingPlan?: MealPlan | null;
  onClose: () => void;
}

function DrawerForm({ existingPlan, onClose }: DrawerFormProps) {
  const { t, i18n } = useTranslation();
  const setupPlan = useSetupPlan();
  const { data: groupedTags } = useTags();

  const form = useForm<GeneratePlanFormValues>({
    resolver: zodResolver(generatePlanSchema),
    defaultValues: {
      iterationWeeks: existingPlan?.iteration_weeks ?? 1,
      shoppingDays: existingPlan?.shopping_days ?? [],
      servings: existingPlan?.servings ?? 2,
      knownRatio: existingPlan?.known_ratio ?? 0.7,
      defaultLeftoverDays: existingPlan?.default_leftover_days ?? 1,
      excludedTagIds: existingPlan?.excluded_tag_ids ?? [],
    },
  });

  const iterationWeeks = form.watch("iterationWeeks");
  const shoppingDays = form.watch("shoppingDays");
  const knownRatio = form.watch("knownRatio");
  const excludedTagIds = form.watch("excludedTagIds");

  function toggleShoppingDay(day: number) {
    const prev = form.getValues("shoppingDays");
    let next: number[];
    if (prev.includes(day)) {
      next = prev.filter((d) => d !== day);
    } else if (prev.length < 2) {
      next = [...prev, day];
    } else {
      return;
    }
    form.setValue("shoppingDays", next, { shouldValidate: true });
  }

  function handleSubmit(values: GeneratePlanFormValues) {
    setupPlan.mutate(
      {
        iteration_weeks: values.iterationWeeks,
        shopping_days: values.shoppingDays,
        servings: values.servings,
        known_ratio: values.knownRatio,
        default_leftover_days: values.defaultLeftoverDays,
        excluded_tag_ids: values.excludedTagIds,
      },
      {
        onSuccess: () => onClose(),
        onError: (error) => {
          const detail =
            error instanceof ApiError &&
            typeof error.body === "object" &&
            error.body !== null &&
            "detail" in error.body
              ? String((error.body as { detail: unknown }).detail)
              : undefined;
          toast.error(detail || t("errors.planGenerate"));
        },
      },
    );
  }

  const weekdays = t("plan.weekdays", { returnObjects: true }) as string[];
  const isUpdate = !!existingPlan;
  const shoppingDayError = form.formState.errors.shoppingDays;

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      {/* Iteration length */}
      <div className="mb-4">
        <Label>
          {t("plan.iterationWeeks")}
        </Label>
        <div className="flex gap-2">
          {[1, 2, 3].map((w) => (
            <Button
              key={w}
              type="button"
              variant={iterationWeeks === w ? "default" : "secondary"}
              size="sm"
              onClick={() => form.setValue("iterationWeeks", w)}
            >
              {t("plan.weeks", { count: w })}
            </Button>
          ))}
        </div>
      </div>

      {/* Shopping days */}
      <div className="mb-4">
        <Label>
          {t("plan.shoppingDays")}
        </Label>
        <div className="flex gap-1">
          {weekdays.map((day, idx) => (
            <Button
              key={idx}
              type="button"
              variant={shoppingDays.includes(idx) ? "default" : "secondary"}
              size="sm"
              className="flex-1 px-1"
              onClick={() => toggleShoppingDay(idx)}
            >
              {day}
            </Button>
          ))}
        </div>
        {shoppingDayError && (
          <p className="mt-1 text-xs text-red-500">
            {shoppingDayError.message === "shopping_days_required"
              ? t("plan.shoppingDaysRequired")
              : shoppingDayError.message === "shopping_days_too_close"
                ? t("plan.shoppingDaysTooClose")
                : shoppingDayError.message}
          </p>
        )}
      </div>

      {/* Servings */}
      <div className="mb-4">
        <Label>
          {t("plan.servings")}
        </Label>
        <Input
          type="number"
          min={1}
          max={12}
          {...form.register("servings", { valueAsNumber: true })}
          className="w-20"
        />
      </div>

      {/* Known/New Ratio */}
      <div className="mb-4">
        <Label>
          {t("plan.knownRatio")} — {Math.round(knownRatio * 100)}%
        </Label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={knownRatio}
          onChange={(e) => form.setValue("knownRatio", Number(e.target.value))}
          className="w-full accent-orange-500"
        />
        <div className="mt-1 flex justify-between text-xs text-gray-400">
          <span>{t("recipes.toTry")}</span>
          <span>{t("recipes.known")}</span>
        </div>
      </div>

      {/* Default Leftover Days */}
      <div className="mb-4">
        <Label>
          {t("plan.defaultLeftoverDays")}
        </Label>
        <Input
          type="number"
          min={0}
          max={3}
          {...form.register("defaultLeftoverDays", { valueAsNumber: true })}
          className="w-20"
        />
      </div>

      {/* Tag exclusions */}
      {groupedTags && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-1">{t("tags.title")}</h3>
            <p className="text-xs text-gray-500">{t("tags.excludeFromPlan")}</p>
          </div>
          {TAG_CATEGORIES.map((category) => {
            const tags = groupedTags[category] || [];
            if (tags.length === 0) return null;
            return (
              <div key={category}>
                <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">
                  {t(`tags.${category}`)}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => {
                    const isExcluded = excludedTagIds.includes(tag.id);
                    return (
                      <label
                        key={tag.id}
                        className={cn(
                          "flex items-center gap-1.5 text-sm px-2 py-1 rounded-lg border cursor-pointer",
                          isExcluded
                            ? "border-gray-200 bg-gray-50 text-gray-400 line-through"
                            : "border-gray-300 bg-white",
                        )}
                      >
                        <Checkbox
                          checked={!isExcluded}
                          onCheckedChange={() => {
                            const prev = form.getValues("excludedTagIds");
                            const next = prev.includes(tag.id)
                              ? prev.filter((id) => id !== tag.id)
                              : [...prev, tag.id];
                            form.setValue("excludedTagIds", next);
                          }}
                        />
                        {i18n.language === "de" ? tag.name_de : tag.name_en}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Button
        className="w-full"
        type="submit"
        disabled={setupPlan.isPending}
      >
        {setupPlan.isPending ? <Spinner /> : <Sparkles size={16} />}
        {setupPlan.isPending
          ? t("common.loading")
          : isUpdate
            ? t("plan.updateConfig")
            : t("plan.setup")}
      </Button>
    </form>
  );
}

export default function GenerateDrawer({
  isOpen,
  onClose,
  existingPlan,
}: GenerateDrawerProps) {
  const { t } = useTranslation();

  // Use a key to remount DrawerForm each time the drawer opens,
  // which resets form state from props without useEffect+setState.
  const [openCount, setOpenCount] = useState(0);
  const [wasOpen, setWasOpen] = useState(false);

  if (isOpen && !wasOpen) {
    setOpenCount((c) => c + 1);
    setWasOpen(true);
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

  const isUpdate = !!existingPlan;

  return (
    <ResponsiveOverlay
      open={isOpen}
      onClose={onClose}
      title={isUpdate ? t("plan.updateConfig") : t("plan.setup")}
      size="md"
    >
      <DrawerForm
        key={openCount}
        existingPlan={existingPlan}
        onClose={onClose}
      />
    </ResponsiveOverlay>
  );
}
