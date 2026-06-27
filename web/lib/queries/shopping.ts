import { asc, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import {
  ingredients, mealPlans, planIterations, shoppingListItems, shoppingLists, units,
} from "@/lib/db/schema";

export interface ShoppingItemDto {
  id: string; ingredientName: string; category: string;
  quantity: string; unitAbbreviation: string; isChecked: boolean;
}
export interface ShoppingListView {
  id: string; shoppingDate: string | null; createdAt: Date; items: ShoppingItemDto[];
}

export function getLatestShoppingList(
  db: Db, householdId: string, locale: "en" | "de",
): ShoppingListView | null {
  const list = db
    .select({ id: shoppingLists.id, shoppingDate: shoppingLists.shoppingDate, createdAt: shoppingLists.createdAt })
    .from(shoppingLists)
    .innerJoin(planIterations, eq(planIterations.id, shoppingLists.iterationId))
    .innerJoin(mealPlans, eq(mealPlans.id, planIterations.mealPlanId))
    .where(eq(mealPlans.householdId, householdId))
    .orderBy(desc(shoppingLists.createdAt))
    .get();
  if (!list) return null;

  const itemRows = db
    .select({
      id: shoppingListItems.id, category: ingredients.category,
      nameEn: ingredients.nameEn, nameDe: ingredients.nameDe,
      quantity: shoppingListItems.quantity, unitAbbreviation: units.abbreviation,
      isChecked: shoppingListItems.isChecked,
    })
    .from(shoppingListItems)
    .innerJoin(ingredients, eq(ingredients.id, shoppingListItems.ingredientId))
    .innerJoin(units, eq(units.id, shoppingListItems.unitId))
    .where(eq(shoppingListItems.shoppingListId, list.id))
    .orderBy(asc(locale === "de" ? ingredients.nameDe : ingredients.nameEn))
    .all();

  return {
    id: list.id, shoppingDate: list.shoppingDate, createdAt: list.createdAt,
    items: itemRows.map((r) => ({
      id: r.id, ingredientName: locale === "de" ? r.nameDe : r.nameEn, category: r.category,
      quantity: r.quantity, unitAbbreviation: r.unitAbbreviation, isChecked: r.isChecked,
    })),
  };
}
