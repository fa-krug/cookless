# Next.js Migration — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js app shell and a Drizzle/SQLite schema that is a faithful port of the current Django models, then prove it by migrating the real production SQLite data into it with verified row counts.

**Architecture:** A new Next.js (App Router) project lives in `web/` at the repo root, coexisting with the existing `backend/` and `frontend/` during the rewrite (the final cutover plan removes the old dirs). Drizzle defines the schema; `better-sqlite3` is the driver. A one-time TypeScript script reads the old Django SQLite file and inserts into the new schema. Decimal columns are stored as TEXT to preserve precision.

**Tech Stack:** Next.js (App Router, TypeScript), Drizzle ORM, better-sqlite3, tsx (script runner), Vitest, decimal.js.

## Global Constraints

- **Decimals stored as TEXT** — `conversion_factor`, all `quantity` columns. Never a JS `number`. (spec: Data layer)
- **Binary as BLOB** — passkey `credential_id`, `public_key`. (spec: Data layer)
- **UUID primary keys** preserved as TEXT, matching Django's UUID values verbatim. (spec: Data layer)
- **SQLite only.** No Postgres. (spec: Constraints)
- **Personal Access Tokens dropped** — no `personal_access_tokens` table; skipped during data migration. (spec: Auth scope)
- **No JSONField equivalent** — real columns only; small fixed lists become multiple nullable columns (e.g. `shopping_day_1`, `shopping_day_2`), matching the current backend. (backend/CLAUDE.md)
- New app root is `web/`. All paths below are relative to repo root unless noted.

---

### Task 1: Scaffold the Next.js app

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/next.config.ts`
- Create: `web/app/layout.tsx`
- Create: `web/app/page.tsx`
- Create: `web/.gitignore`
- Create: `web/vitest.config.ts`

**Interfaces:**
- Produces: a runnable Next.js app in `web/` with `npm run dev`, `npm run build`, `npm test` (Vitest) scripts.

- [ ] **Step 1: Create the Next.js project non-interactively**

Run from repo root:
```bash
npx create-next-app@latest web --ts --app --no-tailwind --no-eslint --no-src-dir --import-alias "@/*" --use-npm --skip-install
```
Expected: `web/` created with `app/`, `package.json`, `tsconfig.json`, `next.config.ts`.
(We add Tailwind in the read-pages plan; ESLint config comes later. `--skip-install` keeps this fast; we install in the next step.)

- [ ] **Step 2: Add dev + test dependencies**

Run:
```bash
cd web && npm install && npm install -D tsx vitest @types/better-sqlite3 && npm install drizzle-orm drizzle-kit better-sqlite3 decimal.js
```
Expected: installs complete, `web/node_modules` populated.

- [ ] **Step 3: Add scripts and Vitest config**

Edit `web/package.json` `"scripts"` to include:
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "vitest run",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx scripts/db-migrate.ts",
  "db:seed": "tsx scripts/seed.ts",
  "data:import": "tsx scripts/migrate-data.ts"
}
```

Create `web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

- [ ] **Step 4: Verify the app boots and tests run**

Run:
```bash
cd web && npm run build && npx vitest run --passWithNoTests
```
Expected: Next build succeeds; Vitest exits 0 with "no test files found".

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "chore: scaffold Next.js app in web/"
```

---

### Task 2: Drizzle config + DB client

**Files:**
- Create: `web/drizzle.config.ts`
- Create: `web/lib/db/client.ts`
- Create: `web/lib/db/index.ts`
- Create: `web/.env.local` (gitignored — DB path)

**Interfaces:**
- Produces:
  - `web/lib/db/client.ts` exports `db` (Drizzle instance) and `sqlite` (raw better-sqlite3 handle).
  - `getDbPath(): string` reads `DATABASE_FILE` env, defaults to `./data/cookless.db`.

- [ ] **Step 1: Write the failing test**

Create `web/lib/db/client.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { getDbPath } from "./client";

describe("getDbPath", () => {
  it("defaults to ./data/cookless.db when DATABASE_FILE is unset", () => {
    delete process.env.DATABASE_FILE;
    expect(getDbPath()).toBe("./data/cookless.db");
  });

  it("honours DATABASE_FILE when set", () => {
    process.env.DATABASE_FILE = "/tmp/x.db";
    expect(getDbPath()).toBe("/tmp/x.db");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/db/client.test.ts`
