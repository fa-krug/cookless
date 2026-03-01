import { PenLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CookingStepPayload, Direction, ProgramType } from "../api/types";
import { MACHINE_PROGRAMS, getProgramDef } from "../constants/machinePrograms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface ProgramStepFormProps {
  step: CookingStepPayload;
  onChange: (step: CookingStepPayload) => void;
  onSelectFreeText?: () => void;
}

export default function ProgramStepForm({ step, onChange, onSelectFreeText }: ProgramStepFormProps) {
  const { t } = useTranslation();
  const program = step.program_type ? getProgramDef(step.program_type) : null;

  function selectProgram(type: ProgramType) {
    onChange({
      ...step,
      program_type: type,
      instruction: "",
      temperature: null,
      duration_seconds: null,
      speed: null,
      turbo: false,
      direction: null,
      weight_grams: null,
    });
  }

  function clearProgram() {
    onChange({
      ...step,
      program_type: null,
      instruction: "",
      temperature: null,
      duration_seconds: null,
      speed: null,
      turbo: false,
      direction: null,
      weight_grams: null,
    });
  }

  // Program selection grid (when no program selected yet)
  if (!program) {
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {MACHINE_PROGRAMS.map((p) => (
          <Button
            key={p.type}
            type="button"
            variant="outline"
            className="flex h-auto flex-col items-center gap-1 px-2 py-2 text-xs hover:border-primary hover:bg-primary/10"
            onClick={() => selectProgram(p.type)}
          >
            <p.icon size={18} className="text-muted-foreground" />
            <span className="text-center leading-tight">
              {t(`steps.programs.${p.type}`)}
            </span>
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          className="flex h-auto flex-col items-center gap-1 px-2 py-2 text-xs hover:border-primary hover:bg-primary/10"
          onClick={() => {
            clearProgram();
            onSelectFreeText?.();
          }}
        >
          <PenLine size={18} className="text-muted-foreground" />
          <span className="text-center leading-tight">{t("steps.freeText")}</span>
        </Button>
      </div>
    );
  }

  // Duration helpers
  const durationMinutes =
    step.duration_seconds != null ? Math.floor(step.duration_seconds / 60) : 0;
  const durationSecs = step.duration_seconds != null ? step.duration_seconds % 60 : 0;

  function setDuration(minutes: number, seconds: number) {
    const total = Math.max(0, minutes * 60 + seconds);
    onChange({ ...step, duration_seconds: total || null });
  }

  // Program form with parameter inputs
  return (
    <div className="space-y-2">
      {/* Program badge + change button */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1">
          <program.icon size={16} className="text-primary-foreground" />
          <span className="text-sm font-medium text-primary-foreground">
            {t(`steps.programs.${step.program_type}`)}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => onChange({ ...step, program_type: null })}
        >
          {t("steps.changeProgram")}
        </Button>
      </div>

      {/* Parameter inputs - only render params for this program */}
      <div className="flex flex-wrap gap-2">
        {program.params.map((param) => {
          if (param.field === "temperature") {
            return (
              <label key="temperature" className="flex items-center gap-1 text-sm">
                <span className="text-muted-foreground">{t("steps.params.temperature")}</span>
                <Input
                  type="number"
                  min={param.min}
                  max={param.max}
                  value={step.temperature ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...step,
                      temperature: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="h-8 w-16"
                />
                <span className="text-muted-foreground">°C</span>
              </label>
            );
          }

          if (param.field === "duration_seconds") {
            return (
              <div key="duration" className="flex items-center gap-1 text-sm">
                <span className="text-muted-foreground">{t("steps.params.duration")}</span>
                <Input
                  type="number"
                  min={0}
                  value={durationMinutes || ""}
                  onChange={(e) =>
                    setDuration(e.target.value === "" ? 0 : Number(e.target.value), durationSecs)
                  }
                  className="h-8 w-14"
                  placeholder="min"
                />
                <span className="text-muted-foreground">:</span>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={durationSecs || ""}
                  onChange={(e) =>
                    setDuration(durationMinutes, e.target.value === "" ? 0 : Number(e.target.value))
                  }
                  className="h-8 w-14"
                  placeholder="sec"
                />
              </div>
            );
          }

          if (param.field === "speed") {
            return (
              <label key="speed" className="flex items-center gap-1 text-sm">
                <span className="text-muted-foreground">{t("steps.params.speed")}</span>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={step.speed ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...step,
                      speed: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="h-8 w-14"
                />
              </label>
            );
          }

          if (param.field === "direction") {
            return (
              <div key="direction" className="flex items-center gap-1 text-sm">
                <span className="text-muted-foreground">{t("steps.params.direction")}</span>
                <ToggleGroup
                  type="single"
                  value={step.direction ?? ""}
                  onValueChange={(val) => {
                    if (val) onChange({ ...step, direction: val as Direction });
                  }}
                >
                  {(["LEFT", "RIGHT"] as Direction[]).map((d) => (
                    <ToggleGroupItem key={d} value={d} size="sm" className="px-2.5 text-xs">
                      {t(`steps.directions.${d}`)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            );
          }

          if (param.field === "turbo") {
            return (
              <label key="turbo" className="flex items-center gap-1.5 text-sm">
                <Checkbox
                  checked={step.turbo ?? false}
                  onCheckedChange={(checked) =>
                    onChange({ ...step, turbo: checked === true })
                  }
                />
                <span className="text-muted-foreground">{t("steps.params.turbo")}</span>
              </label>
            );
          }

          if (param.field === "weight_grams") {
            return (
              <label key="weight" className="flex items-center gap-1 text-sm">
                <span className="text-muted-foreground">{t("steps.params.weight")}</span>
                <Input
                  type="number"
                  min={1}
                  max={5000}
                  value={step.weight_grams ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...step,
                      weight_grams: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="h-8 w-20"
                />
                <span className="text-muted-foreground">g</span>
              </label>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
