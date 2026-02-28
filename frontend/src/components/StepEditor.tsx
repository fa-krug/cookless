import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { CookingStepPayload } from "../api/types";
import ProgramStepForm from "./ProgramStepForm";
import SortableStep from "./SortableStep";
import ResponsiveOverlay from "./ui/ResponsiveOverlay";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type StepRow = CookingStepPayload;

interface StepEditorProps {
  steps: StepRow[];
  onChange: (steps: StepRow[]) => void;
  label: string;
  isMachine?: boolean;
}

export default function StepEditor({ steps, onChange, label, isMachine }: StepEditorProps) {
  const { t } = useTranslation();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const stepIds = steps.map((_, i) => `step-${i}`);

  function addStep() {
    const newIndex = steps.length;
    onChange([...steps, { step_number: newIndex + 1, instruction: "" }]);
    setEditingIndex(newIndex);
  }

  function removeStep(index: number) {
    setEditingIndex(null);
    const updated = steps.filter((_, i) => i !== index);
    onChange(updated.map((step, i) => ({ ...step, step_number: i + 1 })));
  }

  function updateStep(index: number, updated: StepRow) {
    onChange(
      steps.map((step, i) => (i === index ? { ...updated, step_number: step.step_number } : step)),
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = stepIds.indexOf(active.id as string);
    const newIndex = stepIds.indexOf(over.id as string);
    const reordered = arrayMove(steps, oldIndex, newIndex);
    onChange(reordered.map((step, i) => ({ ...step, step_number: i + 1 })));
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{label}</h3>
        <Button
          type="button"
          size="icon"
          className="h-8 w-8"
          onClick={addStep}
          aria-label={t("steps.add")}
        >
          <Plus size={18} />
        </Button>
      </div>

      {steps.length === 0 && (
        <p className="mt-2 text-sm text-gray-500">{t("steps.noSteps")}</p>
      )}

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stepIds} strategy={verticalListSortingStrategy}>
          <div className="mt-2 space-y-2">
            {steps.map((step, index) => (
              <SortableStep
                key={stepIds[index]}
                id={stepIds[index]}
                step={step}
                onRemove={() => removeStep(index)}
                onTap={() => setEditingIndex(index)}
                isMachine={isMachine}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {editingIndex !== null && steps[editingIndex] && (
        <StepEditDrawer
          step={steps[editingIndex]}
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
        <ProgramStepForm step={step} onChange={onStepChange} />
      ) : showProgramSelector ? (
        <ProgramStepForm
          step={step}
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
              className="mt-3 w-full border-dashed border-orange-400 text-orange-500 hover:bg-orange-50"
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
