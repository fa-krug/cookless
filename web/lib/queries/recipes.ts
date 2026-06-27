import { and, eq, inArray, like, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { recipeTags, recipes, tags } from "@/lib/db/schema";

export interface RecipeTagDto {
  id: string;
  category: string;
  nameEn: string;
  nameDe: string;
}

export interface RecipeSummary {
  id: string;
  title: string;
  description: string;
  listType: string;
  defaultServings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  leftoverDays: number | null;
  image: string;
  createdAt: Date;
  updatedAt: Date;
  tags: RecipeTagDto[];
}

export interface ListRecipesOpts {
  listType?: string;
  tagIds?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}

export interface RecipeListResult {
  items: RecipeSummary[];
  totalCount: number;
}

export function listRecipes(
  db: Db,
  householdId: string,
  opts: ListRecipesOpts = {},
): RecipeListResult {
  const { listType, tagIds, search, limit = 20, offset = 0 } = opts;

  const conditions = [eq(recipes.householdId, householdId)];
  if (listType) conditions.push(eq(recipes.listType, listType));
  if (search && search.trim()) {
    conditions.push(like(recipes.title, `%${search.trim()}%`));
  }
  if (tagIds && tagIds.length > 0) {
    // recipe ids that have at least one of the requested tags
    const tagged = db
      .selectDistinct({ recipeId: recipeTags.recipeId })
      .from(recipeTags)
      .where(inArray(recipeTags.tagId, tagIds))
      .all()
      .map((row) => row.recipeId);
    conditions.push(inArray(recipes.id, tagged.length ? tagged : ["__none__"]));
  }

  const where = and(...conditions);

  const totalCount = db
    .select({ n: sql<number>`count(*)` })
    .from(recipes)
    .where(where)
    .get()!.n;

  const rows = db
    .select()
    .from(recipes)
    .where(where)
    .orderBy(recipes.title)
    .limit(limit)
    .offset(offset)
    .all();

  // Attach tags in one extra query, grouped in JS.
  const ids = rows.map((r) => r.id);
  const tagRows = ids.length
    ? db
        .select({
          recipeId: recipeTags.recipeId,
          id: tags.id,
          category: tags.category,
          nameEn: tags.nameEn,
          nameDe: tags.nameDe,
        })
        .from(recipeTags)
        .innerJoin(tags, eq(tags.id, recipeTags.tagId))
        .where(inArray(recipeTags.recipeId, ids))
        .all()
    : [];
  const tagsByRecipe = new Map<string, RecipeTagDto[]>();
  for (const tr of tagRows) {
    const list = tagsByRecipe.get(tr.recipeId) ?? [];
    list.push({ id: tr.id, category: tr.category, nameEn: tr.nameEn, nameDe: tr.nameDe });
    tagsByRecipe.set(tr.recipeId, list);
  }

  const items: RecipeSummary[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    listType: r.listType,
    defaultServings: r.defaultServings,
    prepTimeMinutes: r.prepTimeMinutes,
    cookTimeMinutes: r.cookTimeMinutes,
    leftoverDays: r.leftoverDays,
    image: r.image,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    tags: tagsByRecipe.get(r.id) ?? [],
  }));

  return { items, totalCount };
}
