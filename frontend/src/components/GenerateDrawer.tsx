import { Sparkles } from "lucide-react";
import { Spinner } from "./ui/Spinner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api/client";
import { TAG_CATEGORIES, type MealPlan } from "../api/types";
import { useSetupPlan } from "../hooks/useMealPlan";
import { useTags } from "../hooks/useTags";
import { useToast } from "../hooks/useToast";
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

/** Check that all selected shopping days are at least 3 apart (mod 7). */
function validateShoppingDayGap(days: number[]): boolean {
  if (days.length < 2) return true;
  const sorted = [...days].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const diff = sorted[j] - sorted[i];
      const circularDiff = Math.min(diff, 7 - diff);
      if (circularDiff < 3) return false;
    }
  }
  return true;
}

interface DrawerFormProps {
  existingPlan?: MealPlan | null;
  onClose: () => void;
}

function DrawerForm({ existingPlan, onClose }: DrawerFormProps) {
  const { t, i18n } = useTranslation();
  const { addToast } = useToast();
  const setupPlan = useSetupPlan();
  const { data: groupedTags } = useTags();

  const [iterationWeeks, setIterationWeeks] = useState(
    existingPlan?.iteration_weeks ?? 1,
  );
  const [shoppingDays, setShoppingDays] = useState<number[]>(
    existingPlan?.shopping_days ?? [],
  );
  const [servings, setServings] = useState(existingPlan?.servings ?? 2);
  const [knownRatio, setKnownRatio] = useState(
    existingPlan?.known_ratio ?? 0.7,
  );
  const [defaultLeftoverDays, setDefaultLeftoverDays] = useState(
    existingPlan?.default_leftover_days ?? 1,
  );
  const [excludedTagIds, setExcludedTagIds] = useState<Set<string>>(
    new Set(existingPlan?.excluded_tag_ids ?? []),
  );
  const [shoppingDayError, setShoppingDayError] = useState<
    false | "required" | "tooClose"
  >(false);

  function toggleShoppingDay(day: number) {
    setShoppingDays((prev) => {
      let next: number[];
      if (prev.includes(day)) {
        next = prev.filter((d) => d !== day);
      } else if (prev.length < 2) {
        next = [...prev, day];
      } else {
        return prev;
      }
      setShoppingDayError(
        next.length === 0 ? "required" : !validateShoppingDayGap(next) ? "tooClose" : false,
      );
      return next;
    });
  }

  function handleSubmit() {
    if (shoppingDays.length === 0) {
      setShoppingDayError("required");
      return;
    }
    if (!validateShoppingDayGap(shoppingDays)) {
      setShoppingDayError("tooClose");
      return;
    }

    setupPlan.mutate(
      {
        iteration_weeks: iterationWeeks,
        shopping_days: shoppingDays,
        servings,
        known_ratio: knownRatio,
        default_leftover_days: defaultLeftoverDays,
        excluded_tag_ids: Array.from(excludedTagIds),
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
          addToast(detail || t("errors.planGenerate"), "error");
        },
      },
    );
  }

  const weekdays = t("plan.weekdays", { returnObjects: true }) as string[];
  const isUpdate = !!existingPlan;

  return (
    <div className="space-y-4">
      {/* Iteration length */}
      <div className="mb-4">
        <Label>
          {t("plan.iterationWeeks")}
        </Label>
        <div className="flex gap-2">
          {[1, 2, 3].map((w) => (
            <Button
              key={w}
              variant={iterationWeeks === w ? "default" : "secondary"}
              size="sm"
              onClick={() => setIterationWeeks(w)}
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
            {shoppingDayError === "required"
              ? t("plan.shoppingDaysRequired")
              : t("plan.shoppingDaysTooClose")}
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
          value={servings}
          onChange={(e) => setServings(Number(e.target.value))}
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
          onChange={(e) => setKnownRatio(Number(e.target.value))}
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
          value={defaultLeftoverDays}
          onChange={(e) => setDefaultLeftoverDays(Number(e.target.value))}
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
                    const isExcluded = excludedTagIds.has(tag.id);
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
                            setExcludedTagIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(tag.id)) {
                                next.delete(tag.id);
                              } else {
                                next.add(tag.id);
                              }
                              return next;
                            });
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
        onClick={handleSubmit}
        disabled={setupPlan.isPending}
      >
        {setupPlan.isPending ? <Spinner /> : <Sparkles size={16} />}
        {setupPlan.isPending
          ? t("common.loading")
          : isUpdate
            ? t("plan.updateConfig")
            : t("plan.setup")}
      </Button>
    </div>
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
