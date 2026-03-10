import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  FieldArrayWithId,
  UseFieldArrayAppend,
  UseFieldArrayMove,
  UseFieldArrayRemove,
  UseFieldArrayUpdate,
} from "react-hook-form";

import type { IngredientRowValues, RecipeFormValues, StepIngredientRowValues, StepRowValues } from "@/lib/schemas/recipe";
import type { CookingStepPayload, Ingredient, Unit } from "../api/types";
import ProgramStepForm from "./ProgramStepForm";
import SortableStep from "./SortableStep";
import ResponsiveOverlay from "./ui/ResponsiveOverlay";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type StepRow = StepRowValues;

type StepFieldName = "manualSteps" | "machineSteps";

interface StepEditorProps {
  fields: FieldArrayWithId<RecipeFormValues, StepFieldName>[];
  append: UseFieldArrayAppend<RecipeFormValues, StepFieldName>;
  remove: UseFieldArrayRemove;
  update: UseFieldArrayUpdate<RecipeFormValues, StepFieldName>;
  move: UseFieldArrayMove;
  label: string;
  isMachine?: boolean;
  formIngredients?: IngredientRowValues[];
  allIngredients?: Ingredient[];
  allUnits?: Unit[];
  otherSteps?: StepRowValues[];
}

export default function StepEditor({
  fields,
  append,
  remove,
  update,
  move,
  label,
  isMachine,
  formIngredients = [],
  allIngredients = [],
  allUnits = [],
  otherSteps = [],
}: StepEditorProps) {
  const { t } = useTranslation();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const stepIds = fields.map((f) => f.id);

  function addStep() {
    const newIndex = fields.length;
    append({ step_number: newIndex + 1, instruction: "", ingredients: [] });
    setEditingIndex(newIndex);
  }

  function removeStep(index: number) {
    setEditingIndex(null);
    remove(index);
    // Renumber remaining steps
    fields.forEach((field, i) => {
      if (i > index) {
        update(i - 1, { ...field, step_number: i });
      }
    });
  }

  function updateStep(index: number, updated: StepRow) {
    update(index, { ...updated, step_number: fields[index].step_number });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = stepIds.indexOf(active.id as string);
    const newIndex = stepIds.indexOf(over.id as string);
    move(oldIndex, newIndex);

    // Renumber all steps after move
    const reordered = arrayMove([...fields], oldIndex, newIndex);
    reordered.forEach((field, i) => {
      update(i, { ...field, step_number: i + 1 });
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{label}</h3>
        <IconButton
          type="button"
          className="h-8 w-8"
          onClick={addStep}
          tooltip={t("steps.add")}
          aria-label={t("steps.add")}
        >
          <Plus size={18} />
        </IconButton>
      </div>

      {fields.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">{t("steps.noSteps")}</p>
      )}

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stepIds} strategy={verticalListSortingStrategy}>
          <div className="mt-2 space-y-2">
            {fields.map((step, index) => (
              <SortableStep
                key={step.id}
                id={step.id}
                step={step}
                onRemove={() => removeStep(index)}
                onTap={() => setEditingIndex(index)}
                isMachine={isMachine}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {editingIndex !== null && fields[editingIndex] && (
        <StepEditDrawer
          step={fields[editingIndex]}
          isMachine={isMachine}
          onStepChange={(updated) => updateStep(editingIndex, updated)}
          onClose={() => setEditingIndex(null)}
          formIngredients={formIngredients}
          allIngredients={allIngredients}
          allUnits={allUnits}
          otherStepIngredients={[
            ...otherSteps.flatMap((s) => s.ingredients ?? []),
            ...fields.flatMap((s, i) => (i === editingIndex ? [] : s.ingredients ?? [])),
          ]}
        />
      )}
    </div>
  );
}

interface StepEditDrawerProps {
  step: StepRow;
  isMachine?: boolean;
  onStepChange: (step: StepRow) => void;
  onClose: () => void;
  formIngredients: IngredientRowValues[];
  allIngredients: Ingredient[];
  allUnits: Unit[];
  otherStepIngredients: StepIngredientRowValues[];
}

function StepEditDrawer({
  step,
  isMachine,
  onStepChange,
  onClose,
  formIngredients,
  allIngredients,
  allUnits,
  otherStepIngredients,
}: StepEditDrawerProps) {
  const { t, i18n } = useTranslation();
  const [freeTextMode, setFreeTextMode] = useState(false);

  const lang = i18n.language === "de" ? "de" : "en";
  const nameKey = lang === "de" ? "name_de" : "name_en";
  const ingredientMap = new Map(allIngredients.map((i) => [i.id, i]));
  const unitMap = new Map(allUnits.map((u) => [u.id, u]));

  const showProgram = isMachine && step.program_type;
  const showProgramSelector = isMachine && !step.program_type && !step.instruction && !freeTextMode;

  const stepIngredients = step.ingredients ?? [];

  // Compute how much of each ingredient is allocated in OTHER steps (not this one)
  const otherAllocations = new Map<number, number>();
  for (const si of otherStepIngredients) {
    otherAllocations.set(si.ingredientIndex, (otherAllocations.get(si.ingredientIndex) ?? 0) + parseFloat(si.quantity || "0"));
  }

  function getRemainingQty(formIndex: number): number {
    const fi = formIngredients[formIndex];
    if (!fi) return 0;
    const total = parseFloat(fi.quantity || "0");
    const otherUsed = otherAllocations.get(formIndex) ?? 0;
    const thisUsed = parseFloat(
      stepIngredients.find((si) => si.ingredientIndex === formIndex)?.quantity || "0",
    );
    return total - otherUsed - thisUsed;
  }

  // Ingredients already added to this step (by index)
  const usedIndices = new Set(stepIngredients.map((si) => si.ingredientIndex));

  // Available ingredients that haven't been added to this step yet
  const availableIngredients = formIngredients
    .map((fi, idx) => ({ ...fi, formIndex: idx }))
    .filter((fi) => !usedIndices.has(fi.formIndex) && fi.ingredient > 0);

  function addIngredientToStep(formIndex: number) {
    const fi = formIngredients[formIndex];
    const totalQty = parseFloat(fi.quantity || "0");
    const otherUsed = otherAllocations.get(formIndex) ?? 0;
    const remaining = Math.max(0, totalQty - otherUsed);
    const newIngredients = [
      ...stepIngredients,
      { ingredientIndex: formIndex, quantity: remaining > 0 ? String(remaining) : fi.quantity || "0" },
    ];
    onStepChange({ ...step, ingredients: newIngredients });
  }

  function removeIngredientFromStep(ingredientIndex: number) {
    onStepChange({
      ...step,
      ingredients: stepIngredients.filter((si) => si.ingredientIndex !== ingredientIndex),
    });
  }

  function updateIngredientQuantity(ingredientIndex: number, quantity: string) {
    onStepChange({
      ...step,
      ingredients: stepIngredients.map((si) =>
        si.ingredientIndex === ingredientIndex ? { ...si, quantity } : si,
      ),
    });
  }

  function renderIngredientName(formIndex: number): string {
    const fi = formIngredients[formIndex];
    if (!fi) return "?";
    const ing = ingredientMap.get(fi.ingredient);
    return ing ? ing[nameKey] : fi.ingredientName;
  }

  function renderUnitAbbr(formIndex: number): string {
    const fi = formIngredients[formIndex];
    if (!fi) return "";
    const unit = unitMap.get(fi.unit);
    return unit?.abbreviation ?? "";
  }

  return (
    <ResponsiveOverlay
      open={true}
      onClose={onClose}
      title={t("steps.stepNumber", { number: step.step_number })}
    >
      {showProgram ? (
        <ProgramStepForm
          step={step as unknown as CookingStepPayload}
          onChange={(s) => onStepChange({ ...s, ingredients: step.ingredients })}
        />
      ) : showProgramSelector ? (
        <ProgramStepForm
          step={step as unknown as CookingStepPayload}
          onChange={(s) => onStepChange({ ...s, ingredients: step.ingredients })}
          onSelectFreeText={() => setFreeTextMode(true)}
        />
      ) : (
        <div>
          <Textarea
            value={step.instruction}
            onChange={(e) => onStepChange({ ...step, instruction: e.target.value })}
            placeholder={t("steps.instruction")}
            rows={6}
          />
          {isMachine && (
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full border-dashed border-primary text-primary hover:bg-primary/10"
              onClick={() => {
                setFreeTextMode(false);
                onStepChange({ ...step, program_type: null, instruction: "" });
              }}
            >
              {t("steps.selectProgram")}
            </Button>
          )}
        </div>
      )}

      {/* Step Ingredients */}
      {formIngredients.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium">{t("steps.ingredients")}</h4>

          {stepIngredients.length > 0 && (
            <div className="mt-2 space-y-2">
              {stepIngredients.map((si) => {
                const remaining = getRemainingQty(si.ingredientIndex);
                const isOver = remaining < -0.001;
                return (
                  <div key={si.ingredientIndex}>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={si.quantity}
                        onChange={(e) => updateIngredientQuantity(si.ingredientIndex, e.target.value)}
                        className={`w-20 shrink-0 ${isOver ? "border-destructive text-destructive" : ""}`}
                      />
                      <span className="shrink-0 text-sm text-muted-foreground">
                        {renderUnitAbbr(si.ingredientIndex)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {renderIngredientName(si.ingredientIndex)}
                      </span>
                      <IconButton
                        type="button"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10"
                        onClick={() => removeIngredientFromStep(si.ingredientIndex)}
                        tooltip={t("common.remove")}
                        aria-label={t("common.remove")}
                      >
                        <X size={14} />
                      </IconButton>
                    </div>
                    {isOver && (
                      <p className="mt-0.5 text-xs text-destructive">
                        {t("steps.overAllocated", {
                          amount: Math.abs(remaining).toFixed(1),
                          unit: renderUnitAbbr(si.ingredientIndex),
                        })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {availableIngredients.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {availableIngredients.map((fi) => (
                <Button
                  key={fi.formIndex}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => addIngredientToStep(fi.formIndex)}
                >
                  <Plus size={12} />
                  {renderIngredientName(fi.formIndex)}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </ResponsiveOverlay>
  );
}
