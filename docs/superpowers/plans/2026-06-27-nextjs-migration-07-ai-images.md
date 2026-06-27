# Plan 7 — AI Generation + Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Next.js `web/` app to feature parity with the Django backend's AI + image surface: recipe image upload / AI-generation / removal / serving, AI recipe generation (NDJSON streaming → preview → bulk-create), and a per-household AI settings page.

**Architecture:** Pure, framework-free, dependency-injected modules in `web/lib/` (image processing via Sharp, Gemini fetch wrappers, prompt builders, bulk-create + image services) — all TDD'd against in-memory SQLite (`createTestDb()`) or mocked `fetch`. Thin `"use server"` actions in `web/app/(app)/actions.ts` wrap services with `withHousehold` + `revalidatePath`. HTTP route handlers exist **only** where HTTP is genuinely required: image serving (`GET /api/images/[...path]`) and NDJSON generation streaming (`POST /api/recipes/generate`). Client islands consume actions/routes and call `useT()` themselves — only serializable props cross the RSC boundary.

**Tech Stack:** Next.js 16 App Router · Drizzle + better-sqlite3 · **Sharp** (new dep, Pillow replacement) · decimal.js · Zod · direct `fetch` to Gemini (`generateContent`) · Vitest.

## Global Constraints

- **Newer Gemini models (user decision 2026-06-27):** text = `gemini-2.5-flash`, image = `gemini-2.5-flash-image`. **Imagen `:predict` is dead** (Imagen shut down 2026-06-24) — image generation MUST use the Gemini image model via `:generateContent`, NOT the old `imagen-4.0-generate-001:predict` endpoint. Model IDs live in ONE constants file (`web/lib/ai/config.ts`) so they are trivial to bump later.
- **Gemini text contract:** `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, header `x-goog-api-key`, body `{ contents:[{parts:[{text}]}], generationConfig:{ responseMimeType:"application/json" } }`, result JSON string at `candidates[0].content.parts[0].text` (must parse to an array). 60s timeout.
- **Gemini image contract:** `POST .../gemini-2.5-flash-image:generateContent`, header `x-goog-api-key`, body `{ contents:[{parts:[{text}]}], generationConfig:{ responseModalities:["Image"] } }`, base64 bytes at `candidates[0].content.parts[].inlineData.data` (find the part that has `inlineData`). 30s timeout.
- **Image processing (Sharp, 1:1 with Pillow `_save_image_as_webp`):** resize so the longest side ≤ **1024px** without enlarging, encode **WebP quality 85**. Filename `recipes/<recipeId>_<unixMillis>.webp`. Delete the old file before writing a new one.
- **Upload limits (1:1 with backend):** max **5 MB**; allowed MIME `image/jpeg`, `image/png`, `image/webp`.
- **Storage:** disk under media root `web/lib/images/config.ts → mediaRoot()` = `resolve(process.env.MEDIA_ROOT ?? "data/media")`. `recipes.image` stores the **relative** path (e.g. `recipes/<id>_<ts>.webp`); `recipeImageUrl()` already maps it to `/api/images/<relative>`.
- **Auth/scoping:** every household-scoped read AND write gated by `requireHousehold()` / household ownership. AI settings writes are OWNER-only via the existing `requireOwner` (already inside `updateHouseholdSettings`). **Never** leak the raw `geminiApiKey` to the client — expose only a boolean "is set".
- **Decimals:** quantities are strings; import `Decimal` from `@/lib/domain/decimal`, never `decimal.js` directly. Quantities persisted as `String(...)`.
- **i18n:** every new key added to BOTH `web/lib/i18n/locales/en.json` and `de.json` (parity enforced; build reads both). Server components use `getI18n()`; client islands use `useT()` from `@/lib/i18n/provider`.
- **Verification per task:** `npm test` (vitest), `npx tsc --noEmit`, and (for tasks touching routes/pages) `npm run build`. There is NO `lint` script in `web/` (ESLint enforced via pre-commit).
- **Test DB helper:** `createTestDb()` from `@/lib/test/db` (in-memory SQLite, `foreign_keys = ON`, migrations applied).

---

## File Structure

**New library modules (pure / DI, unit-tested):**
- `web/lib/images/config.ts` — media-root resolution, upload limits.
- `web/lib/images/storage.ts` — Sharp `processToWebp`, `writeRecipeImage`, `deleteImageFile`, `resolveMediaPath` (traversal guard), `readImage`.
- `web/lib/ai/config.ts` — model IDs, endpoint URL builders, timeouts.
- `web/lib/ai/prompt.ts` — `buildGenerationPrompt`, `buildImagePrompt`, `selectReferenceRecipes` (pure ports).
- `web/lib/ai/gemini.ts` — `callGeminiText`, `generateGeminiImage` (fetch wrappers, AuthError on failure).
- `web/lib/ai/stream-client.ts` — `streamGenerateRecipes` (browser NDJSON reader; pure parsing).
- `web/lib/recipes/images.ts` — `setRecipeImage`, `removeRecipeImage`, `generateRecipeImageFromAI` (household-scoped services).
- `web/lib/recipes/bulk-create.ts` — `bulkCreateRecipes`.
- `web/lib/schemas/generate.ts` — Zod schemas + inferred input types.
- `web/lib/queries/household.ts` — `getHouseholdAiSettings` (read-only, no key leak).

**New routes (HTTP-required only):**
- `web/app/api/images/[...path]/route.ts` — GET serve.
- `web/app/api/recipes/generate/route.ts` — POST NDJSON stream.

**New pages / islands:**
- `web/components/recipes/recipe-image-actions.tsx` — upload/generate/remove island (recipe detail).
- `web/app/(app)/settings/ai/page.tsx` + `web/app/(app)/settings/ai/ai-settings-form.tsx`.
- `web/app/(app)/recipes/generate/page.tsx` + `web/app/(app)/recipes/generate/generate-recipes-client.tsx`.

**Modified:**
- `web/package.json` — add `sharp`.
- `web/app/(app)/actions.ts` — 5 new actions.
- `web/components/recipes/recipe-detail.tsx` + `web/app/(app)/recipes/[id]/page.tsx` — mount image actions (needs `aiEnabled`).
- `web/app/(app)/settings/settings-client.tsx` — link to AI settings.
- `web/app/(app)/recipes/page.tsx` — "Generate with AI" entry (gated on `aiEnabled`).
- `web/lib/i18n/locales/en.json` + `de.json` — new key groups.

---

## Task 1: Image storage (Sharp) + config

**Files:**
- Modify: `web/package.json` (add `sharp`)
- Create: `web/lib/images/config.ts`
- Create: `web/lib/images/storage.ts`
- Test: `web/lib/images/storage.test.ts`

**Interfaces:**
- Produces:
  - `mediaRoot(): string`, `MAX_UPLOAD_BYTES: number`, `ALLOWED_UPLOAD_TYPES: Set<string>` (config.ts)
  - `processToWebp(input: Buffer): Promise<Buffer>`
  - `writeRecipeImage(recipeId: string, webp: Buffer, now: Date): string` (returns relative path)
  - `deleteImageFile(relativePath: string): void`
  - `resolveMediaPath(relativePath: string): string | null` (traversal-safe absolute path, or null)
  - `readImage(relativePath: string): Buffer | null`

- [ ] **Step 1: Install Sharp**

```bash
cd web && npm install sharp@^0.34.0
```
Expected: `sharp` appears under `dependencies` in `web/package.json`.

- [ ] **Step 2: Write `web/lib/images/config.ts`**

```ts
import { resolve } from "node:path";

/** Absolute media root. Recipe images live under `<mediaRoot>/recipes/`. */
export function mediaRoot(): string {
  return resolve(process.env.MEDIA_ROOT ?? "data/media");
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB (parity with Django)
export const ALLOWED_UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
```

- [ ] **Step 3: Write the failing test `web/lib/images/storage.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cookless-img-"));
  process.env.MEDIA_ROOT = dir;
});
afterEach(() => {
  delete process.env.MEDIA_ROOT;
  rmSync(dir, { recursive: true, force: true });
});

async function bigPng(): Promise<Buffer> {
  return sharp({ create: { width: 2000, height: 1500, channels: 3, background: "red" } })
    .png()
    .toBuffer();
}

describe("processToWebp", () => {
  it("downscales longest side to <=1024 and outputs webp", async () => {
    const { processToWebp } = await import("./storage");
    const out = await processToWebp(await bigPng());
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1024);
  });

  it("does not enlarge small images", async () => {
    const { processToWebp } = await import("./storage");
    const small = await sharp({ create: { width: 50, height: 50, channels: 3, background: "blue" } })
      .png()
      .toBuffer();
    const meta = await sharp(await processToWebp(small)).metadata();
    expect(meta.width).toBe(50);
  });
});

