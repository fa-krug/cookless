import { BookOpen, Plus, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { listRecipes, listTags } from "@/lib/queries/recipes";
import { getHouseholdAiSettings } from "@/lib/queries/household";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RecipeFilters } from "@/components/recipes/recipe-filters";
import { RecipeList } from "@/components/recipes/recipe-list";

const PAGE = 20;

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { householdId } = await requireHousehold();
  const { locale, t } = await getI18n();

  const list = typeof sp.list === "string" ? sp.list : "KNOWN";
  const q = typeof sp.q === "string" ? sp.q : "";
  const sort = typeof sp.sort === "string" ? sp.sort : "name-asc";
  const tagIds = typeof sp.tags === "string" && sp.tags ? sp.tags.split(",") : [];
  const deletedId = typeof sp.deleted === "string" ? sp.deleted : undefined;
  const highlightId = typeof sp.new === "string" ? sp.new : undefined;

  const allTags = listTags(db, householdId);
  const { aiEnabled, hasKey } = getHouseholdAiSettings(db, householdId);
  const { items, totalCount } = listRecipes(db, householdId, {
    listType: list,
    search: q,
    tagIds,
    sort,
    locale,
    limit: PAGE,
    offset: 0,
  });

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

      {/* RecipeFilters is a client island — pass only serializable props, NO t function */}
      <Card className="p-3">
        <RecipeFilters
          list={list}
          q={q}
          sort={sort}
          tags={tagIds}
          allTags={allTags}
          locale={locale}
        />
      </Card>

      {totalCount === 0 ? (
        q ? (
          <EmptyState
            fill
            icon={Search}
            title={t("recipes.noSearchResults")}
            subtitle={t("recipes.noSearchResultsSubtitle")}
          />
        ) : (
          <EmptyState
            fill
            icon={BookOpen}
            title={t("recipes.noRecipesTitle")}
            subtitle={t("recipes.noRecipesSubtitle")}
            action={
              <Button asChild>
                <Link href={`/recipes/new?list=${list}`}>
                  <Plus size={16} />
                  {t("recipes.addFirstRecipe")}
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <RecipeList
          key={`${list}|${q}|${sort}|${tagIds.join(",")}`}
          initialItems={items}
          totalCount={totalCount}
          list={list}
          q={q}
          sort={sort}
          tags={tagIds}
          locale={locale}
          deletedId={deletedId}
          highlightId={highlightId}
        />
      )}
    </div>
  );
}
