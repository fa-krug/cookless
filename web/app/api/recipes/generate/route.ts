import { eq } from "drizzle-orm";
import { requireHousehold } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/errors";
import { db } from "@/lib/db";
import {
  households,
  recipes,
  recipeIngredients,
  ingredients,
  units,
  tags,
  recipeTags,
  cookingSteps,
} from "@/lib/db/schema";
import { generateRecipesSchema } from "@/lib/schemas/generate";
import {
  buildGenerationPrompt,
  buildImagePrompt,
  selectReferenceRecipes,
  type PromptRecipe,
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
    db
      .select({ id: ingredients.id, nameEn: ingredients.nameEn })
      .from(ingredients)
      .all()
      .map((i) => [i.id, i.nameEn]),
  );
  const unitAbbrById = new Map(unitRows.map((u) => [u.id, u.abbreviation]));

  const referenceRecipes: PromptRecipe[] = selected.map((sel) => {
    const r = recipeRows.find((x) => x.id === sel.id)!;
    const ris = db
      .select()
      .from(recipeIngredients)
      .where(eq(recipeIngredients.recipeId, r.id))
      .orderBy(recipeIngredients.order)
      .all();
    const steps = db.select().from(cookingSteps).where(eq(cookingSteps.recipeId, r.id)).all();
    return {
      title: r.title,
      defaultServings: r.defaultServings,
      prepTimeMinutes: r.prepTimeMinutes,
      cookTimeMinutes: r.cookTimeMinutes,
      leftoverDays: r.leftoverDays,
      tagNames: (tagIdsByRecipe.get(r.id) ?? []).map((id) => tagNameById.get(id) ?? "").filter(Boolean),
      ingredientLines: ris.map(
        (ri) =>
          `    ${ri.quantity} ${unitAbbrById.get(ri.unitId) ?? ""} ${ingNameById.get(ri.ingredientId) ?? ""}`,
      ),
      manualInstructions: steps
        .filter((s) => s.method === "MANUAL")
        .map((s) => s.instruction),
      machineInstructions: steps
        .filter((s) => s.method === "MACHINE")
        .map((s) => s.instruction),
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
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
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
        const ings = Array.isArray(data.ingredients)
          ? (data.ingredients as Record<string, unknown>[])
          : [];
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
