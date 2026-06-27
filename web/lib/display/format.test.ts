import { describe, expect, it } from "vitest";
import { CATEGORY_ORDER, formatQuantity, pickName, recipeImageUrl } from "./format";

describe("formatQuantity", () => {
  it("strips trailing zeros", () => {
    expect(formatQuantity("200.00")).toBe("200");
    expect(formatQuantity("1.50")).toBe("1.5");
    expect(formatQuantity("0.25")).toBe("0.25");
  });
});

describe("pickName", () => {
  it("picks by locale, defaulting to English", () => {
    const row = { nameEn: "Tomato", nameDe: "Tomate" };
    expect(pickName("de", row)).toBe("Tomate");
    expect(pickName("en", row)).toBe("Tomato");
    expect(pickName("fr", row)).toBe("Tomato");
  });
});

describe("recipeImageUrl", () => {
  it("returns null for empty image, else the api path", () => {
    expect(recipeImageUrl("")).toBeNull();
    expect(recipeImageUrl("recipes/abc.webp")).toBe("/api/images/recipes/abc.webp");
  });
});

describe("CATEGORY_ORDER", () => {
  it("is the fixed shopping grouping order", () => {
    expect(CATEGORY_ORDER).toEqual(["PRODUCE", "DAIRY", "MEAT", "PANTRY", "FROZEN", "OTHER"]);
  });
});
