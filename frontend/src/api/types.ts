// ── Enums / Literals ──────────────────────────────────────────────

export type ListType = "KNOWN" | "TO_TRY";
export type MealType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
export type IngredientCategory = "PRODUCE" | "DAIRY" | "MEAT" | "PANTRY" | "FROZEN" | "OTHER";
export type HouseholdRole = "OWNER" | "MEMBER";

// ── Users & Households ───────────────────────────────────────────

export interface UserSettings {
  default_servings: number;
  known_new_ratio: number;
  plan_days: number;
}

export interface HouseholdSummary {
  id: string;
  name: string;
}

export interface User {
  id: string;
  email: string;
  preferred_language: string;
  settings: UserSettings;
  active_household: HouseholdSummary | null;
}

export interface HouseholdMember {
  id: number;
  email: string;
  role: HouseholdRole;
  joined_at: string;
}

export interface Household {
  id: string;
  name: string;
  members: HouseholdMember[];
}

export interface Invite {
  code: string;
  expires_at: string;
  household: string;
}

// ── Recipes ──────────────────────────────────────────────────────

export interface Unit {
  id: number;
  name_de: string;
  name_en: string;
  abbreviation: string;
}

export interface Ingredient {
  id: number;
  name_de: string;
  name_en: string;
  category: IngredientCategory;
}

export interface RecipeIngredient {
  id: number;
  ingredient: number;
  quantity: string;
  unit: number;
  order: number;
}

export interface CookingStep {
  id: number;
  step_number: number;
  instruction: string;
}

export interface Recipe {
  id: string;
  title: string;
  list_type: ListType;
  default_servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  leftover_days: number;
  ingredients: RecipeIngredient[];
  manual_steps: CookingStep[];
  machine_steps: CookingStep[];
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredientPayload {
  ingredient: number;
  quantity: string;
  unit: number;
  order: number;
}

export interface CookingStepPayload {
  step_number: number;
  instruction: string;
}

export interface RecipeUpdatePayload {
  title: string;
  list_type: ListType;
  default_servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  leftover_days: number;
  ingredients: RecipeIngredientPayload[];
  manual_steps: CookingStepPayload[];
  machine_steps: CookingStepPayload[];
}

// ── Meal Plans ───────────────────────────────────────────────────

export interface MealPlanEntry {
  id: string;
  date: string;
  meal_type: MealType;
  recipe: string;
  servings: number;
  is_leftover: boolean;
  source_entry: string | null;
  is_locked: boolean;
}

export interface MealPlan {
  id: string;
  start_date: string;
  end_date: string;
  entries: MealPlanEntry[];
  created_at: string;
}

// ── Shopping Lists ───────────────────────────────────────────────

export interface ShoppingListItem {
  id: string;
  ingredient_name: string;
  ingredient_category: IngredientCategory;
  quantity: string;
  unit_abbreviation: string;
  is_checked: boolean;
}

export interface ShoppingList {
  id: string;
  meal_plan: string;
  items: ShoppingListItem[];
  created_at: string;
}

// ── Passkeys ────────────────────────────────────────────────────

export interface Passkey {
  id: string;
  device_name: string;
  created_at: string;
}

// ── Generic ──────────────────────────────────────────────────────

export interface MessageOut {
  detail: string;
}
