import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface SortableStepProps {
  id: string;
  stepNumber: number;
  instruction: string;
  onInstructionChange: (instruction: string) => void;
  onRemove: () => void;
}

export default function SortableStep({
  id,
  stepNumber,
  instruction,
  onInstructionChange,
  onRemove,
}: SortableStepProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 ${isDragging ? "z-10 scale-105 rounded-md bg-white shadow-lg" : ""}`}
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
        {t("steps.stepNumber", { number: stepNumber })}
      </span>
      <textarea
        value={instruction}
        onChange={(e) => onInstructionChange(e.target.value)}
        placeholder={t("steps.instruction")}
        rows={2}
        className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
      />
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
