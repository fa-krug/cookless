import {
  ChefHat,
  Clock,
  Droplets,
  Egg,
  Flame,
  Hand,
  type LucideIcon,
  Scissors,
  Sparkles,
  Sprout,
  Thermometer,
  Weight,
  Wind,
  Zap,
} from "lucide-react";
import type { Direction, ProgramType } from "../api/types";

export type ParamField =
  | "temperature"
  | "duration_seconds"
  | "speed"
  | "direction"
  | "weight_grams"
  | "turbo";

export interface ProgramParam {
  field: ParamField;
  required: boolean;
  min?: number;
  max?: number;
  options?: Direction[];
}

export interface MachineProgram {
  type: ProgramType;
  icon: LucideIcon;
  params: ProgramParam[];
}

const temp = (min = 37, max = 130): ProgramParam => ({
  field: "temperature",
  required: true,
  min,
  max,
});
const duration = (max = 5940): ProgramParam => ({
  field: "duration_seconds",
  required: true,
  min: 1,
  max,
});
const spd: ProgramParam = { field: "speed", required: true, min: 1, max: 10 };
const dir: ProgramParam = {
  field: "direction",
  required: true,
  options: ["LEFT", "RIGHT"],
};
const turboParam: ProgramParam = { field: "turbo", required: false };
const weight: ProgramParam = {
  field: "weight_grams",
  required: true,
  min: 1,
  max: 5000,
};

export const MACHINE_PROGRAMS: MachineProgram[] = [
  {
    type: "MANUAL_COOKING",
    icon: ChefHat,
    params: [temp(), duration(), spd, dir, turboParam],
  },
  { type: "CHOPPING", icon: Scissors, params: [duration(), spd] },
  { type: "KNEADING", icon: Hand, params: [duration()] },
  { type: "STEAMING", icon: Droplets, params: [temp(), duration()] },
  { type: "BLENDING", icon: Wind, params: [duration()] },
  { type: "SEARING", icon: Flame, params: [temp(), duration(), spd] },
  { type: "SLOW_COOKING", icon: Clock, params: [temp(), duration(43200)] },
  { type: "SOUS_VIDE", icon: Thermometer, params: [temp(), duration(43200)] },
  { type: "WEIGHING", icon: Weight, params: [weight] },
  { type: "TURBO", icon: Zap, params: [duration(60)] },
  { type: "EGG_COOKING", icon: Egg, params: [duration()] },
  { type: "FERMENTATION", icon: Sprout, params: [temp(37, 60), duration(43200)] },
  { type: "PRE_CLEANING", icon: Sparkles, params: [] },
];

export function getProgramDef(type: ProgramType): MachineProgram | undefined {
  return MACHINE_PROGRAMS.find((p) => p.type === type);
}
