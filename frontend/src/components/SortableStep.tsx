import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CookingStepPayload } from "../api/types";
import ProgramStepForm from "./ProgramStepForm";
import Textarea from "./ui/Textarea";

interface SortableStepProps {
  id: string;
  step: CookingStepPayload;
  onStepChange: (step: CookingStepPayload) => void;
  onRemove: () => void;
  isMachine?: boolean;
}

export default function SortableStep({
  id,
  step,
  onStepChange,
  onRemove,
  isMachine,
}: SortableStepProps) {
  const { t } = useTranslation();
  const [freeTextMode, setFreeTextMode] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const showProgram = isMachine && step.program_type;
  const showProgramSelector = isMachine && !step.program_type && !step.instruction && !freeTextMode;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 rounded-lg border ${showProgram ? "border-orange-500/20 bg-orange-50 p-3" : "border-transparent p-1"} ${isDragging ? "z-10 scale-105 bg-white shadow-lg" : ""}`}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none pt-1.5 text-gray-400 hover:text-gray-600 active:cursor-grabbing"
        aria-label={t("steps.reorder")}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} />
      </button>
      <span className="shrink-0 pt-1.5 text-sm font-medium text-gray-500">
        {t("steps.stepNumber", { number: step.step_number })}
      </span>
      <div className="min-w-0 flex-1">
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
              rows={2}
              className="text-sm"
            />
            {isMachine && (
              <button
                type="button"
                onClick={() => {
                  setFreeTextMode(false);
                  onStepChange({ ...step, program_type: null, instruction: "" });
                }}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-orange-400 px-3 py-2 text-sm text-orange-500 hover:bg-orange-50"
              >
                {t("steps.selectProgram")}
              </button>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-md p-1.5 text-red-600 hover:bg-red-50"
        aria-label={t("common.remove")}
      >
        <X size={18} />
      </button>
    </div>
  );
}
