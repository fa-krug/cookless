import { and, asc, eq, inArray, like, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import {
  recipeTags,
  recipes,
  tags,
  recipeIngredients,
  cookingSteps,
  stepIngredients,
  ingredients,
  units,
} from "@/lib/db/schema";

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

// --- detail + global lists ---

export interface IngredientLite {
  id: number;
  nameEn: string;
  nameDe: string;
  category: string;
}

export interface UnitLite {
  id: number;
  nameEn: string;
  nameDe: string;
  abbreviation: string;
}

export interface RecipeIngredientDto {
  id: number;
  ingredientId: number;
  quantity: string;
  unitId: number;
  order: number;
}

export interface StepIngredientDto {
  recipeIngredientId: number;
  quantity: string;
}

export interface CookingStepDto {
  id: number;
  method: string;
  stepNumber: number;
  instruction: string;
  programType: string;
  temperature: number | null;
  durationSeconds: number | null;
  speed: number | null;
  turbo: boolean;
  direction: string;
  weightGrams: number | null;
  ingredients: StepIngredientDto[];
}

export interface RecipeDetail extends RecipeSummary {
  ingredients: RecipeIngredientDto[];
  manualSteps: CookingStepDto[];
  machineSteps: CookingStepDto[];
}

export function getRecipe(
  db: Db,
  householdId: string,
  id: string,
): RecipeDetail | null {
  const r = db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.householdId, householdId)))
    .get();
  if (!r) return null;

  const ri = db
    .select()
    .from(recipeIngredients)
    .where(eq(recipeIngredients.recipeId, id))
    .orderBy(asc(recipeIngredients.order))
    .all();

  const steps = db
    .select()
    .from(cookingSteps)
    .where(eq(cookingSteps.recipeId, id))
    .orderBy(asc(cookingSteps.stepNumber))
    .all();

  const stepIds = steps.map((s) => s.id);
  const si =
    stepIds.length
      ? db
          .select()
          .from(stepIngredients)
          .where(inArray(stepIngredients.stepId, stepIds))
          .all()
      : [];

  const siByStep = new Map<number, StepIngredientDto[]>();
  for (const row of si) {
    const list = siByStep.get(row.stepId) ?? [];
    list.push({
      recipeIngredientId: row.recipeIngredientId,
      quantity: row.quantity,
    });
    siByStep.set(row.stepId, list);
  }

  const toDto = (
    s: (typeof steps)[number],
  ): CookingStepDto => ({
    id: s.id,
    method: s.method,
    stepNumber: s.stepNumber,
    instruction: s.instruction,
    programType: s.programType,
    temperature: s.temperature,
    durationSeconds: s.durationSeconds,
    speed: s.speed,
    turbo: s.turbo,
    direction: s.direction,
    weightGrams: s.weightGrams,
    ingredients: siByStep.get(s.id) ?? [],
  });

  const tagRows = db
    .select({
      id: tags.id,
      category: tags.category,
      nameEn: tags.nameEn,
      nameDe: tags.nameDe,
    })
    .from(recipeTags)
    .innerJoin(tags, eq(tags.id, recipeTags.tagId))
    .where(eq(recipeTags.recipeId, id))
    .all();

  return {
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
    tags: tagRows,
    ingredients: ri.map((x) => ({
      id: x.id,
      ingredientId: x.ingredientId,
      quantity: x.quantity,
      unitId: x.unitId,
      order: x.order,
    })),
    manualSteps: steps.filter((s) => s.method === "MANUAL").map(toDto),
    machineSteps: steps.filter((s) => s.method === "MACHINE").map(toDto),
  };
}

export function listTags(db: Db, householdId: string): RecipeTagDto[] {
  return db
    .select({
      id: tags.id,
      category: tags.category,
      nameEn: tags.nameEn,
      nameDe: tags.nameDe,
    })
    .from(tags)
    .where(eq(tags.householdId, householdId))
    .orderBy(asc(tags.category), asc(tags.nameEn))
    .all();
}

export function listIngredients(db: Db): IngredientLite[] {
  return db
    .select({
      id: ingredients.id,
      nameEn: ingredients.nameEn,
      nameDe: ingredients.nameDe,
      category: ingredients.category,
    })
    .from(ingredients)
    .orderBy(asc(ingredients.id))
    .all();
}

export function listUnits(db: Db): UnitLite[] {
  return db
    .select({
      id: units.id,
      nameEn: units.nameEn,
      nameDe: units.nameDe,
      abbreviation: units.abbreviation,
    })
    .from(units)
    .orderBy(asc(units.id))
    .all();
}
