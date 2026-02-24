import { useTranslation } from "react-i18next";

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

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{label}</h3>
        <button
          type="button"
          onClick={addStep}
          className="rounded-md bg-orange-500 px-3 py-1 text-sm font-medium text-white hover:bg-orange-600"
        >
          {t("steps.add")}
        </button>
      </div>

      {steps.length === 0 && (
        <p className="mt-2 text-sm text-gray-500">{t("steps.noSteps")}</p>
      )}

      <div className="mt-2 space-y-2">
        {steps.map((step, index) => (
          <div key={index} className="flex items-start gap-2">
            <span className="shrink-0 pt-1.5 text-sm font-medium text-gray-500">
              {t("steps.stepNumber", { number: step.step_number })}
            </span>
            <textarea
              value={step.instruction}
              onChange={(e) => updateInstruction(index, e.target.value)}
              placeholder={t("steps.instruction")}
              rows={2}
              className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            <button
              type="button"
              onClick={() => removeStep(index)}
              className="shrink-0 rounded-md px-2 py-1.5 text-sm text-red-600 hover:bg-red-50"
              aria-label={t("common.remove")}
            >
              {t("common.remove")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
