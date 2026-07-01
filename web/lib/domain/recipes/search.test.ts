import { describe, it, expect } from "vitest";
import { normalizeForSearch, fuzzyScore } from "./search";

describe("normalizeForSearch", () => {
  it("lowercases and strips diacritics", () => {
    expect(normalizeForSearch("Püree")).toBe("puree");
    expect(normalizeForSearch("CAFÉ")).toBe("cafe");
  });
});

describe("fuzzyScore", () => {
  it("ranks exact > prefix > substring > subsequence", () => {
    expect(fuzzyScore("Pizza", "pizza")).toBe(4);
    expect(fuzzyScore("Pizza", "piz")).toBe(3);
    expect(fuzzyScore("Pineapple Pizza", "pizza")).toBe(2);
    expect(fuzzyScore("Pizza", "pza")).toBe(1);
  });
  it("returns 0 when the needle is not an in-order subsequence", () => {
    expect(fuzzyScore("Pizza", "xyz")).toBe(0);
  });
  it("is diacritic- and case-insensitive", () => {
    expect(fuzzyScore("Püree", "puree")).toBe(4);
    expect(fuzzyScore("Gemüse-Auflauf", "gemuse")).toBe(3);
  });
  it("treats an empty needle as no match", () => {
    expect(fuzzyScore("Pizza", "")).toBe(0);
    expect(fuzzyScore("Pizza", "   ")).toBe(0);
  });
});
