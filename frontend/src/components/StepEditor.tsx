import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import SortableStep from "./SortableStep";

export interface StepRow {
  step_number: number;
  instruction: string;
}

interface StepEditorProps {
  steps: StepRow[];
  onChange: (steps: StepRow[]) => void;
  label: string;
}

export default function StepEditor({ steps, onChange, label }: StepEditorProps) {
  const { t } = useTranslation();

  const stepIds = steps.map((_, i) => `step-${i}`);

  function addStep() {
    onChange([...steps, { step_number: steps.length + 1, instruction: "" }]);
  }

  function removeStep(index: number) {
    const updated = steps.filter((_, i) => i !== index);
    onChange(updated.map((step, i) => ({ ...step, step_number: i + 1 })));
  }

  function updateInstruction(index: number, instruction: string) {
    const updated = steps.map((step, i) =>
      i === index ? { ...step, instruction } : step,
    );
    onChange(updated);
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
        <button
          type="button"
          onClick={addStep}
          className="rounded-md bg-orange-500 p-1.5 text-white hover:bg-orange-600"
          aria-label={t("steps.add")}
        >
          <Plus size={18} />
        </button>
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
                stepNumber={step.step_number}
                instruction={step.instruction}
                onInstructionChange={(instruction) => updateInstruction(index, instruction)}
                onRemove={() => removeStep(index)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
