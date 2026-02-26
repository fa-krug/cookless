import {
  Gauge,
  RotateCcw,
  RotateCw,
  Scale,
  Thermometer,
  Timer,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CookingStep } from "../api/types";
import { getProgramDef } from "../constants/machinePrograms";
import { formatDuration } from "../utils/formatDuration";

interface ProgramStepDisplayProps {
  step: CookingStep;
  isCurrent: boolean;
}

export default function ProgramStepDisplay({ step, isCurrent }: ProgramStepDisplayProps) {
  const { t } = useTranslation();
  const program = step.program_type ? getProgramDef(step.program_type) : null;

  if (!program) return null;

  const iconSize = isCurrent ? 18 : 14;
  const textClass = isCurrent ? "text-sm" : "text-xs";

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <program.icon size={iconSize} className="text-orange-500" />
        <span
          className={`font-medium ${isCurrent ? "text-base text-gray-900" : "text-sm text-gray-700"}`}
        >
          {t(`steps.programs.${step.program_type}`)}
        </span>
      </div>
      <div className={`mt-1.5 flex flex-wrap items-center gap-3 ${textClass} text-gray-600`}>
        {step.temperature != null && (
          <span className="flex items-center gap-1">
            <Thermometer size={iconSize} />
            {step.temperature}°C
          </span>
        )}
        {step.duration_seconds != null && (
          <span className="flex items-center gap-1">
            <Timer size={iconSize} />
            {formatDuration(step.duration_seconds)}
          </span>
        )}
        {step.speed != null && (
          <span className="flex items-center gap-1">
            <Gauge size={iconSize} />
            {step.speed}
          </span>
        )}
        {step.direction != null && (
          <span className="flex items-center gap-1">
            {step.direction === "LEFT" ? (
              <RotateCcw size={iconSize} />
            ) : (
              <RotateCw size={iconSize} />
            )}
            {t(`steps.directions.${step.direction}`)}
          </span>
        )}
        {step.turbo && (
          <span className="flex items-center gap-1">
            <Zap size={iconSize} />
            {t("steps.params.turbo")}
          </span>
        )}
        {step.weight_grams != null && (
          <span className="flex items-center gap-1">
            <Scale size={iconSize} />
            {step.weight_grams}g
          </span>
        )}
      </div>
    </div>
  );
}
