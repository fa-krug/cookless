"use server";

import { revalidatePath } from "next/cache";
import { withHousehold, type Result } from "@/lib/actions/result";
import { toggleShoppingItem, setShoppingItemsChecked } from "@/lib/shopping/items";
import { moveRecipe, deleteRecipe } from "@/lib/recipes/mutations";
import { setupMealPlan } from "@/lib/meal-plan/setup";
import { renewIteration, generateNextIteration } from "@/lib/meal-plan/iterations";
import { setupPlanSchema } from "@/lib/schemas/mutations";

export async function toggleShoppingItemAction(itemId: string): Promise<Result<boolean>> {
  const res = await withHousehold(({ db, householdId }) =>
    toggleShoppingItem(db, householdId, itemId),
  );
  if (res.ok) revalidatePath("/shopping");
  return res;
}

export async function uncheckAllShoppingAction(itemIds: string[]): Promise<Result<number>> {
  const res = await withHousehold(({ db, householdId }) =>
    setShoppingItemsChecked(db, householdId, itemIds, false),
  );
  if (res.ok) revalidatePath("/shopping");
  return res;
}

export async function moveRecipeAction(recipeId: string): Promise<Result<"KNOWN" | "TO_TRY">> {
  const res = await withHousehold(({ db, householdId, now }) =>
    moveRecipe(db, householdId, recipeId, now),
  );
  if (res.ok) {
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
  }
  return res;
}

export async function deleteRecipeAction(recipeId: string): Promise<Result<undefined>> {
  const res = await withHousehold(({ db, householdId }) => {
    deleteRecipe(db, householdId, recipeId);
    return undefined;
  });
  if (res.ok) revalidatePath("/recipes");
  return res;
}

export async function setupPlanAction(input: unknown): Promise<Result<{ iterationId: string }>> {
  const parsed = setupPlanSchema.parse(input);
  const res = await withHousehold(({ db, householdId, now }) =>
    setupMealPlan(db, householdId, parsed, now),
  );
  if (res.ok) {
    revalidatePath("/plan");
    revalidatePath("/shopping");
  }
  return res;
}

export async function renewIterationAction(iterationId: string): Promise<Result<undefined>> {
  const res = await withHousehold(({ db, householdId }) => {
    renewIteration(db, householdId, iterationId);
    return undefined;
  });
  if (res.ok) {
    revalidatePath("/plan");
    revalidatePath("/shopping");
  }
  return res;
}

export async function nextIterationAction(): Promise<Result<{ iterationId: string }>> {
  const res = await withHousehold(({ db, householdId, now }) =>
    generateNextIteration(db, householdId, now),
  );
  if (res.ok) {
    revalidatePath("/plan");
    revalidatePath("/shopping");
  }
  return res;
}
