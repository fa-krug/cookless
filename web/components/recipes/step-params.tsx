"use client";

import { useT } from "@/lib/i18n/provider";
import { formatDuration } from "@/lib/display/format";

interface StepParamFields {
  temperature: number | null;
  durationSeconds: number | null;
  speed: number | null;
  direction: string;
  weightGrams: number | null;
  turbo: boolean;
}

export function StepParams({ step }: { step: StepParamFields }) {
  const { t } = useT();
  const hasAny =
    step.temperature != null ||
    step.durationSeconds != null ||
    step.speed != null ||
    !!step.direction ||
    step.weightGrams != null ||
    step.turbo;
  if (!hasAny) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
      {step.temperature != null && (
        <span>
          {t("steps.params.temperature")}: {step.temperature}
          {t("steps.units.celsius")}
        </span>
      )}
      {step.durationSeconds != null && (
        <span>
          {t("steps.params.duration")}: {formatDuration(step.durationSeconds)}
        </span>
      )}
      {step.speed != null && (
        <span>
          {t("steps.params.speed")}: {step.speed}
        </span>
      )}
      {step.direction && (
        <span>
          {t("steps.params.direction")}: {t(`steps.directions.${step.direction}`)}
        </span>
      )}
      {step.weightGrams != null && (
        <span>
          {t("steps.params.weight")}: {step.weightGrams}
          {t("steps.units.grams")}
        </span>
      )}
      {step.turbo && <span className="font-medium">{t("steps.params.turbo")}</span>}
    </div>
  );
}
