// web/lib/meal-plan/setup.ts
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { type Rng, mulberry32 } from "@/lib/domain/rng";
import {
  selectRecipes, type SelectableRecipe,
} from "@/lib/domain/meal-plan/selection";
import { assignSchedule, type ScheduleRecipe } from "@/lib/domain/meal-plan/schedule";
import { validateShoppingDays, computeIterationDates } from "@/lib/domain/meal-plan/iteration-dates";
import { generateShoppingListsForIteration } from "@/lib/shopping/generate";
import {
  mealPlans, mealPlanExcludedTags, planIterations, mealPlanEntries,
  recipes, recipeIngredients, recipeTags,
} from "@/lib/db/schema";

export interface SetupPlanInput {
  iterationWeeks: number;
  shoppingDays: number[];
  servings: number;
  knownRatio: number;
  defaultLeftoverDays: number;
  excludedTagIds: string[];
}

export interface PoolRecipe {
  id: string;
  ingredientIds: number[];
  leftoverDays: number | null;
}

type PlanRow = typeof mealPlans.$inferSelect;

export function loadSelectablePools(
  db: Db,
  householdId: string,
  excludedTagIds: string[],
): { known: PoolRecipe[]; tryList: PoolRecipe[]; all: PoolRecipe[] } {
  const recRows = db
    .select({ id: recipes.id, listType: recipes.listType, leftoverDays: recipes.leftoverDays })
    .from(recipes)
    .where(eq(recipes.householdId, householdId))
    .all();

  // recipe -> ingredientIds
  const ingRows = db
    .select({ recipeId: recipeIngredients.recipeId, ingredientId: recipeIngredients.ingredientId })
    .from(recipeIngredients)
    .all();
  const ingByRecipe = new Map<string, number[]>();
  for (const r of ingRows) {
    const arr = ingByRecipe.get(r.recipeId) ?? [];
    arr.push(r.ingredientId);
    ingByRecipe.set(r.recipeId, arr);
  }

  // recipes carrying any excluded tag
  const excluded = new Set<string>();
  if (excludedTagIds.length > 0) {
    const tagRows = db
      .select({ recipeId: recipeTags.recipeId })
      .from(recipeTags)
      .where(inArray(recipeTags.tagId, excludedTagIds))
      .all();
    for (const t of tagRows) excluded.add(t.recipeId);
  }

  const known: PoolRecipe[] = [];
  const tryList: PoolRecipe[] = [];
  const all: PoolRecipe[] = [];
  for (const r of recRows) {
    const pr: PoolRecipe = { id: r.id, ingredientIds: ingByRecipe.get(r.id) ?? [], leftoverDays: r.leftoverDays };
    all.push(pr); // every household recipe, regardless of tag/listType (A1 gap-fill pool)
    if (excluded.has(r.id)) continue;
    if (r.listType === "KNOWN") known.push(pr);
    else if (r.listType === "TO_TRY") tryList.push(pr);
  }
  return { known, tryList, all };
}

