// web/lib/shopping/items.ts
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { shoppingListItems, shoppingLists, planIterations, mealPlans } from "@/lib/db/schema";

/** Returns the set of item ids (from `candidateIds`) that belong to `householdId`. */
function ownedItemIds(db: Db, householdId: string, candidateIds: string[]): Set<string> {
  if (candidateIds.length === 0) return new Set();
  const rows = db
    .select({ id: shoppingListItems.id })
    .from(shoppingListItems)
    .innerJoin(shoppingLists, eq(shoppingListItems.shoppingListId, shoppingLists.id))
    .innerJoin(planIterations, eq(shoppingLists.iterationId, planIterations.id))
    .innerJoin(mealPlans, eq(planIterations.mealPlanId, mealPlans.id))
    .where(and(inArray(shoppingListItems.id, candidateIds), eq(mealPlans.householdId, householdId)))
    .all();
  return new Set(rows.map((r) => r.id));
}

export function toggleShoppingItem(db: Db, householdId: string, itemId: string): boolean {
  if (!ownedItemIds(db, householdId, [itemId]).has(itemId)) {
    throw new AuthError(404, "Item not found");
  }
  const current = db
    .select({ isChecked: shoppingListItems.isChecked })
    .from(shoppingListItems)
    .where(eq(shoppingListItems.id, itemId))
    .get();
  if (current === undefined) {
    throw new AuthError(404, "Item not found");
  }
  const next = !current.isChecked;
  db.update(shoppingListItems).set({ isChecked: next }).where(eq(shoppingListItems.id, itemId)).run();
  return next;
}

export function setShoppingItemsChecked(
  db: Db,
  householdId: string,
  itemIds: string[],
  isChecked: boolean,
): number {
  const owned = [...ownedItemIds(db, householdId, itemIds)];
  if (owned.length === 0) return 0;
  db.update(shoppingListItems)
    .set({ isChecked })
    .where(inArray(shoppingListItems.id, owned))
    .run();
  return owned.length;
}
