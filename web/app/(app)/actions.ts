"use server";

import { revalidatePath } from "next/cache";
import { withHousehold, type Result } from "@/lib/actions/result";
import { moveRecipe, deleteRecipe } from "@/lib/recipes/mutations";
import { setupMealPlan } from "@/lib/meal-plan/setup";
import { renewIteration, generateNextIteration } from "@/lib/meal-plan/iterations";
import { setupPlanSchema } from "@/lib/schemas/mutations";
import { upsertRecipe, type UpsertRecipeInput } from "@/lib/recipes/upsert";
import { createIngredient } from "@/lib/recipes/ingredients";
import { createTag, updateTag, deleteTag, resetTags } from "@/lib/recipes/tags";
import { AuthError } from "@/lib/auth/errors";
import { setRecipeImage, removeRecipeImage, generateRecipeImageFromAI } from "@/lib/recipes/images";
import { generateGeminiImage } from "@/lib/ai/gemini";
import { bulkCreateRecipes } from "@/lib/recipes/bulk-create";
import { bulkCreateSchema, aiSettingsSchema } from "@/lib/schemas/generate";
import { updateHouseholdSettings } from "@/lib/households/manage";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/images/config";

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

export async function uploadRecipeImageAction(
  recipeId: string,
  formData: FormData,
): Promise<Result<undefined>> {
  const res = await withHousehold(async ({ db, householdId, now }) => {
    const file = formData.get("image");
    if (!(file instanceof File)) throw new AuthError(400, "No file provided");
    if (!ALLOWED_UPLOAD_TYPES.has(file.type)) throw new AuthError(400, "Invalid file type");
    if (file.size > MAX_UPLOAD_BYTES) throw new AuthError(400, "File too large (max 5MB)");
    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      await setRecipeImage(db, householdId, recipeId, bytes, now);
    } catch (e) {
      if (e instanceof AuthError) throw e;
      throw new AuthError(400, "Invalid image file");
    }
    return undefined;
  });
  if (res.ok) {
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
  }
  return res;
}

export async function generateRecipeImageAction(recipeId: string): Promise<Result<undefined>> {
  const res = await withHousehold(async ({ db, householdId, now }) => {
    await generateRecipeImageFromAI(db, householdId, recipeId, now, generateGeminiImage);
    return undefined;
  });
  if (res.ok) {
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
  }
  return res;
}

export async function removeRecipeImageAction(recipeId: string): Promise<Result<undefined>> {
  const res = await withHousehold(({ db, householdId }) => {
    removeRecipeImage(db, householdId, recipeId);
    return undefined;
  });
  if (res.ok) {
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
  }
  return res;
}

export async function bulkCreateRecipesAction(
  input: unknown,
): Promise<Result<{ createdIds: string[] }>> {
  const parsed = bulkCreateSchema.parse(input);
  const res = await withHousehold(({ db, householdId, now }) =>
    bulkCreateRecipes(db, householdId, parsed, now),
  );
  if (res.ok) revalidatePath("/recipes");
  return res;
}

export async function updateAiSettingsAction(input: unknown): Promise<Result<undefined>> {
  const parsed = aiSettingsSchema.parse(input);
  const res = await withHousehold(({ db, householdId, user }) => {
    updateHouseholdSettings(db, user.id, householdId, parsed);
    return undefined;
  });
  if (res.ok) revalidatePath("/settings/ai");
  return res;
}