function daysBetween(startDate: string, endDate: string): number {
  // inclusive day count
  const a = new Date(startDate + "T00:00:00Z").getTime();
  const b = new Date(endDate + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

export function populateIteration(
  db: Db,
  args: {
    plan: PlanRow;
    iterationId: string;
    startDate: string;
    endDate: string;
    excludeRecipeIds: Set<string>;
    rng: Rng;
  },
): void {
  const { plan, iterationId, startDate, endDate, excludeRecipeIds, rng } = args;
  const days = daysBetween(startDate, endDate);
  const excludedTagIds = db
    .select({ tagId: mealPlanExcludedTags.tagId })
    .from(mealPlanExcludedTags)
    .where(eq(mealPlanExcludedTags.mealPlanId, plan.id))
    .all()
    .map((r) => r.tagId);

  const { known, tryList, all } = loadSelectablePools(db, plan.householdId, excludedTagIds);

  const selected = selectRecipes({
    known: known.map((r): SelectableRecipe => ({ id: r.id, ingredientIds: r.ingredientIds })),
    tryList: tryList.map((r): SelectableRecipe => ({ id: r.id, ingredientIds: r.ingredientIds })),
    days,
    knownRatio: Number(plan.knownRatio),
    defaultLeftoverDays: plan.defaultLeftoverDays,
    excludeIds: excludeRecipeIds,
    rng,
  });

  // leftoverDays lookup for scheduling (all recipes, so any id resolves)
  const leftoverById = new Map<string, number | null>(all.map((r) => [r.id, r.leftoverDays]));
  const scheduleRecipes: ScheduleRecipe[] = selected.map((r) => ({
    id: r.id,
    leftoverDays: leftoverById.get(r.id) ?? null,
  }));

  // A1: fill empty days from OTHER household recipes for variety (Django parity:
  // planner/services.py _assign_schedule_lunch_only). Fall back to all recipes
  // only when the "others" pool is empty. Excluded tags are intentionally NOT
  // applied here, matching Django.
  const selectedIds = new Set(selected.map((r) => r.id));
  const others = all.filter((r) => !selectedIds.has(r.id));
  const fallbackPool = others.length > 0 ? others : all;
  const fallbackRecipes: ScheduleRecipe[] = fallbackPool.map((r) => ({
    id: r.id,
    leftoverDays: r.leftoverDays,
  }));

  const planned = assignSchedule({
    recipes: scheduleRecipes,
    fallbackRecipes, // A1: other-recipe variety pool, not the selected set
    startDate,
    days,
    servings: plan.servings,
    defaultLeftoverDays: plan.defaultLeftoverDays,
    rng,
  });

  // Pre-assign an id per date so leftover sourceDate -> sourceEntryId resolves in one pass.
  const idByDate = new Map<string, string>();
  for (const p of planned) idByDate.set(p.date, randomUUID());

  if (planned.length > 0) {
    db.insert(mealPlanEntries).values(
      planned.map((p) => ({
        id: idByDate.get(p.date)!,
        iterationId,
        date: p.date,
        mealType: "LUNCH" as const,
        recipeId: p.recipeId,
        servings: p.servings,
        isLeftover: p.isLeftover,
        sourceEntryId: p.sourceDate ? (idByDate.get(p.sourceDate) ?? null) : null,
        isLocked: false,
      })),
    ).run();
  }

  const shoppingDays = [plan.shoppingDay1, plan.shoppingDay2].filter((d): d is number => d != null);
  generateShoppingListsForIteration(db, {
    iterationId, startDate, endDate, shoppingDays,
  });
}

export function setupMealPlan(
  db: Db,
  householdId: string,
  input: SetupPlanInput,
  now: Date,
  rng: Rng = mulberry32((Math.random() * 2 ** 32) >>> 0),
): { iterationId: string } {
  try {
    validateShoppingDays(input.shoppingDays);
  } catch (e) {
    throw new AuthError(422, e instanceof Error ? e.message : "Invalid shopping days");
  }

  const [day1, day2] = input.shoppingDays;
  // Upsert the single per-household plan.
  const existing = db.select().from(mealPlans).where(eq(mealPlans.householdId, householdId)).get();
  const planValues = {
    iterationWeeks: input.iterationWeeks,
    shoppingDay1: day1,
    shoppingDay2: day2 ?? null,
    servings: input.servings,
    knownRatio: String(input.knownRatio),
    defaultLeftoverDays: input.defaultLeftoverDays,
  };
  let planId: string;
  if (existing) {
    planId = existing.id;
    db.update(mealPlans).set(planValues).where(eq(mealPlans.id, planId)).run();
  } else {
    planId = randomUUID();
    db.insert(mealPlans).values({ id: planId, householdId, createdAt: now, ...planValues }).run();
  }

  // Reset excluded tags.
  db.delete(mealPlanExcludedTags).where(eq(mealPlanExcludedTags.mealPlanId, planId)).run();
  if (input.excludedTagIds.length > 0) {
    db.insert(mealPlanExcludedTags).values(
      input.excludedTagIds.map((tagId) => ({ mealPlanId: planId, tagId })),
    ).run();
  }

  // Reset iterations (entries + shopping lists cascade via FK).
  db.delete(planIterations).where(eq(planIterations.mealPlanId, planId)).run();

  const today = now.toISOString().slice(0, 10);
  const { start, end } = computeIterationDates(today, input.iterationWeeks);
  const iterationId = randomUUID();
  db.insert(planIterations).values({
    id: iterationId, mealPlanId: planId, startDate: start, endDate: end, status: "ACTIVE", createdAt: now,
  }).run();

  const plan = db.select().from(mealPlans).where(eq(mealPlans.id, planId)).get()!;
  populateIteration(db, { plan, iterationId, startDate: start, endDate: end, excludeRecipeIds: new Set(), rng });

  return { iterationId };
}
