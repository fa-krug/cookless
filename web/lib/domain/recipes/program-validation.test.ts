import { describe, expect, it } from "vitest";
import { type ProgramStepParams, validateProgramStep } from "./program-validation";

const base: ProgramStepParams = {
  temperature: null, durationSeconds: null, speed: null,
  direction: null, turbo: false, weightGrams: null,
};

describe("validateProgramStep", () => {
  it("accepts a valid MANUAL_COOKING step", () => {
    const errors = validateProgramStep("MANUAL_COOKING", {
      ...base, temperature: 100, durationSeconds: 300, speed: 5, direction: "LEFT",
    });
    expect(errors).toEqual([]);
  });

  it("flags a missing required temperature", () => {
    const errors = validateProgramStep("MANUAL_COOKING", {
      ...base, temperature: null, durationSeconds: 300, speed: 5, direction: "LEFT",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("temperature");
  });

  it("flags an out-of-range temperature (default range 37-130)", () => {
    const errors = validateProgramStep("MANUAL_COOKING", {
      ...base, temperature: 200, durationSeconds: 300, speed: 5, direction: "LEFT",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("temperature");
  });

  it("applies FERMENTATION temperature override (max 60)", () => {
    const errors = validateProgramStep("FERMENTATION", {
      ...base, temperature: 80, durationSeconds: 3600,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("temperature");
  });

  it("rejects an invalid program_type", () => {
    expect(validateProgramStep("NONSENSE", base)).toEqual(["Invalid program_type: NONSENSE"]);
  });

  it("requires a valid direction value when provided", () => {
    const errors = validateProgramStep("MANUAL_COOKING", {
      ...base, temperature: 100, durationSeconds: 300, speed: 5, direction: "SIDEWAYS",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("direction");
  });

  it("accepts PRE_CLEANING with no parameters", () => {
    expect(validateProgramStep("PRE_CLEANING", base)).toEqual([]);
  });
});
