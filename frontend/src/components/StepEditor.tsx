import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  FieldArrayWithId,
  UseFieldArrayAppend,
  UseFieldArrayMove,
  UseFieldArrayRemove,
  UseFieldArrayUpdate,
} from "react-hook-form";

import type { RecipeFormValues, StepRowValues } from "@/lib/schemas/recipe";
import type { CookingStepPayload } from "../api/types";
import ProgramStepForm from "./ProgramStepForm";
import SortableStep from "./SortableStep";
import ResponsiveOverlay from "./ui/ResponsiveOverlay";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/IconButton";
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
}

export default function StepEditor({
  fields,
  append,
  remove,
  update,
  move,
  label,
  isMachine,
}: StepEditorProps) {
  const { t } = useTranslation();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const stepIds = fields.map((f) => f.id);

  function addStep() {
    const newIndex = fields.length;
    append({ step_number: newIndex + 1, instruction: "" });
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
}

function StepEditDrawer({ step, isMachine, onStepChange, onClose }: StepEditDrawerProps) {
  const { t } = useTranslation();
  const [freeTextMode, setFreeTextMode] = useState(false);

  const showProgram = isMachine && step.program_type;
  const showProgramSelector = isMachine && !step.program_type && !step.instruction && !freeTextMode;

  return (
    <ResponsiveOverlay
      open={true}
      onClose={onClose}
      title={t("steps.stepNumber", { number: step.step_number })}
    >
      {showProgram ? (
        <ProgramStepForm step={step as CookingStepPayload} onChange={onStepChange} />
      ) : showProgramSelector ? (
        <ProgramStepForm
          step={step as CookingStepPayload}
          onChange={onStepChange}
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
    </ResponsiveOverlay>
  );
}
