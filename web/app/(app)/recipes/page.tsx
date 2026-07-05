import { Suspense } from "react";
import { Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getHouseholdAiSettings } from "@/lib/queries/household";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RecipeListSkeleton } from "@/components/recipes/recipe-list-skeleton";
import { RecipesSection } from "./recipes-section";

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { householdId } = await requireHousehold();
  const { locale, t } = await getI18n();
  const { aiEnabled, hasKey } = getHouseholdAiSettings(db, householdId);

  const list = typeof sp.list === "string" ? sp.list : "KNOWN";
  const q = typeof sp.q === "string" ? sp.q : "";
  const sort = typeof sp.sort === "string" ? sp.sort : "name-asc";
  const tagIds = typeof sp.tags === "string" && sp.tags ? sp.tags.split(",") : [];
  const deletedId = typeof sp.deleted === "string" ? sp.deleted : undefined;
  const highlightId = typeof sp.new === "string" ? sp.new : undefined;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("recipes.title")}</h1>
        <div className="flex items-center gap-2">
          {aiEnabled && hasKey && (
            <Button asChild size="sm" variant="outline">
              <Link href="/recipes/generate">
                <Sparkles size={16} />
                {t("generateRecipes.button")}
              </Link>
            </Button>
          )}
          <Button asChild size="sm">
            <Link href={`/recipes/new?list=${list}`}>
              <Plus size={16} />
              {t("recipes.addRecipe")}
            </Link>
          </Button>
        </div>
      </div>

      <Suspense
        key={`${list}|${q}|${sort}|${tagIds.join(",")}`}
        fallback={
          <>
            <Skeleton className="h-12 w-full rounded-xl" />
            <RecipeListSkeleton />
          </>
        }
      >
        <RecipesSection
          householdId={householdId}
          locale={locale}
          t={t}
          list={list}
          q={q}
          sort={sort}
          tagIds={tagIds}
          deletedId={deletedId}
          highlightId={highlightId}
        />
      </Suspense>
    </div>
  );
}
