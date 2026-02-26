import { PenLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CookingStepPayload, Direction, ProgramType } from "../api/types";
import { MACHINE_PROGRAMS, getProgramDef } from "../constants/machinePrograms";

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
          <button
            key={p.type}
            type="button"
            onClick={() => selectProgram(p.type)}
            className="flex flex-col items-center gap-1 rounded-md border border-gray-200 px-2 py-2 text-xs hover:border-orange-400 hover:bg-orange-50"
          >
            <p.icon size={18} className="text-gray-600" />
            <span className="text-center leading-tight">
              {t(`steps.programs.${p.type}`)}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            clearProgram();
            onSelectFreeText?.();
          }}
          className="flex flex-col items-center gap-1 rounded-md border border-gray-200 px-2 py-2 text-xs hover:border-orange-400 hover:bg-orange-50"
        >
          <PenLine size={18} className="text-gray-600" />
          <span className="text-center leading-tight">{t("steps.freeText")}</span>
        </button>
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
        <div className="flex items-center gap-1.5 rounded-full bg-orange-500 px-3 py-1">
          <program.icon size={16} className="text-white" />
          <span className="text-sm font-medium text-white">
            {t(`steps.programs.${step.program_type}`)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...step, program_type: null })}
          className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 hover:text-gray-700"
        >
          {t("steps.changeProgram")}
        </button>
      </div>

      {/* Parameter inputs - only render params for this program */}
      <div className="flex flex-wrap gap-2">
        {program.params.map((param) => {
          if (param.field === "temperature") {
            return (
              <label key="temperature" className="flex items-center gap-1 text-sm">
                <span className="text-gray-500">{t("steps.params.temperature")}</span>
                <input
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
                  className="w-16 rounded border border-gray-300 px-1.5 py-1"
                />
                <span className="text-gray-400">°C</span>
              </label>
            );
          }

          if (param.field === "duration_seconds") {
            return (
              <div key="duration" className="flex items-center gap-1 text-sm">
                <span className="text-gray-500">{t("steps.params.duration")}</span>
                <input
                  type="number"
                  min={0}
                  value={durationMinutes || ""}
                  onChange={(e) =>
                    setDuration(e.target.value === "" ? 0 : Number(e.target.value), durationSecs)
                  }
                  className="w-14 rounded border border-gray-300 px-1.5 py-1"
                  placeholder="min"
                />
                <span className="text-gray-400">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={durationSecs || ""}
                  onChange={(e) =>
                    setDuration(durationMinutes, e.target.value === "" ? 0 : Number(e.target.value))
                  }
                  className="w-14 rounded border border-gray-300 px-1.5 py-1"
                  placeholder="sec"
                />
              </div>
            );
          }

          if (param.field === "speed") {
            return (
              <label key="speed" className="flex items-center gap-1 text-sm">
                <span className="text-gray-500">{t("steps.params.speed")}</span>
                <input
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
                  className="w-14 rounded border border-gray-300 px-1.5 py-1"
                />
              </label>
            );
          }

          if (param.field === "direction") {
            return (
              <div key="direction" className="flex items-center gap-1 text-sm">
                <span className="text-gray-500">{t("steps.params.direction")}</span>
                <div className="flex overflow-hidden rounded border border-gray-300">
                  {(["LEFT", "RIGHT"] as Direction[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => onChange({ ...step, direction: d })}
                      className={`px-2.5 py-1 text-xs ${
                        step.direction === d
                          ? "bg-orange-500 text-white"
                          : "bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {t(`steps.directions.${d}`)}
                    </button>
                  ))}
                </div>
              </div>
            );
          }

          if (param.field === "turbo") {
            return (
              <label key="turbo" className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={step.turbo ?? false}
                  onChange={(e) => onChange({ ...step, turbo: e.target.checked })}
                  className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-gray-500">{t("steps.params.turbo")}</span>
              </label>
            );
          }

          if (param.field === "weight_grams") {
            return (
              <label key="weight" className="flex items-center gap-1 text-sm">
                <span className="text-gray-500">{t("steps.params.weight")}</span>
                <input
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
                  className="w-20 rounded border border-gray-300 px-1.5 py-1"
                />
                <span className="text-gray-400">g</span>
              </label>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
