import { describe, expect, it } from "vitest";
import { daysBetween } from "../dates";
import { mulberry32 } from "../rng";
import { assignSchedule, type ScheduleRecipe } from "./schedule";

function recipes(n: number, leftoverDays: number | null): ScheduleRecipe[] {
  return Array.from({ length: n }, (_, i) => ({ id: `r-${i}`, leftoverDays }));
}

const START = "2026-03-02"; // Monday

describe("assignSchedule", () => {
  it("fills every day in the iteration", () => {
    const entries = assignSchedule({
      recipes: recipes(5, 1),
      fallbackRecipes: recipes(5, 1),
      startDate: START,
      days: 7,
      servings: 2,
      defaultLeftoverDays: 1,
      rng: mulberry32(1),
    });
    const dates = new Set(entries.map((e) => e.date));
    expect(dates.size).toBe(7);
  });

  it("places every leftover 2+ days after its cooking entry", () => {
    const entries = assignSchedule({
      recipes: recipes(4, 2),
      fallbackRecipes: recipes(4, 2),
      startDate: START,
      days: 14,
      servings: 2,
      defaultLeftoverDays: 1,
      rng: mulberry32(2),
    });
    for (const e of entries) {
      if (e.isLeftover) {
        expect(e.sourceDate).not.toBeNull();
        expect(daysBetween(e.sourceDate!, e.date)).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("produces no leftovers when leftover_days is 0", () => {
    const entries = assignSchedule({
      recipes: recipes(8, 0),
      fallbackRecipes: recipes(8, 0),
      startDate: START,
      days: 7,
      servings: 2,
      defaultLeftoverDays: 1,
      rng: mulberry32(3),
    });
    expect(entries.filter((e) => e.isLeftover)).toHaveLength(0);
  });

  it("uses default_leftover_days when a recipe's leftover_days is null", () => {
    const entries = assignSchedule({
      recipes: recipes(5, null),
      fallbackRecipes: recipes(5, null),
      startDate: START,
      days: 14,
      servings: 2,
      defaultLeftoverDays: 2,
      rng: mulberry32(4),
    });
    // Each cooking entry yields at most defaultLeftoverDays (2) leftovers.
    const cookDates = entries.filter((e) => !e.isLeftover).map((e) => e.date);
    for (const cookDate of cookDates) {
      const count = entries.filter((e) => e.isLeftover && e.sourceDate === cookDate).length;
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it("is deterministic for a fixed seed", () => {
    const args = {
      recipes: recipes(5, 1),
      fallbackRecipes: recipes(5, 1),
      startDate: START,
      days: 7,
      servings: 2,
      defaultLeftoverDays: 1,
    };
    const a = assignSchedule({ ...args, rng: mulberry32(7) });
    const b = assignSchedule({ ...args, rng: mulberry32(7) });
    expect(a).toEqual(b);
  });
});