describe("write / read / delete", () => {
  it("writes a relative recipes/<id>_<ts>.webp path and reads it back", async () => {
    const { processToWebp, writeRecipeImage, readImage } = await import("./storage");
    const webp = await processToWebp(await bigPng());
    const now = new Date("2026-06-27T12:00:00Z");
    const rel = writeRecipeImage("rid", webp, now);
    expect(rel).toBe(`recipes/rid_${now.getTime()}.webp`);
    expect(readImage(rel)).not.toBeNull();
  });

  it("deleteImageFile removes the file and tolerates empty/missing", async () => {
    const { processToWebp, writeRecipeImage, deleteImageFile, resolveMediaPath } = await import("./storage");
    const rel = writeRecipeImage("rid", await processToWebp(await bigPng()), new Date(1000));
    expect(existsSync(resolveMediaPath(rel)!)).toBe(true);
    deleteImageFile(rel);
    expect(existsSync(resolveMediaPath(rel)!)).toBe(false);
    expect(() => deleteImageFile("")).not.toThrow();
    expect(() => deleteImageFile("recipes/nope.webp")).not.toThrow();
  });

  it("resolveMediaPath blocks path traversal", async () => {
    const { resolveMediaPath } = await import("./storage");
    expect(resolveMediaPath("../../etc/passwd")).toBeNull();
    expect(resolveMediaPath("recipes/ok.webp")).not.toBeNull();
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `cd web && npx vitest run lib/images/storage.test.ts`
Expected: FAIL (`Cannot find module './storage'`).

- [ ] **Step 5: Write `web/lib/images/storage.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import sharp from "sharp";
import { mediaRoot } from "./config";

/** Resize longest side to <=1024 (never enlarge) and encode WebP q85 — matches Pillow `_save_image_as_webp`. */
export async function processToWebp(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
}

/** Write a processed image and return its path relative to the media root. */
export function writeRecipeImage(recipeId: string, webp: Buffer, now: Date): string {
  const rel = `recipes/${recipeId}_${now.getTime()}.webp`;
  const abs = join(mediaRoot(), rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, webp);
  return rel;
}

/** Resolve a relative media path to an absolute path inside the media root, or null if it escapes. */
export function resolveMediaPath(relativePath: string): string | null {
  if (!relativePath) return null;
  const root = mediaRoot();
  const abs = resolve(root, relativePath);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return abs;
}

export function deleteImageFile(relativePath: string): void {
  const abs = resolveMediaPath(relativePath);
  if (abs && existsSync(abs)) rmSync(abs);
}

export function readImage(relativePath: string): Buffer | null {
  const abs = resolveMediaPath(relativePath);
  if (!abs || !existsSync(abs)) return null;
  return readFileSync(abs);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd web && npx vitest run lib/images/storage.test.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Commit**

```bash
git add web/package.json web/package-lock.json web/lib/images/
git commit -m "feat(web): image storage + Sharp processing (Plan 7 Task 1)"
```

---

## Task 2: Image service — set / remove

**Files:**
- Create: `web/lib/recipes/images.ts`
- Test: `web/lib/recipes/images.test.ts`

**Interfaces:**
- Consumes: `processToWebp`, `writeRecipeImage`, `deleteImageFile` (Task 1); `recipes` table; `AuthError`.
- Produces:
  - `setRecipeImage(db: Db, householdId: string, recipeId: string, input: Buffer, now: Date): Promise<void>`
  - `removeRecipeImage(db: Db, householdId: string, recipeId: string): void`

- [ ] **Step 1: Write the failing test `web/lib/recipes/images.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { createTestDb } from "@/lib/test/db";
import { households, recipes } from "@/lib/db/schema";
import { resolveMediaPath } from "@/lib/images/storage";
import { setRecipeImage, removeRecipeImage } from "./images";
import { AuthError } from "@/lib/auth/errors";

const now = new Date("2026-06-27T12:00:00Z");
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cookless-svc-"));
  process.env.MEDIA_ROOT = dir;
});
afterEach(() => {
  delete process.env.MEDIA_ROOT;
  rmSync(dir, { recursive: true, force: true });
});

function seed() {
  const db = createTestDb();
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  db.insert(households).values({ id: "h2", name: "Other", createdAt: now }).run();
  db.insert(recipes)
    .values({ id: "r1", householdId: "h1", title: "Soup", listType: "KNOWN", createdAt: now, updatedAt: now })
    .run();
  return db;
}
const png = () => sharp({ create: { width: 100, height: 100, channels: 3, background: "green" } }).png().toBuffer();

describe("setRecipeImage", () => {
  it("processes, stores, and records the relative path", async () => {
    const db = seed();
    await setRecipeImage(db, "h1", "r1", await png(), now);
    const row = db.select().from(recipes).where(eq(recipes.id, "r1")).get();
    expect(row?.image).toMatch(/^recipes\/r1_\d+\.webp$/);
    expect(existsSync(resolveMediaPath(row!.image)!)).toBe(true);
  });

  it("deletes the previous file when replacing", async () => {
    const db = seed();
    await setRecipeImage(db, "h1", "r1", await png(), new Date(1000));
    const first = db.select().from(recipes).where(eq(recipes.id, "r1")).get()!.image;
    await setRecipeImage(db, "h1", "r1", await png(), new Date(2000));
    const second = db.select().from(recipes).where(eq(recipes.id, "r1")).get()!.image;
    expect(second).not.toBe(first);
    expect(existsSync(resolveMediaPath(first)!)).toBe(false);
  });

  it("rejects a recipe from another household with 404", async () => {
    const db = seed();
    await expect(setRecipeImage(db, "h2", "r1", await png(), now)).rejects.toMatchObject({ status: 404 });
  });
});

describe("removeRecipeImage", () => {
  it("clears the field and deletes the file", async () => {
    const db = seed();
    await setRecipeImage(db, "h1", "r1", await png(), now);
    const rel = db.select().from(recipes).where(eq(recipes.id, "r1")).get()!.image;
    removeRecipeImage(db, "h1", "r1");
    expect(db.select().from(recipes).where(eq(recipes.id, "r1")).get()!.image).toBe("");
    expect(existsSync(resolveMediaPath(rel)!)).toBe(false);
  });

  it("no-ops when there is no image", () => {
    const db = seed();
    expect(() => removeRecipeImage(db, "h1", "r1")).not.toThrow();
  });

  it("rejects cross-household with 404", () => {
    const db = seed();
    expect(() => removeRecipeImage(db, "h2", "r1")).toThrow(AuthError);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd web && npx vitest run lib/recipes/images.test.ts`
Expected: FAIL (`setRecipeImage` not exported).

- [ ] **Step 3: Write `web/lib/recipes/images.ts`**

```ts
import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { recipes } from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/errors";
import { processToWebp, writeRecipeImage, deleteImageFile } from "@/lib/images/storage";

function ownedRecipe(db: Db, householdId: string, recipeId: string): { image: string } {
  const row = db
    .select({ image: recipes.image })
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)))
    .get();
  if (!row) throw new AuthError(404, "Recipe not found");
  return row;
}

export async function setRecipeImage(
  db: Db,
  householdId: string,
  recipeId: string,
  input: Buffer,
  now: Date,
): Promise<void> {
  const { image: old } = ownedRecipe(db, householdId, recipeId);
  const webp = await processToWebp(input);
  const rel = writeRecipeImage(recipeId, webp, now);
  if (old) deleteImageFile(old);
  db.update(recipes).set({ image: rel, updatedAt: now }).where(eq(recipes.id, recipeId)).run();
}

export function removeRecipeImage(db: Db, householdId: string, recipeId: string): void {
  const { image } = ownedRecipe(db, householdId, recipeId);
  if (image) deleteImageFile(image);
  db.update(recipes).set({ image: "" }).where(eq(recipes.id, recipeId)).run();
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd web && npx vitest run lib/recipes/images.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/recipes/images.ts web/lib/recipes/images.test.ts
git commit -m "feat(web): recipe image set/remove service (Plan 7 Task 2)"
```

---

## Task 3: AI config + prompt builders

**Files:**
- Create: `web/lib/ai/config.ts`
- Create: `web/lib/ai/prompt.ts`
- Test: `web/lib/ai/prompt.test.ts`

**Interfaces:**
- Produces (config.ts): `GEMINI_TEXT_MODEL`, `GEMINI_IMAGE_MODEL`, `textGenerateUrl(): string`, `imageGenerateUrl(): string`, `TEXT_TIMEOUT_MS=60000`, `IMAGE_TIMEOUT_MS=30000`.
- Produces (prompt.ts):
  - `interface PromptRecipe { title; defaultServings; prepTimeMinutes; cookTimeMinutes; leftoverDays; tagNames: string[]; ingredientLines: string[]; manualInstructions: string[]; machineInstructions: string[] }`
  - `interface RecipeForSelection { id: string; tagIds: string[] }`
  - `selectReferenceRecipes<T extends RecipeForSelection>(all: T[], requiredTagIds: string[], max: number): T[]`
  - `buildGenerationPrompt(args: { count; freeText; language; ingredients: {nameEn;nameDe;category}[]; units: {abbreviation;nameEn;nameDe}[]; tags: {id;nameEn;nameDe;category}[]; requiredTagIds: string[]; referenceRecipes: PromptRecipe[]; allTitles: string[] }): string`
  - `buildImagePrompt(title: string, ingredientNames: string[]): string`

- [ ] **Step 1: Write the failing test `web/lib/ai/prompt.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { buildGenerationPrompt, buildImagePrompt, selectReferenceRecipes } from "./prompt";

const base = {
  count: 5,
  freeText: "",
  language: "en",
  ingredients: [{ nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" }],
  units: [{ abbreviation: "g", nameEn: "gram", nameDe: "Gramm" }],
  tags: [
    { id: "t1", nameEn: "Vegan", nameDe: "Vegan", category: "DIETARY" },
    { id: "t2", nameEn: "Italian", nameDe: "Italienisch", category: "CUISINE" },
  ],
  requiredTagIds: [] as string[],
  referenceRecipes: [],
  allTitles: [] as string[],
};

describe("buildGenerationPrompt", () => {
  it("includes the final 'Generate exactly N recipes' instruction", () => {
    expect(buildGenerationPrompt(base)).toContain("Generate exactly 5 recipes");
  });
  it("lists required tags when requiredTagIds given", () => {
    const p = buildGenerationPrompt({ ...base, requiredTagIds: ["t1"] });
    expect(p).toContain("REQUIRED TAGS");
    expect(p).toContain("Vegan");
  });
  it("includes free text when present", () => {
    const p = buildGenerationPrompt({ ...base, freeText: "spicy comfort food" });
    expect(p).toContain("ADDITIONAL REQUIREMENTS");
    expect(p).toContain("spicy comfort food");
  });
  it("includes a do-not-recreate list from existing titles", () => {
    const p = buildGenerationPrompt({ ...base, allTitles: ["Old Soup"] });
    expect(p).toContain("Do NOT recreate");
    expect(p).toContain("Old Soup");
  });
  it("uses German in the schema note when language=de", () => {
    expect(buildGenerationPrompt({ ...base, language: "de" })).toContain("German");
  });
  it("renders reference recipes when provided", () => {
    const p = buildGenerationPrompt({
      ...base,
      referenceRecipes: [
        {
          title: "Ref Dish",
          defaultServings: 2,
          prepTimeMinutes: 10,
          cookTimeMinutes: 20,
          leftoverDays: 1,
          tagNames: ["Vegan"],
          ingredientLines: ["100 g Tomato"],
          manualInstructions: ["Chop"],
          machineInstructions: [],
        },
      ],
    });
    expect(p).toContain("STYLE REFERENCE");
    expect(p).toContain("Ref Dish");
  });
});

describe("selectReferenceRecipes", () => {
  it("prioritizes tag-matching recipes then fills, capped at max", () => {
    const all = [
      { id: "a", tagIds: ["x"] },
      { id: "b", tagIds: ["t1"] },
      { id: "c", tagIds: [] },
    ];
    const out = selectReferenceRecipes(all, ["t1"], 2);
    expect(out.map((r) => r.id)).toEqual(["b", "a"]);
  });
  it("returns up to max when no required tags", () => {
    const all = [{ id: "a", tagIds: [] }, { id: "b", tagIds: [] }];
    expect(selectReferenceRecipes(all, [], 1)).toHaveLength(1);
  });
});

describe("buildImagePrompt", () => {
  it("embeds title and ingredients, falls back to 'various'", () => {
    expect(buildImagePrompt("Pasta", ["Tomato", "Basil"])).toContain("Dish: Pasta");
    expect(buildImagePrompt("Pasta", ["Tomato", "Basil"])).toContain("Tomato, Basil");
    expect(buildImagePrompt("Pasta", [])).toContain("various");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd web && npx vitest run lib/ai/prompt.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `web/lib/ai/config.ts`**

```ts
// Newer Gemini models (Plan 7 decision 2026-06-27). Imagen :predict is retired — image
// generation uses the Gemini image model via :generateContent. Bump these IDs here when needed.
export const GEMINI_TEXT_MODEL = "gemini-2.5-flash";
export const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const textGenerateUrl = (): string => `${BASE}/${GEMINI_TEXT_MODEL}:generateContent`;
export const imageGenerateUrl = (): string => `${BASE}/${GEMINI_IMAGE_MODEL}:generateContent`;

export const TEXT_TIMEOUT_MS = 60_000;
export const IMAGE_TIMEOUT_MS = 30_000;
```

- [ ] **Step 4: Write `web/lib/ai/prompt.ts`** (1:1 port of `backend/recipes/generation.py::build_generation_prompt` + the `IMAGE_PROMPT_TEMPLATE`)

```ts
export interface PromptRecipe {
  title: string;
  defaultServings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  leftoverDays: number | null;
  tagNames: string[];
  ingredientLines: string[]; // e.g. "100 g Tomato"
  manualInstructions: string[];
  machineInstructions: string[];
}
export interface RecipeForSelection {
  id: string;
  tagIds: string[];
}
export interface BuildPromptArgs {
  count: number;
  freeText: string;
  language: string;
  ingredients: { nameEn: string; nameDe: string; category: string }[];
  units: { abbreviation: string; nameEn: string; nameDe: string }[];
  tags: { id: string; nameEn: string; nameDe: string; category: string }[];
  requiredTagIds: string[];
  referenceRecipes: PromptRecipe[];
  allTitles: string[];
}

/** Tag-matching recipes first, then fill with the rest, capped at `max`. Ports the Django query order. */
export function selectReferenceRecipes<T extends RecipeForSelection>(
  all: T[],
  requiredTagIds: string[],
  max: number,
): T[] {
  if (max <= 0) return [];
  const required = new Set(requiredTagIds);
  const matching = required.size
    ? all.filter((r) => r.tagIds.some((id) => required.has(id)))
    : [];
  const matchingIds = new Set(matching.map((r) => r.id));
  const rest = all.filter((r) => !matchingIds.has(r.id));
  return [...matching, ...rest].slice(0, max);
}

export function buildGenerationPrompt(args: BuildPromptArgs): string {
  const sections: string[] = [];
  const langNote = args.language === "de" ? "German" : "English";

  sections.push(
    "You are a professional recipe creator. " +
      "Your task is to generate creative, delicious recipes. " +
      "Output structured JSON only.",
  );

  sections.push(
    `OUTPUT SCHEMA:\n` +
      `Return a JSON array of recipe objects. Each object must have:\n` +
      `- title (string, in ${langNote})\n` +
      `- default_servings (integer, typically 2-4)\n` +
      `- prep_time_minutes (integer)\n` +
      `- cook_time_minutes (integer)\n` +
      `- leftover_days (integer, 0-3)\n` +
      `- ingredients (array of objects with: name_en, name_de, category ` +
      `[PRODUCE/DAIRY/MEAT/PANTRY/FROZEN/OTHER], quantity (number), ` +
      `unit_abbreviation (string), order (integer starting at 0))\n` +
      `- manual_steps (array of objects with step_number (integer) and ` +
      `instruction (string in ${langNote}))\n` +
      `- machine_steps (array of step objects for Thermomix or similar kitchen machines; can be empty.\n` +
      `  Each step is EITHER free text OR a structured program:\n` +
      `  Free text: {"step_number": 1, "instruction": "Add ingredients"}\n` +
      `  Program: {"step_number": 1, "instruction": "", "program_type": "MANUAL_COOKING", ` +
      `"temperature": 100, "duration_seconds": 300, "speed": 5, "direction": "LEFT", "turbo": false}\n` +
      `  Available programs:\n` +
      `  - MANUAL_COOKING: temperature (37-130°C), duration_seconds (1-5940), speed (1-10), direction (LEFT/RIGHT), turbo (bool, optional)\n` +
      `  - CHOPPING: duration_seconds (1-5940), speed (1-10)\n` +
      `  - KNEADING: duration_seconds (1-5940)\n` +
      `  - STEAMING: temperature (37-130°C), duration_seconds (1-5940)\n` +
      `  - BLENDING: duration_seconds (1-5940)\n` +
      `  - SEARING: temperature (37-130°C), duration_seconds (1-5940), speed (1-10)\n` +
      `  - SLOW_COOKING: temperature (37-130°C), duration_seconds (1-43200)\n` +
      `  - SOUS_VIDE: temperature (37-130°C), duration_seconds (1-43200)\n` +
      `  - WEIGHING: weight_grams (1-5000)\n` +
      `  - TURBO: duration_seconds (1-60)\n` +
      `  - EGG_COOKING: duration_seconds (1-5940)\n` +
      `  - FERMENTATION: temperature (37-60°C), duration_seconds (1-43200)\n` +
      `  - PRE_CLEANING: (no parameters)\n` +
      `  Prefer structured programs over free text when the step is a machine operation.)\n` +
      `- tag_names_en (array of strings, English tag names that apply)`,
  );

  if (args.ingredients.length) {
    const lines = args.ingredients.map((i) => `  - ${i.nameEn} / ${i.nameDe} (${i.category})`);
    sections.push(
      "EXISTING INGREDIENTS (use exact names when possible; " +
        "new ingredients allowed following the same pattern):\n" +
        lines.join("\n"),
    );
  }

  if (args.units.length) {
    const lines = args.units.map((u) => `  - ${u.abbreviation} (${u.nameEn} / ${u.nameDe})`);
    sections.push("AVAILABLE UNITS:\n" + lines.join("\n"));
  }

  const required = new Set(args.requiredTagIds);
  const selectedTags = args.tags.filter((t) => required.has(t.id));
  if (selectedTags.length) {
    sections.push(
      "REQUIRED TAGS (every generated recipe MUST match these):\n" +
        selectedTags.map((t) => t.nameEn).join(", "),
    );
  }
  if (args.tags.length) {
    sections.push(
      "ALL AVAILABLE TAGS:\n" + args.tags.map((t) => `${t.nameEn} (${t.category})`).join(", "),
    );
  }

  if (args.referenceRecipes.length) {
    const refs = args.referenceRecipes.map((r) => {
      return (
        `  Title: ${r.title}\n` +
        `  Servings: ${r.defaultServings}\n` +
        `  Prep time: ${r.prepTimeMinutes} min\n` +
        `  Cook time: ${r.cookTimeMinutes} min\n` +
        `  Leftover days: ${r.leftoverDays}\n` +
        `  Tags: ${r.tagNames.join(", ")}\n` +
        `  Ingredients:\n` +
        r.ingredientLines.join("\n") +
        `\n  Manual steps: ${JSON.stringify(r.manualInstructions)}\n` +
        `  Machine steps: ${JSON.stringify(r.machineInstructions)}`
      );
    });
    sections.push(
      "STYLE REFERENCE (existing recipes for tone and format reference):\n" + refs.join("\n---\n"),
    );
  }

  if (args.allTitles.length) {
    sections.push(
      "Do NOT recreate or closely duplicate any of the following existing recipes. " +
        "Generate completely different recipes:\n" +
        args.allTitles.map((t) => `  - ${t}`).join("\n"),
    );
  }

  sections.push(
    "VARIETY: Vary cooking methods, main ingredients, and complexity across " +
      "the generated recipes. Avoid repeating the same protein or cooking technique.",
  );

  if (args.freeText && args.freeText.trim()) {
    sections.push(`ADDITIONAL REQUIREMENTS:\n${args.freeText.trim()}`);
  }

  sections.push(`Generate exactly ${args.count} recipes. Respond with ONLY the JSON array.`);

  return sections.join("\n\n");
}

export function buildImagePrompt(title: string, ingredientNames: string[]): string {
  const ingredients = ingredientNames.length ? ingredientNames.join(", ") : "various";
  return (
    "You are a professional food photographer. Generate a photorealistic, " +
    "appetizing overhead shot of the following dish on a clean, modern table setting with natural lighting.\n\n" +
    `Dish: ${title}\n` +
    `Key ingredients: ${ingredients}\n\n` +
    "Style: Top-down food photography, shallow depth of field, warm natural light, minimalist plating " +
    "on a white or neutral ceramic plate. No text, no watermarks, no people."
  );
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd web && npx vitest run lib/ai/prompt.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/lib/ai/config.ts web/lib/ai/prompt.ts web/lib/ai/prompt.test.ts
git commit -m "feat(web): Gemini config + prompt builders (Plan 7 Task 3)"
```

---

## Task 4: Gemini fetch wrappers

**Files:**
- Create: `web/lib/ai/gemini.ts`
- Test: `web/lib/ai/gemini.test.ts`

**Interfaces:**
- Consumes: config URLs/timeouts (Task 3); `AuthError`.
- Produces:
  - `callGeminiText(apiKey: string, prompt: string): Promise<unknown[]>`
  - `generateGeminiImage(apiKey: string, prompt: string): Promise<Buffer>`

- [ ] **Step 1: Write the failing test `web/lib/ai/gemini.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { callGeminiText, generateGeminiImage } from "./gemini";

afterEach(() => vi.restoreAllMocks());

function mockFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, status, json: async () => body }) as unknown as Response),
  );
}

describe("callGeminiText", () => {
  it("parses the JSON array from candidates[0].content.parts[0].text", async () => {
    mockFetch({ candidates: [{ content: { parts: [{ text: '[{"title":"A"}]' }] } }] });
    const out = await callGeminiText("k", "p");
    expect(out).toEqual([{ title: "A" }]);
  });
  it("throws AuthError 502 on non-ok response", async () => {
    mockFetch({}, false, 500);
    await expect(callGeminiText("k", "p")).rejects.toMatchObject({ status: 502 });
  });
  it("throws when the model text is not a JSON array", async () => {
    mockFetch({ candidates: [{ content: { parts: [{ text: '{"not":"array"}' }] } }] });
    await expect(callGeminiText("k", "p")).rejects.toMatchObject({ status: 502 });
  });
});

describe("generateGeminiImage", () => {
  it("returns a Buffer from inlineData.data", async () => {
    const b64 = Buffer.from("hello").toString("base64");
    mockFetch({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: b64 } }] } }] });
    const buf = await generateGeminiImage("k", "p");
    expect(buf.toString()).toBe("hello");
  });
  it("throws AuthError 502 when no image part is present", async () => {
    mockFetch({ candidates: [{ content: { parts: [{ text: "nope" }] } }] });
    await expect(generateGeminiImage("k", "p")).rejects.toMatchObject({ status: 502 });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd web && npx vitest run lib/ai/gemini.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `web/lib/ai/gemini.ts`**

```ts
import { AuthError } from "@/lib/auth/errors";
import {
  IMAGE_TIMEOUT_MS,
  TEXT_TIMEOUT_MS,
  imageGenerateUrl,
  textGenerateUrl,
} from "./config";

async function postJson(url: string, apiKey: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    throw new AuthError(502, "Gemini request failed");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new AuthError(502, `Gemini request failed: ${res.status}`);
  return res.json();
}

/** Returns the parsed JSON array of recipe objects from Gemini text generation. */
export async function callGeminiText(apiKey: string, prompt: string): Promise<unknown[]> {
  const data = (await postJson(
    textGenerateUrl(),
    apiKey,
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } },
    TEXT_TIMEOUT_MS,
  )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new AuthError(502, "Gemini returned no content");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AuthError(502, "Gemini response was not valid JSON");
  }
  if (!Array.isArray(parsed)) throw new AuthError(502, "Gemini response is not a JSON array");
  return parsed;
}

/** Returns raw image bytes from the Gemini image model. */
export async function generateGeminiImage(apiKey: string, prompt: string): Promise<Buffer> {
  const data = (await postJson(
    imageGenerateUrl(),
    apiKey,
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["Image"] } },
    IMAGE_TIMEOUT_MS,
  )) as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] };

  const part = data.candidates?.[0]?.content?.parts?.find((p) => p?.inlineData?.data);
  const b64 = part?.inlineData?.data;
  if (!b64) throw new AuthError(502, "Image generation returned no image");
  return Buffer.from(b64, "base64");
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npx vitest run lib/ai/gemini.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/ai/gemini.ts web/lib/ai/gemini.test.ts
git commit -m "feat(web): Gemini text + image fetch wrappers (Plan 7 Task 4)"
```

---

## Task 5: AI recipe-image generation service

**Files:**
- Modify: `web/lib/recipes/images.ts`
- Modify: `web/lib/recipes/images.test.ts`

**Interfaces:**
- Consumes: `households`/`recipes`/`recipeIngredients`/`ingredients` tables; `buildImagePrompt` (Task 3); `processToWebp`/`writeRecipeImage`/`deleteImageFile` (Task 1).
- Produces:
  - `type ImageGenerator = (apiKey: string, prompt: string) => Promise<Buffer>`
  - `generateRecipeImageFromAI(db: Db, householdId: string, recipeId: string, now: Date, genImage: ImageGenerator): Promise<void>` — throws `AuthError(403)` if AI disabled, `AuthError(400)` if no key, `AuthError(404)` if not owned.

- [ ] **Step 1: Add the failing test to `web/lib/recipes/images.test.ts`**

```ts
// add imports at top:
import { ingredients, recipeIngredients, units } from "@/lib/db/schema";
import { generateRecipeImageFromAI } from "./images";

// add a describe block:
describe("generateRecipeImageFromAI", () => {
  function seedAi(opts: { aiEnabled: boolean; key: string }) {
    const db = createTestDb();
    db.insert(households).values({ id: "h1", name: "Home", aiEnabled: opts.aiEnabled, geminiApiKey: opts.key, createdAt: now }).run();
    db.insert(recipes).values({ id: "r1", householdId: "h1", title: "Soup", listType: "KNOWN", createdAt: now, updatedAt: now }).run();
    db.insert(ingredients).values({ id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" }).run();
    db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g" }).run();
    db.insert(recipeIngredients).values({ recipeId: "r1", ingredientId: 1, quantity: "100", unitId: 1, order: 0 }).run();
    return db;
  }
  const fakeGen = async () =>
    (await import("sharp")).default({ create: { width: 80, height: 80, channels: 3, background: "red" } }).png().toBuffer();

  it("generates, processes, and stores an image", async () => {
    const db = seedAi({ aiEnabled: true, key: "k" });
    await generateRecipeImageFromAI(db, "h1", "r1", now, fakeGen);
    const row = db.select().from(recipes).where(eq(recipes.id, "r1")).get();
    expect(row?.image).toMatch(/^recipes\/r1_\d+\.webp$/);
  });
  it("rejects when AI disabled (403)", async () => {
    const db = seedAi({ aiEnabled: false, key: "k" });
    await expect(generateRecipeImageFromAI(db, "h1", "r1", now, fakeGen)).rejects.toMatchObject({ status: 403 });
  });
  it("rejects when no key (400)", async () => {
    const db = seedAi({ aiEnabled: true, key: "" });
    await expect(generateRecipeImageFromAI(db, "h1", "r1", now, fakeGen)).rejects.toMatchObject({ status: 400 });
  });
  it("rejects cross-household (404)", async () => {
    const db = seedAi({ aiEnabled: true, key: "k" });
    await expect(generateRecipeImageFromAI(db, "hX", "r1", now, fakeGen)).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd web && npx vitest run lib/recipes/images.test.ts`
Expected: FAIL (`generateRecipeImageFromAI` not exported).

- [ ] **Step 3: Extend `web/lib/recipes/images.ts`**

Add imports and the new function (keep existing exports):

```ts
// add to imports:
import { households, ingredients, recipeIngredients } from "@/lib/db/schema";
import { buildImagePrompt } from "@/lib/ai/prompt";

export type ImageGenerator = (apiKey: string, prompt: string) => Promise<Buffer>;

export async function generateRecipeImageFromAI(
  db: Db,
  householdId: string,
  recipeId: string,
  now: Date,
  genImage: ImageGenerator,
): Promise<void> {
  const household = db
    .select({ aiEnabled: households.aiEnabled, key: households.geminiApiKey })
    .from(households)
    .where(eq(households.id, householdId))
    .get();
  if (!household?.aiEnabled) throw new AuthError(403, "AI features are disabled");
  if (!household.key) throw new AuthError(400, "Gemini API key not configured");

  const recipe = db
    .select({ title: recipes.title, oldImage: recipes.image })
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)))
    .get();
  if (!recipe) throw new AuthError(404, "Recipe not found");

  const ingRows = db
    .select({ nameEn: ingredients.nameEn })
    .from(recipeIngredients)
    .innerJoin(ingredients, eq(recipeIngredients.ingredientId, ingredients.id))
    .where(eq(recipeIngredients.recipeId, recipeId))
    .orderBy(recipeIngredients.order)
    .all();
  const names = ingRows.slice(0, 10).map((r) => r.nameEn);

  const bytes = await genImage(household.key, buildImagePrompt(recipe.title, names));
  const webp = await processToWebp(bytes);
  const rel = writeRecipeImage(recipeId, webp, now);
  if (recipe.oldImage) deleteImageFile(recipe.oldImage);
  db.update(recipes).set({ image: rel, updatedAt: now }).where(eq(recipes.id, recipeId)).run();
}
```

> Note: `ownedRecipe` (Task 2) only selects `image`; this function re-queries to also get `title`. That's intentional — keep both.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npx vitest run lib/recipes/images.test.ts`
Expected: PASS (all set/remove + generate cases).

- [ ] **Step 5: Commit**

```bash
git add web/lib/recipes/images.ts web/lib/recipes/images.test.ts
git commit -m "feat(web): AI recipe-image generation service (Plan 7 Task 5)"
```

---

## Task 6: Bulk-create service

**Files:**
- Create: `web/lib/recipes/bulk-create.ts`
- Test: `web/lib/recipes/bulk-create.test.ts`

**Interfaces:**
- Consumes: `recipes`/`recipeIngredients`/`cookingSteps`/`recipeTags`/`ingredients`/`units`/`tags` tables; `processToWebp`/`writeRecipeImage` (Task 1).
- Produces:
  - `interface BulkIngredientInput { nameEn; nameDe; category: string; quantity: string; unitAbbreviation: string; order: number }`
  - `interface BulkStepInput { stepNumber: number; instruction: string; programType?: string; temperature?: number | null; durationSeconds?: number | null; speed?: number | null; turbo?: boolean; direction?: string; weightGrams?: number | null }`
  - `interface BulkRecipeInput { title; description?: string; defaultServings: number; prepTimeMinutes: number | null; cookTimeMinutes: number | null; leftoverDays: number | null; ingredients: BulkIngredientInput[]; manualSteps: BulkStepInput[]; machineSteps: BulkStepInput[]; tagIds: string[]; imageBase64?: string | null }`
  - `bulkCreateRecipes(db: Db, householdId: string, input: { recipes: BulkRecipeInput[] }, now: Date): Promise<{ createdIds: string[] }>`

- [ ] **Step 1: Write the failing test `web/lib/recipes/bulk-create.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { createTestDb } from "@/lib/test/db";
import {
  households, ingredients, units, tags, recipes, recipeIngredients, cookingSteps, recipeTags,
} from "@/lib/db/schema";
import { bulkCreateRecipes } from "./bulk-create";

const now = new Date("2026-06-27T12:00:00Z");
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cookless-bulk-"));
  process.env.MEDIA_ROOT = dir;
});
afterEach(() => {
  delete process.env.MEDIA_ROOT;
  rmSync(dir, { recursive: true, force: true });
});

function seed() {
  const db = createTestDb();
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  db.insert(units).values({ id: 1, nameEn: "gram", nameDe: "Gramm", abbreviation: "g" }).run();
  db.insert(ingredients).values({ id: 1, nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE" }).run();
  db.insert(tags).values({ id: "t1", householdId: "h1", category: "DIETARY", nameEn: "Vegan", nameDe: "Vegan", isDefault: true }).run();
  return db;
}

describe("bulkCreateRecipes", () => {
  it("creates recipes as TO_TRY with ingredients, steps, and tags", async () => {
    const db = seed();
    const res = await bulkCreateRecipes(db, "h1", {
      recipes: [{
        title: "Pasta", defaultServings: 2, prepTimeMinutes: 10, cookTimeMinutes: 20, leftoverDays: 1,
        ingredients: [{ nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE", quantity: "100", unitAbbreviation: "g", order: 0 }],
        manualSteps: [{ stepNumber: 1, instruction: "Boil" }],
        machineSteps: [],
        tagIds: ["t1"],
      }],
    }, now);
    expect(res.createdIds).toHaveLength(1);
    const id = res.createdIds[0];
    expect(db.select().from(recipes).where(eq(recipes.id, id)).get()?.listType).toBe("TO_TRY");
    expect(db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, id)).all()).toHaveLength(1);
    expect(db.select().from(cookingSteps).where(eq(cookingSteps.recipeId, id)).all()).toHaveLength(1);
    expect(db.select().from(recipeTags).where(eq(recipeTags.recipeId, id)).all()).toHaveLength(1);
  });

  it("auto-creates unknown ingredients (case-insensitive match)", async () => {
    const db = seed();
    await bulkCreateRecipes(db, "h1", {
      recipes: [{
        title: "New", defaultServings: 2, prepTimeMinutes: null, cookTimeMinutes: null, leftoverDays: null,
        ingredients: [{ nameEn: "Basil", nameDe: "Basilikum", category: "PRODUCE", quantity: "5", unitAbbreviation: "g", order: 0 }],
        manualSteps: [], machineSteps: [], tagIds: [],
      }],
    }, now);
    expect(db.select().from(ingredients).all().length).toBe(2); // Tomato + Basil
  });

  it("skips ingredients with unknown units", async () => {
    const db = seed();
    const res = await bulkCreateRecipes(db, "h1", {
      recipes: [{
        title: "X", defaultServings: 2, prepTimeMinutes: null, cookTimeMinutes: null, leftoverDays: null,
        ingredients: [{ nameEn: "Tomato", nameDe: "Tomate", category: "PRODUCE", quantity: "1", unitAbbreviation: "zzz", order: 0 }],
        manualSteps: [], machineSteps: [], tagIds: [],
      }],
    }, now);
    expect(db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, res.createdIds[0])).all()).toHaveLength(0);
  });

  it("ignores tag ids from another household", async () => {
    const db = seed();
    const res = await bulkCreateRecipes(db, "h1", {
      recipes: [{
        title: "Y", defaultServings: 2, prepTimeMinutes: null, cookTimeMinutes: null, leftoverDays: null,
        ingredients: [], manualSteps: [], machineSteps: [], tagIds: ["does-not-exist"],
      }],
    }, now);
    expect(db.select().from(recipeTags).where(eq(recipeTags.recipeId, res.createdIds[0])).all()).toHaveLength(0);
  });

  it("decodes and stores image_base64, skipping invalid images", async () => {
    const db = seed();
    const png = await sharp({ create: { width: 60, height: 60, channels: 3, background: "red" } }).png().toBuffer();
    const res = await bulkCreateRecipes(db, "h1", {
      recipes: [
        { title: "Img", defaultServings: 2, prepTimeMinutes: null, cookTimeMinutes: null, leftoverDays: null, ingredients: [], manualSteps: [], machineSteps: [], tagIds: [], imageBase64: png.toString("base64") },
        { title: "Bad", defaultServings: 2, prepTimeMinutes: null, cookTimeMinutes: null, leftoverDays: null, ingredients: [], manualSteps: [], machineSteps: [], tagIds: [], imageBase64: "not-base64-image" },
      ],
    }, now);
    expect(db.select().from(recipes).where(eq(recipes.id, res.createdIds[0])).get()?.image).toMatch(/\.webp$/);
    expect(db.select().from(recipes).where(eq(recipes.id, res.createdIds[1])).get()?.image).toBe("");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd web && npx vitest run lib/recipes/bulk-create.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `web/lib/recipes/bulk-create.ts`** (port of `backend/recipes/api.py::bulk_create_recipes`)

```ts
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import {
  recipes, recipeIngredients, cookingSteps, recipeTags, ingredients, units, tags,
} from "@/lib/db/schema";
import { processToWebp, writeRecipeImage } from "@/lib/images/storage";

export interface BulkIngredientInput {
  nameEn: string;
  nameDe: string;
  category: string;
  quantity: string;
  unitAbbreviation: string;
  order: number;
}
export interface BulkStepInput {
  stepNumber: number;
  instruction: string;
  programType?: string;
  temperature?: number | null;
  durationSeconds?: number | null;
  speed?: number | null;
  turbo?: boolean;
  direction?: string;
  weightGrams?: number | null;
}
export interface BulkRecipeInput {
  title: string;
  description?: string;
  defaultServings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  leftoverDays: number | null;
  ingredients: BulkIngredientInput[];
  manualSteps: BulkStepInput[];
  machineSteps: BulkStepInput[];
  tagIds: string[];
  imageBase64?: string | null;
}

export async function bulkCreateRecipes(
  db: Db,
  householdId: string,
  input: { recipes: BulkRecipeInput[] },
  now: Date,
): Promise<{ createdIds: string[] }> {
  // Pre-process images OUTSIDE the (synchronous) transaction. Map index -> webp bytes (or null).
  const recipeIds = input.recipes.map(() => randomUUID());
  const processedImages: (Buffer | null)[] = await Promise.all(
    input.recipes.map(async (r) => {
      if (!r.imageBase64) return null;
      try {
        return await processToWebp(Buffer.from(r.imageBase64, "base64"));
      } catch {
        return null; // silently skip invalid images (parity)
      }
    }),
  );

  // Lookup maps (case-insensitive), matching the Django pre-load.
  const unitMap = new Map(db.select().from(units).all().map((u) => [u.abbreviation.toLowerCase(), u.id]));
  const ingMap = new Map(db.select().from(ingredients).all().map((i) => [i.nameEn.toLowerCase(), i.id]));

  db.transaction((tx) => {
    input.recipes.forEach((r, idx) => {
      const id = recipeIds[idx];
      const webp = processedImages[idx];
      const image = webp ? writeRecipeImage(id, webp, now) : "";

      tx.insert(recipes).values({
        id, householdId, title: r.title, description: r.description ?? "", listType: "TO_TRY",
        defaultServings: r.defaultServings, prepTimeMinutes: r.prepTimeMinutes,
        cookTimeMinutes: r.cookTimeMinutes, leftoverDays: r.leftoverDays, image,
        createdAt: now, updatedAt: now,
      }).run();

      for (const ing of r.ingredients) {
        const unitId = unitMap.get(ing.unitAbbreviation.toLowerCase());
        if (unitId === undefined) continue; // skip unknown units
        let ingredientId = ingMap.get(ing.nameEn.toLowerCase());
        if (ingredientId === undefined) {
          ingredientId = tx
            .insert(ingredients)
            .values({ nameEn: ing.nameEn, nameDe: ing.nameDe, category: ing.category })
            .returning({ id: ingredients.id })
            .get().id;
          ingMap.set(ing.nameEn.toLowerCase(), ingredientId);
        }
        tx.insert(recipeIngredients).values({
          recipeId: id, ingredientId, quantity: ing.quantity, unitId, order: ing.order,
        }).run();
      }

      const insertSteps = (steps: BulkStepInput[], method: "MANUAL" | "MACHINE") => {
        for (const s of steps) {
          tx.insert(cookingSteps).values({
            recipeId: id, method, stepNumber: s.stepNumber, instruction: s.instruction,
            programType: s.programType ?? "", temperature: s.temperature ?? null,
            durationSeconds: s.durationSeconds ?? null, speed: s.speed ?? null,
            turbo: s.turbo ?? false, direction: s.direction ?? "", weightGrams: s.weightGrams ?? null,
          }).run();
        }
      };
      insertSteps(r.manualSteps, "MANUAL");
      insertSteps(r.machineSteps, "MACHINE");

      if (r.tagIds.length) {
        const owned = tx
          .select({ id: tags.id })
          .from(tags)
          .where(inArray(tags.id, r.tagIds))
          .all()
          .filter(() => true);
        // restrict to this household
        const ownedHh = tx
          .select({ id: tags.id })
          .from(tags)
          .where(inArray(tags.id, r.tagIds))
          .all();
        void owned;
        const householdTagIds = db
          .select({ id: tags.id })
          .from(tags)
          .where(eq(tags.householdId, householdId))
          .all()
          .map((t) => t.id);
        const allowed = ownedHh.filter((t) => householdTagIds.includes(t.id));
        if (allowed.length) {
          tx.insert(recipeTags).values(allowed.map((t) => ({ recipeId: id, tagId: t.id }))).run();
        }
      }
    });
  });

  return { createdIds: recipeIds };
}
```

> Simplify the tag block before committing: the intent is "insert only tag ids that belong to `householdId`". Use a single scoped query:
> ```ts
> if (r.tagIds.length) {
>   const allowed = tx
>     .select({ id: tags.id })
>     .from(tags)
>     .where(and(eq(tags.householdId, householdId), inArray(tags.id, r.tagIds)))
>     .all();
>   if (allowed.length) {
>     tx.insert(recipeTags).values(allowed.map((t) => ({ recipeId: id, tagId: t.id }))).run();
>   }
> }
> ```
> and add `and` to the drizzle import: `import { and, eq, inArray } from "drizzle-orm";`. Replace the verbose block above with this clean version.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npx vitest run lib/recipes/bulk-create.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
cd web && npx tsc --noEmit && cd ..
git add web/lib/recipes/bulk-create.ts web/lib/recipes/bulk-create.test.ts
git commit -m "feat(web): bulk-create recipes service (Plan 7 Task 6)"
```

---

## Task 7: Zod schemas + household AI query

**Files:**
- Create: `web/lib/schemas/generate.ts`
- Create: `web/lib/queries/household.ts`
- Test: `web/lib/schemas/generate.test.ts`

**Interfaces:**
- Produces (generate.ts):
  - `generateRecipesSchema` → `{ count: number; tagIds: string[]; freeText: string; generateImages: boolean }` (count 1–20 default 10).
  - `aiSettingsSchema` → `{ aiEnabled?: boolean; geminiApiKey?: string }`.
  - `bulkCreateSchema` → `{ recipes: BulkRecipeInput[] }` (mirrors Task 6's `BulkRecipeInput`).
  - exported types `GenerateRecipesInput`, `AiSettingsInput`, `BulkCreateInput`.
- Produces (household.ts): `getHouseholdAiSettings(db: Db, householdId: string): { aiEnabled: boolean; hasKey: boolean }`.

- [ ] **Step 1: Write the failing test `web/lib/schemas/generate.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { generateRecipesSchema, aiSettingsSchema, bulkCreateSchema } from "./generate";

describe("generateRecipesSchema", () => {
  it("applies defaults", () => {
    expect(generateRecipesSchema.parse({})).toEqual({ count: 10, tagIds: [], freeText: "", generateImages: true });
  });
  it("rejects count out of range", () => {
    expect(() => generateRecipesSchema.parse({ count: 0 })).toThrow();
    expect(() => generateRecipesSchema.parse({ count: 21 })).toThrow();
  });
});

describe("aiSettingsSchema", () => {
  it("allows partial updates", () => {
    expect(aiSettingsSchema.parse({ aiEnabled: true })).toEqual({ aiEnabled: true });
  });
});

describe("bulkCreateSchema", () => {
  it("accepts a minimal recipe", () => {
    const r = bulkCreateSchema.parse({
      recipes: [{ title: "A", defaultServings: 2, prepTimeMinutes: null, cookTimeMinutes: null, leftoverDays: null, ingredients: [], manualSteps: [], machineSteps: [], tagIds: [] }],
    });
    expect(r.recipes[0].title).toBe("A");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd web && npx vitest run lib/schemas/generate.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `web/lib/schemas/generate.ts`**

```ts
import { z } from "zod";

export const generateRecipesSchema = z.object({
  count: z.number().int().min(1).max(20).default(10),
  tagIds: z.array(z.string()).default([]),
  freeText: z.string().default(""),
  generateImages: z.boolean().default(true),
});
export type GenerateRecipesInput = z.infer<typeof generateRecipesSchema>;

export const aiSettingsSchema = z.object({
  aiEnabled: z.boolean().optional(),
  geminiApiKey: z.string().optional(),
});
export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;

const bulkIngredient = z.object({
  nameEn: z.string(),
  nameDe: z.string(),
  category: z.string().default("OTHER"),
  quantity: z.string(),
  unitAbbreviation: z.string(),
  order: z.number().int().default(0),
});
const bulkStep = z.object({
  stepNumber: z.number().int(),
  instruction: z.string().default(""),
  programType: z.string().optional(),
  temperature: z.number().int().nullable().optional(),
  durationSeconds: z.number().int().nullable().optional(),
  speed: z.number().int().nullable().optional(),
  turbo: z.boolean().optional(),
  direction: z.string().optional(),
  weightGrams: z.number().int().nullable().optional(),
});
const bulkRecipe = z.object({
  title: z.string(),
  description: z.string().optional(),
  defaultServings: z.number().int(),
  prepTimeMinutes: z.number().int().nullable(),
  cookTimeMinutes: z.number().int().nullable(),
  leftoverDays: z.number().int().nullable(),
  ingredients: z.array(bulkIngredient),
  manualSteps: z.array(bulkStep),
  machineSteps: z.array(bulkStep),
  tagIds: z.array(z.string()),
  imageBase64: z.string().nullable().optional(),
});
export const bulkCreateSchema = z.object({ recipes: z.array(bulkRecipe) });
export type BulkCreateInput = z.infer<typeof bulkCreateSchema>;
```

- [ ] **Step 4: Write `web/lib/queries/household.ts`**

```ts
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { households } from "@/lib/db/schema";

/** Read AI settings for a household WITHOUT leaking the key (only whether it is set). */
export function getHouseholdAiSettings(db: Db, householdId: string): { aiEnabled: boolean; hasKey: boolean } {
  const row = db
    .select({ aiEnabled: households.aiEnabled, key: households.geminiApiKey })
    .from(households)
    .where(eq(households.id, householdId))
    .get();
  return { aiEnabled: row?.aiEnabled ?? false, hasKey: (row?.key ?? "") !== "" };
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd web && npx vitest run lib/schemas/generate.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/lib/schemas/generate.ts web/lib/queries/household.ts web/lib/schemas/generate.test.ts
git commit -m "feat(web): generation/bulk/ai-settings schemas + household AI query (Plan 7 Task 7)"
```

---

## Task 8: Server actions

**Files:**
- Modify: `web/app/(app)/actions.ts`

**Interfaces:**
- Consumes: `setRecipeImage`/`removeRecipeImage`/`generateRecipeImageFromAI` (Tasks 2,5); `generateGeminiImage` (Task 4); `bulkCreateRecipes` (Task 6); `bulkCreateSchema`/`aiSettingsSchema` (Task 7); `updateHouseholdSettings` (existing `@/lib/households/manage`); `MAX_UPLOAD_BYTES`/`ALLOWED_UPLOAD_TYPES` (Task 1); `withHousehold`/`Result`/`fail`.
- Produces:
  - `uploadRecipeImageAction(recipeId: string, formData: FormData): Promise<Result<undefined>>`
  - `generateRecipeImageAction(recipeId: string): Promise<Result<undefined>>`
  - `removeRecipeImageAction(recipeId: string): Promise<Result<undefined>>`
  - `bulkCreateRecipesAction(input: unknown): Promise<Result<{ createdIds: string[] }>>`
  - `updateAiSettingsAction(input: unknown): Promise<Result<undefined>>`

- [ ] **Step 1: Add imports to `web/app/(app)/actions.ts`**

```ts
import { AuthError } from "@/lib/auth/errors";
import { fail } from "@/lib/actions/result";
import { setRecipeImage, removeRecipeImage, generateRecipeImageFromAI } from "@/lib/recipes/images";
import { generateGeminiImage } from "@/lib/ai/gemini";
import { bulkCreateRecipes } from "@/lib/recipes/bulk-create";
import { bulkCreateSchema, aiSettingsSchema } from "@/lib/schemas/generate";
import { updateHouseholdSettings } from "@/lib/households/manage";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/images/config";
```

- [ ] **Step 2: Append the five actions**

```ts
export async function uploadRecipeImageAction(
  recipeId: string,
  formData: FormData,
): Promise<Result<undefined>> {
  const res = await withHousehold(async ({ db, householdId, now }) => {
    const file = formData.get("image");
    if (!(file instanceof File)) throw new AuthError(400, "No file provided");
    if (!ALLOWED_UPLOAD_TYPES.has(file.type)) throw new AuthError(400, "Invalid file type");
    if (file.size > MAX_UPLOAD_BYTES) throw new AuthError(400, "File too large (max 5MB)");
    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      await setRecipeImage(db, householdId, recipeId, bytes, now);
    } catch (e) {
      if (e instanceof AuthError) throw e;
      throw new AuthError(400, "Invalid image file");
    }
    return undefined;
  });
  if (res.ok) {
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
  }
  return res;
}

export async function generateRecipeImageAction(recipeId: string): Promise<Result<undefined>> {
  const res = await withHousehold(async ({ db, householdId, now }) => {
    await generateRecipeImageFromAI(db, householdId, recipeId, now, generateGeminiImage);
    return undefined;
  });
  if (res.ok) {
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
  }
  return res;
}

export async function removeRecipeImageAction(recipeId: string): Promise<Result<undefined>> {
  const res = await withHousehold(({ db, householdId }) => {
    removeRecipeImage(db, householdId, recipeId);
    return undefined;
  });
  if (res.ok) {
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
  }
  return res;
}

export async function bulkCreateRecipesAction(
  input: unknown,
): Promise<Result<{ createdIds: string[] }>> {
  const parsed = bulkCreateSchema.parse(input);
  const res = await withHousehold(({ db, householdId, now }) =>
    bulkCreateRecipes(db, householdId, parsed, now),
  );
  if (res.ok) revalidatePath("/recipes");
  return res;
}

export async function updateAiSettingsAction(input: unknown): Promise<Result<undefined>> {
  const parsed = aiSettingsSchema.parse(input);
  const res = await withHousehold(({ db, householdId, user }) => {
    updateHouseholdSettings(db, user.id, householdId, parsed);
    return undefined;
  });
  if (res.ok) revalidatePath("/settings/ai");
  return res;
}
```

> Note: `fail` is imported for parity with patterns even though `withHousehold` already translates `AuthError`. If unused after writing, remove the `fail` import to keep tsc/build clean (no unused imports).

- [ ] **Step 3: Typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: tsc clean; build succeeds (no new routes yet, only server actions).

- [ ] **Step 4: Commit**

```bash
git add "web/app/(app)/actions.ts"
git commit -m "feat(web): image + bulk-create + AI-settings server actions (Plan 7 Task 8)"
```

---

## Task 9: Image-serving route

**Files:**
- Create: `web/app/api/images/[...path]/route.ts`

**Interfaces:**
- Consumes: `readImage` (Task 1).
- Produces: `GET /api/images/<relative>` → serves the WebP bytes (or 404). Path-traversal safe (`readImage` returns null outside the media root). Matches `recipeImageUrl()` which prepends `/api/images/`.

- [ ] **Step 1: Write `web/app/api/images/[...path]/route.ts`**

```ts
import { readImage } from "@/lib/images/storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const relative = path.join("/");
  const bytes = readImage(relative);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

> Filenames are content-addressed by timestamp (`<id>_<ts>.webp`), so `immutable` long-cache is safe — a replaced image gets a new URL. Serving is public (parity with Django's `serve` view, which had no auth); traversal is blocked by `resolveMediaPath`.

- [ ] **Step 2: Build to verify the route registers**

Run: `cd web && npm run build`
Expected: build succeeds; route list includes `/api/images/[...path]`.

- [ ] **Step 3: Manual smoke (optional but recommended)**

```bash
# With a recipe image already stored under web/data/media/recipes/, start dev and curl it:
cd web && npm run dev &  # then:
curl -I "http://localhost:3000/api/images/recipes/<some-file>.webp"
```
Expected: `200` + `Content-Type: image/webp` for an existing file; `404` for a bogus path or `../` traversal.

- [ ] **Step 4: Commit**

```bash
git add "web/app/api/images"
git commit -m "feat(web): image serving route (Plan 7 Task 9)"
```

---

## Task 10: Generation NDJSON streaming route

**Files:**
- Create: `web/app/api/recipes/generate/route.ts`

**Interfaces:**
- Consumes: `requireHousehold`; `getHouseholdAiSettings` won't expose the key, so this route reads `households` directly for the key; `generateRecipesSchema` (Task 7); `buildGenerationPrompt`/`buildImagePrompt`/`selectReferenceRecipes` (Task 3); `callGeminiText`/`generateGeminiImage` (Task 4); `processToWebp` (Task 1); query helpers from `@/lib/queries/recipes` + Drizzle tables.
- Produces: `POST /api/recipes/generate` → `application/x-ndjson` stream of `{type:"recipe",index,data}` / `{type:"image",index,data:{image_base64}}` / `{type:"error",message}` / `{type:"done"}`.

- [ ] **Step 1: Write `web/app/api/recipes/generate/route.ts`** (port of `backend/recipes/api.py::generate_recipes`)

```ts
import { and, eq, inArray } from "drizzle-orm";
import { requireHousehold } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/errors";
import { db } from "@/lib/db";
import {
  households, recipes, recipeIngredients, ingredients, units, tags, recipeTags, cookingSteps,
} from "@/lib/db/schema";
import { generateRecipesSchema } from "@/lib/schemas/generate";
import {
  buildGenerationPrompt, buildImagePrompt, selectReferenceRecipes, type PromptRecipe,
} from "@/lib/ai/prompt";
import { callGeminiText, generateGeminiImage } from "@/lib/ai/gemini";
import { processToWebp } from "@/lib/images/storage";

const MAX_REFERENCE_RECIPES = 10;
const MAX_INGREDIENTS = 200;

function authErr(e: unknown): Response {
  if (e instanceof AuthError) return Response.json({ message: e.message }, { status: e.status });
  throw e;
}

export async function POST(req: Request): Promise<Response> {
  let householdId: string;
  let language: string;
  let apiKey: string;
  try {
    const ctx = await requireHousehold();
    householdId = ctx.householdId;
    language = ctx.user.preferredLanguage || "en";
    const hh = db
      .select({ aiEnabled: households.aiEnabled, key: households.geminiApiKey })
      .from(households)
      .where(eq(households.id, householdId))
      .get();
    if (!hh?.aiEnabled) throw new AuthError(403, "AI features are disabled");
    if (!hh.key) throw new AuthError(400, "Gemini API key not configured");
    apiKey = hh.key;
  } catch (e) {
    return authErr(e);
  }

  let payload: ReturnType<typeof generateRecipesSchema.parse>;
  try {
    payload = generateRecipesSchema.parse(await req.json());
  } catch {
    return Response.json({ message: "Invalid request" }, { status: 422 });
  }

  // ---- gather prompt context (synchronous better-sqlite3 reads) ----
  const ingredientRows = db
    .select({ nameEn: ingredients.nameEn, nameDe: ingredients.nameDe, category: ingredients.category })
    .from(ingredients)
    .limit(MAX_INGREDIENTS)
    .all();
  const unitRows = db
    .select({ abbreviation: units.abbreviation, nameEn: units.nameEn, nameDe: units.nameDe, id: units.id })
    .from(units)
    .all();
  const tagRows = db
    .select({ id: tags.id, nameEn: tags.nameEn, nameDe: tags.nameDe, category: tags.category })
    .from(tags)
    .where(eq(tags.householdId, householdId))
    .all();

  // recipes for this household + their tag ids (for selection) + titles
  const recipeRows = db.select().from(recipes).where(eq(recipes.householdId, householdId)).all();
  const allTitles = recipeRows.map((r) => r.title);
  const recipeTagRows = db
    .select({ recipeId: recipeTags.recipeId, tagId: recipeTags.tagId })
    .from(recipeTags)
    .innerJoin(recipes, eq(recipeTags.recipeId, recipes.id))
    .where(eq(recipes.householdId, householdId))
    .all();
  const tagIdsByRecipe = new Map<string, string[]>();
  for (const rt of recipeTagRows) {
    const arr = tagIdsByRecipe.get(rt.recipeId) ?? [];
    arr.push(rt.tagId);
    tagIdsByRecipe.set(rt.recipeId, arr);
  }
  const forSelection = recipeRows.map((r) => ({ id: r.id, tagIds: tagIdsByRecipe.get(r.id) ?? [] }));
  const selected = selectReferenceRecipes(forSelection, payload.tagIds, MAX_REFERENCE_RECIPES);

  const tagNameById = new Map(tagRows.map((t) => [t.id, t.nameEn]));
  const ingNameById = new Map(
    db.select({ id: ingredients.id, nameEn: ingredients.nameEn }).from(ingredients).all().map((i) => [i.id, i.nameEn]),
  );
  const unitAbbrById = new Map(unitRows.map((u) => [u.id, u.abbreviation]));

  const referenceRecipes: PromptRecipe[] = selected.map((sel) => {
    const r = recipeRows.find((x) => x.id === sel.id)!;
    const ris = db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, r.id)).orderBy(recipeIngredients.order).all();
    const steps = db.select().from(cookingSteps).where(eq(cookingSteps.recipeId, r.id)).all();
    return {
      title: r.title,
      defaultServings: r.defaultServings,
      prepTimeMinutes: r.prepTimeMinutes,
      cookTimeMinutes: r.cookTimeMinutes,
      leftoverDays: r.leftoverDays,
      tagNames: (tagIdsByRecipe.get(r.id) ?? []).map((id) => tagNameById.get(id) ?? "").filter(Boolean),
      ingredientLines: ris.map((ri) => `    ${ri.quantity} ${unitAbbrById.get(ri.unitId) ?? ""} ${ingNameById.get(ri.ingredientId) ?? ""}`),
      manualInstructions: steps.filter((s) => s.method === "MANUAL").map((s) => s.instruction),
      machineInstructions: steps.filter((s) => s.method === "MACHINE").map((s) => s.instruction),
    };
  });

  const prompt = buildGenerationPrompt({
    count: payload.count,
    freeText: payload.freeText,
    language,
    ingredients: ingredientRows,
    units: unitRows.map((u) => ({ abbreviation: u.abbreviation, nameEn: u.nameEn, nameDe: u.nameDe })),
    tags: tagRows,
    requiredTagIds: payload.tagIds,
    referenceRecipes,
    allTitles,
  });

  // resolution maps for emitted recipes (parity with backend)
  const tagIdByNameLower = new Map(tagRows.map((t) => [t.nameEn.toLowerCase(), t.id]));
  const unitIdByAbbrLower = new Map(unitRows.map((u) => [u.abbreviation.toLowerCase(), u.id]));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      let generated: unknown[];
      try {
        generated = await callGeminiText(apiKey, prompt);
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "Generation failed" });
        controller.close();
        return;
      }

      for (let idx = 0; idx < generated.length; idx++) {
        const data = generated[idx] as Record<string, unknown>;

        // resolve tag names -> ids
        const tagNames = Array.isArray(data.tag_names_en) ? (data.tag_names_en as string[]) : [];
        data.tag_ids = tagNames
          .map((n) => tagIdByNameLower.get(String(n).toLowerCase()))
          .filter((x): x is string => Boolean(x));

        // resolve unit abbreviations -> ids
        const ings = Array.isArray(data.ingredients) ? (data.ingredients as Record<string, unknown>[]) : [];
        for (const ing of ings) {
          const abbr = String(ing.unit_abbreviation ?? "");
          ing.unit_id = unitIdByAbbrLower.get(abbr.toLowerCase()) ?? null;
        }

        send({ type: "recipe", index: idx, data });

        if (payload.generateImages) {
          try {
            const title = String(data.title ?? "");
            const names = ings.slice(0, 10).map((i) => String(i.name_en ?? ""));
            const bytes = await generateGeminiImage(apiKey, buildImagePrompt(title, names));
            const webp = await processToWebp(bytes);
            send({ type: "image", index: idx, data: { image_base64: webp.toString("base64") } });
          } catch {
            // skip image for this recipe (parity)
          }
        }
      }

      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
```

> Silences the unused `and`/`inArray` imports by removing any not used. After writing, run tsc; drop unused imports (`and`, `inArray` are likely unused here — remove them).

- [ ] **Step 2: Typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: tsc clean (after pruning unused imports); build registers `/api/recipes/generate`.

- [ ] **Step 3: Commit**

```bash
git add "web/app/api/recipes/generate"
git commit -m "feat(web): AI recipe generation NDJSON streaming route (Plan 7 Task 10)"
```

---

## Task 11: Recipe image actions island + detail wiring + i18n

**Files:**
- Create: `web/components/recipes/recipe-image-actions.tsx`
- Modify: `web/components/recipes/recipe-detail.tsx`
- Modify: `web/app/(app)/recipes/[id]/page.tsx`
- Modify: `web/lib/i18n/locales/en.json`, `web/lib/i18n/locales/de.json`

**Interfaces:**
- Consumes: `uploadRecipeImageAction`, `generateRecipeImageAction`, `removeRecipeImageAction` (Task 8); `getHouseholdAiSettings` (Task 7); `useT`, `toast`, `Button`.
- Produces: `<RecipeImageActions recipeId hasImage aiEnabled />` (all serializable props).

- [ ] **Step 1: Add i18n keys** — add a `recipeImage` group to BOTH locale files (matching old frontend copy).

`en.json`:
```json
  "recipeImage": {
    "upload": "Upload Photo",
    "generate": "Generate with AI",
    "remove": "Remove Photo",
    "generating": "Generating...",
    "uploadFailed": "Couldn't upload the photo.",
    "generateFailed": "Couldn't generate the photo.",
    "removed": "Photo removed"
  },
```
`de.json`:
```json
  "recipeImage": {
    "upload": "Foto hochladen",
    "generate": "Mit KI erstellen",
    "remove": "Foto entfernen",
    "generating": "Wird erstellt...",
    "uploadFailed": "Foto konnte nicht hochgeladen werden.",
    "generateFailed": "Foto konnte nicht erstellt werden.",
    "removed": "Foto entfernt"
  },
```

- [ ] **Step 2: Write `web/components/recipes/recipe-image-actions.tsx`**

```tsx
"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Sparkles, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import {
  uploadRecipeImageAction,
  generateRecipeImageAction,
  removeRecipeImageAction,
} from "@/app/(app)/actions";

interface Props {
  recipeId: string;
  hasImage: boolean;
  aiEnabled: boolean;
}

export function RecipeImageActions({ recipeId, hasImage, aiEnabled }: Props) {
  const { t } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const fd = new FormData();
    fd.append("image", file);
    startTransition(async () => {
      const res = await uploadRecipeImageAction(recipeId, fd);
      if (res.ok) router.refresh();
      else toast.error(t("recipeImage.uploadFailed"));
    });
  }

  function onGenerate() {
    startTransition(async () => {
      const res = await generateRecipeImageAction(recipeId);
      if (res.ok) router.refresh();
      else toast.error(t("recipeImage.generateFailed"));
    });
  }

  function onRemove() {
    startTransition(async () => {
      const res = await removeRecipeImageAction(recipeId);
      if (res.ok) {
        toast.success(t("recipeImage.removed"));
        router.refresh();
      } else {
        toast.error(t("common.errorRetry"));
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFile} />
      <Button variant="outline" size="sm" disabled={pending} onClick={() => fileRef.current?.click()}>
        <ImagePlus size={16} />
        {t("recipeImage.upload")}
      </Button>
      {aiEnabled && (
        <Button variant="outline" size="sm" disabled={pending} onClick={onGenerate}>
          <Sparkles size={16} />
          {pending ? t("recipeImage.generating") : t("recipeImage.generate")}
        </Button>
      )}
      {hasImage && (
        <Button variant="outline" size="sm" disabled={pending} onClick={onRemove} className="text-destructive">
          <Trash2 size={16} />
          {t("recipeImage.remove")}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Mount in `web/components/recipes/recipe-detail.tsx`**

Add `aiEnabled: boolean` to `RecipeDetailProps`, import the island, and render it under the hero image block (after the `imageUrl` conditional, before the title or right beneath the image):

```tsx
// import:
import { RecipeImageActions } from "./recipe-image-actions";

// in props interface:
  aiEnabled: boolean;

// in the destructure:
export function RecipeDetail({ recipe, ingredientsById, unitsById, locale, t, aiEnabled }: RecipeDetailProps): JSX.Element {

// directly after the hero image / placeholder block (after line ~67):
      <RecipeImageActions recipeId={recipe.id} hasImage={imageUrl !== null} aiEnabled={aiEnabled} />
```

- [ ] **Step 4: Pass `aiEnabled` from `web/app/(app)/recipes/[id]/page.tsx`**

```tsx
// add import:
import { getHouseholdAiSettings } from "@/lib/queries/household";

// after `const recipe = getRecipe(...)` / notFound():
  const { aiEnabled } = getHouseholdAiSettings(db, householdId);

// in the JSX, add the prop:
    <RecipeDetail
      recipe={recipe}
      ingredientsById={ingredientsById}
      unitsById={unitsById}
      locale={locale}
      t={t}
      aiEnabled={aiEnabled}
    />
```

- [ ] **Step 5: Typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: clean; detail page renders image actions.

- [ ] **Step 6: Commit**

```bash
git add web/components/recipes/recipe-image-actions.tsx web/components/recipes/recipe-detail.tsx "web/app/(app)/recipes/[id]/page.tsx" web/lib/i18n/locales/en.json web/lib/i18n/locales/de.json
git commit -m "feat(web): recipe image upload/generate/remove UI (Plan 7 Task 11)"
```

---

## Task 12: AI settings page + form + settings link + i18n

**Files:**
- Create: `web/app/(app)/settings/ai/page.tsx`
- Create: `web/app/(app)/settings/ai/ai-settings-form.tsx`
- Modify: `web/app/(app)/settings/settings-client.tsx`
- Modify: `web/lib/i18n/locales/en.json`, `web/lib/i18n/locales/de.json`

**Interfaces:**
- Consumes: `requireHousehold`, `getI18n`, `getHouseholdAiSettings` (Task 7), `updateAiSettingsAction` (Task 8).
- Produces: route `/settings/ai`; `<AiSettingsForm aiEnabled hasKey />` (serializable props; key value never sent to client).

- [ ] **Step 1: Add i18n keys** — `aiSettings` group in BOTH locales.

`en.json`:
```json
  "aiSettings": {
    "title": "AI Features",
    "subtitle": "Generate recipes and photos with Google Gemini.",
    "enable": "Enable AI features",
    "apiKey": "Gemini API key",
    "apiKeyPlaceholder": "Paste your Gemini API key",
    "apiKeySet": "A key is saved. Enter a new one to replace it.",
    "save": "Save",
    "saved": "AI settings saved",
    "link": "Manage AI settings"
  },
```
`de.json`:
```json
  "aiSettings": {
    "title": "KI-Funktionen",
    "subtitle": "Rezepte und Fotos mit Google Gemini erstellen.",
    "enable": "KI-Funktionen aktivieren",
    "apiKey": "Gemini API-Schlüssel",
    "apiKeyPlaceholder": "Gemini API-Schlüssel einfügen",
    "apiKeySet": "Ein Schlüssel ist gespeichert. Gib einen neuen ein, um ihn zu ersetzen.",
    "save": "Speichern",
    "saved": "KI-Einstellungen gespeichert",
    "link": "KI-Einstellungen verwalten"
  },
```

- [ ] **Step 2: Write `web/app/(app)/settings/ai/page.tsx`**

```tsx
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getHouseholdAiSettings } from "@/lib/queries/household";
import { AiSettingsForm } from "./ai-settings-form";

export default async function AiSettingsPage() {
  const { householdId } = await requireHousehold();
  const { t } = await getI18n();
  const { aiEnabled, hasKey } = getHouseholdAiSettings(db, householdId);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("aiSettings.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("aiSettings.subtitle")}</p>
      </div>
      <AiSettingsForm aiEnabled={aiEnabled} hasKey={hasKey} />
    </div>
  );
}
```

- [ ] **Step 3: Write `web/app/(app)/settings/ai/ai-settings-form.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { updateAiSettingsAction } from "@/app/(app)/actions";

export function AiSettingsForm({ aiEnabled, hasKey }: { aiEnabled: boolean; hasKey: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [enabled, setEnabled] = useState(aiEnabled);
  const [key, setKey] = useState("");
  const [pending, startTransition] = useTransition();

  function onSave() {
    startTransition(async () => {
      const input: { aiEnabled: boolean; geminiApiKey?: string } = { aiEnabled: enabled };
      if (key.trim()) input.geminiApiKey = key.trim();
      const res = await updateAiSettingsAction(input);
      if (res.ok) {
        toast.success(t("aiSettings.saved"));
        setKey("");
        router.refresh();
      } else {
        toast.error(t("common.errorRetry"));
      }
    });
  }

  return (
    <div className="max-w-md space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        {t("aiSettings.enable")}
      </label>
      <label className="block text-sm">
        {t("aiSettings.apiKey")}
        <Input
          type="password"
          autoComplete="off"
          value={key}
          placeholder={t("aiSettings.apiKeyPlaceholder")}
          onChange={(e) => setKey(e.target.value)}
        />
        {hasKey && <span className="mt-1 block text-xs text-muted-foreground">{t("aiSettings.apiKeySet")}</span>}
      </label>
      <Button disabled={pending} onClick={onSave}>{t("aiSettings.save")}</Button>
    </div>
  );
}
```

- [ ] **Step 4: Add the settings link** — in `web/app/(app)/settings/settings-client.tsx`, add a section mirroring the existing Tags section:

```tsx
      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("aiSettings.title")}</h2>
        <Button asChild variant="outline"><Link href="/settings/ai">{t("aiSettings.link")}</Link></Button>
      </section>
```

- [ ] **Step 5: Typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: clean; route `/settings/ai` registered.

- [ ] **Step 6: Commit**

```bash
git add "web/app/(app)/settings/ai" "web/app/(app)/settings/settings-client.tsx" web/lib/i18n/locales/en.json web/lib/i18n/locales/de.json
git commit -m "feat(web): household AI settings page (Plan 7 Task 12)"
```

---

## Task 13: NDJSON stream client parser

**Files:**
- Create: `web/lib/ai/stream-client.ts`
- Test: `web/lib/ai/stream-client.test.ts`

**Interfaces:**
- Produces:
  - `type GenStreamEvent = { type: "recipe"; index: number; data: GeneratedRecipeData } | { type: "image"; index: number; data: { image_base64: string } } | { type: "error"; message: string } | { type: "done" }`
  - `interface GeneratedRecipeData { title: string; default_servings?: number; prep_time_minutes?: number | null; cook_time_minutes?: number | null; leftover_days?: number | null; ingredients?: GeneratedIngredient[]; manual_steps?: GeneratedStep[]; machine_steps?: GeneratedStep[]; tag_ids?: string[] }` (raw Gemini shape + resolved `tag_ids`)
  - `streamGenerateRecipes(payload: GenerateRecipesInput, onEvent: (e: GenStreamEvent) => void, signal?: AbortSignal): Promise<void>`

- [ ] **Step 1: Write the failing test `web/lib/ai/stream-client.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { streamGenerateRecipes } from "./stream-client";

afterEach(() => vi.restoreAllMocks());

function streamFrom(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

describe("streamGenerateRecipes", () => {
  it("parses NDJSON across chunk boundaries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamFrom([
          '{"type":"recipe","index":0,"data":{"tit',
          'le":"A"}}\n{"type":"image","index":0,"data":{"image_base64":"xx"}}\n',
          '{"type":"done"}\n',
        ]),
      ),
    );
    const events: unknown[] = [];
    await streamGenerateRecipes({ count: 1, tagIds: [], freeText: "", generateImages: true }, (e) => events.push(e));
    expect(events).toEqual([
      { type: "recipe", index: 0, data: { title: "A" } },
      { type: "image", index: 0, data: { image_base64: "xx" } },
      { type: "done" },
    ]);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response));
    await expect(
      streamGenerateRecipes({ count: 1, tagIds: [], freeText: "", generateImages: false }, () => {}),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd web && npx vitest run lib/ai/stream-client.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `web/lib/ai/stream-client.ts`** (port of old `useGenerateRecipes.ts::streamGenerateRecipes`)

```ts
import type { GenerateRecipesInput } from "@/lib/schemas/generate";

export interface GeneratedIngredient {
  name_en: string;
  name_de: string;
  category?: string;
  quantity?: number | string;
  unit_abbreviation?: string;
  unit_id?: number | null;
  order?: number;
}
export interface GeneratedStep {
  step_number: number;
  instruction?: string;
  program_type?: string;
  temperature?: number | null;
  duration_seconds?: number | null;
  speed?: number | null;
  turbo?: boolean;
  direction?: string;
  weight_grams?: number | null;
}
export interface GeneratedRecipeData {
  title: string;
  default_servings?: number;
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  leftover_days?: number | null;
  ingredients?: GeneratedIngredient[];
  manual_steps?: GeneratedStep[];
  machine_steps?: GeneratedStep[];
  tag_names_en?: string[];
  tag_ids?: string[];
}
export type GenStreamEvent =
  | { type: "recipe"; index: number; data: GeneratedRecipeData }
  | { type: "image"; index: number; data: { image_base64: string } }
  | { type: "error"; message: string }
  | { type: "done" };

export async function streamGenerateRecipes(
  payload: GenerateRecipesInput,
  onEvent: (event: GenStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/recipes/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw new Error(`Generation failed (${res.status})`);
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) onEvent(JSON.parse(trimmed) as GenStreamEvent);
    }
  }
  const tail = buffer.trim();
  if (tail) onEvent(JSON.parse(tail) as GenStreamEvent);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npx vitest run lib/ai/stream-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/ai/stream-client.ts web/lib/ai/stream-client.test.ts
git commit -m "feat(web): NDJSON generation stream client (Plan 7 Task 13)"
```

---

## Task 14: Generate-recipes page + client + entry button + i18n

**Files:**
- Create: `web/app/(app)/recipes/generate/page.tsx`
- Create: `web/app/(app)/recipes/generate/generate-recipes-client.tsx`
- Modify: `web/app/(app)/recipes/page.tsx`
- Modify: `web/lib/i18n/locales/en.json`, `web/lib/i18n/locales/de.json`

**Interfaces:**
- Consumes: `requireHousehold`, `getI18n`, `getHouseholdAiSettings` (Task 7), `listTags` (existing), `streamGenerateRecipes`/`GenStreamEvent`/`GeneratedRecipeData` (Task 13), `bulkCreateRecipesAction` (Task 8), `BulkRecipeInput` shape (Task 6).
- Produces: route `/recipes/generate`; config + streaming preview + select + save flow.

- [ ] **Step 1: Add i18n keys** — `generateRecipes` group in BOTH locales (copy from old frontend).

`en.json`:
```json
  "generateRecipes": {
    "button": "Generate with AI",
    "title": "Generate Recipes",
    "count": "Number of recipes",
    "tags": "Tags",
    "freeText": "Additional instructions",
    "freeTextPlaceholder": "e.g. comfort food for cold weather",
    "generateImages": "Generate photos",
    "generate": "Generate",
    "generating": "Generating recipes...",
    "generatingImages": "Generating photos...",
    "saveCount_one": "Save {{count}} recipe",
    "saveCount_other": "Save {{count}} recipes",
    "saved": "{{count}} recipes added to Want to try!",
    "noResults": "No recipes came up. Try tweaking your settings!",
    "selected": "{{count}} selected",
    "configureAi": "Set up AI first"
  },
```
`de.json`:
```json
  "generateRecipes": {
    "button": "Mit KI erstellen",
    "title": "Rezepte generieren",
    "count": "Anzahl Rezepte",
    "tags": "Tags",
    "freeText": "Zusätzliche Anweisungen",
    "freeTextPlaceholder": "z.B. Wohlfühlessen für kalte Tage",
    "generateImages": "Fotos erstellen",
    "generate": "Generieren",
    "generating": "Rezepte werden erstellt...",
    "generatingImages": "Fotos werden erstellt...",
    "saveCount_one": "{{count}} Rezept speichern",
    "saveCount_other": "{{count}} Rezepte speichern",
    "saved": "{{count}} Rezepte zu Ausprobieren hinzugefügt!",
    "noResults": "Keine Rezepte erstellt. Probier andere Einstellungen!",
    "selected": "{{count}} ausgewählt",
    "configureAi": "KI zuerst einrichten"
  },
```

> The `_one`/`_other` plural suffixes follow the existing convention used by `recipes.loadMore` etc. If the translate helper does not support pluralization, use a single `saveCount` key `"Save {{count}} recipes"` / `"{{count}} Rezepte speichern"` instead — verify against `web/lib/i18n/translate.ts` during this task and pick the matching form.

- [ ] **Step 2: Write `web/app/(app)/recipes/generate/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { listTags } from "@/lib/queries/recipes";
import { getHouseholdAiSettings } from "@/lib/queries/household";
import { GenerateRecipesClient } from "./generate-recipes-client";

export default async function GenerateRecipesPage() {
  const { householdId } = await requireHousehold();
  const { locale } = await getI18n();
  const { aiEnabled, hasKey } = getHouseholdAiSettings(db, householdId);
  if (!aiEnabled || !hasKey) redirect("/settings/ai");
  return <GenerateRecipesClient tags={listTags(db, householdId)} locale={locale} />;
}
```

- [ ] **Step 3: Write `web/app/(app)/recipes/generate/generate-recipes-client.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { pickName } from "@/lib/display/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import type { RecipeTagDto } from "@/lib/queries/recipes";
import { streamGenerateRecipes, type GeneratedRecipeData } from "@/lib/ai/stream-client";
import { bulkCreateRecipesAction } from "@/app/(app)/actions";
import type { BulkRecipeInput } from "@/lib/recipes/bulk-create";

interface PreviewRecipe {
  data: GeneratedRecipeData;
  imageBase64?: string;
  selected: boolean;
}

function toBulkInput(r: PreviewRecipe): BulkRecipeInput {
  const d = r.data;
  return {
    title: d.title,
    defaultServings: d.default_servings ?? 2,
    prepTimeMinutes: d.prep_time_minutes ?? null,
    cookTimeMinutes: d.cook_time_minutes ?? null,
    leftoverDays: d.leftover_days ?? null,
    ingredients: (d.ingredients ?? []).map((i, idx) => ({
      nameEn: i.name_en,
      nameDe: i.name_de,
      category: i.category ?? "OTHER",
      quantity: String(i.quantity ?? "0"),
      unitAbbreviation: i.unit_abbreviation ?? "",
      order: i.order ?? idx,
    })),
    manualSteps: (d.manual_steps ?? []).map((s) => ({ stepNumber: s.step_number, instruction: s.instruction ?? "" })),
    machineSteps: (d.machine_steps ?? []).map((s) => ({
      stepNumber: s.step_number,
      instruction: s.instruction ?? "",
      programType: s.program_type,
      temperature: s.temperature ?? null,
      durationSeconds: s.duration_seconds ?? null,
      speed: s.speed ?? null,
      turbo: s.turbo,
      direction: s.direction,
      weightGrams: s.weight_grams ?? null,
    })),
    tagIds: d.tag_ids ?? [],
    imageBase64: r.imageBase64 ?? null,
  };
}

export function GenerateRecipesClient({ tags, locale }: { tags: RecipeTagDto[]; locale: string }) {
  const { t } = useT();
  const router = useRouter();
  const [count, setCount] = useState(10);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [generateImages, setGenerateImages] = useState(true);
  const [recipes, setRecipes] = useState<PreviewRecipe[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function onGenerate() {
    setRecipes([]);
    setGenerating(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamGenerateRecipes(
        { count, tagIds: selectedTagIds, freeText, generateImages },
        (e) => {
          if (e.type === "recipe") {
            setRecipes((prev) => {
              const next = [...prev];
              next[e.index] = { data: e.data, selected: true };
              return next;
            });
          } else if (e.type === "image") {
            setRecipes((prev) => {
              const next = [...prev];
              if (next[e.index]) next[e.index] = { ...next[e.index], imageBase64: e.data.image_base64 };
              return next;
            });
          } else if (e.type === "error") {
            toast.error(t("common.errorRetry"));
          }
        },
        ctrl.signal,
      );
    } catch {
      toast.error(t("common.errorRetry"));
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }

  async function onSave() {
    const chosen = recipes.filter((r) => r?.selected);
    if (!chosen.length) return;
    setSaving(true);
    const res = await bulkCreateRecipesAction({ recipes: chosen.map(toBulkInput) });
    setSaving(false);
    if (res.ok) {
      toast.success(t("generateRecipes.saved", { count: res.data.createdIds.length }));
      router.push("/recipes");
    } else {
      toast.error(t("common.errorRetry"));
    }
  }

  const present = recipes.filter(Boolean);
  const selectedCount = present.filter((r) => r.selected).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("generateRecipes.title")}</h1>

      <div className="space-y-4 rounded-xl border p-4">
        <label className="block text-sm">
          {t("generateRecipes.count")}
          <Input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} />
        </label>

        {tags.length > 0 && (
          <fieldset>
            <legend className="text-sm font-medium">{t("generateRecipes.tags")}</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {tags.map((tag) => {
                const checked = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => setSelectedTagIds((ids) => (checked ? ids.filter((x) => x !== tag.id) : [...ids, tag.id]))}
                    className={`rounded border px-2 py-1 text-xs ${checked ? "bg-primary text-primary-foreground" : "border-border"}`}
                  >
                    {pickName(locale, tag)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <label className="block text-sm">
          {t("generateRecipes.freeText")}
          <textarea
            className="mt-1 w-full rounded-md border bg-transparent p-2 text-sm"
            rows={3}
            value={freeText}
            placeholder={t("generateRecipes.freeTextPlaceholder")}
            onChange={(e) => setFreeText(e.target.value)}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={generateImages} onChange={(e) => setGenerateImages(e.target.checked)} />
          {t("generateRecipes.generateImages")}
        </label>

        <Button onClick={onGenerate} disabled={generating} className="w-full">
          <Sparkles size={16} />
          {generating ? t("generateRecipes.generating") : t("generateRecipes.generate")}
        </Button>
      </div>

      {present.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("generateRecipes.selected", { count: selectedCount })}</span>
            <Button onClick={onSave} disabled={saving || selectedCount === 0}>
              {t("generateRecipes.saveCount", { count: selectedCount })}
            </Button>
          </div>
          {present.map((r, i) => (
            <label key={i} className="flex items-center gap-3 rounded-lg border p-3">
              <input
                type="checkbox"
                checked={r.selected}
                onChange={(e) =>
                  setRecipes((prev) => {
                    const next = [...prev];
                    const realIdx = prev.indexOf(r);
                    if (next[realIdx]) next[realIdx] = { ...next[realIdx], selected: e.target.checked };
                    return next;
                  })
                }
              />
              {r.imageBase64 ? (
                <img src={`data:image/webp;base64,${r.imageBase64}`} alt={r.data.title} className="h-14 w-14 rounded-md object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-muted">
                  <Sparkles size={20} className={`text-muted-foreground ${generating && generateImages ? "animate-pulse" : ""}`} />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate font-medium">{r.data.title}</p>
                <p className="text-xs text-muted-foreground">{(r.data.ingredients ?? []).length} · {r.data.default_servings ?? 2}</p>
              </div>
            </label>
          ))}
        </div>
      )}

      {!generating && present.length === 0 && recipes.length > 0 && (
        <p className="text-sm text-muted-foreground">{t("generateRecipes.noResults")}</p>
      )}
    </div>
  );
}
```

> If pluralization is unsupported (see Task 14 Step 1 note), `saveCount` is a single key and the call `t("generateRecipes.saveCount", { count: selectedCount })` already works.
> The unused `X` import is a placeholder for an optional cancel control — either wire a cancel button calling `abortRef.current?.abort()` or drop the import to keep tsc clean.

- [ ] **Step 4: Add the entry button to `web/app/(app)/recipes/page.tsx`**

Read the household AI flag and render a "Generate with AI" button next to "Add recipe" when enabled:

```tsx
// add import:
import { getHouseholdAiSettings } from "@/lib/queries/household";
import { Sparkles } from "lucide-react"; // extend the existing lucide import line instead of duplicating

// after `const allTags = listTags(...)`:
  const { aiEnabled, hasKey } = getHouseholdAiSettings(db, householdId);

// in the header button row, after the existing Add button:
        {aiEnabled && hasKey && (
          <Button asChild size="sm" variant="outline">
            <Link href="/recipes/generate">
              <Sparkles size={16} />
              {t("generateRecipes.button")}
            </Link>
          </Button>
        )}
```

> Merge `Sparkles` into the existing `import { BookOpen, Plus, Search } from "lucide-react";` line: `import { BookOpen, Plus, Search, Sparkles } from "lucide-react";`.

- [ ] **Step 5: Typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: clean; route `/recipes/generate` registered; recipes list shows the AI button when configured.

- [ ] **Step 6: Commit**

```bash
git add "web/app/(app)/recipes/generate" "web/app/(app)/recipes/page.tsx" web/lib/i18n/locales/en.json web/lib/i18n/locales/de.json
git commit -m "feat(web): AI recipe generation page + bulk save (Plan 7 Task 14)"
```

---

## Task 15: Integration verification

**Files:**
- Verify only (plus any small i18n-parity fixes surfaced).

- [ ] **Step 1: Full vitest**

Run: `cd web && npm test`
Expected: ALL pass (244 existing Plan 6b + new Plan 7 tests). Note the new count.

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: clean. Remove any unused imports flagged.

- [ ] **Step 3: Production build**

Run: `cd web && npm run build`
Expected: success. Confirm these new routes appear: `/api/images/[...path]`, `/api/recipes/generate`, `/recipes/generate`, `/settings/ai`.

- [ ] **Step 4: i18n parity check**

Run:
```bash
cd web && node -e '
const en=require("./lib/i18n/locales/en.json"), de=require("./lib/i18n/locales/de.json");
const flat=(o,p="")=>Object.entries(o).flatMap(([k,v])=>typeof v==="object"&&v?flat(v,p+k+"."):[p+k]);
const a=new Set(flat(en)), b=new Set(flat(de));
const onlyEn=[...a].filter(k=>!b.has(k)), onlyDe=[...b].filter(k=>!a.has(k));
console.log("en-only:",onlyEn,"de-only:",onlyDe);
if(onlyEn.length||onlyDe.length)process.exit(1);
'
```
Expected: `en-only: [] de-only: []`. Fix any mismatch.

- [ ] **Step 5: Manual smoke (recommended; mirrors Plans 4–6 deferral note if no seeded DB)**

With a seeded/onboarded household + a valid Gemini key set via `/settings/ai`:
1. `/recipes/generate` → generate → recipes stream in with photos → select → save → land on `/recipes` with new TO_TRY recipes (images visible via `/api/images/...`).
2. Recipe detail → Upload Photo (jpeg/png/webp) → image appears; Generate with AI → image replaces; Remove Photo → placeholder returns.

If no live key/DB is available, document the deferral in the progress ledger (consistent with prior plans) — the automated gates (vitest/tsc/build/i18n) are the blocking bar.

- [ ] **Step 6: Update progress ledger + commit**

Append a Plan 7 summary to `.superpowers/sdd/progress.md` (tasks, commit range, final test count, new routes, any deferred minors), then:

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs: Plan 7 progress ledger (AI + images complete)"
```

---

## Self-Review

**Spec coverage (design §"Business logic / AI / images" + build-order step "AI generation + images"):**
- AI text generation (NDJSON stream) → Tasks 3,4,10,13,14. ✓
- AI image generation (Gemini image model, NOT dead Imagen) → Tasks 3,4,5; streaming images in Task 10. ✓
- Image upload (Sharp resize→WebP, 5MB/type limits) → Tasks 1,2,8,11. ✓
- Image removal → Tasks 2,8,11. ✓
- Image serving (`/api/images/...`, matches existing `recipeImageUrl`) → Task 9. ✓
- Bulk-create (auto-create ingredients, unit/tag resolution, base64 images, TO_TRY) → Tasks 6,8,14. ✓
- Per-household AI settings (key + enable, OWNER-only, no key leak) → Tasks 7,8,12. ✓
- Household scoping on every read+write → enforced via `requireHousehold`/ownership in every service, route, and action. ✓
- Decimals as strings → quantities persisted via `String(...)`; no JS `number` for quantities. ✓
- i18n en/de parity → keys added per task in both files; verified in Task 15. ✓

**Placeholder scan:** No "TBD"/"add validation"/"similar to Task N" — every code step shows real code; the two simplification notes (Task 6 tag block, Task 10 unused imports) give the exact final code/instruction.

**Type consistency:** `BulkRecipeInput` (Task 6) is the exact shape produced by `toBulkInput` (Task 14) and validated by `bulkCreateSchema` (Task 7). `ImageGenerator` signature (Task 5) matches `generateGeminiImage` (Task 4) passed in Task 8. `GenStreamEvent`/`GeneratedRecipeData` (Task 13) match what the route emits (Task 10). `getHouseholdAiSettings` return `{aiEnabled,hasKey}` consumed identically in Tasks 11,12,14. Model IDs centralized in `web/lib/ai/config.ts`.

**Carry-forward addressed:** Plan 6b/Plan 5 deferral "image serving/upload/generate/delete + AI generate + bulk-create" — all closed here. `recipeImageUrl` (already `/api/images/...`) now has a real serving route.
