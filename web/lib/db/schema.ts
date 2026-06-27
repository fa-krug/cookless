import {
  blob,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ---- users app ----

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  aiEnabled: integer("ai_enabled", { mode: "boolean" }).notNull().default(false),
  geminiApiKey: text("gemini_api_key").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull().default(""), // Django hash string; "" = unusable
  preferredLanguage: text("preferred_language").notNull().default("en"),
  activeHouseholdId: text("active_household_id").references(() => households.id, {
    onDelete: "set null",
  }),
  onboardingStep: text("onboarding_step").notNull().default("CHANGE_PASSWORD"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  isStaff: integer("is_staff", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const householdMembers = sqliteTable(
  "household_members",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("MEMBER"),
    joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ uniqHouseholdUser: uniqueIndex("uniq_household_user").on(t.householdId, t.userId) }),
);

export const invites = sqliteTable("invites", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  usedById: text("used_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const passkeyCredentials = sqliteTable("passkey_credentials", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  credentialId: blob("credential_id", { mode: "buffer" }).notNull().unique(),
  publicKey: blob("public_key", { mode: "buffer" }).notNull(),
  signCount: integer("sign_count").notNull().default(0),
  deviceName: text("device_name").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ---- recipes app ----

export const ingredients = sqliteTable("ingredients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nameDe: text("name_de").notNull(),
  nameEn: text("name_en").notNull(),
  category: text("category").notNull().default("OTHER"),
});

export const units = sqliteTable("units", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nameDe: text("name_de").notNull(),
  nameEn: text("name_en").notNull(),
  abbreviation: text("abbreviation").notNull(),
  baseUnitId: integer("base_unit_id"),
  conversionFactor: text("conversion_factor").notNull().default("1"),
});

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    nameEn: text("name_en").notNull(),
    nameDe: text("name_de").notNull(),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  },
  (t) => ({
    uniqTag: uniqueIndex("uniq_tag_per_household_category").on(t.householdId, t.category, t.nameEn),
  }),
);

export const recipes = sqliteTable("recipes", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  listType: text("list_type").notNull(),
  defaultServings: integer("default_servings").notNull().default(2),
  prepTimeMinutes: integer("prep_time_minutes"),
  cookTimeMinutes: integer("cook_time_minutes"),
  leftoverDays: integer("leftover_days"),
  image: text("image").notNull().default(""), // relative path under data/media
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const recipeIngredients = sqliteTable("recipe_ingredients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipeId: text("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "cascade" }),
  ingredientId: integer("ingredient_id")
    .notNull()
    .references(() => ingredients.id, { onDelete: "cascade" }),
  quantity: text("quantity").notNull(),
  unitId: integer("unit_id")
    .notNull()
    .references(() => units.id, { onDelete: "cascade" }),
  order: integer("order").notNull().default(0),
});

export const cookingSteps = sqliteTable("cooking_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipeId: text("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "cascade" }),
  method: text("method").notNull(),
  stepNumber: integer("step_number").notNull(),
  instruction: text("instruction").notNull().default(""),
  programType: text("program_type").notNull().default(""),
  temperature: integer("temperature"),
  durationSeconds: integer("duration_seconds"),
  speed: integer("speed"),
  turbo: integer("turbo", { mode: "boolean" }).notNull().default(false),
  direction: text("direction").notNull().default(""),
  weightGrams: integer("weight_grams"),
});

export const stepIngredients = sqliteTable("step_ingredients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  stepId: integer("step_id")
    .notNull()
    .references(() => cookingSteps.id, { onDelete: "cascade" }),
  recipeIngredientId: integer("recipe_ingredient_id")
    .notNull()
    .references(() => recipeIngredients.id, { onDelete: "cascade" }),
  quantity: text("quantity").notNull(),
});

export const recipeTags = sqliteTable(
  "recipe_tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({ uniqRecipeTag: uniqueIndex("uniq_recipe_tag").on(t.recipeId, t.tagId) }),
);

// ---- planner app ----

export const mealPlans = sqliteTable("meal_plans", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .unique()
    .references(() => households.id, { onDelete: "cascade" }),
  iterationWeeks: integer("iteration_weeks").notNull().default(1),
  shoppingDay1: integer("shopping_day_1").notNull().default(5),
  shoppingDay2: integer("shopping_day_2"),
  servings: integer("servings").notNull().default(2),
  knownRatio: text("known_ratio").notNull().default("0.7"), // Django FloatField; stored as text per the decimals-as-text constraint
  defaultLeftoverDays: integer("default_leftover_days").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const planIterations = sqliteTable("plan_iterations", {
  id: text("id").primaryKey(),
  mealPlanId: text("meal_plan_id")
    .notNull()
    .references(() => mealPlans.id, { onDelete: "cascade" }),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const mealPlanEntries = sqliteTable("meal_plan_entries", {
  id: text("id").primaryKey(),
  iterationId: text("iteration_id")
    .notNull()
    .references(() => planIterations.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  mealType: text("meal_type").notNull(),
  recipeId: text("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "cascade" }),
  servings: integer("servings").notNull(),
  isLeftover: integer("is_leftover", { mode: "boolean" }).notNull().default(false),
  sourceEntryId: text("source_entry_id"),
  isLocked: integer("is_locked", { mode: "boolean" }).notNull().default(false),
});

export const mealPlanExcludedTags = sqliteTable(
  "meal_plan_excluded_tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mealPlanId: text("meal_plan_id")
      .notNull()
      .references(() => mealPlans.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({ uniqExcluded: uniqueIndex("uniq_mealplan_tag").on(t.mealPlanId, t.tagId) }),
);

// ---- shopping app ----

export const shoppingLists = sqliteTable("shopping_lists", {
  id: text("id").primaryKey(),
  iterationId: text("iteration_id")
    .notNull()
    .references(() => planIterations.id, { onDelete: "cascade" }),
  shoppingDate: text("shopping_date"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const shoppingListItems = sqliteTable("shopping_list_items", {
  id: text("id").primaryKey(),
  shoppingListId: text("shopping_list_id")
    .notNull()
    .references(() => shoppingLists.id, { onDelete: "cascade" }),
  ingredientId: integer("ingredient_id")
    .notNull()
    .references(() => ingredients.id, { onDelete: "cascade" }),
  quantity: text("quantity").notNull(),
  unitId: integer("unit_id")
    .notNull()
    .references(() => units.id, { onDelete: "cascade" }),
  isChecked: integer("is_checked", { mode: "boolean" }).notNull().default(false),
});
