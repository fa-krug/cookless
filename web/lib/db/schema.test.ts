import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as s from "./schema";

describe("schema", () => {
  it("exports all 19 tables with expected SQL names", () => {
    const names = [
      [s.users, "users"],
      [s.households, "households"],
      [s.householdMembers, "household_members"],
      [s.invites, "invites"],
      [s.passkeyCredentials, "passkey_credentials"],
      [s.ingredients, "ingredients"],
      [s.units, "units"],
      [s.tags, "tags"],
      [s.recipes, "recipes"],
      [s.recipeIngredients, "recipe_ingredients"],
      [s.cookingSteps, "cooking_steps"],
      [s.stepIngredients, "step_ingredients"],
      [s.recipeTags, "recipe_tags"],
      [s.mealPlans, "meal_plans"],
      [s.planIterations, "plan_iterations"],
      [s.mealPlanEntries, "meal_plan_entries"],
      [s.mealPlanExcludedTags, "meal_plan_excluded_tags"],
      [s.shoppingLists, "shopping_lists"],
      [s.shoppingListItems, "shopping_list_items"],
    ] as const;
    for (const [table, name] of names) {
      expect(getTableConfig(table as never).name).toBe(name);
    }
  });

  it("stores quantity as text (decimal precision)", () => {
    const cols = getTableConfig(s.recipeIngredients).columns;
    const qty = cols.find((c) => c.name === "quantity");
    expect(qty?.columnType).toBe("SQLiteText");
  });

  it("stores passkey credential_id as blob", () => {
    const cols = getTableConfig(s.passkeyCredentials).columns;
    const credId = cols.find((c) => c.name === "credential_id");
    expect(credId?.columnType).toBe("SQLiteBlob" + "Buffer");
  });

  it("recipes table has a household_id index", () => {
    const { indexes } = getTableConfig(s.recipes);
    const names = indexes.map((idx) => idx.config.name);
    expect(names).toContain("recipes_household_id_idx");
  });

  it("recipe_ingredients table has a recipe_id index", () => {
    const { indexes } = getTableConfig(s.recipeIngredients);
    const names = indexes.map((idx) => idx.config.name);
    expect(names).toContain("recipe_ingredients_recipe_id_idx");
  });

  it("cooking_steps table has a recipe_id index", () => {
    const { indexes } = getTableConfig(s.cookingSteps);
    const names = indexes.map((idx) => idx.config.name);
    expect(names).toContain("cooking_steps_recipe_id_idx");
  });

  it("step_ingredients table has a step_id index", () => {
    const { indexes } = getTableConfig(s.stepIngredients);
    const names = indexes.map((idx) => idx.config.name);
    expect(names).toContain("step_ingredients_step_id_idx");
  });

  it("meal_plan_entries table has an iteration_id index", () => {
    const { indexes } = getTableConfig(s.mealPlanEntries);
    const names = indexes.map((idx) => idx.config.name);
    expect(names).toContain("meal_plan_entries_iteration_id_idx");
  });

  it("plan_iterations table has a meal_plan_id index", () => {
    const { indexes } = getTableConfig(s.planIterations);
    const names = indexes.map((idx) => idx.config.name);
    expect(names).toContain("plan_iterations_meal_plan_id_idx");
  });

  it("shopping_list_items table has a shopping_list_id index", () => {
    const { indexes } = getTableConfig(s.shoppingListItems);
    const names = indexes.map((idx) => idx.config.name);
    expect(names).toContain("shopping_list_items_shopping_list_id_idx");
  });

  it("household_members table has a user_id index", () => {
    const { indexes } = getTableConfig(s.householdMembers);
    const names = indexes.map((idx) => idx.config.name);
    expect(names).toContain("household_members_user_id_idx");
  });
});
