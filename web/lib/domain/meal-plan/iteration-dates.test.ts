import { describe, expect, it } from "vitest";
import {
  computeIterationDates,
  computeShoppingSegments,
  validateShoppingDays,
} from "./iteration-dates";

describe("validateShoppingDays", () => {
  it("accepts a single day", () => {
    expect(() => validateShoppingDays([5])).not.toThrow();
  });
  it("accepts two days 3+ apart", () => {
    expect(() => validateShoppingDays([0, 3])).not.toThrow();
  });
  it("accepts two days 3 apart via wrap (Sat + Tue)", () => {
    expect(() => validateShoppingDays([5, 1])).not.toThrow();
  });
  it("rejects empty", () => {
    expect(() => validateShoppingDays([])).toThrow(/at least 1/);
  });
  it("rejects three days", () => {
    expect(() => validateShoppingDays([0, 2, 4])).toThrow(/at most 2/);
  });
  it("rejects two days too close", () => {
    expect(() => validateShoppingDays([0, 1])).toThrow(/at least 3 days apart/);
  });
  it("rejects two days too close via wrap (Sun + Mon)", () => {
    expect(() => validateShoppingDays([6, 0])).toThrow(/at least 3 days apart/);
  });
  it("rejects an out-of-range weekday", () => {
    expect(() => validateShoppingDays([7])).toThrow();
    expect(() => validateShoppingDays([-1])).toThrow();
  });
});

describe("computeIterationDates", () => {
  it("spans one week (start + 7 - 1)", () => {
    expect(computeIterationDates("2026-02-28", 1)).toEqual({
      start: "2026-02-28",
      end: "2026-03-06",
    });
  });
  it("spans two weeks", () => {
    expect(computeIterationDates("2026-02-28", 2)).toEqual({
      start: "2026-02-28",
      end: "2026-03-13",
    });
  });
});

describe("computeShoppingSegments", () => {
  it("single shopping day, one week -> one segment", () => {
    expect(computeShoppingSegments("2026-02-28", "2026-03-06", [5])).toEqual([
      { segStart: "2026-02-28", shoppingDate: "2026-02-28", segEnd: "2026-03-06" },
    ]);
  });

  it("single shopping day, two weeks -> two segments", () => {
    expect(computeShoppingSegments("2026-02-28", "2026-03-13", [5])).toEqual([
      { segStart: "2026-02-28", shoppingDate: "2026-02-28", segEnd: "2026-03-06" },
      { segStart: "2026-03-07", shoppingDate: "2026-03-07", segEnd: "2026-03-13" },
    ]);
  });

  it("two shopping days, two weeks -> four segments", () => {
    expect(computeShoppingSegments("2026-03-04", "2026-03-17", [2, 5])).toEqual([
      { segStart: "2026-03-04", shoppingDate: "2026-03-04", segEnd: "2026-03-06" },
      { segStart: "2026-03-07", shoppingDate: "2026-03-07", segEnd: "2026-03-10" },
      { segStart: "2026-03-11", shoppingDate: "2026-03-11", segEnd: "2026-03-13" },
      { segStart: "2026-03-14", shoppingDate: "2026-03-14", segEnd: "2026-03-17" },
    ]);
  });

  it("no shopping date in range -> one full-span segment", () => {
    expect(computeShoppingSegments("2026-03-02", "2026-03-03", [4])).toEqual([
      { segStart: "2026-03-02", shoppingDate: "2026-03-02", segEnd: "2026-03-03" },
    ]);
  });
});
