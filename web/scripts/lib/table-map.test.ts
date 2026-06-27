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
