import { describe, expect, it } from "vitest";
import { scaleFactor, scaleQuantity } from "./scaling";

describe("scaleFactor", () => {
  it("doubles when servings is twice the default", () => {
    expect(scaleFactor(4, 2).toString()).toBe("2");
  });

  it("is 1 when servings equals default", () => {
    expect(scaleFactor(2, 2).toString()).toBe("1");
  });
});

describe("scaleQuantity", () => {
  it("scales 200 by 4/2 -> 400", () => {
    expect(scaleQuantity("200", 4, 2).toString()).toBe("400");
  });

  it("keeps decimal precision (1.5 by 3/2 -> 2.25)", () => {
    expect(scaleQuantity("1.5", 3, 2).toString()).toBe("2.25");
  });
});
