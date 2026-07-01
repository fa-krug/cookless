import { describe, expect, it } from "vitest";
import { mulberry32 } from "../rng";
import {
  computeSessionCounts,
  filterPools,
  ingredientOverlapScore,
  selectRecipes,
  type SelectableRecipe,
} from "./selection";

function makeRecipes(prefix: string, n: number): SelectableRecipe[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, ingredientIds: [i, i + 1] }));
}

describe("computeSessionCounts", () => {
  it("7 days, leftover 1, ratio 0.7 -> 3 sessions, 2 known, 1 try", () => {
    expect(computeSessionCounts(7, 1, 0.7)).toEqual({
      cookingSessions: 3,
      knownCount: 2,
      tryCount: 1,
    });
  });

  it("7 days, leftover 0 -> 7 sessions", () => {
    expect(computeSessionCounts(7, 0, 0.7).cookingSessions).toBe(7);
  });

  it("never drops below one cooking session", () => {
    expect(computeSessionCounts(1, 3, 0.7).cookingSessions).toBe(1);
  });
});

describe("ingredientOverlapScore", () => {
  it("sums shared-ingredient counts (3 ingredients each shared by 2 -> 6)", () => {
    const recipes: SelectableRecipe[] = [
      { id: "a", ingredientIds: [1, 2] },
      { id: "b", ingredientIds: [1, 3] },
      { id: "c", ingredientIds: [2, 3] },
    ];
    expect(ingredientOverlapScore(recipes)).toBe(6);
  });

  it("is zero when no ingredients are shared", () => {
    expect(ingredientOverlapScore([
      { id: "a", ingredientIds: [1] },
      { id: "b", ingredientIds: [2] },
    ])).toBe(0);
  });
});

describe("filterPools", () => {
  it("removes excluded ids when the remaining pool is still big enough", () => {
    const known = makeRecipes("k", 5);
    const result = filterPools(known, [], 2, 0, new Set(["k-0", "k-1"]));
    expect(result.known.map((r) => r.id)).not.toContain("k-0");
    expect(result.known).toHaveLength(3);
  });

  it("restores the full pool when exclusion would leave too few", () => {
    const known = makeRecipes("k", 3);
    const result = filterPools(known, [], 3, 0, new Set(["k-0", "k-1"]));
    expect(result.known).toHaveLength(3); // restored
  });
});

describe("selectRecipes", () => {
  it("selects the expected known/try counts", () => {
    const selected = selectRecipes({
      known: makeRecipes("k", 10),
      tryList: makeRecipes("t", 10),
      days: 7,
      knownRatio: 0.7,
      defaultLeftoverDays: 1,
      excludeIds: new Set(),
      rng: mulberry32(123),
    });
    // 3 sessions: 2 known + 1 try
    expect(selected).toHaveLength(3);
    expect(selected.filter((r) => r.id.startsWith("k-"))).toHaveLength(2);
    expect(selected.filter((r) => r.id.startsWith("t-"))).toHaveLength(1);
  });

  it("is deterministic for a fixed seed", () => {
    const args = {
      known: makeRecipes("k", 10),
      tryList: makeRecipes("t", 10),
      days: 7,
      knownRatio: 0.7,
      defaultLeftoverDays: 1,
      excludeIds: new Set<string>(),
    };
    const a = selectRecipes({ ...args, rng: mulberry32(99) }).map((r) => r.id);
    const b = selectRecipes({ ...args, rng: mulberry32(99) }).map((r) => r.id);
    expect(a).toEqual(b);
  });
});
