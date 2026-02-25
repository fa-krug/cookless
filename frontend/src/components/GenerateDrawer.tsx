import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api/client";
import type { MealPlan } from "../api/types";
import { useSetupPlan } from "../hooks/useMealPlan";
import { useToast } from "../hooks/useToast";
import Drawer from "./ui/Drawer";

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
  const { t } = useTranslation();
  const { addToast } = useToast();
  const setupPlan = useSetupPlan();

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
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {t("plan.iterationWeeks")}
        </label>
        <div className="flex gap-2">
          {[1, 2, 3].map((w) => (
            <button
              key={w}
              onClick={() => setIterationWeeks(w)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                iterationWeeks === w
                  ? "bg-orange-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t("plan.weeks", { count: w })}
            </button>
          ))}
        </div>
      </div>

      {/* Shopping days */}
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {t("plan.shoppingDays")}
        </label>
        <div className="flex gap-1">
          {weekdays.map((day, idx) => (
            <button
              key={idx}
              onClick={() => toggleShoppingDay(idx)}
              className={`flex-1 rounded-lg px-1 py-2 text-xs font-medium ${
                shoppingDays.includes(idx)
                  ? "bg-orange-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {day}
            </button>
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
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {t("plan.servings")}
        </label>
        <input
          type="number"
          min={1}
          max={12}
          value={servings}
          onChange={(e) => setServings(Number(e.target.value))}
          className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {/* Known/New Ratio */}
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {t("plan.knownRatio")} — {Math.round(knownRatio * 100)}%
        </label>
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
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {t("plan.defaultLeftoverDays")}
        </label>
        <input
          type="number"
          min={0}
          max={3}
          value={defaultLeftoverDays}
          onChange={(e) => setDefaultLeftoverDays(Number(e.target.value))}
          className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={setupPlan.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
      >
        <Sparkles size={16} />
        {setupPlan.isPending
          ? t("common.loading")
          : isUpdate
            ? t("plan.updateConfig")
            : t("plan.setup")}
      </button>
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
    <Drawer
      open={isOpen}
      onClose={onClose}
      title={isUpdate ? t("plan.updateConfig") : t("plan.setup")}
    >
      <DrawerForm
        key={openCount}
        existingPlan={existingPlan}
        onClose={onClose}
      />
    </Drawer>
  );
}
