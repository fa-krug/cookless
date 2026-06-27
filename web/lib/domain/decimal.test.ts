import { describe, expect, it } from "vitest";
import { Decimal, quantize2 } from "./decimal";

describe("quantize2", () => {
  it("rounds half to even (banker's rounding), matching Python Decimal.quantize", () => {
    // .005 -> nearest even hundredth is .00 (0 is even)
    expect(quantize2(new Decimal("1700.005")).toFixed(2)).toBe("1700.00");
    // .015 -> nearest even hundredth is .02 (rounds up from odd 1)
    expect(quantize2(new Decimal("1700.015")).toFixed(2)).toBe("1700.02");
  });

  it("preserves two decimal places on whole numbers", () => {
    expect(quantize2(new Decimal("400")).toFixed(2)).toBe("400.00");
    // numeric equality ignores trailing zeros, mirroring Python Decimal("400.00") == Decimal("400")
    expect(quantize2(new Decimal("400")).equals(new Decimal("400"))).toBe(true);
  });

  it("does not introduce float drift", () => {
    expect(quantize2(new Decimal("0.1").plus("0.2")).toFixed(2)).toBe("0.30");
  });
});
