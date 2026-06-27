import { addDays, daysBetween } from "../dates";
import { type Rng, shuffle } from "../rng";

export interface ScheduleRecipe {
  id: string;
  leftoverDays: number | null;
}

export interface PlannedEntry {
  date: string;
  recipeId: string;
  servings: number;
  isLeftover: boolean;
  sourceDate: string | null;
}

/**
 * Assign recipes to LUNCH slots, spreading leftovers non-consecutively.
 * Port of planner/services.py _assign_schedule_lunch_only.
 */
export function assignSchedule(opts: {
  recipes: ScheduleRecipe[];
  fallbackRecipes: ScheduleRecipe[];
  startDate: string;
  days: number;
  servings: number;
  defaultLeftoverDays: number;
  rng: Rng;
}): PlannedEntry[] {
  const { startDate, days, servings, defaultLeftoverDays, rng } = opts;
  const dates = Array.from({ length: days }, (_, i) => addDays(startDate, i));
  const assigned = new Set<string>();
  const entries: PlannedEntry[] = [];

  const recipes = shuffle(rng, opts.recipes);

  for (const recipe of recipes) {
    const leftoverCount = recipe.leftoverDays ?? defaultLeftoverDays;

    // Find the first free date for cooking.
    const cookDate = dates.find((d) => !assigned.has(d));
    if (cookDate === undefined) break;

    entries.push({
      date: cookDate,
      recipeId: recipe.id,
      servings,
      isLeftover: false,
      sourceDate: null,
    });
    assigned.add(cookDate);

    // Place leftovers: 2+ days after cooking, 2+ days apart.
    let placed = 0;
    let lastPlaced = cookDate;
    for (const d of dates) {
      if (placed >= leftoverCount) break;
      if (assigned.has(d)) continue;
      if (daysBetween(cookDate, d) < 2) continue;
      if (daysBetween(lastPlaced, d) < 2) continue;
      entries.push({
        date: d,
        recipeId: recipe.id,
        servings,
        isLeftover: true,
        sourceDate: cookDate,
      });
      assigned.add(d);
      lastPlaced = d;
      placed += 1;
    }
  }

  // Fill remaining dates with fallback recipes.
  const emptyDates = dates.filter((d) => !assigned.has(d));
  if (emptyDates.length > 0) {
    const pool = shuffle(rng, opts.fallbackRecipes);
    if (pool.length > 0) {
      const repeats = Math.floor(emptyDates.length / pool.length) + 1;
      const cycle: ScheduleRecipe[] = [];
      for (let i = 0; i < repeats; i++) cycle.push(...pool);
      emptyDates.forEach((d, i) => {
        if (i < cycle.length) {
          entries.push({
            date: d,
            recipeId: cycle[i].id,
            servings,
            isLeftover: false,
            sourceDate: null,
          });
        }
      });
    }
  }

  return entries;
}
