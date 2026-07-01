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
