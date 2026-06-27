import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "@/lib/test/db";
import type { Db } from "@/lib/db";
import { verifyMigration } from "./verify-migration";

// Helper to get a named check from results
function getCheck(checks: { name: string; ok: boolean; detail: string }[], name: string) {
  const c = checks.find((c) => c.name === name);
  if (!c) throw new Error(`check "${name}" not found`);
  return c;
}

// Seed helpers — insert bare-minimum rows to satisfy FK constraints
function seedHousehold(db: Db, id = "hh1") {
  db.run(
    sql`INSERT INTO households (id, name, created_at) VALUES (${id}, 'Test HH', ${Math.floor(Date.now() / 1000)})`,
  );
}

function seedUser(db: Db, id = "u1", password = "", householdId = "hh1") {
  db.run(
    sql`INSERT INTO users (id, email, password, created_at)
        VALUES (${id}, ${`${id}@test.test`}, ${password}, ${Math.floor(Date.now() / 1000)})`,
  );
  if (householdId) {
    // Link user to household via household_members
    db.run(
      sql`INSERT INTO household_members (household_id, user_id, joined_at)
          VALUES (${householdId}, ${id}, ${Math.floor(Date.now() / 1000)})`,
    );
  }
}

function seedIngredient(db: Db, id = 1) {
  db.run(
    sql`INSERT OR IGNORE INTO ingredients (id, name_de, name_en) VALUES (${id}, 'Zutat', 'Ingredient')`,
  );
}

function seedUnit(db: Db, id = 1) {
  db.run(
    sql`INSERT OR IGNORE INTO units (id, name_de, name_en, abbreviation) VALUES (${id}, 'Stück', 'piece', 'pc')`,
  );
}

function seedRecipe(db: Db, id = "r1", image = "", householdId = "hh1") {
  db.run(
    sql`INSERT INTO recipes (id, household_id, title, list_type, image, created_at, updated_at)
        VALUES (${id}, ${householdId}, 'Test Recipe', 'INGREDIENT_LIST', ${image},
                ${Math.floor(Date.now() / 1000)}, ${Math.floor(Date.now() / 1000)})`,
  );
}

function seedRecipeIngredient(db: Db, recipeId = "r1", quantity = "2") {
  seedIngredient(db);
  seedUnit(db);
  db.run(
    sql`INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit_id)
        VALUES (${recipeId}, 1, ${quantity}, 1)`,
  );
}

function seedMealPlanChain(
  db: Db,
  householdId = "hh1",
  mealPlanId = "mp1",
  iterationId = "iter1",
) {
  // meal_plan (if not already exists)
  db.run(
    sql`INSERT OR IGNORE INTO meal_plans (id, household_id, known_ratio, created_at)
        VALUES (${mealPlanId}, ${householdId}, '0.7', ${Math.floor(Date.now() / 1000)})`,
  );
  // plan_iteration
  db.run(
    sql`INSERT OR IGNORE INTO plan_iterations (id, meal_plan_id, start_date, end_date, created_at)
        VALUES (${iterationId}, ${mealPlanId}, '2026-01-01', '2026-01-07', ${Math.floor(Date.now() / 1000)})`,
  );
}

function seedShoppingList(db: Db, id = "sl1", iterationId = "iter1") {
  db.run(
    sql`INSERT INTO shopping_lists (id, iteration_id, shopping_date, created_at)
        VALUES (${id}, ${iterationId}, '2026-01-01', ${Math.floor(Date.now() / 1000)})`,
  );
}

function seedShoppingListItem(db: Db, id = "sli1", shoppingListId = "sl1", quantity = "1") {
  seedIngredient(db);
  seedUnit(db);
  db.run(
    sql`INSERT INTO shopping_list_items (id, shopping_list_id, ingredient_id, quantity, unit_id)
        VALUES (${id}, ${shoppingListId}, 1, ${quantity}, 1)`,
  );
}

