import { BookOpen, Plus, Search } from "lucide-react";
import Link from "next/link";
import type { TVars } from "@/lib/i18n/translate";
import { db } from "@/lib/db";
import { listRecipes, listTags } from "@/lib/queries/recipes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RecipeFilters } from "@/components/recipes/recipe-filters";
import { RecipeList } from "@/components/recipes/recipe-list";

const PAGE = 20;

type RecipesSectionProps = {
  householdId: string;
  locale: "en" | "de";
  t: (key: string, vars?: TVars) => string;
  list: string;
  q: string;
  sort: string;
  tagIds: string[];
  deletedId?: string;
  highlightId?: string;
};

/**
 * Async server component holding the recipes' data queries. Rendered inside a
 * <Suspense> boundary so the page shell paints immediately and this list
 * streams in once the queries resolve.
 */
export async function RecipesSection({
  householdId,
  locale,
  t,
  list,
  q,
  sort,
  tagIds,
  deletedId,
  highlightId,
}: RecipesSectionProps) {
  const allTags = listTags(db, householdId);
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
    <>
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
    </>
  );
}
