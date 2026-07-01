import { describe, it, expect } from "vitest";
import { pickLocale } from "./locale";

describe("pickLocale", () => {
  it("returns the first exact match", () => {
    expect(pickLocale(["de", "en"])).toBe("de");
  });

  it("normalizes region subtags (de-DE -> de)", () => {
    expect(pickLocale(["de-DE"])).toBe("de");
  });

  it("skips null/undefined/unsupported and falls back", () => {
    expect(pickLocale([null, undefined, "fr"])).toBe("en");
  });

  it("falls back to default for an empty list", () => {
    expect(pickLocale([])).toBe("en");
  });
});
