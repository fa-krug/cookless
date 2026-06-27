import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import {
  mealPlanEntries, mealPlanExcludedTags, mealPlans, planIterations, recipes,
  shoppingListItems, shoppingLists,
} from "@/lib/db/schema";

export interface PlanEntryDto {
  id: string; date: string; mealType: string; recipeId: string; recipeTitle: string;
  servings: number; isLeftover: boolean; sourceEntryId: string | null; isLocked: boolean;
}
export interface PlanShoppingListDto { id: string; shoppingDate: string | null; itemCount: number }
export interface PlanIterationDto {
  id: string; startDate: string; endDate: string; status: string;
  entries: PlanEntryDto[]; shoppingLists: PlanShoppingListDto[]; createdAt: Date;
}
export interface MealPlanView {
  id: string; iterationWeeks: number; shoppingDays: number[]; servings: number;
  knownRatio: string; defaultLeftoverDays: number; excludedTagIds: string[];
  iterations: PlanIterationDto[]; createdAt: Date;
}

export function getMealPlanView(db: Db, householdId: string): MealPlanView | null {
  const plan = db.select().from(mealPlans).where(eq(mealPlans.householdId, householdId)).get();
  if (!plan) return null;

  const excludedTagIds = db
    .select({ tagId: mealPlanExcludedTags.tagId })
    .from(mealPlanExcludedTags)
    .where(eq(mealPlanExcludedTags.mealPlanId, plan.id))
    .all()
    .map((r) => r.tagId);

  const iterationRows = db
    .select()
    .from(planIterations)
    .where(eq(planIterations.mealPlanId, plan.id))
    .all();
  const iterationIds = iterationRows.map((i) => i.id);

  const entryRows = iterationIds.length
    ? db
        .select({
          id: mealPlanEntries.id, iterationId: mealPlanEntries.iterationId, date: mealPlanEntries.date,
          mealType: mealPlanEntries.mealType, recipeId: mealPlanEntries.recipeId,
          recipeTitle: recipes.title, servings: mealPlanEntries.servings,
          isLeftover: mealPlanEntries.isLeftover, sourceEntryId: mealPlanEntries.sourceEntryId,
          isLocked: mealPlanEntries.isLocked,
        })
        .from(mealPlanEntries)
        .innerJoin(recipes, eq(recipes.id, mealPlanEntries.recipeId))
        .where(inArray(mealPlanEntries.iterationId, iterationIds))
        .orderBy(asc(mealPlanEntries.date))
        .all()
    : [];
  const entriesByIteration = new Map<string, PlanEntryDto[]>();
  for (const e of entryRows) {
    const list = entriesByIteration.get(e.iterationId) ?? [];
    list.push({
      id: e.id, date: e.date, mealType: e.mealType, recipeId: e.recipeId, recipeTitle: e.recipeTitle,
      servings: e.servings, isLeftover: e.isLeftover, sourceEntryId: e.sourceEntryId, isLocked: e.isLocked,
    });
    entriesByIteration.set(e.iterationId, list);
  }

  const listRows = iterationIds.length
    ? db
        .select({
          id: shoppingLists.id, iterationId: shoppingLists.iterationId,
          shoppingDate: shoppingLists.shoppingDate,
          itemCount: sql<number>`count(${shoppingListItems.id})`,
        })
        .from(shoppingLists)
        .leftJoin(shoppingListItems, eq(shoppingListItems.shoppingListId, shoppingLists.id))
        .where(inArray(shoppingLists.iterationId, iterationIds))
        .groupBy(shoppingLists.id)
        .all()
    : [];
  const listsByIteration = new Map<string, PlanShoppingListDto[]>();
  for (const l of listRows) {
    const list = listsByIteration.get(l.iterationId) ?? [];
    list.push({ id: l.id, shoppingDate: l.shoppingDate, itemCount: l.itemCount });
    listsByIteration.set(l.iterationId, list);
  }

  const iterations: PlanIterationDto[] = iterationRows
    .map((i) => ({
      id: i.id, startDate: i.startDate, endDate: i.endDate, status: i.status,
      entries: entriesByIteration.get(i.id) ?? [],
      shoppingLists: listsByIteration.get(i.id) ?? [],
      createdAt: i.createdAt,
    }))
    .sort((a, b) => {
      // ACTIVE first, then startDate descending
      if (a.status !== b.status) return a.status === "ACTIVE" ? -1 : 1;
      return a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0;
    });

  const shoppingDays = [plan.shoppingDay1, plan.shoppingDay2].filter(
    (d): d is number => d !== null && d !== undefined,
  );

  return {
    id: plan.id, iterationWeeks: plan.iterationWeeks, shoppingDays, servings: plan.servings,
    knownRatio: plan.knownRatio, defaultLeftoverDays: plan.defaultLeftoverDays, excludedTagIds,
    iterations, createdAt: plan.createdAt,
  };
}
