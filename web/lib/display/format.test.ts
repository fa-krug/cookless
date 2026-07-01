import { describe, expect, it } from "vitest";
import { CATEGORY_ORDER, formatDuration, formatQuantity, pickName, recipeImageUrl } from "./format";

describe("formatQuantity", () => {
  it("strips trailing zeros", () => {
    expect(formatQuantity("200.00")).toBe("200");
    expect(formatQuantity("1.50")).toBe("1.5");
    expect(formatQuantity("0.25")).toBe("0.25");
  });

  it("rounds to at most 2 decimal places using banker's rounding (half-to-even)", () => {
    // "2.00" → "2" (trailing zeros stripped)
    expect(formatQuantity("2.00")).toBe("2");
    // "2.50" → "2.5" (one trailing zero stripped)
    expect(formatQuantity("2.50")).toBe("2.5");
    // "0.125" → "0.12": floor=12 (even), banker's rounding stays at 12
    expect(formatQuantity("0.125")).toBe("0.12");
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

describe("formatDuration", () => {
  it("shows seconds under a minute", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(0)).toBe("0s");
  });

  it("shows whole minutes with no trailing seconds", () => {
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(120)).toBe("2m");
  });

  it("shows minutes and seconds when mixed", () => {
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(125)).toBe("2m 5s");
  });
});
