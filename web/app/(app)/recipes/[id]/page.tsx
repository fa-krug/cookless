import { notFound } from "next/navigation";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getRecipe, listIngredients, listUnits } from "@/lib/queries/recipes";
import { getHouseholdAiSettings } from "@/lib/queries/household";
import { RecipeDetail } from "@/components/recipes/recipe-detail";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { householdId } = await requireHousehold();
  const { locale, t } = await getI18n();

  const recipe = getRecipe(db, householdId, id);
  if (!recipe) notFound();

  const { aiEnabled } = getHouseholdAiSettings(db, householdId);
  const ingredientsById = new Map(listIngredients(db).map((i) => [i.id, i]));
  const unitsById = new Map(listUnits(db).map((u) => [u.id, u]));

  return (
    <RecipeDetail
      recipe={recipe}
      ingredientsById={ingredientsById}
      unitsById={unitsById}
      locale={locale}
      t={t}
      aiEnabled={aiEnabled}
    />
  );
}
