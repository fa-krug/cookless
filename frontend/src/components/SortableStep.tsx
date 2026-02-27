import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CookingStepPayload } from "../api/types";

interface SortableStepProps {
  id: string;
  step: CookingStepPayload;
  onRemove: () => void;
  onTap: () => void;
  isMachine?: boolean;
}

export default function SortableStep({
  id,
  step,
  onRemove,
  onTap,
  isMachine,
}: SortableStepProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const hasProgram = isMachine && step.program_type;
  const previewText = step.instruction || (hasProgram ? t(`steps.programs.${step.program_type}`) : "");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 rounded-lg border ${hasProgram ? "border-orange-500/20 bg-orange-50 p-2" : "border-gray-200 p-2"} ${isDragging ? "z-10 scale-105 bg-white shadow-lg" : ""}`}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none pt-1 text-gray-400 hover:text-gray-600 active:cursor-grabbing"
        aria-label={t("steps.reorder")}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-500">
            {t("steps.stepNumber", { number: step.step_number })}
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded-md p-1 text-red-600 hover:bg-red-50"
            aria-label={t("common.remove")}
          >
            <X size={16} />
          </button>
        </div>
        <div
          className="mt-1 cursor-pointer rounded px-1 py-1 hover:bg-gray-50"
          onClick={onTap}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onTap();
            }
          }}
        >
          <p
            className={`text-sm ${previewText ? "" : "italic text-gray-400"}`}
          >
            {previewText || t("steps.instruction")}
          </p>
        </div>
      </div>
    </div>
  );
}
