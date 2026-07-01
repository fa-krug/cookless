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
});