Expected: FAIL — cannot find module `./client`.

- [ ] **Step 3: Write the DB client**

Create `web/lib/db/client.ts`:
```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export function getDbPath(): string {
  return process.env.DATABASE_FILE ?? "./data/cookless.db";
}

export const sqlite = new Database(getDbPath());
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
```

Create `web/lib/db/index.ts`:
```ts
export { db, sqlite, getDbPath } from "./client";
export * as schema from "./schema";
```

Create `web/.env.local`:
```
DATABASE_FILE=./data/cookless.db
```

Add to `web/.gitignore`:
```
/data
.env.local
```

(The schema module is created in Task 3; importing it now is fine because Tasks run in order. If running this task in isolation, create an empty `web/lib/db/schema.ts` first.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/db/client.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Create Drizzle config**

Create `web/drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_FILE ?? "./data/cookless.db" },
});
```

- [ ] **Step 6: Commit**

```bash
git add web/lib/db web/drizzle.config.ts web/.gitignore web/.env.local
git commit -m "feat: add Drizzle config and SQLite client"
```

---

### Task 3: Drizzle schema — faithful port of all models

**Files:**
- Create: `web/lib/db/schema.ts`
- Test: `web/lib/db/schema.test.ts`

**Interfaces:**
- Produces — exported Drizzle tables (table name in parens):
  - `users` (`users`), `households` (`households`), `householdMembers` (`household_members`), `invites` (`invites`), `passkeyCredentials` (`passkey_credentials`)
  - `ingredients` (`ingredients`), `units` (`units`), `tags` (`tags`), `recipes` (`recipes`), `recipeIngredients` (`recipe_ingredients`), `cookingSteps` (`cooking_steps`), `stepIngredients` (`step_ingredients`), `recipeTags` (`recipe_tags`)
  - `mealPlans` (`meal_plans`), `planIterations` (`plan_iterations`), `mealPlanEntries` (`meal_plan_entries`), `mealPlanExcludedTags` (`meal_plan_excluded_tags`)
  - `shoppingLists` (`shopping_lists`), `shoppingListItems` (`shopping_list_items`)
- Convention: UUID PKs → `text("id").primaryKey()`. Django auto-increment PKs (`household_members`, `recipe_ingredients`, `cooking_steps`, `step_ingredients`, M2M tables) → `integer("id").primaryKey({ autoIncrement: true })`. Decimals → `text(...)`. Binary → `blob(...)`. Timestamps → `integer(..., { mode: "timestamp" })`. Dates (DateField) → `text(...)` storing ISO `YYYY-MM-DD`. Booleans → `integer(..., { mode: "boolean" })`.

- [ ] **Step 1: Write the failing test**

Create `web/lib/db/schema.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/db/schema.test.ts`
Expected: FAIL — exports undefined.

- [ ] **Step 3: Write the schema**

Create `web/lib/db/schema.ts`:
```ts
import { sql } from "drizzle-orm";
import {
  blob,
  integer,
  primaryKey,
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
  knownRatio: text("known_ratio").notNull().default("0.7"),
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
```

Notes embedded for the implementer:
- `users.password` is new vs the Django `User` row but Django stores the hash in the same table (`password` column on `auth`/custom user) — the data migration copies it across so password login keeps working.
- `units.baseUnitId` and `mealPlanEntries.sourceEntryId` are self-references; Drizzle can't express a self-FK inline cleanly, so they are plain columns (no `.references`). Integrity is preserved by the source data.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/db/schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Generate the initial migration**

Run: `cd web && npm run db:generate`
Expected: a SQL file appears under `web/drizzle/`.

- [ ] **Step 6: Write the migrate-runner script**

Create `web/scripts/db-migrate.ts`:
```ts
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "../lib/db/client";

migrate(db, { migrationsFolder: "./drizzle" });
console.log("migrations applied");
```

- [ ] **Step 7: Apply migrations to a fresh DB and verify tables exist**

Run:
```bash
cd web && mkdir -p data && rm -f data/cookless.db && npm run db:migrate
```
Then verify with a quick check:
```bash
cd web && npx tsx -e "import('better-sqlite3').then(({default:D})=>{const c=new D('./data/cookless.db');const t=c.prepare(\"select name from sqlite_master where type='table' order by name\").all();console.log(t.map(r=>r.name).join(','))})"
```
Expected: output lists all 19 tables (plus `__drizzle_migrations`).

- [ ] **Step 8: Commit**

```bash
git add web/lib/db/schema.ts web/lib/db/schema.test.ts web/drizzle web/scripts/db-migrate.ts
git commit -m "feat: add Drizzle schema port of all Django models"
```

---

### Task 4: Data migration script (Django SQLite → new schema)

**Files:**
- Create: `web/scripts/migrate-data.ts`
- Create: `web/scripts/lib/table-map.ts`
- Test: `web/scripts/lib/table-map.test.ts`

**Interfaces:**
- Consumes: `web/lib/db/schema.ts`, `web/lib/db/client.ts`.
- Produces:
  - `TABLE_MAP: ReadonlyArray<{ source: string; dest: string; columns: Record<string,string> }>` — ordered parent-before-child, mapping old Django table/column names to new ones.
  - `migrate-data.ts` reads `SOURCE_DB` env (path to old Django `db.sqlite3`), copies every mapped table, and prints a per-table row-count comparison.
- Source Django table names (verbatim): `users_user`, `users_household`, `users_householdmember`, `users_invite`, `users_passkeycredential`, `recipes_ingredient`, `recipes_unit`, `recipes_tag`, `recipes_recipe`, `recipes_recipeingredient`, `recipes_cookingstep`, `recipes_stepingredient`, `recipes_recipe_tags`, `planner_mealplan`, `planner_planiteration`, `planner_mealplanentry`, `planner_mealplan_excluded_tags`, `shopping_shoppinglist`, `shopping_shoppinglistitem`. (Skip `users_personalaccesstoken`.)

- [ ] **Step 1: Write the failing test for the table map**

Create `web/scripts/lib/table-map.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { TABLE_MAP } from "./table-map";

describe("TABLE_MAP", () => {
  it("covers all 19 destination tables and skips personal_access_tokens", () => {
    const dests = TABLE_MAP.map((m) => m.dest);
    expect(dests).toContain("users");
    expect(dests).toContain("recipe_tags");
    expect(dests).toContain("meal_plan_excluded_tags");
    expect(dests).not.toContain("personal_access_tokens");
    expect(new Set(dests).size).toBe(19);
  });

  it("orders parents before children (households before users)", () => {
    const order = TABLE_MAP.map((m) => m.dest);
    expect(order.indexOf("households")).toBeLessThan(order.indexOf("users"));
    expect(order.indexOf("recipes")).toBeLessThan(order.indexOf("recipe_ingredients"));
    expect(order.indexOf("plan_iterations")).toBeLessThan(order.indexOf("shopping_lists"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run scripts/lib/table-map.test.ts`
Expected: FAIL — cannot find `./table-map`.

- [ ] **Step 3: Write the table map**

Create `web/scripts/lib/table-map.ts`. Each entry maps `destColumn: sourceColumn`. (Django FK columns are `<field>_id`; same on both sides except where our names differ.)
```ts
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
    columns: {
      id: "id", household_id: "household_id", title: "title",
      description: "description", list_type: "list_type",
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
```
Note for implementer: the Django M2M through table `planner_mealplan_excluded_tags` names its FK column `mealplan_id` (model name, no underscore) — hence the mapping `meal_plan_id: "mealplan_id"`. Confirm the exact column name by inspecting the source DB (Step 6) before the full run; `recipes_recipe_tags` similarly uses `recipe_id`/`tag_id`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run scripts/lib/table-map.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the migration script**

Create `web/scripts/migrate-data.ts`:
```ts
import Database from "better-sqlite3";
import { TABLE_MAP } from "./lib/table-map";

const SOURCE = process.env.SOURCE_DB;
if (!SOURCE) throw new Error("set SOURCE_DB to the old Django db.sqlite3 path");
const DEST = process.env.DATABASE_FILE ?? "./data/cookless.db";

const src = new Database(SOURCE, { readonly: true });
const dest = new Database(DEST);
dest.pragma("foreign_keys = OFF"); // we control insertion order

let ok = true;
for (const entry of TABLE_MAP) {
  const destCols = Object.keys(entry.columns);
  const srcCols = Object.values(entry.columns);
  const rows = src.prepare(`SELECT ${srcCols.join(", ")} FROM ${entry.source}`).all();
  const placeholders = destCols.map(() => "?").join(", ");
  const insert = dest.prepare(
    `INSERT INTO ${entry.dest} (${destCols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`,
  );
  const tx = dest.transaction((items: Record<string, unknown>[]) => {
    for (const r of items) insert.run(srcCols.map((c) => (r as Record<string, unknown>)[c]));
  });
  tx(rows as Record<string, unknown>[]);

  const got = (dest.prepare(`SELECT count(*) AS n FROM ${entry.dest}`).get() as { n: number }).n;
  const want = (src.prepare(`SELECT count(*) AS n FROM ${entry.source}`).get() as { n: number }).n;
  const status = got === want ? "OK " : "BAD";
  if (got !== want) ok = false;
  console.log(`${status} ${entry.dest.padEnd(24)} ${got}/${want}`);
}
dest.pragma("foreign_keys = ON");
console.log(ok ? "\nALL ROW COUNTS MATCH" : "\nROW COUNT MISMATCH — investigate");
process.exit(ok ? 0 : 1);
```

- [ ] **Step 6: Inspect the real source DB column names**

Run (point at the real prod copy — adjust path):
```bash
cd web && npx tsx -e "import('better-sqlite3').then(({default:D})=>{const c=new D(process.env.SOURCE_DB,{readonly:true});for(const t of ['planner_mealplan_excluded_tags','recipes_recipe_tags']){console.log(t, c.prepare('select * from '+t+' limit 0').columns().map(x=>x.name).join(','))}})" SOURCE_DB=../backend/db.sqlite3
```
Expected: prints the real M2M column names. If they differ from the map (`mealplan_id`, `recipe_id`, `tag_id`), fix `table-map.ts` to match, then re-run Step 4.

- [ ] **Step 7: Run the full data migration against real data**

Run:
```bash
cd web && rm -f data/cookless.db && npm run db:migrate && SOURCE_DB=../backend/db.sqlite3 npm run data:import
```
Expected: every line prints `OK`, final line `ALL ROW COUNTS MATCH`, exit 0.

- [ ] **Step 8: Spot-check decimal + binary fidelity**

Run:
```bash
cd web && npx tsx -e "import('better-sqlite3').then(({default:D})=>{const c=new D('./data/cookless.db',{readonly:true});console.log('qty sample', c.prepare('select quantity from recipe_ingredients limit 3').all());console.log('passkeys', c.prepare('select typeof(credential_id) t, count(*) n from passkey_credentials group by t').all())})"
```
Expected: quantities are exact strings (e.g. `"1.50"`, not `1.5000000001`); `credential_id` typeof is `blob` (or none if you have no passkeys yet).

- [ ] **Step 9: Commit**

```bash
git add web/scripts
git commit -m "feat: add Django-to-Drizzle data migration script"
```

---

## Self-Review

**1. Spec coverage (Plan 1 portion — Foundation / Data layer):**
- Scaffold single Next.js app → Task 1. ✓
- Drizzle + better-sqlite3 client → Task 2. ✓
- All 17 models → tables (+ 2 M2M through tables = 19) → Task 3. ✓
- Decimals as TEXT, binary as BLOB, UUID PKs preserved → Task 3 schema + Task 3 Step 1 tests. ✓
- One-time data migration with row-count verification → Task 4. ✓
- PATs dropped → omitted from schema and table map (Task 3, Task 4 test asserts absence). ✓
- Seed data (tag_defaults, units) → **deferred to Plan 2/3** where the domain + auth code that consumes them lands; the data migration already brings real seeded rows across, so a fresh-seed path isn't needed to validate Plan 1. Noted here so it isn't lost.

**2. Placeholder scan:** No TBD/TODO/"handle errors" placeholders; every code step shows full content. ✓

**3. Type consistency:** Table export names in Task 3 Interfaces match the schema source and the Task 4 `TABLE_MAP` dest names; `getDbPath` signature consistent across Task 2 test and impl. ✓

**Known follow-ups for later plans (not gaps in this plan):**
- `units.baseUnitId` / `mealPlanEntries.sourceEntryId` self-FKs intentionally un-referenced in Drizzle; revisit if Drizzle relations are added in read-pages plan.
- A `sessions` table is added in Plan 3 (Auth), not here.
- `seed.ts` (referenced by the `db:seed` script) is authored in Plan 3 alongside tag defaults; the script entry exists now but the file is created later.
