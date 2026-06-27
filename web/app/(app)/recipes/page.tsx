import { BookOpen, Search } from "lucide-react";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { listRecipes, listTags, type RecipeSummary } from "@/lib/queries/recipes";
import { EmptyState } from "@/components/ui/empty-state";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { RecipeFilters } from "@/components/recipes/recipe-filters";

const PAGE = 20;

function sortItems(items: RecipeSummary[], sort: string): RecipeSummary[] {
  const arr = [...items];
  switch (sort) {
    case "name-desc":
      return arr.sort((a, b) => b.title.localeCompare(a.title));
    case "newest":
      return arr.sort((a, b) => +b.createdAt - +a.createdAt);
    case "updated":
      return arr.sort((a, b) => +b.updatedAt - +a.updatedAt);
    default:
      return arr.sort((a, b) => a.title.localeCompare(b.title));
  }
}

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
  const tagIds =
    typeof sp.tags === "string" && sp.tags ? sp.tags.split(",") : [];
  const offset =
    typeof sp.offset === "string"
      ? Math.max(0, parseInt(sp.offset, 10) || 0)
      : 0;

  const allTags = listTags(db, householdId);
  const { items, totalCount } = listRecipes(db, householdId, {
    listType: list,
    search: q,
    tagIds,
    limit: PAGE,
    offset,
  });
  const sorted = sortItems(items, sort);

  const hasMore = offset + items.length < totalCount;
  const nextOffset = offset + PAGE;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("recipes.title")}</h1>

      {/* RecipeFilters is a client island — pass only serializable props, NO t function */}
      <RecipeFilters
        list={list}
        q={q}
        sort={sort}
        tags={tagIds}
        allTags={allTags}
        locale={locale}
      />

      {sorted.length === 0 ? (
        q ? (
          <EmptyState
            icon={Search}
            title={t("recipes.noSearchResults")}
            subtitle={t("recipes.noSearchResultsSubtitle")}
          />
        ) : (
          <EmptyState
            icon={BookOpen}
            title={t("recipes.noRecipesTitle")}
            subtitle={t("recipes.noRecipesSubtitle")}
          />
        )
      ) : (
        <div className="space-y-3">
          {sorted.map((r) => (
            <RecipeCard key={r.id} recipe={r} locale={locale} t={t} />
          ))}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <a
                href={`?${new URLSearchParams({
                  ...(list !== "KNOWN" ? { list } : {}),
                  ...(q ? { q } : {}),
                  ...(sort !== "name-asc" ? { sort } : {}),
                  ...(tagIds.length ? { tags: tagIds.join(",") } : {}),
                  offset: String(nextOffset),
                }).toString()}`}
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                Load more ({totalCount - offset - items.length} remaining)
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
