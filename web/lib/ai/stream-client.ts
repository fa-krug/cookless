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
