import { notFound } from "next/navigation";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getRecipe, listIngredients, listUnits } from "@/lib/queries/recipes";
import { CookingView } from "@/components/cooking/cooking-view";

export default async function CookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { householdId } = await requireHousehold();
  const { locale } = await getI18n();
  const recipe = getRecipe(db, householdId, id);
  if (!recipe) notFound();
  return (
    <CookingView
      recipe={recipe}
      ingredients={listIngredients(db)}
      units={listUnits(db)}
      locale={locale}
    />
  );
}
