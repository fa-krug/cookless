// web/lib/shopping/generate.ts
import { randomUUID } from "node:crypto";
import { and, eq, gte, lte } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { computeShoppingSegments } from "@/lib/domain/meal-plan/iteration-dates";
import { aggregateShoppingItems, type ShoppingEntry } from "@/lib/domain/shopping/aggregate";
import type { DomainUnit } from "@/lib/domain/shopping/units";
import {
  mealPlanEntries, recipes, recipeIngredients, units, shoppingLists, shoppingListItems,
} from "@/lib/db/schema";

interface GenerateOpts {
  iterationId: string;
  startDate: string;
  endDate: string;
  shoppingDays: readonly number[];
  servings: number;
}

export function generateShoppingListsForIteration(db: Db, opts: GenerateOpts): void {
  const { iterationId, startDate, endDate, shoppingDays, servings } = opts;

  // Wipe existing lists (items cascade via FK).
  db.delete(shoppingLists).where(eq(shoppingLists.iterationId, iterationId)).run();

  // Preload all units once → DomainUnit map for conversion.
  const unitRows = db.select().from(units).all();
  const unitMap = new Map<number, DomainUnit>(
    unitRows.map((u) => [u.id, { id: u.id, baseUnitId: u.baseUnitId, conversionFactor: u.conversionFactor }]),
  );

  const segments = computeShoppingSegments(startDate, endDate, [...shoppingDays]);
  const createdAt = new Date();

  for (const seg of segments) {
    // Non-leftover lunch entries within the segment date range.
    const entries = db
      .select({
        recipeId: mealPlanEntries.recipeId,
        servings: mealPlanEntries.servings,
        defaultServings: recipes.defaultServings,
      })
      .from(mealPlanEntries)
      .innerJoin(recipes, eq(mealPlanEntries.recipeId, recipes.id))
      .where(
        and(
          eq(mealPlanEntries.iterationId, iterationId),
          eq(mealPlanEntries.isLeftover, false),
          gte(mealPlanEntries.date, seg.segStart),
          lte(mealPlanEntries.date, seg.segEnd),
        ),
      )
      .all();

    const shoppingEntries: ShoppingEntry[] = entries.map((e) => {
      const ings = db
        .select({ ingredientId: recipeIngredients.ingredientId, quantity: recipeIngredients.quantity, unitId: recipeIngredients.unitId })
        .from(recipeIngredients)
        .where(eq(recipeIngredients.recipeId, e.recipeId))
        .all();
      return {
        servings,
        defaultServings: e.defaultServings,
        isLeftover: false,
        ingredients: ings.map((ri) => ({
          ingredientId: ri.ingredientId,
          quantity: ri.quantity,
          unit: unitMap.get(ri.unitId)!,
        })),
      };
    });

    const aggregated = aggregateShoppingItems(shoppingEntries);
    if (aggregated.length === 0) continue;

    const listId = randomUUID();
    db.insert(shoppingLists).values({
      id: listId, iterationId, shoppingDate: seg.shoppingDate, createdAt,
    }).run();
    db.insert(shoppingListItems).values(
      aggregated.map((a) => ({
        id: randomUUID(),
        shoppingListId: listId,
        ingredientId: a.ingredientId,
        quantity: a.quantity.toString(),
        unitId: a.unitId,
        isChecked: false,
      })),
    ).run();
  }
}
