"use client";

import { useFormContext } from "react-hook-form";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PROGRAM_PARAMS, validateProgramStep } from "@/lib/domain/recipes/program-validation";
import type { RecipeFormValues } from "@/lib/schemas/recipe";

const PROGRAMS = Object.keys(PROGRAM_PARAMS);

export function ProgramStepForm({
  name,
  index,
}: {
  name: "manualSteps" | "machineSteps";
  index: number;
}) {
  const { t } = useT();
  const { watch, setValue, register } = useFormContext<RecipeFormValues>();
  const step = watch(`${name}.${index}`);
  const programType = step?.programType ?? "";
  const params = programType ? PROGRAM_PARAMS[programType] : [];
  const fieldNames = new Set(params.map(([f]) => f));

  const errors =
    programType
      ? validateProgramStep(programType, {
          temperature: step.temperature,
          durationSeconds: step.durationSeconds,
          speed: step.speed,
          direction: step.direction || null,
          turbo: step.turbo,
          weightGrams: step.weightGrams,
        })
      : [];

  if (!programType) {
    return (
      <div className="flex flex-wrap gap-1">
        {PROGRAMS.map((p) => (
          <Button
            key={p}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setValue(`${name}.${index}.programType`, p)}
          >
            {t(`steps.programs.${p}`)}
          </Button>
        ))}
        <span className="self-center text-xs text-muted-foreground">{t("steps.orFreeText")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t(`steps.programs.${programType}`)}</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setValue(`${name}.${index}.programType`, "")}
        >
          {t("steps.changeProgram")}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {fieldNames.has("temperature") && (
          <Input
            type="number"
            placeholder={t("steps.temperature")}
            {...register(`${name}.${index}.temperature`, {
              setValueAs: (v) => (v === "" ? null : Number(v)),
            })}
          />
        )}
        {fieldNames.has("duration_seconds") && (
          <Input
            type="number"
            placeholder={t("steps.durationSeconds")}
            {...register(`${name}.${index}.durationSeconds`, {
              setValueAs: (v) => (v === "" ? null : Number(v)),
            })}
          />
        )}
        {fieldNames.has("speed") && (
          <Input
            type="number"
            placeholder={t("steps.speed")}
            {...register(`${name}.${index}.speed`, {
              setValueAs: (v) => (v === "" ? null : Number(v)),
            })}
          />
        )}
        {fieldNames.has("weight_grams") && (
          <Input
            type="number"
            placeholder={t("steps.weightGrams")}
            {...register(`${name}.${index}.weightGrams`, {
              setValueAs: (v) => (v === "" ? null : Number(v)),
            })}
          />
        )}
        {fieldNames.has("direction") && (
          <select
            className="rounded-md border bg-background p-2 text-sm"
            {...register(`${name}.${index}.direction`)}
          >
            <option value="">—</option>
            <option value="LEFT">{t("steps.directionLeft")}</option>
            <option value="RIGHT">{t("steps.directionRight")}</option>
          </select>
        )}
        {fieldNames.has("turbo") && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register(`${name}.${index}.turbo`)} /> {t("steps.turbo")}
          </label>
        )}
      </div>
      {errors.length > 0 && <p className="text-xs text-destructive">{errors[0]}</p>}
    </div>
  );
}
