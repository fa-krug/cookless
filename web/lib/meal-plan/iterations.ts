// web/lib/meal-plan/iterations.ts
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { type Rng, mulberry32 } from "@/lib/domain/rng";
import { addDays } from "@/lib/domain/dates";
import { computeIterationDates } from "@/lib/domain/meal-plan/iteration-dates";
import { populateIteration } from "./setup";
import { mealPlans, planIterations, mealPlanEntries } from "@/lib/db/schema";

function previousRecipeIds(db: Db, iterationId: string): Set<string> {
  const rows = db
    .select({ recipeId: mealPlanEntries.recipeId })
    .from(mealPlanEntries)
    .where(and(eq(mealPlanEntries.iterationId, iterationId), eq(mealPlanEntries.isLeftover, false)))
    .all();
  return new Set(rows.map((r) => r.recipeId));
}

function ownedIteration(db: Db, householdId: string, iterationId: string) {
  const row = db
    .select({
      id: planIterations.id,
      planId: planIterations.mealPlanId,
      startDate: planIterations.startDate,
      endDate: planIterations.endDate,
    })
    .from(planIterations)
    .innerJoin(mealPlans, eq(planIterations.mealPlanId, mealPlans.id))
    .where(and(eq(planIterations.id, iterationId), eq(mealPlans.householdId, householdId)))
    .get();
  if (!row) throw new AuthError(404, "Iteration not found");
  return row;
}

export function renewIteration(
  db: Db,
  householdId: string,
  iterationId: string,
  rng: Rng = mulberry32((Math.random() * 2 ** 32) >>> 0),
): void {
  const it = ownedIteration(db, householdId, iterationId);
  const exclude = previousRecipeIds(db, iterationId);
  // Entries + shopping lists are replaced inside populateIteration (entries deleted here,
  // shopping lists deleted by generateShoppingListsForIteration).
  db.delete(mealPlanEntries).where(eq(mealPlanEntries.iterationId, iterationId)).run();
  const plan = db.select().from(mealPlans).where(eq(mealPlans.id, it.planId)).get()!;
  populateIteration(db, {
    plan,
    iterationId,
    startDate: it.startDate,
    endDate: it.endDate,
    excludeRecipeIds: exclude,
    rng,
  });
}

export function generateNextIteration(
  db: Db,
  householdId: string,
  now: Date,
  rng: Rng = mulberry32((Math.random() * 2 ** 32) >>> 0),
): { iterationId: string } {
  const plan = db.select().from(mealPlans).where(eq(mealPlans.householdId, householdId)).get();
  if (!plan) throw new AuthError(404, "No meal plan");

  const prev = db
    .select()
    .from(planIterations)
    .where(eq(planIterations.mealPlanId, plan.id))
    .orderBy(desc(planIterations.startDate))
    .get();

  let nextStart: string;
  if (prev) {
    db.update(planIterations).set({ status: "ARCHIVED" }).where(eq(planIterations.id, prev.id)).run();
    nextStart = addDays(prev.endDate, 1);
  } else {
    nextStart = now.toISOString().slice(0, 10);
  }

  const { start, end } = computeIterationDates(nextStart, plan.iterationWeeks);
  const iterationId = randomUUID();
  db.insert(planIterations)
    .values({
      id: iterationId,
      mealPlanId: plan.id,
      startDate: start,
      endDate: end,
      status: "ACTIVE",
      createdAt: now,
    })
    .run();

  const exclude = prev ? previousRecipeIds(db, prev.id) : new Set<string>();
  populateIteration(db, { plan, iterationId, startDate: start, endDate: end, excludeRecipeIds: exclude, rng });

  return { iterationId };
}
