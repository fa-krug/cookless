import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { listIngredients, listUnits, listTags } from "@/lib/queries/recipes";
import { RecipeEditor } from "@/components/recipes/recipe-editor";

export default async function NewRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const { list } = await searchParams;
  const { householdId } = await requireHousehold();
  const { locale } = await getI18n();
  const listType = list === "KNOWN" ? "KNOWN" : "TO_TRY";

  return (
    <RecipeEditor
      mode="create"
      recipeId={null}
      listType={listType}
      ingredients={listIngredients(db)}
      units={listUnits(db)}
      tags={listTags(db, householdId)}
      locale={locale}
    />
  );
}
