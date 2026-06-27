export const PROGRAM_PARAMS: Record<string, [string, boolean][]> = {
  MANUAL_COOKING: [
    ["temperature", true],
    ["duration_seconds", true],
    ["speed", true],
    ["direction", true],
    ["turbo", false],
  ],
  CHOPPING: [["duration_seconds", true], ["speed", true]],
  KNEADING: [["duration_seconds", true]],
  STEAMING: [["temperature", true], ["duration_seconds", true]],
  BLENDING: [["duration_seconds", true]],
  SEARING: [["temperature", true], ["duration_seconds", true], ["speed", true]],
  SLOW_COOKING: [["temperature", true], ["duration_seconds", true]],
  SOUS_VIDE: [["temperature", true], ["duration_seconds", true]],
  WEIGHING: [["weight_grams", true]],
  TURBO: [["duration_seconds", true]],
  EGG_COOKING: [["duration_seconds", true]],
  FERMENTATION: [["temperature", true], ["duration_seconds", true]],
  PRE_CLEANING: [],
};

export const DEFAULT_RANGES: Record<string, [number, number]> = {
  temperature: [37, 130],
  duration_seconds: [1, 5940],
  speed: [1, 10],
  weight_grams: [1, 5000],
};

export const RANGE_OVERRIDES: Record<string, Record<string, [number, number]>> = {
  SLOW_COOKING: { duration_seconds: [1, 43200] },
  SOUS_VIDE: { duration_seconds: [1, 43200] },
  FERMENTATION: { temperature: [37, 60], duration_seconds: [1, 43200] },
  TURBO: { duration_seconds: [1, 60] },
};

export const VALID_DIRECTIONS: ReadonlySet<string> = new Set(["LEFT", "RIGHT"]);

export interface ProgramStepParams {
  temperature: number | null;
  durationSeconds: number | null;
  speed: number | null;
  direction: string | null;
  turbo: boolean;
  weightGrams: number | null;
}

/** Validate program step parameters. Returns error messages (empty = valid). */
export function validateProgramStep(programType: string, params: ProgramStepParams): string[] {
  const errors: string[] = [];

  const programParams = PROGRAM_PARAMS[programType];
  if (programParams === undefined) {
    return [`Invalid program_type: ${programType}`];
  }

  const overrides = RANGE_OVERRIDES[programType] ?? {};
  const intValues: Record<string, number | null> = {
    temperature: params.temperature,
    duration_seconds: params.durationSeconds,
    speed: params.speed,
    weight_grams: params.weightGrams,
  };

  for (const [field, required] of programParams) {
    if (field === "turbo") continue;

    if (field === "direction") {
      if (required && params.direction === null) {
        errors.push(`${field} is required for ${programType}`);
      } else if (params.direction !== null && !VALID_DIRECTIONS.has(params.direction)) {
        errors.push(`direction must be one of LEFT, RIGHT, got ${params.direction}`);
      }
      continue;
    }

    const value = intValues[field];

    if (required && value === null) {
      errors.push(`${field} is required for ${programType}`);
      continue;
    }
    if (value === null) continue;

    const [min, max] = overrides[field] ?? DEFAULT_RANGES[field] ?? [0, 999999];
    if (!(min <= value && value <= max)) {
      errors.push(`${field} must be between ${min} and ${max}, got ${value}`);
    }
  }

  return errors;
}