function seedMealPlan(db: Db, id = "mp1", householdId = "hh1", knownRatio: string | null = "0.7") {
  if (knownRatio !== null) {
    db.run(
      sql`INSERT INTO meal_plans (id, household_id, known_ratio, created_at)
          VALUES (${id}, ${householdId}, ${knownRatio}, ${Math.floor(Date.now() / 1000)})`,
    );
  } else {
    // known_ratio has a NOT NULL default, so we just use the default
    db.run(
      sql`INSERT INTO meal_plans (id, household_id, created_at)
          VALUES (${id}, ${householdId}, ${Math.floor(Date.now() / 1000)})`,
    );
  }
}

// ---- Test suites ----

describe("verifyMigration — clean empty DB", () => {
  let db: Db;
  beforeEach(() => {
    db = createTestDb();
  });

  it("returns ok:true for an empty DB", () => {
    const result = verifyMigration(db);
    expect(result.ok).toBe(true);
  });

  it("includes all expected check names", () => {
    const { checks } = verifyMigration(db);
    const names = checks.map((c) => c.name);
    expect(names).toContain("users.password all reset");
    expect(names).toContain("foreign_key_check");
    expect(names).toContain("recipes.image paths are relative");
    expect(names).toContain("recipe_ingredients.quantity all numeric");
    expect(names).toContain("shopping_list_items.quantity all numeric");
    expect(names).toContain("meal_plans.known_ratio all numeric (non-null)");
    expect(names).toContain("row counts (informational)");
  });
});

describe("verifyMigration — check 1: password reset", () => {
  let db: Db;
  beforeEach(() => {
    db = createTestDb();
    seedHousehold(db);
  });

  it("PASS when all users have empty password", () => {
    seedUser(db, "u1", "");
    const { checks } = verifyMigration(db);
    expect(getCheck(checks, "users.password all reset").ok).toBe(true);
  });

  it("FAIL when a user has a non-empty password", () => {
    seedUser(db, "u1", "pbkdf2_sha256$870000$salt$hash==");
    const { checks, ok } = verifyMigration(db);
    const check = getCheck(checks, "users.password all reset");
    expect(check.ok).toBe(false);
    expect(ok).toBe(false);
    expect(check.detail).toMatch(/1 user/);
  });
});

describe("verifyMigration — check 2: FK integrity", () => {
  let db: Db;
  beforeEach(() => {
    db = createTestDb();
  });

  it("PASS when no FK violations", () => {
    // empty DB — clean
    const { checks } = verifyMigration(db);
    expect(getCheck(checks, "foreign_key_check").ok).toBe(true);
  });

  it("FAIL when FK violation exists (FK is OFF to insert bad data)", () => {
    // Bypass FK to insert an orphaned recipe
    db.run(sql`PRAGMA foreign_keys = OFF`);
    db.run(
      sql`INSERT INTO recipes (id, household_id, title, list_type, image, created_at, updated_at)
          VALUES ('r-orphan', 'nonexistent-hh', 'Orphan', 'INGREDIENT_LIST', '',
                  ${Math.floor(Date.now() / 1000)}, ${Math.floor(Date.now() / 1000)})`,
    );
    db.run(sql`PRAGMA foreign_keys = ON`);

    const { checks, ok } = verifyMigration(db);
    const check = getCheck(checks, "foreign_key_check");
    expect(check.ok).toBe(false);
    expect(ok).toBe(false);
  });
});

describe("verifyMigration — check 3: image paths", () => {
  let db: Db;
  beforeEach(() => {
    db = createTestDb();
    seedHousehold(db);
  });

  it("PASS when image is empty string", () => {
    seedRecipe(db, "r1", "");
    const { checks } = verifyMigration(db);
    expect(getCheck(checks, "recipes.image paths are relative").ok).toBe(true);
  });

  it("PASS when image is a relative path", () => {
    seedRecipe(db, "r1", "recipes/r1.webp");
    const { checks } = verifyMigration(db);
    expect(getCheck(checks, "recipes.image paths are relative").ok).toBe(true);
  });

  it("FAIL when image starts with /media/", () => {
    seedRecipe(db, "r1", "/media/recipes/photo.jpg");
    const { checks, ok } = verifyMigration(db);
    const check = getCheck(checks, "recipes.image paths are relative");
    expect(check.ok).toBe(false);
    expect(ok).toBe(false);
    expect(check.detail).toMatch(/1 recipe/);
  });

  it("FAIL when image starts with http", () => {
    seedRecipe(db, "r1", "https://example.com/photo.jpg");
    const { checks, ok } = verifyMigration(db);
    const check = getCheck(checks, "recipes.image paths are relative");
    expect(check.ok).toBe(false);
    expect(ok).toBe(false);
  });
});

