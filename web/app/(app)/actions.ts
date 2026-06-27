"use server";

import { revalidatePath } from "next/cache";
import { withHousehold, type Result } from "@/lib/actions/result";
import { toggleShoppingItem, setShoppingItemsChecked } from "@/lib/shopping/items";
import { moveRecipe, deleteRecipe } from "@/lib/recipes/mutations";
import { setupMealPlan } from "@/lib/meal-plan/setup";
import { renewIteration, generateNextIteration } from "@/lib/meal-plan/iterations";
import { setupPlanSchema } from "@/lib/schemas/mutations";
import { upsertRecipe, type UpsertRecipeInput } from "@/lib/recipes/upsert";
import { createIngredient } from "@/lib/recipes/ingredients";
import { createTag, updateTag, deleteTag, resetTags } from "@/lib/recipes/tags";

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

export async function saveRecipeAction(
  recipeId: string | null,
  input: UpsertRecipeInput,
): Promise<Result<{ id: string }>> {
  const res = await withHousehold(({ db, householdId, now }) =>
    upsertRecipe(db, householdId, recipeId, input, now),
  );
  if (res.ok) {
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${res.data.id}`);
  }
  return res;
}

export async function createIngredientAction(
  input: { nameEn: string; nameDe: string; category?: string },
): Promise<Result<{ id: number }>> {
  return withHousehold(({ db }) => createIngredient(db, input));
}

export async function createTagAction(
  input: { category: string; nameEn: string; nameDe: string },
): Promise<Result<{ id: string }>> {
  const res = await withHousehold(({ db, householdId }) => createTag(db, householdId, input));
  if (res.ok) {
    revalidatePath("/settings/tags");
    revalidatePath("/recipes");
  }
  return res;
}

export async function updateTagAction(
  tagId: string,
  input: { nameEn: string; nameDe: string },
): Promise<Result<undefined>> {
  const res = await withHousehold(({ db, householdId }) => {
    updateTag(db, householdId, tagId, input);
    return undefined;
  });
  if (res.ok) {
    revalidatePath("/settings/tags");
    revalidatePath("/recipes");
  }
  return res;
}

export async function deleteTagAction(tagId: string): Promise<Result<undefined>> {
  const res = await withHousehold(({ db, householdId }) => {
    deleteTag(db, householdId, tagId);
    return undefined;
  });
  if (res.ok) {
    revalidatePath("/settings/tags");
    revalidatePath("/recipes");
  }
  return res;
}

export async function resetTagsAction(): Promise<Result<undefined>> {
  const res = await withHousehold(({ db, householdId }) => {
    resetTags(db, householdId);
    return undefined;
  });
  if (res.ok) {
    revalidatePath("/settings/tags");
    revalidatePath("/recipes");
  }
  return res;
}
