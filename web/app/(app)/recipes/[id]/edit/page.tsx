import { notFound } from "next/navigation";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getRecipe, listIngredients, listUnits, listTags } from "@/lib/queries/recipes";
import { RecipeEditor } from "@/components/recipes/recipe-editor";
import { toInitialValues } from "@/components/recipes/editor/to-initial-values";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { householdId } = await requireHousehold();
  const { locale } = await getI18n();

  const recipe = getRecipe(db, householdId, id);
  if (!recipe) notFound();

  return (
    <RecipeEditor
      mode="edit"
      recipeId={recipe.id}
      listType={recipe.listType as "KNOWN" | "TO_TRY"}
      initialValues={toInitialValues(recipe)}
      ingredients={listIngredients(db)}
      units={listUnits(db)}
      tags={listTags(db, householdId)}
      locale={locale}
    />
  );
}
