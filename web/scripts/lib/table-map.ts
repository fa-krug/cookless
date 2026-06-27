export interface TableMapEntry {
  source: string;
  dest: string;
  columns: Record<string, string>; // destColumn -> sourceColumn
}

export const TABLE_MAP: ReadonlyArray<TableMapEntry> = [
  {
    source: "users_household",
    dest: "households",
    columns: {
      id: "id", name: "name", ai_enabled: "ai_enabled",
      gemini_api_key: "gemini_api_key", created_at: "created_at",
    },
  },
  {
    source: "users_user",
    dest: "users",
    columns: {
      id: "id", email: "email", password: "password",
      preferred_language: "preferred_language", active_household_id: "active_household_id",
      onboarding_step: "onboarding_step", is_active: "is_active",
      is_staff: "is_staff", created_at: "created_at",
    },
  },
  {
    source: "users_householdmember",
    dest: "household_members",
    columns: {
      id: "id", household_id: "household_id", user_id: "user_id",
      role: "role", joined_at: "joined_at",
    },
  },
  {
    source: "users_invite",
    dest: "invites",
    columns: {
      id: "id", household_id: "household_id", created_by_id: "created_by_id",
      code: "code", expires_at: "expires_at", used_by_id: "used_by_id",
      created_at: "created_at",
    },
  },
  {
    source: "users_passkeycredential",
    dest: "passkey_credentials",
    columns: {
      id: "id", user_id: "user_id", credential_id: "credential_id",
      public_key: "public_key", sign_count: "sign_count",
      device_name: "device_name", created_at: "created_at",
    },
  },
  {
    source: "recipes_ingredient",
    dest: "ingredients",
    columns: { id: "id", name_de: "name_de", name_en: "name_en", category: "category" },
  },
  {
    source: "recipes_unit",
    dest: "units",
    columns: {
      id: "id", name_de: "name_de", name_en: "name_en",
      abbreviation: "abbreviation", base_unit_id: "base_unit_id",
      conversion_factor: "conversion_factor",
    },
  },
  {
    source: "recipes_tag",
    dest: "tags",
    columns: {
      id: "id", household_id: "household_id", category: "category",
      name_en: "name_en", name_de: "name_de", is_default: "is_default",
    },
  },
  {
    source: "recipes_recipe",
    dest: "recipes",
    // Note: source DB has no "description" column (it was added later in Django);
    // the dest schema has description with a default of "" so we omit it here.
    columns: {
      id: "id", household_id: "household_id", title: "title",
      list_type: "list_type",
      default_servings: "default_servings", prep_time_minutes: "prep_time_minutes",
      cook_time_minutes: "cook_time_minutes", leftover_days: "leftover_days",
      image: "image", created_at: "created_at", updated_at: "updated_at",
    },
  },
  {
    source: "recipes_recipeingredient",
    dest: "recipe_ingredients",
    columns: {
      id: "id", recipe_id: "recipe_id", ingredient_id: "ingredient_id",
      quantity: "quantity", unit_id: "unit_id", order: "order",
    },
  },
  {
    source: "recipes_cookingstep",
    dest: "cooking_steps",
    columns: {
      id: "id", recipe_id: "recipe_id", method: "method", step_number: "step_number",
      instruction: "instruction", program_type: "program_type", temperature: "temperature",
      duration_seconds: "duration_seconds", speed: "speed", turbo: "turbo",
      direction: "direction", weight_grams: "weight_grams",
    },
  },
  {
    source: "recipes_stepingredient",
    dest: "step_ingredients",
    columns: {
      id: "id", step_id: "step_id",
      recipe_ingredient_id: "recipe_ingredient_id", quantity: "quantity",
    },
  },
  {
    source: "recipes_recipe_tags",
    dest: "recipe_tags",
    columns: { id: "id", recipe_id: "recipe_id", tag_id: "tag_id" },
  },
  {
    source: "planner_mealplan",
    dest: "meal_plans",
    columns: {
      id: "id", household_id: "household_id", iteration_weeks: "iteration_weeks",
      shopping_day_1: "shopping_day_1", shopping_day_2: "shopping_day_2",
      servings: "servings", known_ratio: "known_ratio",
      default_leftover_days: "default_leftover_days", created_at: "created_at",
    },
  },
  {
    source: "planner_planiteration",
    dest: "plan_iterations",
    columns: {
      id: "id", meal_plan_id: "meal_plan_id", start_date: "start_date",
      end_date: "end_date", status: "status", created_at: "created_at",
    },
  },
  {
    source: "planner_mealplanentry",
    dest: "meal_plan_entries",
    columns: {
      id: "id", iteration_id: "iteration_id", date: "date", meal_type: "meal_type",
      recipe_id: "recipe_id", servings: "servings", is_leftover: "is_leftover",
      source_entry_id: "source_entry_id", is_locked: "is_locked",
    },
  },
  {
    source: "planner_mealplan_excluded_tags",
    dest: "meal_plan_excluded_tags",
    // Django M2M through-table names the FK "mealplan_id" (no underscore between meal/plan)
    columns: { id: "id", meal_plan_id: "mealplan_id", tag_id: "tag_id" },
  },
  {
    source: "shopping_shoppinglist",
    dest: "shopping_lists",
    columns: {
      id: "id", iteration_id: "iteration_id",
      shopping_date: "shopping_date", created_at: "created_at",
    },
  },
  {
    source: "shopping_shoppinglistitem",
    dest: "shopping_list_items",
    columns: {
      id: "id", shopping_list_id: "shopping_list_id", ingredient_id: "ingredient_id",
      quantity: "quantity", unit_id: "unit_id", is_checked: "is_checked",
    },
  },
];