describe("verifyMigration — check 4a: recipe_ingredients.quantity", () => {
  let db: Db;
  beforeEach(() => {
    db = createTestDb();
    seedHousehold(db);
    seedRecipe(db);
  });

  it("PASS with valid numeric quantity", () => {
    seedRecipeIngredient(db, "r1", "2.5");
    const { checks } = verifyMigration(db);
    expect(getCheck(checks, "recipe_ingredients.quantity all numeric").ok).toBe(true);
  });

  it("PASS with integer quantity", () => {
    seedRecipeIngredient(db, "r1", "3");
    const { checks } = verifyMigration(db);
    expect(getCheck(checks, "recipe_ingredients.quantity all numeric").ok).toBe(true);
  });

  it("FAIL with non-numeric quantity", () => {
    seedRecipeIngredient(db, "r1", "abc");
    const { checks, ok } = verifyMigration(db);
    const check = getCheck(checks, "recipe_ingredients.quantity all numeric");
    expect(check.ok).toBe(false);
    expect(ok).toBe(false);
    expect(check.detail).toMatch(/1 non-numeric/);
  });
});

describe("verifyMigration — check 4b: shopping_list_items.quantity", () => {
  let db: Db;
  beforeEach(() => {
    db = createTestDb();
    seedHousehold(db);
    seedMealPlanChain(db);
    seedShoppingList(db);
  });

  it("PASS with valid numeric quantity", () => {
    seedShoppingListItem(db, "sli1", "sl1", "1.5");
    const { checks } = verifyMigration(db);
    expect(getCheck(checks, "shopping_list_items.quantity all numeric").ok).toBe(true);
  });

  it("FAIL with non-numeric quantity", () => {
    seedShoppingListItem(db, "sli1", "sl1", "not-a-number");
    const { checks, ok } = verifyMigration(db);
    const check = getCheck(checks, "shopping_list_items.quantity all numeric");
    expect(check.ok).toBe(false);
    expect(ok).toBe(false);
  });
});

describe("verifyMigration — check 4c: meal_plans.known_ratio", () => {
  let db: Db;
  beforeEach(() => {
    db = createTestDb();
    seedHousehold(db);
  });

  it("PASS with valid numeric known_ratio", () => {
    seedMealPlan(db, "mp1", "hh1", "0.7");
    const { checks } = verifyMigration(db);
    expect(getCheck(checks, "meal_plans.known_ratio all numeric (non-null)").ok).toBe(true);
  });

  it("PASS when known_ratio uses default (0.7)", () => {
    seedMealPlan(db, "mp1", "hh1", null);
    const { checks } = verifyMigration(db);
    expect(getCheck(checks, "meal_plans.known_ratio all numeric (non-null)").ok).toBe(true);
  });

  it("FAIL with non-numeric known_ratio", () => {
    // Insert directly to bypass schema default
    db.run(
      sql`INSERT INTO meal_plans (id, household_id, known_ratio, created_at)
          VALUES ('mp1', 'hh1', 'not-a-number', ${Math.floor(Date.now() / 1000)})`,
    );
    const { checks, ok } = verifyMigration(db);
    const check = getCheck(checks, "meal_plans.known_ratio all numeric (non-null)");
    expect(check.ok).toBe(false);
    expect(ok).toBe(false);
  });
});

describe("verifyMigration — check 5: row counts (informational)", () => {
  let db: Db;
  beforeEach(() => {
    db = createTestDb();
    seedHousehold(db);
  });

  it("always ok:true, includes table counts in detail", () => {
    seedRecipe(db);
    const { checks } = verifyMigration(db);
    const check = getCheck(checks, "row counts (informational)");
    expect(check.ok).toBe(true);
    expect(check.detail).toContain("recipes=1");
    expect(check.detail).toContain("households=1");
  });
});
