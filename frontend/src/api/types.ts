// ── Enums / Literals ──────────────────────────────────────────────

export type ListType = "KNOWN" | "TO_TRY";
export type MealType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
export type IngredientCategory = "PRODUCE" | "DAIRY" | "MEAT" | "PANTRY" | "FROZEN" | "OTHER";
export type HouseholdRole = "OWNER" | "MEMBER";
export type TagCategory = "DIETARY" | "PROTEIN" | "CUISINE" | "MEAL_TYPE";
export const TAG_CATEGORIES: TagCategory[] = ["DIETARY", "PROTEIN", "CUISINE", "MEAL_TYPE"];

// ── Users & Households ───────────────────────────────────────────

export interface HouseholdSummary {
  id: string;
  name: string;
  ai_enabled: boolean;
  gemini_api_key: string;
}

export interface User {
  id: string;
  email: string;
  preferred_language: string;
  active_household: HouseholdSummary | null;
  has_password: boolean;
  has_passkey: boolean;
  is_staff: boolean;
  onboarding_step: "CHANGE_PASSWORD" | "ADD_PASSKEY" | "CREATE_HOUSEHOLD" | "COMPLETED";
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
  ai_enabled: boolean;
  gemini_api_key: string;
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

export type ProgramType =
  | "MANUAL_COOKING"
  | "CHOPPING"
  | "KNEADING"
  | "STEAMING"
  | "BLENDING"
  | "SEARING"
  | "SLOW_COOKING"
  | "SOUS_VIDE"
  | "WEIGHING"
  | "TURBO"
  | "EGG_COOKING"
  | "FERMENTATION"
  | "PRE_CLEANING";

export type Direction = "LEFT" | "RIGHT";

export interface StepIngredient {
  recipe_ingredient_id: number;
  quantity: string;
}

export interface CookingStep {
  id: number;
  step_number: number;
  instruction: string;
  program_type: ProgramType | null;
  temperature: number | null;
  duration_seconds: number | null;
  speed: number | null;
  turbo: boolean;
  direction: Direction | null;
  weight_grams: number | null;
  ingredients: StepIngredient[];
}

export interface RecipeSummary {
  id: string;
  title: string;
  description: string;
  list_type: ListType;
  default_servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  leftover_days: number | null;
  image: string | null;
  created_at: string;
  updated_at: string;
  tags: Tag[];
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  list_type: ListType;
  default_servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  leftover_days: number | null;
  image: string | null;
  ingredients: RecipeIngredient[];
  manual_steps: CookingStep[];
  machine_steps: CookingStep[];
  created_at: string;
  updated_at: string;
  tags: Tag[];
}

export interface RecipeIngredientPayload {
  ingredient: number;
  quantity: string;
  unit: number;
  order: number;
}

export interface StepIngredientPayload {
  recipe_ingredient_order: number;
  quantity: string;
}

export interface CookingStepPayload {
  step_number: number;
  instruction: string;
  program_type?: ProgramType | null;
  temperature?: number | null;
  duration_seconds?: number | null;
  speed?: number | null;
  turbo?: boolean;
  direction?: Direction | null;
  weight_grams?: number | null;
  ingredients?: StepIngredientPayload[];
}

export interface RecipeUpdatePayload {
  title: string;
  list_type: ListType;
  default_servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  leftover_days: number | null;
  ingredients: RecipeIngredientPayload[];
  manual_steps: CookingStepPayload[];
  machine_steps: CookingStepPayload[];
  tag_ids: string[];
}

// ── Meal Plans ───────────────────────────────────────────────────

export type IterationStatus = "ACTIVE" | "ARCHIVED";

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

export interface PlanIteration {
  id: string;
  start_date: string;
  end_date: string;
  status: IterationStatus;
  entries: MealPlanEntry[];
  created_at: string;
}

export interface MealPlan {
  id: string;
  iteration_weeks: number;
  shopping_days: number[];
  servings: number;
  known_ratio: number;
  default_leftover_days: number;
  excluded_tag_ids: string[];
  iterations: PlanIteration[];
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
  iteration: string;
  shopping_date: string | null;
  items: ShoppingListItem[];
  created_at: string;
}

// ── Passkeys ────────────────────────────────────────────────────

export interface Passkey {
  id: string;
  device_name: string;
  created_at: string;
}

// ── Access Tokens ──────────────────────────────────────────────────

export interface AccessToken {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface AccessTokenCreated extends AccessToken {
  token: string;
}

// ── Tags ──────────────────────────────────────────────────────────

export interface Tag {
  id: string;
  category: TagCategory;
  name_en: string;
  name_de: string;
  is_default: boolean;
}

export type GroupedTags = Record<TagCategory, Tag[]>;

export interface TagCreatePayload {
  category: TagCategory;
  name_en: string;
  name_de: string;
}

export interface TagUpdatePayload {
  name_en: string;
  name_de: string;
}

// ── AI Recipe Generation ────────────────────────────────────────

export interface GenerateRecipesPayload {
  count: number;
  tag_ids: string[];
  free_text: string;
  generate_images: boolean;
}

export interface GeneratedIngredient {
  name_en: string;
  name_de: string;
  category: string;
  quantity: string;
  unit_abbreviation: string;
  order: number;
}

export interface GeneratedRecipe {
  title: string;
  default_servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  leftover_days: number | null;
  ingredients: GeneratedIngredient[];
  manual_steps: CookingStepPayload[];
  machine_steps: CookingStepPayload[];
  tag_ids: string[];
  image_base64?: string;
}

export interface GenerateStreamEvent {
  type: "recipe" | "image" | "error" | "done";
  index?: number;
  data?: GeneratedRecipe | { image_base64: string } | undefined;
  message?: string;
}

export interface BulkCreatePayload {
  recipes: (GeneratedRecipe & { image_base64?: string })[];
}

export interface BulkCreateResponse {
  created_ids: string[];
}

// ── Pagination ──────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total_count: number;
}

// ── Generic ──────────────────────────────────────────────────────

export interface MessageOut {
  detail: string;
}
